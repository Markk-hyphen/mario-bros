'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const C = require('./constants');
const { World } = require('./game');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- Servidor HTTP estático mínimo (sin dependencias extra) ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Resolución segura dentro de PUBLIC_DIR (evita path traversal).
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- Juego -----------------------------------------------------------------
const world = new World();
const wss = new WebSocketServer({ server: httpServer });

let nextId = 1;

wss.on('connection', (ws) => {
  ws.playerId = null;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join' && ws.playerId === null) {
      const id = nextId++;
      ws.playerId = id;
      world.addPlayer(id, msg.name);
      ws.send(JSON.stringify(world.welcomeFor(id)));
      return;
    }
    if (msg.type === 'input' && ws.playerId !== null) {
      world.setInput(ws.playerId, msg);
    }
  });

  ws.on('close', () => {
    if (ws.playerId !== null) world.removePlayer(ws.playerId);
  });
  ws.on('error', () => {});
});

// Heartbeat: descarta conexiones muertas (cliente que cerró sin avisar).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch {}
  }
}, 5000);
wss.on('close', () => clearInterval(heartbeat));

// --- Loops -----------------------------------------------------------------
// Simulación a 60 Hz con acumulador (estable frente al jitter de setInterval).
const STEP_MS = 1000 / C.SIM_HZ;
let last = Date.now();
let acc = 0;
setInterval(() => {
  const now = Date.now();
  acc += now - last;
  last = now;
  let steps = 0;
  while (acc >= STEP_MS && steps < 5) { // tope de 5 para evitar espiral de la muerte
    world.step();
    acc -= STEP_MS;
    steps++;
  }
}, STEP_MS);

// Broadcast de snapshots a 30 Hz.
setInterval(() => {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify(world.snapshot());
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.playerId !== null) ws.send(payload);
  }
}, 1000 / C.NET_HZ);

// --- Arranque + ayuda para conectarse desde la LAN -------------------------
httpServer.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
    }
  }
  console.log('\n  LAN Platformer corriendo.');
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  En LAN:  http://${ip}:${PORT}   <- pasale esta a tus amigos`);
  console.log('\n  Ctrl+C para cortar.\n');
});
