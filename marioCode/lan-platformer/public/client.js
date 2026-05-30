'use strict';

// ===========================================================================
// Cliente de LAN Platformer.
// Servidor autoritativo: el cliente manda inputs y renderiza snapshots.
// Interpolación con retraso (INTERP_MS) para suavizar; el jugador local se
// dibuja con el snapshot más nuevo para que el control se sienta directo.
// ===========================================================================

const INTERP_MS = 100;

// ---- DOM ----
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const nameInput = document.getElementById('name');
const joinBtn = document.getElementById('joinBtn');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const connEl = document.getElementById('conn');
const touch = document.getElementById('touch');
const crHud = document.getElementById('crHud');
const crCoinsEl = document.getElementById('crCoins');
const crHoldEl = document.getElementById('crHold');
const crHoldNameEl = document.getElementById('crHoldName');
const crBar = document.getElementById('crBar');
const crHoldSecsEl = document.getElementById('crHoldSecs');
const winOverlay = document.getElementById('winOverlay');
const winNameEl = document.getElementById('winName');
const winScoreEl = document.getElementById('winScore');
const restartBtn = document.getElementById('restartBtn');

// ---- Estado ----
let ws = null;
let myId = null;
let cfg = null;
let worldW = 0, worldH = 0;
let maxHp = 100;
let gameMode = 'classic';
let levelIndex = 0;
let levelName = '';
const buffer = [];
const effects = [];
const prevStreaks = {};
let screenShakeMag = 0;
let screenFlash = 0;
let latest = null;
const input = { left: false, right: false, jump: false, fire: false };
let lastSent = '';

// ---- Selector de modo (lobby) ----
let selectedMode = 'classic';
for (const btn of document.querySelectorAll('.mode-btn')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
    document.getElementById('crOptions').classList.toggle('hidden', selectedMode !== 'coin-rush');
  });
}

// ===========================================================================
// Conexión
// ===========================================================================
function connect(name, mode, holdSecs) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name, mode, holdSecs }));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'welcome') {
      myId = msg.id;
      cfg = msg;
      maxHp = msg.maxHp || 100;
      worldW = msg.cols * msg.tile;
      worldH = msg.rows * msg.tile;
      gameMode = msg.mode || 'classic';
      levelIndex = msg.levelIndex || 0;
      levelName  = msg.levelName  || '';
      // Al recibir welcome en mid-game (transición de nivel) refrescamos el mapa.
      if (cfg && game && !game.classList.contains('hidden')) {
        resize();
      } else {
        enterGame();
      }
    } else if (msg.type === 'state') {
      const t = performance.now();
      buffer.push({ t, state: msg });
      latest = msg;
      levelIndex = msg.levelIndex ?? levelIndex;
      levelName  = msg.levelName  ?? levelName;
      while (buffer.length > 2 && t - buffer[0].t > 1000) buffer.shift();
      setConn(true);
      for (const p of msg.players) checkStompEffect(p);
      if (gameMode === 'coin-rush' && msg.cr) updateCoinRushHud(msg.cr);
    } else if (msg.type === 'restart') {
      location.reload();
    }
  };
  ws.onclose = () => {
    setConn(false, 'desconectado — recargá la página');
    statusEl.textContent = 'Se cortó la conexión con el servidor.';
  };
  ws.onerror = () => setConn(false, 'error de conexión');
}

function setConn(ok, txt) {
  if (!connEl) return;
  connEl.textContent = txt || (ok ? 'conectado' : 'sin conexión');
  connEl.classList.toggle('bad', !ok);
}

// ===========================================================================
// Lobby -> juego
// ===========================================================================
function join() {
  const name = (nameInput.value || 'P1').trim().slice(0, 16) || 'P1';
  const holdSecs = parseInt(document.getElementById('holdSecs').value) || 10;
  joinBtn.disabled = true;
  statusEl.textContent = 'conectando…';
  try { connect(name, selectedMode, holdSecs); } catch (e) { statusEl.textContent = 'no se pudo conectar'; joinBtn.disabled = false; }
}
joinBtn.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function enterGame() {
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  if (gameMode === 'coin-rush') crHud.classList.remove('hidden');
  resize();
  if ('ontouchstart' in window) touch.classList.remove('hidden');
  requestAnimationFrame(render);
}

function updateCoinRushHud(cr) {
  crCoinsEl.textContent = cr.coinsLeft > 0
    ? `monedas: ${cr.coinsLeft}`
    : 'todas recogidas';

  if (cr.gameOver && cr.winner) {
    winNameEl.textContent = cr.winner.name;
    winScoreEl.textContent = `${cr.winner.score} pts`;
    winOverlay.classList.remove('hidden');
    return;
  }

  if (cr.holdLeader !== null && cr.coinsLeft === 0) {
    crHoldEl.classList.remove('hidden');
    const leader = latest && latest.players.find((p) => p.id === cr.holdLeader);
    crHoldNameEl.textContent = leader ? leader.n : '?';
    const frac = Math.min(cr.holdTicks / cr.holdTarget, 1);
    crBar.style.width = `${(frac * 100).toFixed(1)}%`;
    const secsLeft = Math.ceil((cr.holdTarget - cr.holdTicks) / 60);
    crHoldSecsEl.textContent = `${secsLeft}s`;
  } else {
    crHoldEl.classList.add('hidden');
  }
}

restartBtn.addEventListener('click', () => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'restart' }));
});

document.getElementById('debugRespawn').addEventListener('click', () => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'respawn' }));
});

// ===========================================================================
// Input
// ===========================================================================
function sendInput() {
  if (!ws || ws.readyState !== ws.OPEN) return;
  const payload = JSON.stringify({ type: 'input', ...input });
  if (payload === lastSent) return;
  lastSent = payload;
  ws.send(payload);
}

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  // Disparo: varias teclas para que sirva tanto con WASD como con flechas.
  KeyF: 'fire', KeyJ: 'fire', Slash: 'fire', ControlRight: 'fire',
};
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  if (!input[k]) { input[k] = true; sendInput(); }
});
window.addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  if (input[k]) { input[k] = false; sendInput(); }
});

for (const btn of document.querySelectorAll('.tb')) {
  const k = btn.dataset.k;
  const on = (e) => { e.preventDefault(); if (!input[k]) { input[k] = true; sendInput(); } };
  const off = (e) => { e.preventDefault(); if (input[k]) { input[k] = false; sendInput(); } };
  btn.addEventListener('touchstart', on, { passive: false });
  btn.addEventListener('touchend', off, { passive: false });
  btn.addEventListener('touchcancel', off, { passive: false });
}

// ===========================================================================
// Canvas / cámara
// ===========================================================================
let cssW = 0, cssH = 0, dpr = 1, zoom = 2;
function resize() {
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  zoom = Math.max(1, cssH / (14 * (cfg ? cfg.tile : 32)));
}
window.addEventListener('resize', resize);

function camera(focusX, focusY) {
  const visW = cssW / zoom;
  const visH = cssH / zoom;
  let camX = focusX - visW / 2;
  let camY = focusY - visH / 2;
  camX = worldW <= visW ? (worldW - visW) / 2 : clamp(camX, 0, worldW - visW);
  camY = worldH <= visH ? (worldH - visH) / 2 : clamp(camY, 0, worldH - visH);
  return { camX, camY, visW, visH };
}

// ===========================================================================
// Interpolación
// ===========================================================================
function interpolated(renderT) {
  if (buffer.length === 0) return { players: {}, enemies: {}, bullets: {} };
  let s0 = buffer[0], s1 = buffer[buffer.length - 1];
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i].t <= renderT && renderT <= buffer[i + 1].t) { s0 = buffer[i]; s1 = buffer[i + 1]; break; }
  }
  let a = 0;
  if (s1.t > s0.t) a = clamp((renderT - s0.t) / (s1.t - s0.t), 0, 1);

  const lerpSet = (key) => {
    const m0 = index(s0.state[key] || []);
    const out = {};
    for (const e of (s1.state[key] || [])) {
      const p = m0[e.id];
      out[e.id] = p ? { ...e, x: lerp(p.x, e.x, a), y: lerp(p.y, e.y, a) } : { ...e };
    }
    return out;
  };
  return { players: lerpSet('players'), enemies: lerpSet('enemies'), bullets: lerpSet('bullets') };
}

// ===========================================================================
// Render
// ===========================================================================
function render(now) {
  requestAnimationFrame(render);
  if (!cfg || !latest) return;

  const renderT = now - INTERP_MS;
  const interp = interpolated(renderT);

  const me = latest.players.find((p) => p.id === myId);
  const focusX = me ? me.x + 12 : worldW / 2;
  const focusY = me ? me.y + 15 : worldH / 2;
  const { camX, camY } = camera(focusX, focusY);

  let shakeX = 0, shakeY = 0;
  if (screenShakeMag > 0) {
    shakeX = (Math.random() - 0.5) * screenShakeMag;
    shakeY = (Math.random() - 0.5) * screenShakeMag;
    screenShakeMag *= 0.78;
    if (screenShakeMag < 0.1) screenShakeMag = 0;
  }
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, (-camX + shakeX) * dpr * zoom, (-camY + shakeY) * dpr * zoom);

  drawBackground(camX, camY);
  drawTiles(camX, camY);
  drawCoins(now);
  for (const e of Object.values(interp.enemies)) drawEnemy(e, now);

  // Jugadores: local desde 'latest' (sin retraso), remotos interpolados.
  for (const p of latest.players) {
    if (p.id === myId) drawPlayer(p, true, now);
  }
  for (const p of Object.values(interp.players)) {
    if (p.id !== myId) {
      const meta = latest.players.find((q) => q.id === p.id) || p;
      drawPlayer({ ...meta, x: p.x, y: p.y }, false, now);
    }
  }

  for (const b of Object.values(interp.bullets)) drawBullet(b);
  drawEffects(now);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (screenFlash > 0) {
    ctx.fillStyle = `rgba(255,80,80,${screenFlash * 0.22})`;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    screenFlash *= 0.82;
    if (screenFlash < 0.02) screenFlash = 0;
  }

  updateHUD();
}

function drawBackground(camX, camY) {
  ctx.fillStyle = '#070b15';
  ctx.fillRect(camX - 50, camY - 50, cssW / zoom + 100, cssH / zoom + 100);
  ctx.fillStyle = 'rgba(120,150,210,0.16)';
  for (let i = 0; i < 80; i++) {
    const sx = (i * 137.5) % worldW;
    const sy = (i * 71.3) % worldH;
    ctx.fillRect(sx, sy, 2, 2);
  }
}

function drawTiles(camX, camY) {
  const T = cfg.tile;
  const c0 = Math.max(0, Math.floor(camX / T) - 1);
  const c1 = Math.min(cfg.cols - 1, Math.floor((camX + cssW / zoom) / T) + 1);
  const r0 = Math.max(0, Math.floor(camY / T) - 1);
  const r1 = Math.min(cfg.rows - 1, Math.floor((camY + cssH / zoom) / T) + 1);
  for (let r = r0; r <= r1; r++) {
    const row = cfg.tiles[r];
    for (let c = c0; c <= c1; c++) {
      const ch = row[c];
      if (ch !== '#' && ch !== '=') continue;
      const x = c * T, y = r * T;
      if (ch === '#') {
        ctx.fillStyle = '#26314f'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#34416a'; ctx.fillRect(x, y, T, 4);
        ctx.fillStyle = '#1b2440'; ctx.fillRect(x, y + T - 4, T, 4);
      } else {
        ctx.fillStyle = '#3a5d44'; ctx.fillRect(x, y, T, T * 0.5);
        ctx.fillStyle = '#52facb'; ctx.fillRect(x, y, T, 3);
      }
    }
  }
}

function drawCoins(now) {
  const bob = Math.sin(now / 220) * 2;
  for (const co of latest.coins) {
    const cx = co.x + 10, cy = co.y + 10 + bob;
    ctx.fillStyle = '#ffd24d';
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff2bf';
    ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawEnemy(e, now) {
  const wob = Math.sin(now / 90) * 2;
  const x = e.x, y = e.y, w = 28, h = 28;
  ctx.fillStyle = '#b54a6a';
  roundRect(x, y + 2, w, h - 2, 6); ctx.fill();
  ctx.fillStyle = '#7d3149';
  ctx.fillRect(x + 4, y + h - 4, 6, 4 + wob);
  ctx.fillRect(x + w - 10, y + h - 4, 6, 4 - wob);
  ctx.fillStyle = '#fff';
  const ex = e.d > 0 ? x + w - 13 : x + 5;
  ctx.fillRect(ex, y + 8, 8, 8);
  ctx.fillStyle = '#1a0d13';
  ctx.fillRect(ex + (e.d > 0 ? 4 : 0), y + 10, 4, 4);

  // Barra de HP (solo si tiene más de 1 HP max — nivel 2 y 3)
  if (e.maxHp > 1 && typeof e.hp === 'number') {
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    const bw = w + 4, bx = x - 2, by = y - 9;
    ctx.fillStyle = 'rgba(7,11,21,0.8)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = '#b54a6a';
    ctx.fillRect(bx, by, bw * frac, 3);
  }
}

function drawBullet(b) {
  const x = b.x, y = b.y;
  let w = 10, h = 4, color = '#ffe680', glow = 'rgba(255,210,77,0.35)';
  if (levelIndex === 1) {
    w = 12; h = 5; color = '#ff9933'; glow = 'rgba(255,153,51,0.4)';
  } else if (levelIndex >= 2) {
    w = 15; h = 6; color = '#ff3333'; glow = 'rgba(255,51,51,0.5)';
  }
  ctx.fillStyle = glow;
  ctx.fillRect(x - b.d * (w - 2), y - 1, w + 4, h + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(b.d > 0 ? x + w - 3 : x, y, 3, h);
}

function drawPlayer(p, isMe, now) {
  if (p.iv && Math.floor(now / 80) % 2 === 0) return;
  const x = p.x, y = p.y, w = 24, h = 30;

  ctx.fillStyle = p.col;
  roundRect(x, y, w, h, 6); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x, y + h - 6, w, 6);
  ctx.fillStyle = '#0a0f1c';
  const ex = p.f >= 0 ? x + w - 12 : x + 5;
  ctx.fillRect(ex, y + 8, 7, 7);

  // Barra de vida sobre la cabeza.
  if (typeof p.hp === 'number') {
    const frac = clamp(p.hp / maxHp, 0, 1);
    const bw = w + 4, bx = x - 2, by = y - 9;
    ctx.fillStyle = 'rgba(7,11,21,0.8)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = frac > 0.5 ? '#5dff8f' : frac > 0.25 ? '#ffd24d' : '#ff5d5d';
    ctx.fillRect(bx, by, bw * frac, 3);
  }

  // Glow magenta cuando está maldito
  if (p.cx) {
    const pulse = 0.45 + 0.3 * Math.sin(now / 120);
    ctx.strokeStyle = `rgba(255,64,255,${pulse})`;
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#ff40ff';
    ctx.shadowBlur  = 12;
    roundRect(x - 2, y - 2, w + 4, h + 4, 8); ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineWidth   = 1;
  }

  // Indicador de doble salto: punto bajo los pies
  ctx.fillStyle = p.dj ? '#4dd2ff' : 'rgba(60,90,120,0.35)';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h + 6, 3, 0, Math.PI * 2); ctx.fill();

  // Nombre.
  ctx.font = '700 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const label = (isMe ? '▸ ' : '') + p.n;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(7,11,21,0.7)';
  ctx.fillRect(x + w / 2 - tw / 2 - 4, y - 24, tw + 8, 12);
  ctx.fillStyle = isMe ? '#5dff8f' : '#e8ecf8';
  ctx.fillText(label, x + w / 2, y - 15);
  ctx.textAlign = 'left';
}

// ===========================================================================
// HUD
// ===========================================================================
function updateHUD() {
  if (!latest) return;
  const sorted = [...latest.players].sort((a, b) => b.sc - a.sc);
  scoreboard.innerHTML = sorted.map((p) => `
    <div class="row">
      <span class="chip" style="background:${p.col}"></span>
      <span class="${p.id === myId ? 'me' : ''}">${escapeHtml(p.n)}</span>
      <span class="lv">♥${p.lv}</span>
      <span class="sc">${p.sc}</span>
    </div>`).join('');
  const me = latest.players.find((p) => p.id === myId);
  if (connEl) {
    if (me && me.cx) {
      const secsLeft = Math.ceil((me.ct || 0) / 60);
      connEl.textContent = `CURSED — controles invertidos (${secsLeft}s)`;
      connEl.classList.add('cursed');
    } else {
      connEl.textContent = `Nivel ${levelIndex + 1}/3 • ${levelName}`;
      connEl.classList.remove('cursed');
    }
  }
}

// ===========================================================================
// Efectos de stomp chain
// ===========================================================================
function checkStompEffect(p) {
  const prev = prevStreaks[p.id] || 0;
  const curr = p.ss || 0;
  if (curr > prev && curr > 1) {
    const mult = Math.pow(2, Math.min(curr - 1, 3));
    const cx = p.x + 12, cy = p.y + 15;
    const now = performance.now();
    effects.push({ type: 'shockwave', x: cx, y: cy, t: now, dur: 480, mult });
    effects.push({ type: 'text',      x: cx, y: p.y - 8, t: now, dur: 900, mult,
      text: `×${mult}${'!'.repeat(Math.min(curr - 1, 3))}` });
    if (mult >= 8)      { screenShakeMag = Math.max(screenShakeMag, 7); screenFlash = 0.9; }
    else if (mult >= 4) { screenShakeMag = Math.max(screenShakeMag, 4); }
    else                { screenShakeMag = Math.max(screenShakeMag, 2); }
  }
  prevStreaks[p.id] = curr;
}

function drawEffects(now) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const ef = effects[i];
    const age = now - ef.t;
    if (age > ef.dur) { effects.splice(i, 1); continue; }
    const prog = age / ef.dur;

    if (ef.type === 'shockwave') {
      const maxR = ef.mult >= 8 ? 85 : ef.mult >= 4 ? 55 : 30;
      const r     = maxR * prog;
      const alpha = 1 - prog;
      const lw    = 3.5 * (1 - prog * 0.6);
      ctx.strokeStyle = ef.mult >= 8
        ? `rgba(255,80,80,${alpha})`
        : ef.mult >= 4
          ? `rgba(255,210,77,${alpha})`
          : `rgba(77,210,255,${alpha})`;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(ef.x, ef.y, Math.max(r, 1), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (ef.type === 'text') {
      const oy    = -38 * prog;
      const alpha = prog < 0.65 ? 1 : 1 - (prog - 0.65) / 0.35;
      const sz    = ef.mult >= 8 ? 15 : ef.mult >= 4 ? 13 : 11;
      ctx.font = `700 ${sz}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = ef.mult >= 8
        ? `rgba(255,100,100,${alpha})`
        : ef.mult >= 4
          ? `rgba(255,220,80,${alpha})`
          : `rgba(100,220,255,${alpha})`;
      ctx.fillText(ef.text, ef.x, ef.y + oy);
      ctx.textAlign = 'left';
    }
  }
}

// ===========================================================================
// Utilidades
// ===========================================================================
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function index(arr) { const m = {}; for (const e of arr) m[e.id] = e; return m; }
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
