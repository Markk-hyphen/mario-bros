'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const C = require('./constants');
const { LEVELS } = require('./level');
const { World } = require('./game');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// --- Servidor HTTP estático mínimo -----------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

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

// --- Estado de campaña -----------------------------------------------------
// Vive fuera del World para sobrevivir las transiciones de nivel.
// campaignData: Map<playerId, { name, color, score }>
let campaignData = new Map();
let currentLevelIndex = 0;
let worldConfig = { mode: 'classic', holdSecs: 10 };

let world = null;

function createWorld(levelIndex) {
  const w = new World(levelIndex, worldConfig.mode, worldConfig.holdSecs);
  // Re-agregar todos los jugadores conectados con su score acumulado.
  for (const [id, data] of campaignData) {
    w.addPlayer(id, data.name, data.color, data.score);
  }
  return w;
}

function advanceLevel() {
  // Guardar scores actuales antes de destruir el world.
  for (const [id, p] of world.players) {
    if (campaignData.has(id)) campaignData.get(id).score = p.score;
  }

  currentLevelIndex++;
  const isEnd = currentLevelIndex >= LEVELS.length;
  if (isEnd) currentLevelIndex = 0;

  world = createWorld(currentLevelIndex);

  // Notificar a cada cliente: nuevo world, mismo ws/id.
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.playerId !== null) {
      ws.send(JSON.stringify(world.welcomeFor(ws.playerId)));
    }
  }

  if (isEnd) {
    console.log('  Campaña completada — reiniciando desde nivel 1.');
  } else {
    console.log(`  Nivel ${currentLevelIndex + 1}: ${LEVELS[currentLevelIndex].name}`);
  }
}

// --- WebSocket -------------------------------------------------------------
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
      // Primer jugador define el modo; los siguientes heredan el mundo en curso.
      if (!world) {
        worldConfig.mode = msg.mode === 'coin-rush' ? 'coin-rush' : 'classic';
        worldConfig.holdSecs = clamp(parseInt(msg.holdSecs) || 10, 5, 120);
        world = createWorld(currentLevelIndex);
      }

      const id = nextId++;
      ws.playerId = id;

      // Color asignado de la paleta global para persistir entre niveles.
      const color = C.PLAYER_COLORS[(id - 1) % C.PLAYER_COLORS.length];
      campaignData.set(id, { name: (msg.name || 'P').slice(0, 16), color, score: 0 });

      world.addPlayer(id, campaignData.get(id).name, color, 0);
      ws.send(JSON.stringify(world.welcomeFor(id)));
      return;
    }

    if (msg.type === 'input' && ws.playerId !== null && world) {
      world.setInput(ws.playerId, msg);
    }
    if (msg.type === 'respawn' && ws.playerId !== null && world) {
      world.teleportToSpawn(ws.playerId);
    }

    if (msg.type === 'restart' && ws.playerId !== null && world && world.gameOver) {
      // Restart solo aplica en modo coin-rush (el clásico no tiene game over).
      campaignData.clear();
      currentLevelIndex = 0;
      nextId = 1;
      world = null;
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ type: 'restart' }));
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.playerId !== null) {
      if (world) world.removePlayer(ws.playerId);
      campaignData.delete(ws.playerId);
    }
  });
  ws.on('error', () => {});
});

// Heartbeat
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch {}
  }
}, 5000);
wss.on('close', () => clearInterval(heartbeat));

// --- Loops -----------------------------------------------------------------
const STEP_MS = 1000 / C.SIM_HZ;
let last = Date.now();
let acc = 0;

setInterval(() => {
  const now = Date.now();
  acc += now - last;
  last = now;
  if (!world) { acc = 0; return; }
  let steps = 0;
  while (acc >= STEP_MS && steps < 5) {
    world.step();
    acc -= STEP_MS;
    steps++;
  }
  // Chequear victoria de nivel en modo clásico.
  if (worldConfig.mode === 'classic' && world.isLevelCleared()) {
    advanceLevel();
  }
}, STEP_MS);

// Broadcast de snapshots a 30 Hz.
setInterval(() => {
  if (!world || wss.clients.size === 0) return;
  const payload = JSON.stringify(world.snapshot());
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.playerId !== null) ws.send(payload);
  }
}, 1000 / C.NET_HZ);

// --- Arranque --------------------------------------------------------------
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
