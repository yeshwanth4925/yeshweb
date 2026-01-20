// server.js
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const url = require('url');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = parsed.pathname;

  // Serve index.html for any /room/* path
  if (pathname.startsWith('/room/')) {
    pathname = '/index.html';
  }

  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const type =
      ext === '.html' ? 'text/html' :
      ext === '.js'   ? 'text/javascript' :
      ext === '.css'  ? 'text/css' :
      'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

function getRoomIdFromReq(req) {
  try {
    const u = url.parse(req.url, true);
    return u.query.room || 'default';
  } catch {
    return 'default';
  }
}

function broadcast(roomId, data, except) {
  const set = rooms.get(roomId);
  if (!set) return;
  for (const client of set) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws, req) => {
  const roomId = getRoomIdFromReq(req);
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);

  ws.id = Math.random().toString(36).slice(2, 9);

  broadcast(roomId, JSON.stringify({ type: 'system', event: 'join', id: ws.id }), ws);

  ws.on('message', (msg) => {
    broadcast(roomId, msg, ws);
  });

  ws.on('close', () => {
    const set = rooms.get(roomId);
    if (set) set.delete(ws);
    broadcast(roomId, JSON.stringify({ type: 'system', event: 'leave', id: ws.id }));
    if (set && set.size === 0) rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Join a room via: http://localhost:${PORT}/room/my-match`);
});
