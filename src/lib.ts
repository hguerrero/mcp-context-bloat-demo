import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------------------------------------------------------------- configuration

export const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000";
export const HEADROOM_URL = process.env.HEADROOM_URL ?? "http://localhost:8787";
export const REGISTRY_URL = process.env.REGISTRY_URL ?? "http://localhost:12121";
export const MODEL = process.env.MODEL ?? "claude-haiku-5-5";
const MAX_TURNS = 14;
const MAX_RESULT_CHARS = 60_000; // safety net for a runaway tool result; the report says when it is hit

// USD per million tokens. Override with PRICE_INPUT / PRICE_OUTPUT for other models.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
const price = {
  ...(PRICES[MODEL] ?? { input: NaN, output: NaN }),
  ...(process.env.PRICE_INPUT ? { input: Number(process.env.PRICE_INPUT) } : {}),
  ...(process.env.PRICE_OUTPUT ? { output: Number(process.env.PRICE_OUTPUT) } : {}),
};

export const TASKS: Record<string, string> = {
  joke: "Tell me a Chuck Norris joke.",
  github: "What is the latest release of the GitHub repository agentgateway/agentgateway, and when was it published?",
  release:
    "What is the latest release of the GitHub repository agentgateway/agentgateway, and how many issues in the Jira project AGW are not done? " +
    "Finish with a short Chuck Norris joke.",
};

// CODE_HINT=1 adds one sentence that tells the model to filter inside scripts. Without it, the model sometimes returns a whole
// raw tool result from run_code, which puts the payload back into the context (see the README).
const SYSTEM =
  "You are a helpful assistant. Use your tools when you need data. Keep the answer short." +
  (process.env.CODE_HINT === "1" ? " When you write code, filter and aggregate inside the script and return only the values the question asks for." : "");
// In the registry stage the agent starts without the tools it needs, so it must be told where to look.
const SYSTEM_DISCOVER =
  SYSTEM + " You start with no task tools. Never answer from memory when a tool could supply the answer: " +
  "use find_mcp_servers to search the registry, connect_mcp_server to connect to what you need, then use its tools.";

// ---------------------------------------------------------------- stages

export type Stage = {
  id: string;
  title: string;
  /** MCP endpoints connected up front. */
  servers: { name: string; url: string }[];
  /** The agent starts with two registry tools and loads servers on demand. */
  discover?: boolean;
  /** Which tool names a correctly configured endpoint must expose (guards against a gateway that ignores toolMode). */
  expect?: (names: string[]) => boolean;
};

const mcp = (name: string, path = name) => ({ name, url: `${GATEWAY_URL}/mcp/${path}` });
const jokes = mcp("jokes");
const github = mcp("github");
const jira = mcp("jira");

export const STAGES: Stage[] = [
  { id: "bare", title: "Stage 0: the agent with no tools", servers: [] },
  { id: "jokes", title: "Stage 1: + jokes MCP", servers: [jokes] },
  { id: "github", title: "Stage 2: + GitHub MCP", servers: [jokes, github] },
  { id: "jira", title: "Stage 3: + Jira MCP (all connected up front)", servers: [jokes, github, jira] },
  { id: "registry", title: "Stage 4: tools just in time, discovered through agentregistry", servers: [], discover: true },
  {
    id: "standard", title: "Stage 5a: one endpoint, standard mode", servers: [mcp("all", "standard")],
    expect: (n) => n.length > 10 && !n.includes("run_code") && !n.includes("get_tool"),
  },
  {
    id: "search", title: "Stage 5b: one endpoint, search mode", servers: [mcp("all", "search")],
    expect: (n) => n.length === 2 && n.includes("get_tool") && n.includes("invoke_tool"),
  },
  {
    id: "code", title: "Stage 5c: one endpoint, code mode", servers: [mcp("all", "code")],
    expect: (n) => n.length === 1 && n[0] === "run_code",
  },
  {
    id: "codeSearch", title: "Stage 5d: one endpoint, codeSearch mode", servers: [mcp("all", "codeSearch")],
    expect: (n) => n.length === 2 && n.includes("get_tool") && n.includes("run_code"),
  },
  { id: "flows", title: "Stage 6: workflows (Arazzo) as tools", servers: [mcp("flows")] },
];

// ---------------------------------------------------------------- MCP

export type Tool = { name: string; description: string; input_schema: Anthropic.Tool.InputSchema };
type Connection = { name: string; client: Client; tools: Tool[] };

// GitHub's hosted MCP server rate-limits bursts (429), and in stateless mode every gateway request opens a new upstream session.
// Retry with a growing pause so a long run does not die on one 429. A failed attempt that never connects costs no model tokens.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 4 || !/429|too many requests/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
    }
  }
}

export async function connect(server: { name: string; url: string }): Promise<Connection> {
  const client = new Client({ name: "context-bloat-demo", version: "1.0.0" });
  await withRetry(() => client.connect(new StreamableHTTPClientTransport(new URL(server.url))));
  const listed = (await withRetry(() => client.listTools())).tools;
  return {
    name: server.name,
    client,
    tools: listed.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
  };
}

// ---------------------------------------------------------------- registry (stage 4)

type RegistryServer = { name: string; title: string; description: string; url: string };

async function registryList(): Promise<RegistryServer[]> {
  const res = await fetch(`${REGISTRY_URL}/v0/mcpservers?limit=100`);
  if (!res.ok) throw new Error(`registry answered ${res.status}. Is it running? (scripts/registry-up.sh)`);
  const body = (await res.json()) as { items: { metadata: { name: string }; spec: { title?: string; description?: string; remote?: { url: string } } }[] };
  return body.items
    .filter((i) => i.spec.remote?.url)
    .map((i) => ({ name: i.metadata.name, title: i.spec.title ?? i.metadata.name, description: i.spec.description ?? "", url: i.spec.remote!.url }));
}

// The registry stores the catalog and its metadata. Ranking is a plain keyword score here; with embeddings over the same
// records it becomes semantic search. Either way the model sees a handful of one-line entries, not the tool schemas.
export async function findServers(query: string, limit = 5): Promise<RegistryServer[]> {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scored = (await registryList())
    .map((s) => {
      const text = `${s.name} ${s.title} ${s.description}`.toLowerCase();
      return { s, score: words.filter((w) => text.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}

const REGISTRY_TOOLS: Tool[] = [
  {
    name: "find_mcp_servers",
    description: "Search the MCP server registry for servers that can help with a task. Returns name, description and nothing else. Call connect_mcp_server to use one.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "What you need to do, in a few words." } }, required: ["query"] },
  },
  {
    name: "connect_mcp_server",
    description: "Connect to an MCP server from the registry by name. Its tools become available on your next turn.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Server name from find_mcp_servers." } }, required: ["name"] },
  },
];

// ---------------------------------------------------------------- the agent loop

export type Turn = { n: number; inputTokens: number; outputTokens: number; modelMs: number; toolMs: number; tools: string[]; toolsInContext: number; code?: string[] };
export type RunResult = {
  stage: string; task: string; model: string; viaHeadroom: boolean;
  toolsInContext: number; catalogTokens: number | null;
  modelCalls: number; toolCalls: number; inputTokens: number; outputTokens: number;
  modelMs: number; toolMs: number; wallMs: number; usd: number | null;
  truncated: boolean; answer: string; turns: Turn[]; error?: string;
};

export type RunOptions = { stage: string; prompt: string; taskName?: string; headroom?: boolean; log?: (line: string) => void };

const fmt = (n: number) => n.toLocaleString("en-US");

export async function runStage(opts: RunOptions): Promise<RunResult> {
  const stage = STAGES.find((s) => s.id === opts.stage);
  if (!stage) throw new Error(`unknown stage "${opts.stage}". Stages: ${STAGES.map((s) => s.id).join(", ")}`);
  const log = opts.log ?? (() => {});
  const viaHeadroom = !!opts.headroom;
  const anthropic = new Anthropic({ baseURL: viaHeadroom ? HEADROOM_URL : GATEWAY_URL, apiKey: "set-by-the-gateway" });
  const started = Date.now();

  const connections: Connection[] = [];
  const toolOwner = new Map<string, Connection>();
  const tools: Tool[] = [];
  const addConnection = (c: Connection) => {
    connections.push(c);
    for (const t of c.tools) if (!toolOwner.has(t.name)) { toolOwner.set(t.name, c); tools.push(t); }
  };

  for (const s of stage.servers) {
    const c = await connect(s);
    if (stage.expect && !stage.expect(c.tools.map((t) => t.name))) {
      throw new Error(
        `${s.url} exposes ${c.tools.length} tool(s) (${c.tools.slice(0, 4).map((t) => t.name).join(", ")}...), not what stage "${stage.id}" should expose. ` +
          `Is this the Solo Enterprise build with a valid license? The open-source proxy always runs in standard mode.`,
      );
    }
    addConnection(c);
  }
  if (stage.discover) tools.push(...REGISTRY_TOOLS);

  log(`${stage.title}`);
  log(`  model ${MODEL} via ${viaHeadroom ? "Headroom -> gateway" : "gateway"}   tools in context: ${tools.length}` +
    (connections.length ? `  (${connections.map((c) => `${c.name} ${c.tools.length}`).join(", ")})` : ""));
  log(`  prompt: ${opts.prompt}\n`);

  const catalogTokens = await countCatalog(anthropic, tools);
  const r: RunResult = {
    stage: stage.id, task: opts.taskName ?? "custom", model: MODEL, viaHeadroom,
    toolsInContext: tools.length, catalogTokens,
    modelCalls: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, modelMs: 0, toolMs: 0, wallMs: 0, usd: null,
    truncated: false, answer: "", turns: [],
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const t0 = Date.now();
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        ...(process.env.EFFORT === "off" ? {} : { output_config: { effort: (process.env.EFFORT ?? "low") as "low" } }),
        system: stage.discover ? SYSTEM_DISCOVER : SYSTEM,
        ...(tools.length ? { tools } : {}),
        messages,
      });
      const modelMs = Date.now() - t0;
      const inTok = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
      r.modelCalls++;
      r.inputTokens += inTok;
      r.outputTokens += response.usage.output_tokens;
      r.modelMs += modelMs;
      const t: Turn = { n: turn, inputTokens: inTok, outputTokens: response.usage.output_tokens, modelMs, toolMs: 0, tools: [], toolsInContext: tools.length };

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "text") r.answer = block.text;
        if (block.type !== "tool_use") continue;
        r.toolCalls++;
        t.tools.push(block.name);
        if (block.name === "run_code") (t.code ??= []).push(String((block.input as { code?: string }).code ?? ""));
        const t1 = Date.now();
        let text: string;
        let isError = false;
        try {
          if (block.name === "find_mcp_servers" && stage.discover) {
            const found = await findServers(String((block.input as { query?: string }).query ?? ""));
            text = JSON.stringify(found.map((s) => ({ name: s.name, description: s.description })));
          } else if (block.name === "connect_mcp_server" && stage.discover) {
            const name = String((block.input as { name?: string }).name ?? "");
            const server = (await registryList()).find((s) => s.name === name);
            if (!server) throw new Error(`no server named "${name}" in the registry`);
            const c = await connect({ name: server.name, url: server.url });
            addConnection(c);
            text = `Connected to ${server.name}. ${c.tools.length} tools are available from your next turn.`;
          } else {
            const owner = toolOwner.get(block.name);
            if (!owner) throw new Error(`unknown tool ${block.name}`);
            const result = await withRetry(() => owner.client.callTool({ name: block.name, arguments: block.input as Record<string, unknown> }));
            text = (result.content as { type: string; text?: string }[]).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
            isError = result.isError === true;
          }
        } catch (e) {
          text = e instanceof Error ? e.message : String(e);
          isError = true;
        }
        if (text.length > MAX_RESULT_CHARS) {
          r.truncated = true;
          text = `${text.slice(0, MAX_RESULT_CHARS)}\n... (truncated, ${text.length} chars)`;
        }
        const ms = Date.now() - t1;
        t.toolMs += ms;
        results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: isError });
      }
      r.toolMs += t.toolMs;
      r.turns.push(t);
      log(`  call ${String(turn).padStart(2)}  in ${fmt(inTok).padStart(7)}  out ${fmt(response.usage.output_tokens).padStart(4)}  ${(modelMs / 1000).toFixed(1)}s` +
        (t.tools.length ? `  -> ${t.tools.join(", ")}` : "  -> answer"));

      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "tool_use") break;
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    r.error = e instanceof Error ? e.message : String(e);
  } finally {
    await Promise.allSettled(connections.map((c) => c.client.close()));
  }

  r.wallMs = Date.now() - started;
  r.usd = Number.isFinite(price.input) ? (r.inputTokens * price.input + r.outputTokens * price.output) / 1e6 : null;
  return r;
}

async function countCatalog(anthropic: Anthropic, tools: Tool[]): Promise<number | null> {
  if (!tools.length) return 0;
  try {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: "hi" }];
    const [withTools, without] = await Promise.all([
      anthropic.messages.countTokens({ model: MODEL, tools, messages }),
      anthropic.messages.countTokens({ model: MODEL, messages }),
    ]);
    return withTools.input_tokens - without.input_tokens;
  } catch {
    return null;
  }
}

export function printMeter(r: RunResult, log: (line: string) => void = console.log) {
  log(`\n  answer: ${r.answer.replace(/\s+/g, " ").trim().slice(0, 400)}${r.error ? `\n  ERROR: ${r.error}` : ""}\n`);
  log("  ┌───────────────────── METER ─────────────────────");
  log(`  │ tools in context   ${r.toolsInContext}${r.catalogTokens != null ? `   (catalog ≈ ${fmt(r.catalogTokens)} tokens)` : ""}`);
  log(`  │ model calls        ${r.modelCalls}   (tool calls: ${r.toolCalls})`);
  log(`  │ input tokens       ${fmt(r.inputTokens)}`);
  log(`  │ output tokens      ${fmt(r.outputTokens)}`);
  log(`  │ latency            ${(r.wallMs / 1000).toFixed(1)}s total   (${(r.modelMs / 1000).toFixed(1)}s model, ${(r.toolMs / 1000).toFixed(1)}s tools)`);
  log(`  │ cost               ${r.usd == null ? "n/a (set PRICE_INPUT and PRICE_OUTPUT)" : `$${r.usd.toFixed(4)}`}`);
  log("  └─────────────────────────────────────────────────");
  if (r.truncated) log("  note: a tool result was truncated at 60,000 characters");
}
