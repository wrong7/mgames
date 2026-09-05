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

## Cómo se juega

Como en los juegos de sobremesa de consola: cada uno pone su nombre una vez,
alguien crea una sala y dicta el código, los demás entran, y dentro de la sala
se elige a qué jugar. Se puede cambiar de juego sin que nadie vuelva a teclear
nada.

- **Perfil.** No hay cuentas. La primera vez que alguien abre una sala se le
  pide un nombre y se le da una cara (un *blobatar*, generado a partir de una
  semilla que puede volver a tirar hasta que le guste). Se guarda en el móvil y
  desde ahí viaja con cada conexión y cada jugada: es lo que los demás ven en las
  fichas y en las listas. La ruta `_jugador` es la puerta: nada se abre sin él.
- **Sala.** Un código de cuatro caracteres. Conectarse es entrar; salir es un
  botón. El primero que entró es el anfitrión y es quien pone un juego sobre la
  mesa o lo recoge — la forma más simple de que no haya cinco dedos cambiando de
  juego a la vez.
- **Juego.** Recibe la gente de la sala y no lleva lista propia. Código Secreto
  empieza formando la mesa: cada uno elige equipo y papel y dice "listo", y el
  tablero no aparece hasta que todos los de la sala están sentados y listos y
  cada equipo tiene al menos un jefe y un agente — lo comprueba el motor, no la
  pantalla. Después, el asiento manda: destapa el jefe del equipo en turno y
  señalan sus agentes. El Espía reparte directamente a quien esté.

## Cómo se sincroniza una partida

Cada sala es un Durable Object, identificado por el código que los jugadores se
dictan en voz alta. Todos los móviles de la sala abren un WebSocket contra él,
y el objeto difunde la sala —gente, juego elegido y estado del juego— después
de cada cambio.

Cinco decisiones que conviene conocer antes de tocar nada:

- **El servidor no sabe a qué se juega.** Lleva la sala (quién está, qué juego
  hay puesto) y busca el motor por slug para pasarle las jugadas
  (`apps/realtime/src/engines.ts`). Añadir un juego al servidor es añadir una
  línea a ese registro.
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
- **Sin servidor no hay sala.** La sala es literalmente el sitio donde están los
  demás, así que no hay modo local: la pantalla dice "sin conexión" y reintenta
  sola. Lo que sí hay es respuesta inmediata en los juegos sin secretos: el
  cliente aplica su jugada antes de que el servidor conteste, porque va a
  confirmar lo mismo.

## Añadir un juego

1. `packages/<juego>/` con su `package.json` (`@mgames/<juego>`, con `exports`
   a `./src/index.ts` y a `./src/engine/index.ts`) y su `tsconfig.json`
   extendiendo el de la raíz.
2. Un `GameManifest` exportado: es todo lo que la app sabe del juego.
3. Un `GameEngine` en `src/engine`, **sin importar React**. Recibe la gente de
   la sala en `ctx.players` y quién juega en `ctx.actor`. Si el juego reparte
   secretos, implementar también `project`.
4. Una pantalla que cumpla `GameScreenProps` (vista, gente, `play`, `onExit`
   para el anfitrión), con la estética que le corresponda. No sabe nada de
   conexiones ni de rutas.
5. Registrarlo en dos sitios: `apps/realtime/src/engines.ts` (para que el
   servidor lo aloje) y `apps/web/src/games.ts` (manifest, motor y pantalla).
6. Añadir su `src` a las líneas `@source` de `apps/web/src/styles.css`, o
   Tailwind no verá sus clases y el juego saldrá sin estilos.

## Despliegue

- **Web** → Vercel (`apps/web/vercel.json` ya declara el framework). Hay que
  configurar `VITE_REALTIME_URL` apuntando al Worker.
- **Salas** → Cloudflare Workers: `pnpm --filter @mgames/realtime deploy`.
  Conviene rellenar la variable `ALLOWED_ORIGINS` en `wrangler.jsonc` con el
  dominio de la web: los WebSockets no pasan por CORS, así que esa comprobación
  es lo único que evita que otra web abra salas contra el servidor.
