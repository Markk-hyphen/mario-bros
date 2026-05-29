// Constantes de simulación. El servidor es autoritativo: estas son las únicas
// reglas de física que importan. El cliente solo renderiza lo que recibe.
//
// Unidades: píxeles por *tick*. El loop corre a 60 ticks/seg, así que NO hay
// que escalar por dt en la física (dt = 1 tick). Esto hace el código más
// legible a costa de acoplar la física al tickrate; ver README si querés
// desacoplarlo.

const TILE = 32; // tamaño de celda en px

const SIM_HZ = 60; // ticks de simulación por segundo
const NET_HZ = 30; // snapshots enviados por segundo

// --- Física del jugador ---
const PLAYER_W = 24;
const PLAYER_H = 30;
const MOVE_ACCEL = 1.1; // aceleración horizontal al pulsar dirección
const FRICTION = 0.80; // multiplicador de vx cuando no hay input (1 = sin fricción)
const MAX_RUN = 5.2; // velocidad horizontal máxima
const GRAVITY = 0.78;
const MAX_FALL = 16; // < TILE para no atravesar suelo en un tick
const JUMP_VEL = -13.5; // impulso de salto (arriba es negativo)
const JUMP_CUT = 0.45; // al soltar salto subiendo, vy *= JUMP_CUT (salto variable)
const COYOTE_TICKS = 6; // ticks de gracia para saltar tras dejar el suelo
const BUFFER_TICKS = 6; // ticks de buffer para un salto pulsado en el aire
const STOMP_BOUNCE = -9.5; // rebote al pisar un enemigo
const INVULN_TICKS = 90; // invulnerabilidad tras recibir golpe
const START_LIVES = 3;

// --- Enemigos ---
const ENEMY_W = 28;
const ENEMY_H = 28;
const ENEMY_SPEED = 1.4;

// --- Puntajes ---
const COIN_SCORE = 100;
const STOMP_SCORE = 200;

// Paleta de colores asignada a jugadores en orden de llegada.
const PLAYER_COLORS = [
  '#ff5d5d', '#4dd2ff', '#5dff8f', '#ffd24d',
  '#c06dff', '#ff8f3d', '#3dffe0', '#ff6db0',
];

module.exports = {
  TILE, SIM_HZ, NET_HZ,
  PLAYER_W, PLAYER_H, MOVE_ACCEL, FRICTION, MAX_RUN, GRAVITY, MAX_FALL,
  JUMP_VEL, JUMP_CUT, COYOTE_TICKS, BUFFER_TICKS, STOMP_BOUNCE,
  INVULN_TICKS, START_LIVES,
  ENEMY_W, ENEMY_H, ENEMY_SPEED,
  COIN_SCORE, STOMP_SCORE, PLAYER_COLORS,
};
