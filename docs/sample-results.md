# Sample results

The reference run behind the deck. `claude-haiku-5-5` ($1 per million input tokens, $5 per million output tokens), no prompt caching, Solo Enterprise agentgateway v2026.10.0, Headroom 0.42.0, agentregistry v0.4.0. The tables show the **median run of 3** by input tokens (the first table is a single run). One task per table.

The model picks its own steps, so expect different numbers. These tables are a fallback for a live demo and a sanity check for yours, not a benchmark.

## 1. The bloat: the same joke, more MCP servers

`npm run agent -- --stage <stage> --task joke` (single run)

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `bare` | 0 | 0 | 1 | 52 | 31 | 1.6s | $0.0002 |  |
| `jokes` | 3 | 588 | 2 | 1,503 | 63 | 2.4s | $0.0018 | x28.9 |
| `github` | 31 | 12,034 | 2 | 24,438 | 107 | 2.7s | $0.0250 | x470.0 |
| `jira` | 58 | 16,430 | 2 | 33,178 | 55 | 2.6s | $0.0335 | x638.0 |

## 2. Just in time with agentregistry

`STAGES=jira,registry TASK=<task> RUNS=3 npm run compare`

**joke** (needs the jokes server only)

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `jira` | 58 | 16,430 | 2 | 33,202 | 86 | 2.7s | $0.0336 |  |
| `registry` | 2 | 525 | 4 | 4,104 | 282 | 4.0s | $0.0055 | -88% |

**github** (needs GitHub only)

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `jira` | 58 | 16,430 | 2 | 58,001 | 129 | 3.9s | $0.0586 |  |
| `registry` | 2 | 525 | 4 | 51,104 | 242 | 4.8s | $0.0523 | -12% |

**release** (needs all three servers)

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `jira` | 58 | 16,430 | 2 | 58,453 | 401 | 5.8s | $0.0605 |  |
| `registry` | 2 | 525 | 4 | 61,246 | 551 | 5.9s | $0.0640 | x1.0 |

## 3. One endpoint, four tool modes, and flows

`CODE_HINT=1 STAGES=standard,search,code,codeSearch,flows TASK=release RUNS=5 npm run compare`

Median of 5 runs. `CODE_HINT=1` adds one sentence to the system prompt: filter inside the script and return only what the question asks for.

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `standard` | 58 | 16,579 | 2 | 58,859 | 327 | 4.0s | $0.0605 |  |
| `search` | 2 | 1,104 | 3 | 31,057 | 840 | 15.5s | $0.0353 | -47% |
| `code` | 1 | 14,581 | 2 | 29,778 | 335 | 6.2s | $0.0315 | -49% |
| `codeSearch` | 2 | 1,506 | 3 | 6,899 | 485 | 9.8s | $0.0093 | -88% |
| `flows` | 1 | 542 | 2 | 1,569 | 209 | 2.0s | $0.0026 | -97% |

Input-token range over the 5 runs: `standard` 58,826 to 101,574, `search` 30,981 to 69,223, `code` 29,731 to 29,787, `codeSearch` 3,983 to 11,389, `flows` 1,556 to 1,590.

The same runs **without** the hint (`CODE_HINT` unset), 5 runs:

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `standard` | 58 | 16,579 | 2 | 58,786 | 363 | 4.6s | $0.0606 |  |
| `search` | 2 | 1,104 | 2 | 34,931 | 718 | 9.2s | $0.0385 | -41% |
| `code` | 1 | 14,581 | 2 | 29,680 | 314 | 6.3s | $0.0313 | -50% |
| `codeSearch` | 2 | 1,506 | 5 | 62,324 | 1,072 | 14.9s | $0.0677 | x1.1 |
| `flows` | 1 | 542 | 2 | 1,520 | 196 | 2.2s | $0.0025 | -97% |

Without the hint, some `codeSearch` runs returned the whole raw release (about 27,000 tokens) from `run_code`, which put the payload back in the context. Those runs cost about 62,000 input tokens and the others about 6,800: the median hides a two-humped distribution. `search` stays near 31,000 to 35,000 either way, because search returns raw results to the model by design.

## 4. Headroom in front of the model (lossy mode)

`STAGES=jira,search,code,codeSearch TASK=release HEADROOM=off,on RUNS=3 npm run compare`

Ignore the `codeSearch` pair: without the hint its run-to-run spread (about 6,800 to 62,000) is larger than any Headroom effect. The other rows show a small effect on a small payload.

| stage | tools | catalog tokens | model calls | input tokens | output tokens | latency | cost | vs first row |
|---|---|---|---|---|---|---|---|---|
| `jira` | 58 | 16,430 | 2 | 58,498 | 305 | 5.6s | $0.0600 |  |
| `jira+headroom` | 58 | 16,430 | 2 | 58,355 | 324 | 4.6s | $0.0600 | 0% |
| `search` | 2 | 1,104 | 2 | 34,952 | 806 | 9.0s | $0.0390 | -40% |
| `search+headroom` | 2 | 1,104 | 2 | 32,732 | 1,108 | 10.0s | $0.0383 | -44% |
| `code` | 1 | 14,581 | 2 | 29,668 | 338 | 6.8s | $0.0314 | -49% |
| `code+headroom` | 1 | 14,581 | 2 | 25,637 | 303 | 6.1s | $0.0272 | -56% |
| `codeSearch` | 2 | 1,506 | 5 | 61,974 | 732 | 21.3s | $0.0656 | x1.1 |
| `codeSearch+headroom` | 2 | 1,506 | 4 | 8,803 | 638 | 18.1s | $0.0120 | -85% |
