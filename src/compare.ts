import { mkdirSync, writeFileSync } from "node:fs";
import { STAGES, TASKS, runStage, type RunResult } from "./lib.js";

// Runs the stages one after another on the same task and prints one comparison table.
//   npm run compare                                  # stages jokes..jira, task joke
//   STAGES=jira,registry,codeSearch TASK=release npm run compare
//   STAGES=jira,codeSearch HEADROOM=on,off npm run compare
const stages = (process.env.STAGES ?? "bare,jokes,github,jira").split(",").map((s) => s.trim());
const task = process.env.TASK ?? "joke";
const headroomStates = (process.env.HEADROOM ?? "off").split(",").map((s) => s.trim() === "on");
const runs = Number(process.env.RUNS ?? 1);

const prompt = TASKS[task];
if (!prompt) throw new Error(`unknown TASK "${task}". Tasks: ${Object.keys(TASKS).join(", ")}`);
for (const s of stages) if (!STAGES.some((x) => x.id === s)) throw new Error(`unknown stage "${s}"`);

const all: RunResult[] = [];
for (const stage of stages) {
  for (const headroom of headroomStates) {
    for (let i = 0; i < runs; i++) {
      process.stderr.write(`running ${stage}${headroom ? " +headroom" : ""} (${i + 1}/${runs})...\n`);
      let r: RunResult;
      try {
        r = await runStage({ stage, prompt, taskName: task, headroom });
      } catch (e) {
        // a stage that cannot even connect (for example a route in the wrong mode) is reported, not fatal
        r = { stage, task, model: "", viaHeadroom: headroom, toolsInContext: 0, catalogTokens: null, modelCalls: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, modelMs: 0, toolMs: 0, wallMs: 0, usd: null, truncated: false, answer: "", turns: [], error: e instanceof Error ? e.message : String(e) };
      }
      all.push(r);
      await new Promise((res) => setTimeout(res, Number(process.env.DELAY_MS ?? 3000)));
    }
  }
}

const n = (x: number) => x.toLocaleString("en-US");
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// With RUNS > 1, report the median run of each stage (by input tokens) so one unlucky run does not decide the table.
const groups = new Map<string, RunResult[]>();
for (const r of all) groups.set(r.stage + (r.viaHeadroom ? "+headroom" : ""), [...(groups.get(r.stage + (r.viaHeadroom ? "+headroom" : "")) ?? []), r]);
const shown = [...groups.values()].map((g) => {
  const ok = g.filter((x) => !x.error);
  const pool = ok.length ? ok : g;
  const mid = median(pool.map((x) => x.inputTokens));
  const pick = pool.reduce((a, b) => (Math.abs(b.inputTokens - mid) < Math.abs(a.inputTokens - mid) ? b : a));
  return { r: pick, range: g.length > 1 ? `${n(Math.min(...pool.map((x) => x.inputTokens)))}-${n(Math.max(...pool.map((x) => x.inputTokens)))}` : "", errors: g.length - ok.length };
});
const base = shown[0].r;
const rows = shown.map(({ r, range, errors }) => [
  r.stage + (r.viaHeadroom ? "+headroom" : ""),
  String(r.toolsInContext),
  r.catalogTokens == null ? "n/a" : n(r.catalogTokens),
  String(r.modelCalls),
  n(r.inputTokens),
  n(r.outputTokens),
  `${(r.wallMs / 1000).toFixed(1)}s`,
  r.usd == null ? "n/a" : `$${r.usd.toFixed(4)}`,
  base.inputTokens > 0 && r !== base ? `${r.inputTokens / base.inputTokens >= 1 ? "x" + (r.inputTokens / base.inputTokens).toFixed(1) : (((r.inputTokens / base.inputTokens) - 1) * 100).toFixed(0) + "%"}` : "",
  range,
  errors ? `${errors} failed` : "",
]);
const head = ["stage", "tools", "catalog tok", "calls", "input tok", "output tok", "latency", "cost", `vs ${base.stage}`, runs > 1 ? "input range" : "", ""];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
const line = (cells: string[]) => "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
console.log(`\ntask: ${task}  model: ${all[0].model}\n`);
console.log(line(head));
console.log("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|");
for (const row of rows) console.log(line(row));
for (const r of all.filter((x) => x.error)) console.log(`\n${r.stage}: ${r.error}`);

mkdirSync("results", { recursive: true });
writeFileSync(`results/compare-${new Date().toISOString().replace(/[:.]/g, "-")}-${task}.json`, JSON.stringify(all, null, 2));
