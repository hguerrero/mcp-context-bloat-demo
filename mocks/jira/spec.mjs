// A small stand-in for the Jira Cloud REST API: about two dozen operations with canned data.
// `server.mjs` serves it, and `gen-openapi.mjs` turns the same table into `openapi.json`,
// which agentgateway converts into MCP tools. Same table, so the spec and the server cannot drift.
//
// It exists so the demo needs no Atlassian account. The tool count and the size of the descriptions are
// close to what a real Jira MCP server exposes, which is the point: the catalog is what costs tokens.

const days = (n) => new Date(Date.UTC(2026, 9, 28) - n * 86400000).toISOString();

export const users = [
  { accountId: "u-alice", displayName: "Alice Nguyen", emailAddress: "alice@example.com", active: true },
  { accountId: "u-bob", displayName: "Bob Martins", emailAddress: "bob@example.com", active: true },
  { accountId: "u-carol", displayName: "Carol Silva", emailAddress: "carol@example.com", active: true },
  { accountId: "u-dan", displayName: "Dan Okafor", emailAddress: "dan@example.com", active: true },
];

export const projects = [
  { id: "10000", key: "AGW", name: "agentgateway", projectTypeKey: "software", lead: users[0] },
  { id: "10001", key: "REG", name: "agentregistry", projectTypeKey: "software", lead: users[1] },
  { id: "10002", key: "KAG", name: "kagent", projectTypeKey: "software", lead: users[2] },
];

export const versions = [
  { id: "20000", name: "v1.5.0", projectId: "10000", released: true, releaseDate: "2026-08-12" },
  { id: "20001", name: "v1.6.0", projectId: "10000", released: true, releaseDate: "2026-10-08" },
  { id: "20002", name: "v1.7.0", projectId: "10000", released: false, releaseDate: "2026-12-10" },
  { id: "20003", name: "v0.4.0", projectId: "10001", released: true, releaseDate: "2026-08-03" },
];

export const boards = [
  { id: 1, name: "agentgateway board", type: "scrum", projectKey: "AGW" },
  { id: 2, name: "agentregistry board", type: "kanban", projectKey: "REG" },
  { id: 3, name: "kagent board", type: "scrum", projectKey: "KAG" },
];

export const sprints = [
  { id: 41, boardId: 1, name: "AGW Sprint 41", state: "closed", startDate: days(35), endDate: days(21) },
  { id: 42, boardId: 1, name: "AGW Sprint 42", state: "active", startDate: days(14), endDate: days(0) },
  { id: 43, boardId: 1, name: "AGW Sprint 43", state: "future", startDate: days(-1), endDate: days(-14) },
];

const summaries = {
  AGW: [
    ["Tool mode search returns stale schema after hot reload", "Bug", "High", ["mcp", "toolmode"], "v1.6.0"],
    ["Add codeSearch example to the docs", "Task", "Medium", ["docs", "toolmode"], "v1.6.0"],
    ["Token usage metric missing cache_read label", "Bug", "Medium", ["observability"], "v1.6.0"],
    ["Support per-route CPU limit for run_code", "Story", "High", ["mcp", "toolmode", "security"], "v1.7.0"],
    ["OpenAPI target: respect servers[] override", "Bug", "Low", ["mcp", "openapi"], "v1.7.0"],
    ["JWT groups claim not available in mcpAuthorization CEL", "Bug", "High", ["mcp", "authz"], "v1.6.0"],
    ["Rate limit by token budget per API key", "Story", "High", ["llm", "ratelimit"], "v1.7.0"],
    ["Admin UI: show tool mode per MCP route", "Story", "Low", ["ui"], "v1.7.0"],
    ["Prompt guard: reversible masking for tool results", "Story", "Medium", ["guardrails"], "v1.7.0"],
    ["A2A agent card rewrite drops skills array", "Bug", "Medium", ["a2a"], "v1.6.0"],
    ["Document standalone license key loading", "Task", "Low", ["docs"], "v1.6.0"],
    ["Access log: include request model and cost", "Story", "Medium", ["observability", "llm"], "v1.7.0"],
    ["Stateless MCP sessions leak connection on timeout", "Bug", "High", ["mcp"], "v1.7.0"],
    ["Add Gemini virtual model failover example", "Task", "Low", ["llm", "docs"], "v1.7.0"],
  ],
  REG: [
    ["Search MCP servers by tool name", "Story", "High", ["catalog", "search"], "v0.4.0"],
    ["Registry: label selectors in list API", "Story", "Medium", ["api"], "v0.4.0"],
    ["Publish remote MCP server with headers", "Bug", "Medium", ["catalog"], "v0.4.0"],
    ["Semantic search over MCP server descriptions", "Story", "High", ["search", "embeddings"], "v0.5.0"],
    ["Helm chart: external Postgres", "Task", "Low", ["deploy"], "v0.4.0"],
  ],
  KAG: [
    ["Agent CRD: model fallback", "Story", "Medium", ["crd"], "v0.7.0"],
    ["Memory backend for long-running agents", "Story", "High", ["memory"], "v0.7.0"],
    ["Tool server health check", "Bug", "Low", ["tools"], "v0.6.0"],
  ],
};

const statuses = ["To Do", "In Progress", "In Review", "Done"];
export const issues = [];
let n = 100;
for (const [key, list] of Object.entries(summaries)) {
  list.forEach(([summary, type, priority, labels, fixVersion], i) => {
    n++;
    issues.push({
      id: String(10000 + n),
      key: `${key}-${n}`,
      fields: {
        summary,
        issuetype: { name: type },
        priority: { name: priority },
        status: { name: statuses[[0, 1, 3, 2, 1, 0, 3, 1, 2, 0, 1, 3, 2, 1][i % 14]] },
        labels,
        fixVersions: [{ name: fixVersion }],
        project: { key },
        assignee: users[i % users.length],
        reporter: users[(i + 1) % users.length],
        created: days(60 - i * 3),
        updated: days(i % 9),
        description: `${summary}. Reported while running the ${key} test suite; see the linked discussion for the reproduction steps and the expected behavior.`,
      },
      comments: [],
      worklogs: [],
      links: [],
    });
  });
}

const json = (status, body) => ({ status, body });
const find = (key) => issues.find((i) => i.key === key || i.id === key);
const slim = (i, fields) => {
  if (!fields) return { id: i.id, key: i.key, fields: i.fields };
  const want = fields.split(",").map((f) => f.trim());
  return { id: i.id, key: i.key, fields: Object.fromEntries(Object.entries(i.fields).filter(([k]) => want.includes(k))) };
};

// Very small JQL: project, status, assignee, labels, fixVersion, issuetype, text ~ "...", ORDER BY.
function runJql(jql = "") {
  let rows = issues.slice();
  const eq = (field, fn) => {
    const m = jql.match(new RegExp(`${field}\\s*(!=|=|in)\\s*(\\(([^)]*)\\)|"[^"]*"|[\\w.-]+)`, "i"));
    if (!m) return;
    const values = (m[3] ?? m[2]).split(",").map((v) => v.trim().replace(/^"|"$/g, "").toLowerCase());
    rows = rows.filter((i) => {
      const hit = values.includes(String(fn(i)).toLowerCase());
      return m[1] === "!=" ? !hit : hit;
    });
  };
  eq("project", (i) => i.fields.project.key);
  eq("status", (i) => i.fields.status.name);
  eq("issuetype", (i) => i.fields.issuetype.name);
  eq("fixVersion", (i) => i.fields.fixVersions[0]?.name ?? "");
  eq("assignee", (i) => i.fields.assignee.displayName);
  const labels = jql.match(/labels\s*(?:=|in)\s*\(?"?([\w-]+)"?/i);
  if (labels) rows = rows.filter((i) => i.fields.labels.includes(labels[1].toLowerCase()));
  const text = jql.match(/text\s*~\s*"([^"]*)"/i);
  if (text) {
    const words = text[1].toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((i) => words.some((w) => i.fields.summary.toLowerCase().includes(w) || i.fields.labels.includes(w)));
  }
  if (/order by\s+updated/i.test(jql)) rows.sort((a, b) => b.fields.updated.localeCompare(a.fields.updated));
  return rows;
}

const S = "string";
const I = "integer";
const issueKey = ["issueIdOrKey", S, "Issue key (for example AGW-101) or numeric id."];

// path params are written {name}. Each query/body entry is [name, type, description, required?].
export const operations = [
  {
    id: "searchIssues", method: "get", path: "/rest/api/3/search",
    summary: "Search for issues using JQL",
    description: "Returns issues that match a JQL query. Supports project, status, assignee, labels, fixVersion, issuetype, text ~ \"words\" and ORDER BY. Results are paged with startAt and maxResults.",
    query: [["jql", S, "The JQL query, for example: project = AGW AND status != Done ORDER BY updated DESC.", true], ["startAt", I, "Index of the first issue to return (0-based)."], ["maxResults", I, "Maximum number of issues to return. Default 50."], ["fields", S, "Comma-separated list of fields to return, for example summary,status,assignee."]],
    run: ({ query }) => {
      const rows = runJql(query.jql);
      const start = Number(query.startAt ?? 0);
      const max = Number(query.maxResults ?? 50);
      return json(200, { startAt: start, maxResults: max, total: rows.length, issues: rows.slice(start, start + max).map((i) => slim(i, query.fields)) });
    },
  },
  {
    id: "getIssue", method: "get", path: "/rest/api/3/issue/{issueIdOrKey}",
    summary: "Get an issue",
    description: "Returns the details of one issue: summary, description, status, priority, assignee, reporter, labels, fix versions and dates.",
    path_: [issueKey], query: [["fields", S, "Comma-separated list of fields to return."]],
    run: ({ params, query }) => (find(params.issueIdOrKey) ? json(200, slim(find(params.issueIdOrKey), query.fields)) : json(404, { errorMessages: ["Issue does not exist"] })),
  },
  {
    id: "createIssue", method: "post", path: "/rest/api/3/issue",
    summary: "Create an issue",
    description: "Creates an issue in a project. Provide the project key, the issue type name and a summary.",
    body: [["projectKey", S, "Key of the project that gets the issue.", true], ["issueType", S, "Issue type name: Bug, Task, Story or Epic.", true], ["summary", S, "One-line summary.", true], ["description", S, "Longer description."], ["priority", S, "Priority name: Highest, High, Medium, Low or Lowest."], ["labels", "array", "Labels to add."], ["assigneeAccountId", S, "Account id of the assignee."]],
    run: ({ body }) => {
      const key = `${body.projectKey}-${++n}`;
      const issue = { id: String(10000 + n), key, fields: { summary: body.summary, issuetype: { name: body.issueType }, priority: { name: body.priority ?? "Medium" }, status: { name: "To Do" }, labels: body.labels ?? [], fixVersions: [], project: { key: body.projectKey }, assignee: users[0], reporter: users[0], created: new Date().toISOString(), updated: new Date().toISOString(), description: body.description ?? "" }, comments: [], worklogs: [], links: [] };
      issues.push(issue);
      return json(201, { id: issue.id, key });
    },
  },
  {
    id: "editIssue", method: "put", path: "/rest/api/3/issue/{issueIdOrKey}",
    summary: "Edit an issue",
    description: "Updates fields of an issue. Only the fields you send change.",
    path_: [issueKey], body: [["summary", S, "New summary."], ["description", S, "New description."], ["priority", S, "New priority name."], ["labels", "array", "Replacement list of labels."]],
    run: ({ params, body }) => {
      const i = find(params.issueIdOrKey);
      if (!i) return json(404, { errorMessages: ["Issue does not exist"] });
      if (body.summary) i.fields.summary = body.summary;
      if (body.description) i.fields.description = body.description;
      if (body.priority) i.fields.priority = { name: body.priority };
      if (body.labels) i.fields.labels = body.labels;
      return json(204, null);
    },
  },
  {
    id: "assignIssue", method: "put", path: "/rest/api/3/issue/{issueIdOrKey}/assignee",
    summary: "Assign an issue",
    description: "Assigns an issue to a user. Send a null accountId to leave it unassigned.",
    path_: [issueKey], body: [["accountId", S, "Account id of the new assignee.", true]],
    run: ({ params, body }) => {
      const i = find(params.issueIdOrKey);
      const u = users.find((x) => x.accountId === body.accountId);
      if (!i || !u) return json(404, { errorMessages: ["Issue or user does not exist"] });
      i.fields.assignee = u;
      return json(204, null);
    },
  },
  {
    id: "getTransitions", method: "get", path: "/rest/api/3/issue/{issueIdOrKey}/transitions",
    summary: "Get the transitions of an issue",
    description: "Returns the workflow transitions that the issue can take from its current status.",
    path_: [issueKey],
    run: () => json(200, { transitions: statuses.map((name, i) => ({ id: String(11 + i), name, to: { name } })) }),
  },
  {
    id: "transitionIssue", method: "post", path: "/rest/api/3/issue/{issueIdOrKey}/transitions",
    summary: "Transition an issue",
    description: "Moves an issue to another status. Get the transition id from getTransitions first.",
    path_: [issueKey], body: [["transitionId", S, "Id of the transition to run.", true]],
    run: ({ params, body }) => {
      const i = find(params.issueIdOrKey);
      if (!i) return json(404, { errorMessages: ["Issue does not exist"] });
      i.fields.status = { name: statuses[Number(body.transitionId) - 11] ?? i.fields.status.name };
      return json(204, null);
    },
  },
  {
    id: "addComment", method: "post", path: "/rest/api/3/issue/{issueIdOrKey}/comment",
    summary: "Add a comment",
    description: "Adds a comment to an issue.",
    path_: [issueKey], body: [["body", S, "The comment text.", true]],
    run: ({ params, body }) => {
      const i = find(params.issueIdOrKey);
      if (!i) return json(404, { errorMessages: ["Issue does not exist"] });
      const c = { id: String(i.comments.length + 1), author: users[0], body: body.body, created: new Date().toISOString() };
      i.comments.push(c);
      return json(201, c);
    },
  },
  {
    id: "getComments", method: "get", path: "/rest/api/3/issue/{issueIdOrKey}/comment",
    summary: "Get the comments of an issue",
    description: "Returns the comments of an issue, oldest first.",
    path_: [issueKey],
    run: ({ params }) => (find(params.issueIdOrKey) ? json(200, { comments: find(params.issueIdOrKey).comments }) : json(404, { errorMessages: ["Issue does not exist"] })),
  },
  {
    id: "addWorklog", method: "post", path: "/rest/api/3/issue/{issueIdOrKey}/worklog",
    summary: "Add a worklog",
    description: "Logs time spent on an issue.",
    path_: [issueKey], body: [["timeSpent", S, "Time spent, for example 2h 30m.", true], ["comment", S, "What the work was."]],
    run: ({ params, body }) => {
      const i = find(params.issueIdOrKey);
      if (!i) return json(404, { errorMessages: ["Issue does not exist"] });
      i.worklogs.push({ author: users[0], timeSpent: body.timeSpent, comment: body.comment ?? "" });
      return json(201, i.worklogs.at(-1));
    },
  },
  {
    id: "getWorklogs", method: "get", path: "/rest/api/3/issue/{issueIdOrKey}/worklog",
    summary: "Get the worklogs of an issue",
    description: "Returns the time logged on an issue.",
    path_: [issueKey],
    run: ({ params }) => (find(params.issueIdOrKey) ? json(200, { worklogs: find(params.issueIdOrKey).worklogs }) : json(404, { errorMessages: ["Issue does not exist"] })),
  },
  {
    id: "getChangelog", method: "get", path: "/rest/api/3/issue/{issueIdOrKey}/changelog",
    summary: "Get the changelog of an issue",
    description: "Returns the history of changes to an issue: who changed which field and when.",
    path_: [issueKey], query: [["maxResults", I, "Maximum number of entries."]],
    run: () => json(200, { values: [] }),
  },
  {
    id: "linkIssues", method: "post", path: "/rest/api/3/issueLink",
    summary: "Link two issues",
    description: "Creates a link between two issues, for example Blocks or Relates.",
    body: [["type", S, "Link type name, for example Blocks or Relates.", true], ["inwardIssue", S, "Key of the inward issue.", true], ["outwardIssue", S, "Key of the outward issue.", true]],
    run: () => json(201, null),
  },
  {
    id: "listLinkTypes", method: "get", path: "/rest/api/3/issueLinkType",
    summary: "List issue link types",
    description: "Returns the link types that can connect two issues.",
    run: () => json(200, { issueLinkTypes: [{ name: "Blocks", inward: "is blocked by", outward: "blocks" }, { name: "Relates", inward: "relates to", outward: "relates to" }] }),
  },
  {
    id: "listProjects", method: "get", path: "/rest/api/3/project/search",
    summary: "List projects",
    description: "Returns the projects the user can see, with key, name and type.",
    query: [["query", S, "Filter by name or key."], ["maxResults", I, "Maximum number of projects."]],
    run: ({ query }) => json(200, { values: projects.filter((p) => !query.query || (p.key + p.name).toLowerCase().includes(query.query.toLowerCase())) }),
  },
  {
    id: "getProject", method: "get", path: "/rest/api/3/project/{projectIdOrKey}",
    summary: "Get a project",
    description: "Returns one project with its lead and issue types.",
    path_: [["projectIdOrKey", S, "Project key or id."]],
    run: ({ params }) => { const p = projects.find((x) => x.key === params.projectIdOrKey || x.id === params.projectIdOrKey); return p ? json(200, p) : json(404, { errorMessages: ["Project does not exist"] }); },
  },
  {
    id: "listProjectVersions", method: "get", path: "/rest/api/3/project/{projectIdOrKey}/versions",
    summary: "List the versions of a project",
    description: "Returns the release versions of a project and whether each one is released.",
    path_: [["projectIdOrKey", S, "Project key or id."]],
    run: ({ params }) => { const p = projects.find((x) => x.key === params.projectIdOrKey || x.id === params.projectIdOrKey); return json(200, versions.filter((v) => v.projectId === p?.id)); },
  },
  {
    id: "createVersion", method: "post", path: "/rest/api/3/version",
    summary: "Create a version",
    description: "Creates a release version in a project.",
    body: [["name", S, "Version name, for example v1.8.0.", true], ["projectId", I, "Id of the project.", true], ["releaseDate", S, "Planned release date (YYYY-MM-DD)."]],
    run: ({ body }) => json(201, { id: "29999", ...body }),
  },
  {
    id: "listIssueTypes", method: "get", path: "/rest/api/3/issuetype",
    summary: "List issue types",
    description: "Returns the issue types that exist: Bug, Task, Story and Epic.",
    run: () => json(200, ["Bug", "Task", "Story", "Epic"].map((name, i) => ({ id: String(i + 1), name }))),
  },
  {
    id: "listPriorities", method: "get", path: "/rest/api/3/priority",
    summary: "List priorities",
    description: "Returns the priority levels, from Highest to Lowest.",
    run: () => json(200, ["Highest", "High", "Medium", "Low", "Lowest"].map((name, i) => ({ id: String(i + 1), name }))),
  },
  {
    id: "listFields", method: "get", path: "/rest/api/3/field",
    summary: "List fields",
    description: "Returns the system and custom fields that an issue can have.",
    run: () => json(200, ["summary", "description", "status", "priority", "assignee", "reporter", "labels", "fixVersions", "created", "updated"].map((id) => ({ id, name: id }))),
  },
  {
    id: "listLabels", method: "get", path: "/rest/api/3/label",
    summary: "List labels",
    description: "Returns all labels in use.",
    run: () => json(200, { values: [...new Set(issues.flatMap((i) => i.fields.labels))].sort() }),
  },
  {
    id: "getCurrentUser", method: "get", path: "/rest/api/3/myself",
    summary: "Get the current user",
    description: "Returns the user that makes the request.",
    run: () => json(200, users[0]),
  },
  {
    id: "searchUsers", method: "get", path: "/rest/api/3/user/search",
    summary: "Find users",
    description: "Returns users whose name or email matches the query.",
    query: [["query", S, "Name or email to search for.", true]],
    run: ({ query }) => json(200, users.filter((u) => (u.displayName + u.emailAddress).toLowerCase().includes((query.query ?? "").toLowerCase()))),
  },
  {
    id: "listBoards", method: "get", path: "/rest/agile/1.0/board",
    summary: "List boards",
    description: "Returns the Scrum and Kanban boards, optionally for one project.",
    query: [["projectKeyOrId", S, "Only boards of this project."]],
    run: ({ query }) => json(200, { values: boards.filter((b) => !query.projectKeyOrId || b.projectKey === query.projectKeyOrId) }),
  },
  {
    id: "listSprints", method: "get", path: "/rest/agile/1.0/board/{boardId}/sprint",
    summary: "List the sprints of a board",
    description: "Returns the sprints of a Scrum board, optionally filtered by state.",
    path_: [["boardId", I, "Id of the board."]], query: [["state", S, "active, closed or future."]],
    run: ({ params, query }) => json(200, { values: sprints.filter((s) => String(s.boardId) === params.boardId && (!query.state || s.state === query.state)) }),
  },
  {
    id: "getSprintIssues", method: "get", path: "/rest/agile/1.0/sprint/{sprintId}/issue",
    summary: "Get the issues of a sprint",
    description: "Returns the issues in a sprint.",
    path_: [["sprintId", I, "Id of the sprint."]], query: [["maxResults", I, "Maximum number of issues."]],
    run: ({ query }) => json(200, { issues: issues.slice(0, Number(query.maxResults ?? 10)).map((i) => slim(i, "summary,status")) }),
  },
];
