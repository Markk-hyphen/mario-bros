// Definición de niveles como filas de texto.
//
// Leyenda:
//   '#'  bloque sólido
//   '='  plataforma (sólida, se dibuja distinto)
//   'o'  moneda
//   'e'  spawn de enemigo
//   'p'  spawn de jugador (puede haber varios; se reparten en orden)
//   ' '  vacío

const LEVELS = [
  {
    name: 'Jungle',
    rows: [
      '                                                                            ',
      '                                                                            ',
      '                                                                            ',
      '                                                o o                         ',
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
    ],
  },
  {
    // Plataformas estrechas y escalonadas, más enemigos, menos monedas
    name: 'Base',
    rows: [
      '                                                                              ',
      '                                                                              ',
      '          o           o                   o           o                      ',
      '        =====       =====       e       =====       =====                    ',
      '                                      ========                               ',
      '  e             o         ========               o         e                 ',
      '      =======  ====                    ====     ====                         ',
      '                        o    e    o                                          ',
      '   ====                ================                ====     o            ',
      '              e                              e                 ====          ',
      '            ======    o   o   o   o        ======                            ',
      '  o                  ================               o   o                   ',
      ' ====     e                                    e        ====                 ',
      'p    ##########    o o o o o o o o o      ##########               p         ',
      '################  ###################  ################  ###################',
      '################  ###################  ################  ###################',
      '################  ###################  ################  ###################',
    ],
  },
  {
    // Diseño vertical-ascendente, plataformas cortas, muchos enemigos, pocas monedas
    name: 'Escape',
    rows: [
      '                                                                              ',
      '     o               e                       e               o               ',
      '   ======          ======                  ======          ======            ',
      '                                  o                                          ',
      '          e      ============            ============      e                 ',
      '        ====                    e                        ====                ',
      '                  o   o                 o   o                                ',
      '   e    ======  ========   e       e  ========  ======    e                  ',
      '       =                                               =                     ',
      '   ====   o       e      ============      e      o    ====                  ',
      '                        ==            ==                                     ',
      '          e    ====    =     o  o      =    ====    e                        ',
      '   ====                =                =               ====                 ',
      'p       #######    e   =                =   e    #######           p         ',
      '##############  ######=##################=######  ##############  ###########',
      '##############  ######=##################=######  ##############  ###########',
      '##############  ######=##################=######  ##############  ###########',
    ],
  },
];

function parseLevel(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const height = rows.length;
  const grid = rows.map((r) => r.padEnd(cols, ' ').split(''));

  const solid = [];
  const coins = [];
  const enemySpawns = [];
  const playerSpawns = [];

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

  const renderRows = grid.map((row) => row.map((ch) => {
    if (ch === '#') return '#';
    if (ch === '=') return '=';
    return ' ';
  }).join(''));

  return { cols, rows: height, solid, coins, enemySpawns, playerSpawns, renderRows };
}

function getLevelByIndex(levelIndex) {
  return parseLevel(LEVELS[levelIndex].rows);
}

// ROWS exportado por compatibilidad con cualquier import legacy
const ROWS = LEVELS[0].rows;

module.exports = { LEVELS, ROWS, parseLevel, getLevelByIndex };
