// Constantes de simulación. El servidor es autoritativo: estas son las únicas
// reglas de física que importan. El cliente solo renderiza lo que recibe.
//
// Unidades: píxeles por *tick*. El loop corre a 60 ticks/seg, así que NO hay
// que escalar por dt en la física (dt = 1 tick).

const TILE = 32; // tamaño de celda en px

const SIM_HZ = 60; // ticks de simulación por segundo
const NET_HZ = 30; // snapshots enviados por segundo

// --- Física del jugador ---
const PLAYER_W = 24;
const PLAYER_H = 30;
const MOVE_ACCEL = 1.1;
const FRICTION = 0.80;
const MAX_RUN = 5.2;
const GRAVITY = 0.78;
const MAX_FALL = 16;
const JUMP_VEL = -13.5;
const JUMP_CUT = 0.45;
const COYOTE_TICKS = 6;
const BUFFER_TICKS = 6;
const STOMP_BOUNCE = -9.5;
const STOMP_STREAK_WINDOW = 90; // ticks (~1.5s) para encadenar el siguiente stomp
const INVULN_TICKS = 90;   // invulnerabilidad tras morir (no recibís daño)
const START_LIVES = 3;

// --- Vida y combate ---
const MAX_HP = 100;        // barra de vida del jugador (variable abstracta)
const BULLET_DAMAGE_PLAYER = [10, 15, 20]; // daño de bala a jugadores por nivel
const BULLET_DAMAGE_ENEMY  = 1;            // daño de bala a enemigos (su HP escala, no esto)
const ENEMY_DAMAGE = 50;  // enemigos = 100% (te matan de un toque, como antes)

// --- Armas / balas ---
const BULLET_SPEED = 11;   // px/tick (< TILE para no atravesar paredes)
const BULLET_LIFE = 72;    // ticks de vida antes de desaparecer (~1.2s)
const BULLET_W = 10;
const BULLET_H = 4;
const FIRE_COOLDOWN = 16;  // ticks entre disparos (~3.75 tiros/seg)

// --- Drop económico al morir ---
const DROP_FRACTION = 0.5;   // fracción del score que perdés al morir
const DROP_COIN_VALUE = 100; // cuánto vale cada moneda dropeada
const DROP_MAX_COINS = 8;    // tope de monedas que caen (evita spamear el piso)

// --- Puntajes ---
const COIN_SCORE = 100;
const STOMP_SCORE = 200;

// --- Stupidity Curse ---
const STUPIDITY_CURSE_MIN_SCORE = 3000;  // score mínimo para disparar la maldición
const STUPIDITY_CURSE_CHANCE    = 0.50;  // 50% de chance cuando se cumple la condición
const STUPIDITY_CURSE_COOLDOWN  = 1800;  // ticks entre activaciones globales (~30s a 60Hz)
const STUPIDITY_CURSE_DURATION  = 360;   // ticks que dura la maldición (~6s a 60Hz)

const PLAYER_COLORS = [
  '#ff5d5d', '#4dd2ff', '#5dff8f', '#ffd24d',
  '#c06dff', '#ff8f3d', '#3dffe0', '#ff6db0',
];

module.exports = {
  TILE, SIM_HZ, NET_HZ,
  PLAYER_W, PLAYER_H, MOVE_ACCEL, FRICTION, MAX_RUN, GRAVITY, MAX_FALL,
  JUMP_VEL, JUMP_CUT, COYOTE_TICKS, BUFFER_TICKS, STOMP_BOUNCE, STOMP_STREAK_WINDOW,
  INVULN_TICKS, START_LIVES,
  MAX_HP, BULLET_DAMAGE_PLAYER, BULLET_DAMAGE_ENEMY, ENEMY_DAMAGE,
  BULLET_SPEED, BULLET_LIFE, BULLET_W, BULLET_H, FIRE_COOLDOWN,
  DROP_FRACTION, DROP_COIN_VALUE, DROP_MAX_COINS,
  ENEMY_W: 28, ENEMY_H: 28,
  ENEMY_SPEED:  [1.4, 1.6, 1.8],  // velocidad de patrulla por nivel
  ENEMY_MAX_HP: [1,   2,   3],     // balas necesarias para matar por nivel
  COIN_SCORE, STOMP_SCORE, PLAYER_COLORS,
  STUPIDITY_CURSE_MIN_SCORE, STUPIDITY_CURSE_CHANCE,
  STUPIDITY_CURSE_COOLDOWN, STUPIDITY_CURSE_DURATION,
};
