# LAN Platformer

Plataformero co-op para jugar entre amigos en la misma red local. Un solo
proceso de Node hace de **servidor autoritativo** y además sirve el cliente; los
jugadores entran abriendo una URL en el navegador. Cero instalación por cliente,
multiplataforma (PC, Mac, Linux, celular).

> **Sobre el nombre y los gráficos:** esto es un motor de plataformas *del
> género* (correr, saltar, pisar enemigos, juntar monedas), no una reproducción
> de Mario Bros. Las mecánicas no son propiedad de nadie, pero los sprites, la
> música y los personajes de Nintendo sí. Por eso los gráficos son formas
> geométricas originales y los nombres son genéricos. Si querés, después
> reemplazás los dibujos por tus propios assets en `public/client.js`.

---

## Cómo correrlo

Requisitos: **Node.js 18+**.

```bash
cd lan-platformer
npm install      # instala 'ws' (la única dependencia)
npm start
```

Al arrancar imprime las URLs, algo así:

```
  LAN Platformer corriendo.
  Local:   http://localhost:3000
  En LAN:  http://192.168.1.42:3000   <- pasale esta a tus amigos
```

- Vos abrís `http://localhost:3000`.
- Tus amigos (en la misma red / WiFi) abren `http://<la-ip-LAN>:3000`.
- Cada uno pone su nombre y entra. Listo.

**Si no se conectan desde otra máquina:** casi siempre es el firewall del SO
bloqueando el puerto 3000. Permití conexiones entrantes a Node en ese puerto, o
cambiá el puerto con `PORT=8080 npm start`.

### Controles
- Mover: `← →` o `A D`
- Saltar: `espacio`, `↑` o `W` (mantené pulsado para saltar más alto)
- En celular aparecen botones táctiles.

---

## Arquitectura (y por qué)

```
server/
  constants.js   reglas de física (servidor = única fuente de verdad)
  level.js       el mapa como texto + parser
  game.js        World: simulación, colisiones AABB, enemigos, puntajes
  server.js      HTTP estático + WebSocket + loops (sim 60Hz / red 30Hz)
public/
  index.html     lobby + canvas + HUD
  style.css       estética arcade/CRT, sin fuentes externas (funciona offline)
  client.js      red, input, interpolación y render
```

Decisiones, con sus trade-offs:

- **Servidor autoritativo.** El servidor simula toda la física; el cliente solo
  manda inputs y dibuja. Esto elimina desincronización y cheating a costa de un
  poco de latencia de input. Para LAN el costo es despreciable.
- **Web + WebSocket en vez de motor nativo.** El objetivo número uno era
  *facilidad de juntarse a jugar*: abrir una URL gana contra "instalá esto".
  Renunciamos a rendimiento extremo, que acá no hace falta.
- **Física en píxeles por tick (no por segundo).** Más legible, al costo de
  acoplar la física al tickrate de 60Hz. Si algún día querés tickrate variable,
  hay que multiplicar las constantes por `dt`.
- **Resolución de colisión por ejes separados.** Robusta para tilemaps porque
  `MAX_FALL` y `MAX_RUN` son menores que `TILE`: no hay tunneling.
- **Simulación a 60Hz, snapshots a 30Hz, render interpolado.** El cliente guarda
  los últimos snapshots y los interpola con ~100ms de retraso para suavizar.
  *Excepción:* tu propio personaje se dibuja con el snapshot más nuevo (sin
  retraso) para que el control se sienta directo.

---

## Extenderlo

- **Nuevo nivel:** editá el arte ASCII en `server/level.js`. Leyenda:
  `#` bloque, `=` plataforma, `o` moneda, `e` enemigo, `p` spawn de jugador.
  Más anchas las filas = nivel más largo (la cámara hace scroll horizontal).
- **Ajustar el "feel":** todo está en `server/constants.js` — gravedad, salto,
  velocidad, coyote time, jump buffer, rebote al pisar enemigos.
- **Más mecánicas:** la lógica vive en `World.step()` y `resolveInteractions()`
  en `server/game.js`. Power-ups, plataformas móviles, checkpoints, etc., se
  agregan ahí y aparecen en el `snapshot()`.
- **Control más crudo (prediction):** hoy el jugador local renderiza el último
  snapshot. Para latencia percibida casi nula incluso fuera de LAN, el siguiente
  paso es *client-side prediction*: simular el input localmente al instante y
  reconciliar cuando llega el estado autoritativo. Es bastante más código y para
  LAN no rinde, por eso quedó fuera del v1.

## Límites conocidos
- No hay persistencia ni "game over": al perder las vidas reaparecés con 3
  (modo casual sin fin). Cambialo en `respawnPlayer()`.
- Sin sonido. Sin reconexión automática (si se cae el server, recargá).
- Pensado para un puñado de jugadores en LAN, no para escala en internet.
