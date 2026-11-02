import { mkdirSync, writeFileSync } from "node:fs";
import { STAGES, TASKS, printMeter, runStage } from "./lib.js";

// Usage:
//   npm run agent -- --stage jira                      # stage id, default task "joke"
//   npm run agent -- --stage jira --task release       # the multi-tool task
//   npm run agent -- --stage codeSearch --task release --headroom
//   npm run agent -- --stage registry "Any free-text prompt"
//
// Stages: bare, jokes, github, jira, registry, standard, search, code, codeSearch, flows

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
  args.splice(i, v === "true" ? 1 : 2);
  return v;
};

const stage = flag("stage") ?? "jira";
const task = flag("task") ?? "joke";
const headroom = flag("headroom") === "true";
const free = args.join(" ").trim();
const prompt = free || TASKS[task];

if (!prompt) {
  console.error(`unknown task "${task}". Tasks: ${Object.keys(TASKS).join(", ")}. Stages: ${STAGES.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const result = await runStage({ stage, prompt, taskName: free ? "custom" : task, headroom, log: console.log });
printMeter(result);

mkdirSync("results", { recursive: true });
writeFileSync(`results/${new Date().toISOString().replace(/[:.]/g, "-")}-${stage}-${result.task}${headroom ? "-headroom" : ""}.json`, JSON.stringify(result, null, 2));
if (result.error) process.exit(1);
