const C = require('./constants');
const { ROWS, parseLevel } = require('./level');

// ---------------------------------------------------------------------------
// Simulación autoritativa. Resolución de colisión por ejes separados (X y luego
// Y): robusta para tilemaps porque las velocidades son menores que TILE.
// ---------------------------------------------------------------------------

class World {
  constructor() {
    this.level = parseLevel(ROWS);
    this.worldW = this.level.cols * C.TILE;
    this.worldH = this.level.rows * C.TILE;
    this.deathY = this.worldH + 120;

    this.players = new Map();
    this.enemies = [];
    this.coins = new Map();
    this.bullets = [];

    this.tick = 0;
    this.nextEnemyId = 0;
    this.nextBulletId = 0;
    this.colorIdx = 0;

    this.spawnEnemies();
    for (const co of this.level.coins) this.coins.set(co.id, { ...co });
    // Las monedas dropeadas necesitan IDs únicos por encima de los del nivel.
    this.nextCoinId = this.level.coins.length;
  }

  spawnEnemies() {
    for (const s of this.level.enemySpawns) {
      this.enemies.push({
        id: this.nextEnemyId++,
        x: s.x, y: s.y, vx: 0, vy: 0,
        w: C.ENEMY_W, h: C.ENEMY_H,
        dir: Math.random() < 0.5 ? -1 : 1,
        alive: true,
        respawn: { x: s.x, y: s.y },
      });
    }
  }

  solidAt(col, row) {
    if (col < 0 || col >= this.level.cols) return true;
    if (row < 0 || row >= this.level.rows) return false;
    return this.level.solid[row][col];
  }

  moveX(e) {
    e.x += e.vx;
    const r0 = Math.floor(e.y / C.TILE);
    const r1 = Math.floor((e.y + e.h - 1) / C.TILE);
    const c0 = Math.floor(e.x / C.TILE);
    const c1 = Math.floor((e.x + e.w - 1) / C.TILE);
    let hit = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!this.solidAt(c, r)) continue;
        if (e.vx > 0) e.x = Math.min(e.x, c * C.TILE - e.w);
        else if (e.vx < 0) e.x = Math.max(e.x, (c + 1) * C.TILE);
        hit = true;
      }
    }
    if (hit) e.vx = 0;
    return hit;
  }

  moveY(e) {
    e.y += e.vy;
    e.onGround = false;
    const c0 = Math.floor(e.x / C.TILE);
    const c1 = Math.floor((e.x + e.w - 1) / C.TILE);
    const r0 = Math.floor(e.y / C.TILE);
    const r1 = Math.floor((e.y + e.h - 1) / C.TILE);
    let hit = false;
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        if (!this.solidAt(c, r)) continue;
        if (e.vy > 0) { e.y = Math.min(e.y, r * C.TILE - e.h); e.onGround = true; }
        else if (e.vy < 0) e.y = Math.max(e.y, (r + 1) * C.TILE);
        hit = true;
      }
    }
    if (hit) e.vy = 0;
    return hit;
  }

  // ------------------------------------------------------------------ players
  addPlayer(id, name) {
    const spawns = this.level.playerSpawns;
    const spawn = spawns[this.players.size % spawns.length] || { x: 64, y: 64 };
    const color = C.PLAYER_COLORS[this.colorIdx++ % C.PLAYER_COLORS.length];
    const p = {
      id, name: (name || 'P').slice(0, 16), color,
      x: spawn.x, y: spawn.y, vx: 0, vy: 0,
      w: C.PLAYER_W, h: C.PLAYER_H,
      onGround: false, facing: 1,
      coyote: 0, buffer: 0, prevJump: false,
      score: 0, lives: C.START_LIVES,
      hp: C.MAX_HP, invuln: 0,
      fireCd: 0,
      spawn: { x: spawn.x, y: spawn.y },
      input: { left: false, right: false, jump: false, fire: false },
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p) return;
    p.input.left = !!input.left;
    p.input.right = !!input.right;
    p.input.jump = !!input.jump;
    p.input.fire = !!input.fire;
  }

  // Aplica daño. Si la vida llega a 0, muere (con o sin botín).
  damage(p, amount, dropLoot) {
    if (p.invuln > 0) return;
    p.hp -= amount;
    if (p.hp <= 0) this.killPlayer(p, dropLoot);
  }

  killPlayer(p, dropLoot) {
    // Solo dropea si murió dentro del mapa (caída al vacío = botín perdido).
    if (dropLoot && p.y < this.deathY) this.dropCoins(p);
    p.hp = C.MAX_HP;
    p.x = p.spawn.x; p.y = p.spawn.y;
    p.vx = 0; p.vy = 0;
    p.invuln = C.INVULN_TICKS;
    p.lives -= 1;
    if (p.lives <= 0) p.lives = C.START_LIVES; // modo casual: nunca "game over"
  }

  // Convierte parte del score del muerto en monedas físicas en el piso.
  dropCoins(p) {
    let n = Math.floor((p.score * C.DROP_FRACTION) / C.DROP_COIN_VALUE);
    n = Math.min(n, C.DROP_MAX_COINS);
    if (n <= 0) return;
    p.score -= n * C.DROP_COIN_VALUE;
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 60;
      const oy = (Math.random() - 0.5) * 30;
      this.coins.set(this.nextCoinId, {
        id: this.nextCoinId,
        x: clampN(p.x + ox, 0, this.worldW - 20),
        y: clampN(p.y + oy, 0, this.worldH - 20),
      });
      this.nextCoinId++;
    }
  }

  // -------------------------------------------------------------------- step
  step() {
    this.tick++;
    for (const p of this.players.values()) this.updatePlayer(p);
    for (const e of this.enemies) this.updateEnemy(e);
    this.updateBullets();
    this.resolveInteractions();
  }

  updatePlayer(p) {
    const inp = p.input;

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) {
      p.vx += dir * C.MOVE_ACCEL;
      p.vx = Math.max(-C.MAX_RUN, Math.min(C.MAX_RUN, p.vx));
      p.facing = dir;
    } else {
      p.vx *= C.FRICTION;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }

    if (p.onGround) p.coyote = C.COYOTE_TICKS; else if (p.coyote > 0) p.coyote--;
    if (inp.jump && !p.prevJump) p.buffer = C.BUFFER_TICKS; else if (p.buffer > 0) p.buffer--;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = C.JUMP_VEL;
      p.buffer = 0; p.coyote = 0; p.onGround = false;
    }
    if (p.prevJump && !inp.jump && p.vy < 0) p.vy *= C.JUMP_CUT;
    p.prevJump = inp.jump;

    p.vy = Math.min(C.MAX_FALL, p.vy + C.GRAVITY);
    this.moveX(p);
    this.moveY(p);

    // Disparo (semiautomático: respeta cooldown mientras mantenés la tecla).
    if (p.fireCd > 0) p.fireCd--;
    if (inp.fire && p.fireCd === 0) this.fire(p);

    if (p.y > this.deathY) this.killPlayer(p, false); // caída al vacío, sin botín
    if (p.invuln > 0) p.invuln--;
  }

  fire(p) {
    p.fireCd = C.FIRE_COOLDOWN;
    const dir = p.facing >= 0 ? 1 : -1;
    const bx = dir > 0 ? p.x + p.w : p.x - C.BULLET_W;
    this.bullets.push({
      id: this.nextBulletId++,
      x: bx, y: p.y + p.h * 0.4,
      vx: dir * C.BULLET_SPEED,
      owner: p.id,
      life: C.BULLET_LIFE,
    });
  }

  updateBullets() {
    const next = [];
    for (const b of this.bullets) {
      b.x += b.vx;
      b.life--;
      if (b.life <= 0) continue;

      // Pared.
      const col = Math.floor((b.x + C.BULLET_W / 2) / C.TILE);
      const row = Math.floor((b.y + C.BULLET_H / 2) / C.TILE);
      if (this.solidAt(col, row)) continue;

      // Jugador (no el dueño, no invulnerable).
      let consumed = false;
      for (const p of this.players.values()) {
        if (p.id === b.owner || p.invuln > 0) continue;
        if (aabb(b.x, b.y, C.BULLET_W, C.BULLET_H, p.x, p.y, p.w, p.h)) {
          this.damage(p, C.BULLET_DAMAGE, true); // muerte por bala dropea botín
          consumed = true;
          break;
        }
      }
      if (consumed) continue;

      next.push(b);
    }
    this.bullets = next;
  }

  updateEnemy(e) {
    if (!e.alive) return;
    e.vx = e.dir * C.ENEMY_SPEED;

    const aheadX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const footCol = Math.floor(aheadX / C.TILE);
    const footRow = Math.floor((e.y + e.h + 1) / C.TILE);
    if (!this.solidAt(footCol, footRow)) { e.dir *= -1; e.vx = e.dir * C.ENEMY_SPEED; }

    if (this.moveX(e)) e.dir *= -1;

    e.vy = Math.min(C.MAX_FALL, e.vy + C.GRAVITY);
    this.moveY(e);

    if (e.y > this.deathY) { e.x = e.respawn.x; e.y = e.respawn.y; e.vy = 0; }
  }

  resolveInteractions() {
    for (const p of this.players.values()) {
      // Monedas.
      for (const [cid, co] of this.coins) {
        if (aabb(p.x, p.y, p.w, p.h, co.x, co.y, 20, 20)) {
          this.coins.delete(cid);
          p.score += C.COIN_SCORE;
        }
      }
      // Enemigos.
      if (p.invuln > 0) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (!aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) continue;
        const pisada = p.vy > 1 && (p.y + p.h) < (e.y + e.h * 0.6);
        if (pisada) {
          e.alive = false;
          p.vy = C.STOMP_BOUNCE;
          p.score += C.STOMP_SCORE;
        } else {
          this.damage(p, C.ENEMY_DAMAGE, true); // enemigo = 100%, dropea botín
        }
      }
    }
  }

  // ---------------------------------------------------------------- snapshot
  snapshot() {
    return {
      type: 'state',
      tick: this.tick,
      players: [...this.players.values()].map((p) => ({
        id: p.id, n: p.name, col: p.color,
        x: Math.round(p.x), y: Math.round(p.y),
        f: p.facing, sc: p.score, lv: p.lives,
        hp: Math.max(0, Math.round(p.hp)),
        iv: p.invuln > 0 ? 1 : 0,
      })),
      enemies: this.enemies.filter((e) => e.alive).map((e) => ({
        id: e.id, x: Math.round(e.x), y: Math.round(e.y), d: e.dir,
      })),
      bullets: this.bullets.map((b) => ({
        id: b.id, x: Math.round(b.x), y: Math.round(b.y), d: b.vx > 0 ? 1 : -1,
      })),
      coins: [...this.coins.values()].map((c) => ({ id: c.id, x: c.x, y: c.y })),
    };
  }

  welcomeFor(id) {
    return {
      type: 'welcome',
      id,
      tile: C.TILE,
      cols: this.level.cols,
      rows: this.level.rows,
      maxHp: C.MAX_HP,
      tiles: this.level.renderRows,
    };
  }
}

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }

module.exports = { World };
