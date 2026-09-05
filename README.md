# No mires

Juegos de mesa para grupos que están en la misma habitación, jugados desde el
móvil de cada uno. Todos son juegos de información oculta: tu pantalla dice algo
que la del de al lado no. Se entra tecleando un código de cuatro caracteres; no
hay cuentas, ni instalación, ni salas que administrar.

La web está pensada para móvil y prácticamente sólo para móvil: pantalla
completa, sin scroll y con las áreas táctiles grandes.

## Estructura

```
apps/web             La web: catálogo de juegos y rutas (TanStack Start)
apps/realtime        Servidor de salas: un Durable Object por partida (Cloudflare Workers)
packages/game-kit    Contrato entre juego y app: manifest, motores, códigos, azar determinista
packages/codenames   Código Secreto: motor e interfaz
packages/spy         El Espía: motor e interfaz
```

Cada juego es un paquete independiente que trae **su lógica y su interfaz**. No
hay paquete de UI compartido a propósito: la gracia de la colección es que cada
juego se vea como lo que es. Lo único que comparten es `game-kit`, que no pinta
nada — el contrato del motor, la sincronización y cuatro utilidades.

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

Cada sala es un Durable Object, identificado por el juego y el código que los
jugadores se dictan en voz alta. Todos los móviles de la sala abren un WebSocket
contra él, y el objeto difunde el estado después de cada jugada.

Cinco decisiones que conviene conocer antes de tocar nada:

- **El servidor no sabe a qué se juega.** Busca el motor por el slug de la URL y
  le pasa las acciones (`apps/realtime/src/engines.ts`). Añadir un juego al
  servidor es añadir una línea a ese registro.
- **El servidor y el navegador ejecutan el mismo motor.** Vive en
  `packages/<juego>/src/engine` y no importa React, así que el Durable Object
  aplica exactamente las mismas reglas que la pantalla. No hay dos versiones del
  juego que puedan divergir.
- **Los secretos no salen del servidor.** Un motor puede definir `project`, y
  entonces cada móvil recibe su propia vista: en El Espía, quien no es el espía
  no recibe *nada* que diga quién lo es, así que abrir las herramientas de
  desarrollo no destripa la partida. Los juegos sin `project` (Código Secreto)
  difunden el estado entero, y a cambio el cliente puede pintar sus jugadas sin
  esperar respuesta.
- **El estado vive en memoria, con respaldo en el almacenamiento del objeto.** La
  memoria es la que se sirve; el respaldo sólo existe porque los móviles cierran
  el WebSocket en cuanto se bloquea la pantalla, y sin él una sala se perdería
  cada vez que el grupo deja de mirar el móvil a la vez. Una alarma borra la sala
  entera 24 horas después de la última jugada.
- **Perder la conexión no rompe la partida.** Código Secreto sigue siendo jugable
  sin servidor: el tablero se deriva del código y cada móvil lleva sus propias
  marcas. El Espía no puede —hace falta alguien que reparta a escondidas— y lo
  dice en pantalla en lugar de quedarse en blanco.

## Añadir un juego

1. `packages/<juego>/` con su `package.json` (`@mgames/<juego>`, con `exports`
   a `./src/index.ts` y a `./src/engine/index.ts`) y su `tsconfig.json`
   extendiendo el de la raíz.
2. Un `GameManifest` exportado: es todo lo que la app sabe del juego.
3. Un `GameEngine` en `src/engine`, **sin importar React**. Si el juego reparte
   secretos, implementar también `project`.
4. Los componentes de sus pantallas, con la estética que le corresponda.
5. Registrarlo en tres sitios: `apps/realtime/src/engines.ts` (para que el
   servidor lo aloje), `apps/web/src/games.ts` (para el catálogo) y una ruta en
   `apps/web/src/routes/`.
6. Añadir su `src` a las líneas `@source` de `apps/web/src/styles.css`, o
   Tailwind no verá sus clases y el juego saldrá sin estilos.

## Despliegue

- **Web** → Vercel (`apps/web/vercel.json` ya declara el framework). Hay que
  configurar `VITE_REALTIME_URL` apuntando al Worker.
- **Salas** → Cloudflare Workers: `pnpm --filter @mgames/realtime deploy`.
  Conviene rellenar la variable `ALLOWED_ORIGINS` en `wrangler.jsonc` con el
  dominio de la web: los WebSockets no pasan por CORS, así que esa comprobación
  es lo único que evita que otra web abra salas contra el servidor.
