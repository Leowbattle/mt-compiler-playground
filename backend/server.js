import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Session } from './lib/session.js';

const PORT = Number(process.env.PORT || 8080);
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 20);
const MAX_PER_IP = Number(process.env.MAX_SESSIONS_PER_IP || 2);
const MAX_CONN_PER_MIN = Number(process.env.MAX_CONN_PER_MIN || 10);

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://leowbattle.github.io',
    'https://www.leowbattle.com',
    'http://www.leowbattle.com',
    'https://leowbattle.com',
    'http://leowbattle.com',
  ].join(',')
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const sessions = new Set();

function originAllowed(origin) {
  // Non-browser clients (e.g. wscat) send no Origin header.
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const perIp = new Map(); // ip -> active sessions
const buckets = new Map(); // ip -> { tokens, last }

function clientIp(req) {
  // Cloud Run appends the real client IP to X-Forwarded-For. Use the last
  // entry rather than the client-supplied leftmost value.
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

function allowConnection(ip) {
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: MAX_CONN_PER_MIN, last: now };
  bucket.tokens = Math.min(
    MAX_CONN_PER_MIN,
    bucket.tokens + ((now - bucket.last) / 60_000) * MAX_CONN_PER_MIN,
  );
  bucket.last = now;
  if (bucket.tokens < 1) {
    buckets.set(ip, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  return true;
}

// Keep the token-bucket map bounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now - bucket.last > 10 * 60 * 1000) buckets.delete(ip);
  }
}, 10 * 60 * 1000).unref();

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
  if (!allowConnection(clientIp(req))) {
    socket.write(
      'HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\nConnection: close\r\n\r\n',
    );
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  const activeForIp = perIp.get(ip) ?? 0;

  if (sessions.size >= MAX_SESSIONS || activeForIp >= MAX_PER_IP) {
    ws.send(JSON.stringify({ type: 'error', message: 'Server busy; try again shortly.' }));
    ws.close(1013, 'busy');
    return;
  }

  perIp.set(ip, activeForIp + 1);
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
    const left = (perIp.get(ip) ?? 1) - 1;
    if (left <= 0) perIp.delete(ip);
    else perIp.set(ip, left);
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
  console.log(
    `limits:   MAX_SESSIONS=${MAX_SESSIONS}, MAX_PER_IP=${MAX_PER_IP}, MAX_CONN_PER_MIN=${MAX_CONN_PER_MIN}`,
  );
});
