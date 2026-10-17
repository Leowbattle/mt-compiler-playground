# MT Compiler Playground

A three-pane web IDE for the "MT" language from
[compilers-labs](https://github.com/Leowbattle/compilers-labs):

- **Source** — Monaco editor with MT syntax highlighting and an examples dropdown
- **TAM** — the generated TAM instructions
- **Console** — xterm.js terminal for interactive program I/O

The frontend currently runs against a **mock transport** so the UI works without a
backend. Once the backend exists, set `VITE_WS_URL` to the WebSocket endpoint.

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

See [PLAN.md](PLAN.md) for the full design (backend, deployment, CI).
