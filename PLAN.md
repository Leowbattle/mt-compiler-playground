# MT Compiler Playground — Build Plan

A web IDE for the **cw2** "MT" language from `Leowbattle/compilers-labs`.

Three panes: **Monaco editor** (MT source) · **TAM view** (generated instructions) ·
**interactive xterm terminal** (program I/O). The browser talks over a **WSS** connection
to a Cloud Run container that runs the Haskell compiler (cloned from GitHub at build
time), spawning one compile process and one long-lived interpreter under a PTY per
session.

> Build order: **frontend first** (with a mock transport so it is usable and deployable
> before the backend exists), then backend, then Docker/Cloud Run/CI.

---

## 1. Locked decisions

| Area | Decision |
|---|---|
| Target language | **cw2** only (typed language with functions/recursion) |
| Compiler | **unchanged** Haskell (glibc), built with plain `ghc` — no cabal |
| Compiler source | **cloned from GitHub at build time** (`Leowbattle/compilers-labs`, ref `cw2`) — **not vendored** |
| Backend | Node + Express + `ws`; spawns Haskell subprocesses |
| Interactive I/O | **`node-pty`**, cooked mode, one PTY per session |
| Haskell changes | **none** (cooked PTY gives line buffering; see §7) |
| Frontend | **vanilla TypeScript + Vite**, no framework |
| Editor | **Monaco** (npm dependency) |
| Terminal | **`@xterm/xterm`** + `@xterm/addon-fit` |
| Hosting | frontend on **GitHub Pages** (`https://www.leowbattle.com/mt-compiler-playground/`); backend on **Cloud Run** |
| Transport | **WSS** — `wss://api.mt-compiler-playground.leowbattle.com/ws` |
| CI | GitHub Actions: separate frontend and backend workflows |
| Non-goals | No stepping/debugger, no auth, no persistence, no multi-branch selector |

---

## 2. Architecture

```
┌───────────────────────── browser (GitHub Pages) ─────────────────────────┐
│  toolbar: [Run] [Stop] [examples ▾] [status]                              │
│  ┌──────────────────┬──────────────────┬──────────────────────────────┐   │
│  │ Monaco: MT       │ <pre>: TAM       │ xterm: program I/O           │   │
│  └──────────────────┴──────────────────┴──────────────────────────────┘   │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │ WSS (JSON frames)
                                    │ wss://api.mt-compiler-playground.leowbattle.com/ws
                                    ▼
┌──────────────────── Cloud Run container (Node + Express + ws) ────────────┐
│  per session:                                                             │
│    compile:  spawn compiler prog.mt        → diagnostics + prog.tam       │
│    run:      node-pty spawn compiler prog.tam  (cooked PTY)               │
│    bridge:   ws frames  ⇄  pty stdin/stdout                               │
│  guards:     idle timeout, wall-clock timeout, output cap, session cap    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository layout

```
mt-compiler-playground/
├── PLAN.md
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       ├── frontend.yml        # build + deploy to GitHub Pages
│       └── backend.yml         # build image + deploy to Cloud Run
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts             # wiring
│       ├── editor.ts           # Monaco mount
│       ├── monaco-mt.ts        # MT language registration (Monarch)
│       ├── terminal.ts         # xterm mount
│       ├── session.ts          # WebSocket transport + mock transport
│       ├── examples.ts         # example programs
│       └── styles.css
├── backend/
│   ├── package.json
│   ├── server.js               # express + ws bootstrap
│   └── lib/
│       ├── session.js          # per-session lifecycle
│       └── protocol.js         # message helpers/types
├── Dockerfile                  # clones the compiler from GitHub
└── .dockerignore
```

The compiler is **not vendored**. The Dockerfile clones
`https://github.com/Leowbattle/compilers-labs.git`, checks out `cw2`, and builds it with
`ghc`. Nothing from the compiler repo is committed here. Pin the ref to a commit SHA
(see §8) for reproducible builds.

---

## 4. Frontend (Phase 1 — build this first)

Goal: a fully working three-pane UI that runs against a **mock transport**, deployable
to GitHub Pages before the backend exists.

### 4.1 `index.html`

- Toolbar: `Run`, `Stop`, examples `<select id="examples">`, status indicator
  (`idle` / `compiling` / `running` / `error`).
- Three panes:
  - `#editor` — Monaco container.
  - `#tam` — `<pre>` (read-only), monospace.
  - `#console` — xterm container.

### 4.2 `styles.css`

- Dark theme, CSS grid: `grid-template-columns: 1fr 1fr 1fr` (resize handles optional,
  add only if trivial).
- Each pane scrolls independently. `html, body, #app { height: 100% }`.

### 4.3 `monaco-mt.ts`

Register a Monarch tokenizer for language id `mt`:

- Keywords: `let in var fun if then else while do begin end getint printint`
- Literals: `true false`; types `Integer Boolean`
- Numbers, operators `+ - * / && || ! < <= > >= == != ? : = := ; , ( )`
- No comments in the language (skip).

### 4.4 `editor.ts`

```ts
export async function mountEditor(el: HTMLElement): Promise<{
  getValue(): string;
  setValue(s: string): void;
  dispose(): void;
}>;
```

- `await import('monaco-editor')`.
- `monaco.editor.create(el, { language: 'mt', theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false } })`.
- Register the language once (guard against double registration).

### 4.5 `terminal.ts`

```ts
export async function mountTerminal(
  el: HTMLElement,
  onData: (data: string) => void,
): Promise<{ write(s: string): void; clear(): void; dispose(): void }>;
```

- `await import('@xterm/xterm')` and `@xterm/addon-fit`; import `@xterm/xterm/css/xterm.css`.
- `new Terminal({ cursorBlink: true, convertEol: false })` (cooked PTY supplies CRLF).
- `FitAddon` + `ResizeObserver` → `fit()`.
- **No local echo** — xterm does not echo; the cooked PTY echoes. (The mock transport
  must simulate echo.)
- Forward `term.onData` to `onData`.

### 4.6 `examples.ts`

```ts
export type Example = { name: string; needsInput: boolean; source: string };
export const examples: Example[] = [...];
```

Ship from cw2 tests:

| Name | Input? | Notes |
|---|---|---|
| `sqcb` | no | functions, booleans |
| `test2` | no | argument order |
| `add` | 2 ints | two `getint` |
| `max` | 2 ints | comparison/if |
| `fact` | 1 int | recursion |
| `fibonacci` | 1 int | recursion |

### 4.7 `session.ts`

Define a transport interface so the UI is backend-independent:

```ts
export interface Transport {
  connect(): void;
  run(source: string): void;
  sendInput(data: string): void;
  stop(): void;
  onFrame: (frame: ServerFrame) => void; // set by caller
  onStatus: (s: Status) => void;
}
```

- **`WsTransport`** — real WebSocket. URL from `import.meta.env.VITE_WS_URL`
  (production `wss://api.mt-compiler-playground.leowbattle.com/ws`; local dev
  `ws://localhost:8080/ws`). Sends/receives the JSON frames in §6.
- **`MockTransport`** — for frontend-first development:
  - `run` → after a short delay emit a canned `tam` frame, then a fake prompt
    `stdout: "Enter a number: "`.
  - `sendInput` → echo the input locally (append `data`) and emit a canned `stdout`
    result depending on the example (or just `output > <input>\n`), then `exit`.
  - Lets the panes, buttons, dropdown, and styling be built/tested with no server.
- Select transport at startup: use `MockTransport` unless `VITE_WS_URL` is set (or a
  `?mock=1` query flag).

### 4.8 `main.ts`

- Mount editor and terminal.
- Populate the examples `<select>` from `examples.ts`.
- On select change → `editor.setValue(example.source)`.
- On `Run` → clear TAM + terminal, `session.run(editor.getValue())`.
- On `Stop` → `session.stop()`.
- On terminal `onData` → `session.sendInput(data)`.
- Dispatch server frames:
  - `tam` → set `<pre>` text.
  - `diagnostics` → prefix in TAM pane or a small banner; keep simple.
  - `stdout`/`stderr` → `term.write`.
  - `exit` → status idle.
  - `error` → write to terminal + status error.
- Update status indicator.

### 4.9 `vite.config.ts`

- `base` must match the Pages path. For a project site:
  `base: process.env.VITE_BASE ?? '/mt-compiler-playground/'`.
  (Or `/` for a custom domain/user site.)
- Dev proxy (when the backend exists):
  `server.proxy = { '/ws': { target: 'ws://localhost:8080', ws: true } }`.

### 4.10 Frontend dev commands

```
cd frontend
npm install
npm run dev      # mock mode unless VITE_WS_URL is set
npm run build    # outputs frontend/dist
```

---

## 5. Backend (Phase 2)

Goal: run the compiler (built from the upstream repo), expose an interactive PTY
session over **WSS**.

### 5.1 `server.js`

- Express app + Node `http.Server` + `ws` `Server` at `/ws`.
- `GET /health` → `200 ok` (Cloud Run health check).
- `Origin` allowlist check on WebSocket upgrade
  (`https://www.leowbattle.com`, plus `http://localhost:*` in dev).
- Per-connection → construct a `Session` (§5.2).
- Global caps: reject if active sessions exceed `MAX_SESSIONS` (e.g. 20).

### 5.2 `lib/session.js`

State per socket:

```
tmpDir, compileProc, ptyProc, pty, idleTimer, clockTimer, bytesOut
```

Flow:

1. `run(source)`:
   - `fs.mkdtemp(path.join(os.tmpdir(), 'mt-'))` → `prog.mt`.
   - Write source.
   - Spawn `compiler prog.mt` **with pipes** (no PTY needed; buffering flushes on exit).
   - On exit: read `prog.tam`; send `{type:"tam", text}`; send compiler stdout minus
     the `compiled to TAM file: ...` line as `{type:"diagnostics", text}`.
   - If the `.tam` text is empty (cw2 emits no code when type checking fails) →
     send `{type:"error", message:"Type errors"}` and **do not** start the interpreter.
2. `startInterpreter()`:
   - Wrap the interpreter in **`rlwrap`** for readline (history, arrow keys):
     `pty.spawn(RLWRAP_BIN, ['-n', '-H', historyPath, COMPILER, tamPath], {...})`.
   - Use `-n` (no warnings), **not `-q`** — in rlwrap `-q` means `--quote-characters`.
   - **Cooked mode is the default** — do not pass `raw`/`echo:false`.
   - `pty.onData(d)` → `{type:"stdout", text:d}` (cap total bytes).
   - `pty.onExit(({exitCode}))` → `{type:"exit", code:exitCode}`.
3. `input(data)` → `pty.write(data)`.
4. `resize(cols, rows)` (optional) → `pty.resize(cols, rows)`.
5. `stop()` / socket close → `pty.kill()`, kill compile proc, `fs.rm(tmpDir, {recursive:true})`,
   clear timers.

Guards:

- **Idle timeout**: no client message for 10 min → close socket + cleanup. (Protects the
  free tier: an open socket is billed while it lives.)
- **Wall-clock timeout**: interpreter running > 30–60 s → `SIGKILL` (infinite loops).
- **Output cap**: e.g. 1 MB per session, then stop.
- Always clean up temp dirs, including on abnormal exit.

### 5.3 `lib/protocol.js`

Small helpers/types for the frame shapes in §6 (parse/validate, `send`).

### 5.4 Backend dev commands

```
cd backend
npm install
node server.js      # listens on PORT (default 8080)
```

For local backend testing you need the Haskell compiler binary. Clone it from GitHub
(the same thing the Dockerfile does):

```
git clone --branch cw2 https://github.com/Leowbattle/compilers-labs.git /tmp/compilers-labs
cd /tmp/compilers-labs && ghc -O2 -o /home/leo/src/mt-compiler-playground/backend/compiler Main.hs
```

(or point `COMPILER_BIN` at a binary built elsewhere). The Docker image builds it in a
stage.

---

## 6. WebSocket protocol

Transport is **WSS** in production
(`wss://api.mt-compiler-playground.leowbattle.com/ws`); plain `ws://localhost:8080/ws`
only for local development. Frames are JSON:

```
C→S  {type:"run",    source:"..."}
C→S  {type:"input",  data:"4\r"}          // raw keystrokes from xterm.onData
C→S  {type:"resize", cols:120, rows:30}   // optional
C→S  {type:"stop"}

S→C  {type:"tam",         text:"LOADL 0\n..."}
S→C  {type:"diagnostics", text:"Variable x: ..."}
S→C  {type:"stdout",      text:"Enter a number: "}
S→C  {type:"stderr",      text:"..."}
S→C  {type:"exit",        code:0}
S→C  {type:"error",       message:"..."}
```

Notes:

- `input.data` is raw terminal input. xterm sends `\r` for Enter; the cooked PTY maps
  CR→NL, so the Haskell `hGetLine` receives a proper line. Do **not** rewrite it.
- `stdout.text` is a chunk of terminal output; feed it straight to `term.write`.

---

## 7. Why no compiler changes are needed

Running the interpreter under a **cooked PTY** makes GHC choose `LineBuffering`
(`isatty` is true), so output flushes on newlines. In the cw2 VM:

- `GETINT` → `putStrLn "Enter a number: "` — newline → flushes immediately.
- `PUTINT` → `putStr "output > "` then `print x` — the newline from `print` flushes both.

Cooked mode also provides input echo, backspace/line editing, and CR→NL translation.
So the upstream Haskell is used verbatim; `hSetBuffering` is unnecessary.

If a future prompt ever lacks a following newline, add a tiny launcher
(`Webrun.hs`) that sets `NoBuffering` and calls the existing `parseTAM`/`runTAM` —
without editing the compiler modules.

---

## 8. Dockerfile (repo root, build context = repo root)

Multi-stage:

**Stage 1 — compiler** (`haskell:9.10`, Debian):
```
ARG COMPILER_REPO=https://github.com/Leowbattle/compilers-labs.git
ARG COMPILER_REF=cw2          # pin to a commit SHA for reproducible builds

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone "$COMPILER_REPO" . && git checkout "$COMPILER_REF"
RUN ghc -O2 -o /out/compiler Main.hs
RUN ldd /out/compiler   # inspect runtime deps; install matching libs in stage 2
```

**Stage 2 — runtime** (`node:20-bookworm-slim`):
```
apt-get install -y --no-install-recommends rlwrap libgmp10 python3 make g++   # rlwrap = readline; build deps for node-pty
COPY --from=0 /out/compiler /usr/local/bin/compiler
COPY backend/ /app/
WORKDIR /app
RUN npm ci --omit=dev        # node-pty builds here (package.json allowScripts approves it)
COPY ... (server files)
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server.js"]
```

Notes:

- **glibc rule:** runtime glibc must be ≥ builder glibc. Builder bookworm-or-older +
  runtime bookworm is safe.
- **node-pty is native.** Either install `python3 make g++` in the runtime stage, or run
  `npm ci` in a separate builder stage and copy `node_modules`. Verify with
  `ldd node_modules/node-pty/build/Release/pty.node`.
- Temp files go under `/tmp` (the only writable path on Cloud Run).
- Keep the image small-ish, but **image size barely affects Cloud Run cold start**
  (image streaming).

`.dockerignore`: `.git`, `frontend`, `**/node_modules`, `**/dist`, `PLAN.md`, `README.md`.

---

## 9. Cloud Run deployment

Build/push once (or via CI, §10):

```
gcloud artifacts repositories create mt-playground \
  --repository-format=docker --location=us-central1

gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/mt-playground/backend
gcloud run deploy mt-compiler-playground \
  --image us-central1-docker.pkg.dev/PROJECT/mt-playground/backend \
  --region us-central1 --allow-unauthenticated \
  --memory 256Mi --cpu 1 --concurrency 20 --max-instances 3 --timeout 600
```

- Set a **$1 budget alert**.
- WebSockets are billed while open → keep the idle timeout short (10 min).
- `--timeout 600` caps connection life at 10 min (fine for a playground).
- Plain Cloud Run URL: `https://mt-compiler-playground-xxxx.a.run.app`.

### Custom domain (WSS endpoint)

```
gcloud run domain-mappings create \
  --service=mt-compiler-playground \
  --domain=api.mt-compiler-playground.leowbattle.com \
  --region=us-central1
```

Add the DNS record `gcloud` prints (typically a `CNAME` for `api.mt-compiler-playground`
to `ghs.googlehosted.com`). Google provisions a **managed TLS certificate**, so the
public endpoint becomes:

```
wss://api.mt-compiler-playground.leowbattle.com/ws
```

> If `leowbattle.com` is on Cloudflare, set the `api` record to **DNS-only (grey cloud)**
> while the Google-managed cert provisions; proxying can block issuance. Enable the
> proxy afterward only if you want Cloudflare in front.

**Risk to smoke-test early:** `node-pty` needs `/dev/pts` inside the container. gVisor
generally supports it, but verify on the first deploy; fallback is `script`/`socat`
(allocation of the same PTY, different tool).

---

## 10. GitHub Actions

### 10.1 `frontend.yml` (GitHub Pages)

Trigger: push to `main` touching `frontend/**` (+ `workflow_dispatch`).

```
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    - checkout
    - actions/setup-node (node 20, cache npm)
    - cd frontend && npm ci && npm run build   # VITE_BASE=/mt-compiler-playground/
    - actions/upload-pages-artifact (path: frontend/dist)
  deploy:
    - actions/deploy-pages
```

Repo settings: **Pages → Source = GitHub Actions**. Set `VITE_WS_URL` as a build env
(or repo variable) to `wss://api.mt-compiler-playground.leowbattle.com/ws`, and
`VITE_BASE` to `/mt-compiler-playground/`. Watch the base — a wrong one is the classic
404-assets failure.

### 10.2 `backend.yml` (Cloud Run)

Trigger: push to `main` touching `backend/**`, `Dockerfile` (+ `workflow_dispatch`).
The compiler is cloned inside the Docker builder, so there is no `compiler/**` path in
this repo; a rebuild picks up whatever `COMPILER_REF` points to.

```
permissions: { contents: read, id-token: write }
jobs:
  deploy:
    - checkout
    - google-github-actions/auth (Workload Identity Federation preferred)
    - google-github-actions/setup-gcloud
    - docker build --build-arg COMPILER_REF=${{ vars.COMPILER_REF }} -t IMAGE . && docker push IMAGE
    - gcloud run deploy ...
```

Repo variables/secrets needed: `GCP_PROJECT`, `GCP_REGION`, `GCP_WIF_PROVIDER`,
`GCP_SERVICE_ACCOUNT`, `AR_REPO`, `SERVICE_NAME`, `COMPILER_REF`.

> **Note:** GitHub Pages cannot host the Node backend. "Deploy the backend" here means
> **Cloud Run**. If a different target is wanted (Render/Fly/VPS), only this workflow
> changes.

---

## 11. Local development

1. **Frontend only (mock):**
   ```
   cd frontend && npm install && npm run dev
   ```
   Exercises all three panes, the examples dropdown, and Run/Stop with `MockTransport`.

2. **Frontend + backend:**
   ```
   git clone --branch cw2 https://github.com/Leowbattle/compilers-labs.git /tmp/compilers-labs
   cd /tmp/compilers-labs && ghc -O2 -o /home/leo/src/mt-compiler-playground/backend/compiler Main.hs
   cd /home/leo/src/mt-compiler-playground/backend && npm install && node server.js
   cd ../frontend && VITE_WS_URL=ws://localhost:8080/ws npm run dev
   ```

3. **Protocol probe (before UI wiring):**
   ```
   npx wscat -c ws://localhost:8080/ws
   > {"type":"run","source":"let var x: Integer; var i: Integer := 0 in ..."}
   ```

---

## 12. Milestones & acceptance criteria

| Milestone | Deliverable | Done when |
|---|---|---|
| **M1** | Frontend scaffold + 3 panes + examples dropdown + `MockTransport` | `npm run build` works; UI runs locally in mock mode |
| **M2** | GitHub Pages workflow | Site deploys on push and loads with working mock session |
| **M3** | Backend local (compile + `node-pty`) | `wscat` runs `sqcb` (no input) and `fibonacci` (interactive `8`) |
| **M4** | Frontend wired to real backend | Same flows work through the UI |
| **M5** | Docker + Cloud Run | Public URL; type errors shown; infinite loop killed |
| **M6** | Backend CI + polish | Push to `main` redeploys both; error/status styling done |

**Acceptance:** pick an example from the dropdown → Run → TAM appears → program output
streams to the terminal → `getint` prompts accept input interactively → `fibonacci`
returns the right sequence → cw2 type errors are displayed and no run occurs.

---

## 13. Open questions / risks

1. **`node-pty` on Cloud Run** — verify `/dev/pts` works (gVisor). Fallback: `script`/`socat`.
2. **Pages base path** — must match the repo/domain or assets 404.
3. **Backend deploy target** — assumed **Cloud Run** (Pages is static-only).
4. **Compiler ref pinning** — the Dockerfile clones upstream and checks out `cw2`; pin
   `COMPILER_REF` to the `cw2` commit SHA (`494174c…`) for reproducible builds.
5. **Backend URL** — currently
   `wss://mt-compiler-playground-hgblofd7eq-uc.a.run.app/ws`; the planned custom domain
   is `wss://api.mt-compiler-playground.leowbattle.com/ws` (pending domain
   verification). Set as `VITE_WS_URL` for the Pages build and allow
   `https://www.leowbattle.com` as an `Origin`.
6. **Cost** — free tier is ample; the only runaway risk is idle-open sockets, mitigated
   by the idle timeout + `--max-instances`.
