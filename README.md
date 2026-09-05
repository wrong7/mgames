# mgames

Juegos de mesa para grupos que están en la misma habitación, jugados desde el
móvil de cada uno. Se entra tecleando un código de cuatro caracteres; no hay
cuentas, ni instalación, ni salas que administrar.

La web está pensada para móvil y prácticamente sólo para móvil: pantalla
completa, sin scroll y con las áreas táctiles grandes.

## Estructura

```
apps/web         La web: catálogo de juegos y rutas (TanStack Start)
apps/realtime    Servidor de salas: un Durable Object por partida (Cloudflare Workers)
packages/game-kit  Contrato entre juego y app: manifest, códigos, azar determinista
packages/codenames Código Secreto: motor e interfaz
```

Cada juego es un paquete independiente que trae **su lógica y su interfaz**. No
hay paquete de UI compartido a propósito: la gracia de la colección es que cada
juego se vea como lo que es. Lo único que comparten es `game-kit`, que no pinta
nada.

## Arrancar

```bash
pnpm install
pnpm dev
```

Levanta la web en `http://localhost:3000` y el servidor de salas en
`http://localhost:8787`. La web lee la URL del servidor de `VITE_REALTIME_URL`
(ver `apps/web/.env.example`).

```bash
pnpm test         # reglas de los juegos
pnpm check-types  # TypeScript en todo el monorepo
pnpm check        # Biome (formato y lint)
```

## Cómo se sincroniza una partida

Cada sala es un Durable Object, identificado por el código que los jugadores se
dictan en voz alta. Todos los móviles de la sala abren un WebSocket contra él, y
el objeto difunde la partida entera después de cada jugada.

Tres decisiones que conviene conocer antes de tocar nada:

- **El servidor y el navegador ejecutan el mismo reducer.** `applyAction` vive en
  `packages/codenames/src/engine` y no importa React, así que el Durable Object
  aplica exactamente las mismas reglas que la pantalla. No hay dos versiones del
  juego que puedan divergir.
- **El cliente pinta la jugada antes de que el servidor conteste.** Es la misma
  función determinista, así que el servidor va a confirmar lo mismo. Esperar al
  turno de red para colorear una carta se nota en la mano.
- **El estado vive en memoria, con respaldo en el almacenamiento del objeto.** La
  memoria es la que se sirve; el respaldo sólo existe porque los móviles cierran
  el WebSocket en cuanto se bloquea la pantalla, y sin él una sala se perdería
  cada vez que el grupo deja de mirar el móvil a la vez. Una alarma borra la sala
  entera 24 horas después de la última jugada.

Si el servidor no está disponible, el juego sigue siendo jugable: el tablero se
puede derivar del código y cada móvil lleva sus propias marcas. La pantalla lo
dice ("sin conexión") en lugar de quedarse en blanco.

## Añadir un juego

1. `packages/<juego>/` con su `package.json` (`@mgames/<juego>`, `exports` a
   `./src/index.ts`) y su `tsconfig.json` extendiendo el de la raíz.
2. Un `GameManifest` exportado: es todo lo que la app sabe del juego.
3. Los componentes de sus pantallas. Si necesita sincronizar, que el estado sea
   un reducer puro como el de `codenames/engine`, para poder ejecutarlo también
   en el Worker.
4. Montar sus rutas en `apps/web/src/routes/` y registrarlo en
   `apps/web/src/games.ts`.
5. Añadir su `src` a las líneas `@source` de `apps/web/src/styles.css`, o
   Tailwind no verá sus clases y el juego saldrá sin estilos.

## Despliegue

- **Web** → Vercel (`apps/web/vercel.json` ya declara el framework). Hay que
  configurar `VITE_REALTIME_URL` apuntando al Worker.
- **Salas** → Cloudflare Workers: `pnpm --filter @mgames/realtime deploy`.
  Conviene rellenar la variable `ALLOWED_ORIGINS` en `wrangler.jsonc` con el
  dominio de la web: los WebSockets no pasan por CORS, así que esa comprobación
  es lo único que evita que otra web abra salas contra el servidor.
