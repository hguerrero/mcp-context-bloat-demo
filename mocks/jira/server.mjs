// Serves the Jira stand-in from spec.mjs on :8081 (override with PORT). No dependencies.
import { createServer } from "node:http";
import { operations } from "./spec.mjs";

const PORT = Number(process.env.PORT ?? 8081);

const routes = operations.map((op) => {
  const names = [];
  const pattern = op.path.replace(/\{(\w+)\}/g, (_, n) => (names.push(n), "([^/]+)"));
  return { op, names, re: new RegExp(`^${pattern}$`) };
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = routes.find((r) => r.op.method === req.method.toLowerCase() && r.re.test(url.pathname));
  if (!route) {
    res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ errorMessages: ["No such operation"] }));
    return;
  }
  const values = url.pathname.match(route.re).slice(1).map(decodeURIComponent);
  const params = Object.fromEntries(route.names.map((n, i) => [n, values[i]]));
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
  const { status, body: out } = route.op.run({ params, query: Object.fromEntries(url.searchParams), body });
  console.log(`${req.method} ${url.pathname}${url.search} -> ${status}`);
  res.writeHead(status, { "content-type": "application/json" }).end(out === null ? undefined : JSON.stringify(out));
}).listen(PORT, () => console.log(`jira mock on http://localhost:${PORT} (${operations.length} operations)`));
