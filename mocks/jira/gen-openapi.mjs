// Writes openapi.json from the operations table in spec.mjs. Run: npm run gen:jira
import { writeFileSync } from "node:fs";
import { operations } from "./spec.mjs";

const schemaOf = (type) => (type === "array" ? { type: "array", items: { type: "string" } } : { type });

const paths = {};
for (const op of operations) {
  const parameters = [
    ...(op.path_ ?? []).map(([name, type, description]) => ({ name, in: "path", required: true, description, schema: schemaOf(type) })),
    ...(op.query ?? []).map(([name, type, description, required]) => ({ name, in: "query", required: !!required, description, schema: schemaOf(type) })),
  ];
  const operation = { operationId: op.id, summary: op.summary, description: op.description, ...(parameters.length ? { parameters } : {}), responses: { 200: { description: "OK" } } };
  if (op.body) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: Object.fromEntries(op.body.map(([name, type, description]) => [name, { ...schemaOf(type), description }])),
            required: op.body.filter((b) => b[3]).map((b) => b[0]),
          },
        },
      },
    };
  }
  (paths[op.path] ??= {})[op.method] = operation;
}

const doc = {
  openapi: "3.0.3",
  info: { title: "Jira (mock)", version: "1.0.0", description: "A stand-in for the Jira Cloud REST API, served by mocks/jira/server.mjs." },
  servers: [{ url: "http://localhost:8081" }],
  paths,
};
writeFileSync(new URL("./openapi.json", import.meta.url), JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote openapi.json with ${operations.length} operations`);
