import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ArazzoRunner } from "@usearazzo/runner";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Serves every workflow of an Arazzo document as one MCP tool, on :3002/mcp (override with PORT).
// The tool name is the workflowId, the description is the workflow summary and description, and the input schema
// is the workflow's `inputs`. agentgateway sits in front of it at /mcp/flows.
//
// Uses @usearazzo/runner (alpha) to execute the steps. Calls go straight to the APIs the OpenAPI documents point at.

const PORT = Number(process.env.PORT ?? 3002);
const file = fileURLToPath(new URL(process.env.ARAZZO ?? "./release-brief.arazzo.yaml", import.meta.url));
const doc = parse(readFileSync(file, "utf8")) as {
  workflows: { workflowId: string; summary?: string; description?: string; inputs?: Record<string, unknown> }[];
};

const runner = await ArazzoRunner.load(file, {
  // GitHub allows 60 unauthenticated calls an hour. A token raises that.
  requestInterceptor: async (request: { url: string | URL; headers: Record<string, string> }) => {
    if (String(request.url).startsWith("https://api.github.com") && process.env.GITHUB_PAT) {
      request.headers.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
    }
  },
});

function mcpServer() {
  const server = new Server({ name: "arazzo-flows", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: doc.workflows.map((w) => ({
      name: w.workflowId,
      description: [w.summary, w.description].filter(Boolean).join(". ").replace(/\s+/g, " "),
      inputSchema: (w.inputs as { type: "object" }) ?? { type: "object", properties: {} },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await runner.execute(req.params.name, { inputs: (req.params.arguments ?? {}) as Record<string, unknown> });
    const failed = result.status !== "completed";
    const steps = result.steps.map((s: { stepId: string; successful: boolean }) => `${s.successful ? "ok" : "failed"} ${s.stepId}`);
    return {
      isError: failed,
      content: [{ type: "text" as const, text: JSON.stringify(failed ? { status: result.status, steps } : result.outputs) }],
    };
  });
  return server;
}

createServer(async (req, res) => {
  if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
  // stateless: a fresh server and transport per request
  const server = mcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
}).listen(PORT, () => console.log(`workflow server on http://localhost:${PORT}/mcp (${doc.workflows.length} workflow tool(s))`));
