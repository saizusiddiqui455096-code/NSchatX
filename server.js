/* NS ChatX server — REST auth + WebSocket rooms. In-memory only. */
'use strict';

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8000;
const app = express();
const staticRoot = __dirname;
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(staticRoot));
app.get('/', (_req, res) => res.sendFile(path.join(staticRoot, 'index.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(staticRoot, 'index.html'));
});

/* ------------------------------- storage -------------------------------- */
// rooms: id -> { salt, hash, users: Map<username, ws>, history: [], lastEmpty }
const rooms = new Map();
// tokens: token -> { roomId, username, exp }
const tokens = new Map();

const HISTORY_MAX = 200;
const ROOM_TTL_MS = 60 * 60 * 1000; // empty rooms expire after an hour
const TOKEN_TTL_MS = 2 * 60 * 1000;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}
function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}
function safeEqual(a, b) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function randomRoomId() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[crypto.randomInt(abc.length)];
  return out;
}
function normalizeRoomId(id) {
  return String(id || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function validate(body) {
  const username = String(body.username || '').trim().slice(0, 24);
  const password = String(body.password || '');
  if (username.length < 2) return { error: 'Username must be at least 2 characters.' };
  if (password.length < 4) return { error: 'Password must be at least 4 characters.' };
  return { username, password };
}

function issueToken(roomId, username) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { roomId, username, exp: Date.now() + TOKEN_TTL_MS });
  return token;
}

/* --------------------------------- REST --------------------------------- */
app.post('/api/rooms', (req, res) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ error: v.error });

  let roomId = normalizeRoomId(req.body.roomId);
  if (!roomId) {
    do {
      roomId = randomRoomId();
    } while (rooms.has(roomId));
  }
  if (roomId.length > 24) return res.status(400).json({ error: 'Room ID is too long.' });
  if (rooms.has(roomId)) {
    return res
      .status(409)
      .json({ error: `Room ${roomId} already exists. Join it instead, or pick another ID.` });
  }

  const salt = makeSalt();
  rooms.set(roomId, {
    salt,
    hash: hashPassword(v.password, salt),
    users: new Map(),
    history: [],
    lastEmpty: Date.now(),
  });

  res.json({ roomId, username: v.username, token: issueToken(roomId, v.username) });
});

app.post('/api/rooms/join', (req, res) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ error: v.error });

  const roomId = normalizeRoomId(req.body.roomId);
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: `No room called ${roomId || '—'} is open.` });
  if (!safeEqual(room.hash, hashPassword(v.password, room.salt))) {
    return res.status(401).json({ error: 'That password does not match this room.' });
  }
  if (room.users.has(v.username)) {
    return res.status(409).json({ error: `"${v.username}" is already in this room. Pick another name.` });
  }

  res.json({ roomId, username: v.username, token: issueToken(roomId, v.username) });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

/* ------------------------------ WebSocket -------------------------------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.endsWith('/ws')) {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get('token');
  const claim = tokens.get(token);
  if (!claim || claim.exp < Date.now()) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  tokens.delete(token);
  const room = rooms.get(claim.roomId);
  if (!room) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.roomId = claim.roomId;
    ws.username = claim.username;
    wss.emit('connection', ws, req);
  });
});

function broadcast(roomId, payload, exclude) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const [name, sock] of room.users) {
    if (name === exclude) continue;
    if (sock.readyState === 1) sock.send(data);
  }
}

function presence(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const users = [...room.users.keys()];
  broadcast(roomId, { type: 'presence', users, count: users.length });
}

function pushHistory(room, entry) {
  room.history.push(entry);
  if (room.history.length > HISTORY_MAX) room.history.shift();
}

wss.on('connection', (ws) => {
  const room = rooms.get(ws.roomId);
  if (!room) return ws.close();

  if (room.users.has(ws.username)) {
    ws.send(JSON.stringify({ type: 'error', message: 'That username is already connected.' }));
    return ws.close();
  }

  room.users.set(ws.username, ws);
  room.lastEmpty = null;

  ws.send(
    JSON.stringify({
      type: 'welcome',
      roomId: ws.roomId,
      username: ws.username,
      history: room.history,
      users: [...room.users.keys()],
      count: room.users.size,
    }),
  );

  const joined = { type: 'system', text: `${ws.username} joined the room`, ts: Date.now() };
  pushHistory(room, joined);
  broadcast(ws.roomId, joined, ws.username);
  presence(ws.roomId);

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.type === 'message') {
      const text = String(m.text || '').slice(0, 2000).trim();
      if (!text) return;
      const entry = { type: 'message', from: ws.username, text, ts: Date.now() };
      pushHistory(room, entry);
      broadcast(ws.roomId, entry);
    } else if (m.type === 'typing') {
      broadcast(ws.roomId, { type: 'typing', from: ws.username, active: !!m.active }, ws.username);
    }
  });

  ws.on('close', () => {
    const r = rooms.get(ws.roomId);
    if (!r) return;
    if (r.users.get(ws.username) === ws) r.users.delete(ws.username);
    const left = { type: 'system', text: `${ws.username} left the room`, ts: Date.now() };
    pushHistory(r, left);
    broadcast(ws.roomId, left);
    presence(ws.roomId);
    if (r.users.size === 0) r.lastEmpty = Date.now();
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.users.size === 0 && room.lastEmpty && now - room.lastEmpty > ROOM_TTL_MS) {
      rooms.delete(id);
    }
  }
  for (const [t, c] of tokens) if (c.exp < now) tokens.delete(t);
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NS ChatX server listening on ${PORT}`);
});
