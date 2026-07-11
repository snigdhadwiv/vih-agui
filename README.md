# Agentic UI

A floating AI agent you drop into an existing dashboard app. It scans your
project once, then lets you ask for new or modified KPI cards, charts,
tables, and filters in plain English — built from your own components,
your own chart/table libraries, and your own styling, not a generic template.

```
"Add a KPI card for weekly active users next to the revenue card"
"Turn the orders table into a bar chart of orders per day"
"Add a date-range filter to the sales dashboard and wire it to /api/sales"
```

## How it works (architecture)

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Your app (any stack)   │        │  Agentic UI local server  │
│                          │        │  (node, runs on :4411)    │
│  <agentic-ui-agent>      │  HTTP  │                            │
│  Web Component,          │◄──────►│  /api/agentic-ui/chat      │
│  Shadow DOM, no build     │        │    → calls Claude with     │
│  step required            │        │      tools: read_file,     │
│                          │        │      propose_edit          │
│  floating bubble,         │        │  /api/agentic-ui/apply     │
│  bottom-right              │        │    → writes file to disk   │
└─────────────────────────┘        │      only after you click  │
                                     │      "Apply" on a diff     │
                                     └──────────────────────────┘
                 ▲
                 │ read at startup / on `scan`
                 │
      .agentic-ui/manifest.json
      (framework, components, chart/table libs,
       styling tokens, API endpoints — generated
       by the scanner, nothing sent anywhere until
       you send a prompt)
```

Three pieces ship in this package:

1. **Scanner** (`src/scanner`) — walks your repo, detects framework
   (React / Vue / Angular / Svelte / Next / Nuxt / vanilla), indexes
   components and tags them (`card`, `table`, `chart`, `filter`, `modal`,
   `layout`), detects chart/table/UI-kit libraries already in
   `package.json`, and pulls CSS variables / Tailwind config so generated
   UI matches your palette instead of inventing its own. Output:
   `.agentic-ui/manifest.json`.
2. **Widget** (`src/widget/agentic-widget.js`) — a native Web Component,
   `<agentic-ui-agent>`. Framework-agnostic by construction: Web Components
   run unmodified in React, Vue, Angular, Svelte, or a static HTML page.
   Optional thin wrappers (`react.jsx`, `AgenticUiAgent.vue`) exist purely
   for teams who want an idiomatic import.
3. **Agent server** (`server/index.js`) — a small Express server that holds
   your Anthropic API key (never exposed to the browser), grounds every
   request in the manifest, and gives the model two tools: `read_file`
   (read-only, confined to your project root) and `propose_edit`. The model
   never writes to disk directly — it proposes a diff, the widget shows it
   in the chat panel, and only your `apply` click writes the file.

## Install

```bash
npm install agentic-ui
npx agentic-ui init
```

`init` will:
- scan your project and write `.agentic-ui/manifest.json`
- try to auto-inject the widget's `<script>` + `<agentic-ui-agent>` tag into
  your `index.html` (or tell you the two lines to paste if it can't find one —
  common for Angular/Next.js server-rendered shells)
- scaffold `.env.agentic-ui.example` — copy to `.env` and add
  `AGENTIC_UI_ANTHROPIC_API_KEY`

Then, in a separate terminal alongside your normal dev server:

```bash
npx agentic-ui server        # starts the agent server on :4411
```

Open your app — the bubble appears bottom-right. That's the whole install.

### Manual injection (if `init` couldn't find an HTML entry point)

```html
<script type="module" src="/node_modules/agentic-ui/src/widget/agentic-widget.js"></script>
<agentic-ui-agent endpoint="http://localhost:4411"></agentic-ui-agent>
```

For meta-frameworks with no single `index.html` (Next.js App Router, Nuxt,
Angular universal), add those two lines to your root layout / shell
component instead.

## Realistic timeline

- **~5 minutes**: install, `init`, add API key, start agent server.
- **~15–20 minutes**: first few prompts, agent reading your real components,
  you reviewing and applying diffs, tuning what it has access to.
- **~1 hour**: it has round-tripped on enough of your actual cards/tables/
  charts that prompts reliably produce edits that fit your codebase without
  you re-explaining conventions each time. "Fully autonomous" is a stretch
  goal, not day-one behavior — see Limitations below.

## Choosing a backend

Agentic UI supports two kinds of LLM backend, picked automatically from
whichever env vars are set (or forced via `AGENTIC_UI_LLM_PROVIDER`):

- **`anthropic`** — uses native tool-calling: the model calls `read_file`
  itself (read-only, confined to the project root) as many times as it
  needs, then finishes with one `propose_edit`. Set
  `AGENTIC_UI_ANTHROPIC_API_KEY`.
- **`openai_compatible`** — for GLM, vLLM, Ollama, LM Studio, or any other
  server exposing `/v1/chat/completions`. No tool-calling assumed: the
  server itself picks likely-relevant files from the manifest (by matching
  keywords in your prompt against component tags), inlines their contents
  into the prompt, and asks the model to reply as strict JSON. Set
  `AGENTIC_UI_LLM_PROVIDER=openai_compatible`, `AGENTIC_UI_LLM_BASE_URL`,
  `AGENTIC_UI_LLM_MODEL`, and optionally `AGENTIC_UI_LLM_API_KEY` if the
  server requires one.

With **neither** configured, the server runs in **MOCK mode**: canned
replies so you can test the widget → chat → diff → apply flow with zero
setup and zero API cost, before pointing it at a real model.

⚠ A couple of things worth checking before pointing this at a self-hosted
or third-party OpenAI-compatible endpoint with real project code:
- Confirm the connection is trusted/encrypted if the codebase is
  sensitive — your file contents get sent to whatever `AGENTIC_UI_LLM_BASE_URL`
  points at.
- Bare-IP endpoints with no auth token tend to be demo/test deployments —
  fine to experiment against, but don't assume uptime or that no one else
  can hit the same box.
- JSON-mode reliability varies by model; if a smaller/faster model like a
  "Flash" variant returns malformed JSON, the widget will show its raw text
  instead of a diff rather than silently failing — that's the adapter's
  fallback, not a bug.

## Production hardening

These are on by default or one env var away — not optional add-ons:

- **Bound to `127.0.0.1` only.** The agent server never listens on all
  network interfaces by default, so it isn't reachable from your LAN/wifi
  unless you explicitly set `AGENTIC_UI_HOST=0.0.0.0` (don't, unless you
  also set a token — see below).
- **CORS locked to localhost.** Only `http://localhost:*` / `http://127.0.0.1:*`
  origins are allowed by default. Add more via `AGENTIC_UI_ALLOWED_ORIGINS`
  (comma-separated) if your dev server runs somewhere else.
- **Optional bearer-token auth.** Set `AGENTIC_UI_TOKEN` in `.env` and pass
  the same value as the widget's `token` attribute:
  `<agentic-ui-agent endpoint="..." token="...">`. Without it, the server
  runs unauthenticated (fine solo, on a trusted machine only) and prints a
  loud warning on every boot so it's never silently insecure.
- **Rate limiting.** Default 60 requests / 5 minutes per IP across
  chat + apply, configurable via `AGENTIC_UI_RATE_LIMIT`.
- **Backups + audit log, not just overwrite-and-hope.** Every `/apply`
  snapshots the file's previous contents into `.agentic-ui/backups/` and
  appends a line to `.agentic-ui/audit.log` before writing. Undo any single
  apply with:
  ```bash
  npx agentic-ui undo path/to/file.jsx
  ```
  This is a safety net, not a replacement for git — commit your work.
- **Path confinement.** Both `read_file` (Anthropic backend) and `/apply`
  resolve paths against the project root and reject anything that escapes
  it (`../../etc/passwd`-style traversal, symlink games, etc.).

### What's still NOT here (be honest with yourself before calling this "done")

- **No real AST parsing.** The scanner is regex/filename heuristics, fast
  and dependency-light, but it can misclassify unusually-named files. A
  genuinely production-grade scanner would use `@babel/parser` / `ts-morph`
  for JS/TS, the Vue SFC compiler, and the Svelte compiler to build a real
  component graph with prop types — that's a substantial follow-on project,
  not a checkbox.
- **`/apply` overwrites full file contents, not a true patch.** No conflict
  detection if the file changed since the model read it. A real patch/merge
  engine (three-way merge, or at minimum a proper unified-diff apply with
  `git apply`) is the right next step before trusting this on files you
  haven't just backed up.
- **No automated tests.** There's nothing here verifying the scanner's
  classification accuracy or the adapters' JSON-parsing robustness against
  regressions — needed before calling this CI-gateable.
- **Single-tenant, one project root, one LLM backend per server instance.**
  Nothing here supports multiple users, multiple projects, or role-based
  access control. If this needs to run as a shared team service rather than
  "one dev, one laptop," that's a different architecture (a real database
  instead of flat JSON files, per-user auth instead of one shared token,
  etc.) — worth scoping separately rather than bolting on top of this.



## Re-scanning

Run `npx agentic-ui scan` after adding new components or libraries so the
manifest stays current. For large monorepos, scan a subfolder by running
the command from that subfolder — the manifest is written to whichever
directory you run it from.

## Limitations (read before relying on this)

- **Heuristic scanning, not a compiler.** The scanner uses filename and
  text-pattern heuristics, not a full AST/type-checker, to stay dependency-
  light and fast. It can misclassify unusually-named components; if a
  prompt seems to target the wrong file, mention the file path explicitly.
- **No fully-autonomous multi-file refactors.** Each turn proposes one file
  at a time for review. This is intentional — an agent with unreviewed
  write access to your source tree is a bigger risk than the convenience is
  worth.
- **Applies overwrite the target file's full contents** in this MVP (not a
  true unified diff/patch). Use git or your editor's local history as your
  safety net — commit before a session, review the diff panel before
  clicking Apply.
- **Framework coverage is heuristic-driven**, strongest for React/Vue/plain
  HTML dashboards. Angular and Svelte detection works, but generated code
  quality depends on how idiomatic the surrounding files already are —
  the agent imitates what it reads.
- **You provide the Anthropic API key** and its usage cost; this package
  doesn't include hosting or a bundled key.
- **Not a security boundary.** `read_file`/`apply` are confined to the
  project root, but this tool is meant for local development, not for
  exposing write access to untrusted users in production.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `AGENTIC_UI_LLM_PROVIDER` | auto-detected | `anthropic` or `openai_compatible`; only needed to force one |
| `AGENTIC_UI_ANTHROPIC_API_KEY` | — | for the `anthropic` backend, used only server-side |
| `AGENTIC_UI_LLM_BASE_URL` | — | for `openai_compatible`, e.g. `http://45.194.90.209:8000/v1` |
| `AGENTIC_UI_LLM_MODEL` | — | for `openai_compatible`, e.g. `zai-org/GLM-4.7-Flash` |
| `AGENTIC_UI_LLM_API_KEY` | — | optional, only if your `openai_compatible` server requires a bearer token |
| `AGENTIC_UI_PORT` | `4411` | agent server port |
| `AGENTIC_UI_HOST` | `127.0.0.1` | bind address — leave alone unless you know why you're changing it |
| `AGENTIC_UI_TOKEN` | — | shared secret required in `Authorization: Bearer` header; unset = no auth |
| `AGENTIC_UI_ALLOWED_ORIGINS` | — | extra CORS origins beyond localhost, comma-separated |
| `AGENTIC_UI_RATE_LIMIT` | `60` | max requests per IP per 5-minute window |

## License

MIT
