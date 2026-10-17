# MT Compiler Playground

A three-pane web IDE for the "MT" language from
[compilers-labs](https://github.com/Leowbattle/compilers-labs):

- **Source** — Monaco editor with MT syntax highlighting and an examples dropdown
- **TAM** — the generated TAM instructions
- **Console** — xterm.js terminal for interactive program I/O

The frontend runs against a **mock transport** by default so the UI works without a
backend. Set `VITE_WS_URL` to connect to the real backend (see below).

## Live deployment

- **Frontend:** https://www.leowbattle.com/mt-compiler-playground/
- **Backend:** https://api.mt-compiler-playground.leowbattle.com
- **WebSocket:** `wss://api.mt-compiler-playground.leowbattle.com/ws`

Deploys are automatic on push to `main`:

- `.github/workflows/frontend.yml` builds the Vite app and deploys to GitHub Pages.
- `.github/workflows/backend.yml` builds the Docker image, pushes it to Artifact
  Registry, and deploys to Cloud Run.

The API is served from the custom domain
`wss://api.mt-compiler-playground.leowbattle.com/ws` via a Cloud Run domain mapping with
a Google-managed certificate.

## Development

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Add `?mock=1` to force mock mode, or set `VITE_WS_URL=ws://localhost:8080/ws`
to connect to a backend.

```bash
npm run build        # production build -> frontend/dist
npm run typecheck    # tsc --noEmit
```

For a GitHub Pages project site, build with:

```bash
VITE_BASE=/mt-compiler-playground/ npm run build
VITE_WS_URL=wss://api.mt-compiler-playground.leowbattle.com/ws npm run build
```

## Backend

The backend compiles and runs programs with the cw2 Haskell compiler. The interpreter
is wrapped in **`rlwrap`**, which provides readline-style line editing and history
(arrow keys) inside the xterm pane.

```bash
cd backend
npm install
bash build-compiler.sh        # clones cw2 from GitHub and builds ./compiler (needs ghc + git)
COMPILER_BIN="$PWD/compiler" npm start
```

`rlwrap` must be on `PATH` (e.g. `apt install rlwrap`). The server listens on
`http://localhost:8080` (`/health`, WebSocket at `/ws`).

Then run the frontend against it:

```bash
cd frontend
VITE_WS_URL=ws://localhost:8080/ws npm run dev
```

See [PLAN.md](PLAN.md) for the full design (deployment, CI, protocol).
