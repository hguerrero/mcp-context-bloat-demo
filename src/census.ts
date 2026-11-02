import { connect, STAGES } from "./lib.js";

// Lists the tools every endpoint exposes (no model call). Shows how big each catalog is on the wire.
//   npm run census
const endpoints = [...new Map(STAGES.flatMap((s) => s.servers).map((s) => [s.url, s])).values()];
console.log("endpoint".padEnd(34), "tools".padStart(5), "tools/list bytes".padStart(18), "  first tools");
for (const e of endpoints) {
  try {
    const c = await connect(e);
    const bytes = JSON.stringify(c.tools).length;
    console.log(e.url.replace(/^https?:\/\/[^/]+/, "").padEnd(34), String(c.tools.length).padStart(5), bytes.toLocaleString("en-US").padStart(18), " ", c.tools.slice(0, 3).map((t) => t.name).join(", "));
    await c.client.close();
  } catch (err) {
    console.log(e.url.padEnd(34), "unreachable:", (err as Error).message);
  }
}
