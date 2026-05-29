// Definición del nivel como filas de texto. Editá esto para crear mapas.
//
// Leyenda:
//   '#'  bloque sólido
//   '='  plataforma (sólida, se dibuja distinto)
//   'o'  moneda
//   'e'  spawn de enemigo
//   'p'  spawn de jugador (puede haber varios; se reparten en orden)
//   ' '  vacío
//
// Notas:
//   - Los bordes izquierdo/derecho del mundo son paredes implícitas.
//   - El techo es abierto (se puede saltar "fuera" por arriba sin morir).
//   - Caerse por un hueco hasta debajo del mapa = muerte y respawn.

const ROWS = [
  '                                                                            ',
  '                                                                            ',
  '            o o o                                                           ',
  '           =======                              o o                         ',
  '                                       e      =======                       ',
  '                          o o o     =======                    o o o        ',
  '       e                 =======                              =======       ',
  '     ======                              o                                  ',
  '                          o            =====            e                   ',
  '                e   ===========                       ======      o o o      ',
  '              =====              o o o        o                  =======     ',
  '    o o                        =======      =====                           ',
  '   =====       e                                          e                 ',
  'p           #####           o o o o            e                          p ',
  '#####################   ##############   ###################   ##############',
  '#####################   ##############   ###################   ##############',
  '#####################   ##############   ###################   ##############',
];

function parseLevel(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const height = rows.length;
  // Normalizamos cada fila a la misma longitud rellenando con vacío.
  const grid = rows.map((r) => r.padEnd(cols, ' ').split(''));

  const solid = [];   // grid[r][c] => true si bloquea
  const coins = [];   // {id, x, y}
  const enemySpawns = []; // {x, y}
  const playerSpawns = []; // {x, y}

  let coinId = 0;
  for (let r = 0; r < height; r++) {
    solid[r] = [];
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c];
      const isSolid = ch === '#' || ch === '=';
      solid[r][c] = isSolid;
      const px = c * 32;
      const py = r * 32;
      if (ch === 'o') coins.push({ id: coinId++, x: px + 6, y: py + 6 });
      else if (ch === 'e') enemySpawns.push({ x: px + 2, y: py + 4 });
      else if (ch === 'p') playerSpawns.push({ x: px + 4, y: py + 2 });
    }
  }

  // Render hint: filas con su tipo de tile para que el cliente dibuje sin
  // tener que reinterpretar la lógica de colisión.
  const renderRows = grid.map((row) => row.map((ch) => {
    if (ch === '#') return '#';
    if (ch === '=') return '=';
    return ' ';
  }).join(''));

  return { cols, rows: height, solid, coins, enemySpawns, playerSpawns, renderRows };
}

module.exports = { ROWS, parseLevel };
