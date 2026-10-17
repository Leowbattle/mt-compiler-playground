import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Session } from './lib/session.js';

const PORT = Number(process.env.PORT || 8080);
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 20);

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,https://leowbattle.github.io'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const sessions = new Set();

function originAllowed(origin) {
  // Non-browser clients (e.g. wscat) send no Origin header.
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  if (!originAllowed(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  if (sessions.size >= MAX_SESSIONS) {
    ws.send(JSON.stringify({ type: 'error', message: 'Server busy; try again shortly.' }));
    ws.close(1013, 'busy');
    return;
  }

  const session = new Session(ws);
  sessions.add(session);

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (data) => {
    ws.isAlive = true;
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    session.handle(message).catch((error) => {
      console.error('session error:', error);
      session.send({ type: 'error', message: String(error) });
    });
  });
  ws.on('close', () => {
    sessions.delete(session);
    session.dispose('client closed');
  });
  ws.on('error', () => {
    // The close handler cleans up.
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // Ignore; the close handler will clean up.
    }
  }
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`mt-compiler-playground backend listening on :${PORT}`);
  console.log(`compiler: ${process.env.COMPILER_BIN || '(backend/compiler)'}`);
  console.log(`rlwrap:   ${process.env.RLWRAP_BIN || 'rlwrap'}`);
  console.log(`origins:  ${ALLOWED_ORIGINS.join(', ')}`);
});
