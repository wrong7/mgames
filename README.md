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
packages/game-kit    Contrato entre juego y app: manifest, motores, códigos, azar determinista, slimes
packages/codenames   Código Secreto: motor e interfaz
packages/cubes       Visto y no visto: motor e interfaz
packages/spy         El Espía: motor e interfaz
```

Cada juego es un paquete independiente que trae **su lógica y su interfaz**. No
hay paquete de UI compartido a propósito: la gracia de la colección es que cada
juego se vea como lo que es. Lo único que comparten es `game-kit`: el contrato
del motor, la sincronización, cuatro utilidades y lo único que se pinta igual en
todos los juegos, la cara de cada jugador.

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
  pide un nombre y se le da un slime 3D con mucha cara de tonto, generado a
  partir de una semilla que puede volver a tirar hasta que le guste (y deshacer
  si se pasa uno bueno). Se
  guarda en el móvil y desde ahí viaja con cada conexión y cada jugada: es lo que
  los demás ven en las fichas y en las listas. La ruta `_jugador` es la puerta:
  nada se abre sin él.
- **Sala.** Un código de cuatro caracteres. Conectarse es entrar; salir es un
  botón. Mientras se elige juego, la sala es un escenario: cada uno es su slime
  en una peana, el que llega cae del cielo y el que se va se derrite en un
  charco. El primero que entró es el anfitrión y es quien pone un juego
  sobre la mesa o lo recoge — la forma más simple de que no haya cinco dedos
  cambiando de juego a la vez.
- **Juego.** Recibe la gente de la sala y no lleva lista propia. Código Secreto
  empieza formando la mesa: cada uno elige equipo y papel y dice "listo", y el
  tablero no aparece hasta que todos los de la sala están sentados y listos y
  cada equipo tiene al menos un jefe y un agente — lo comprueba el motor, no la
  pantalla. Después, el asiento manda: destapa el jefe del equipo en turno y
  señalan sus agentes. El Espía reparte directamente a quien esté. Visto y no
  visto va por rondas y cada ronda empieza cuando todos han dicho "listo" (o a
  los 15 segundos del resultado, para que un despistado no pare la mesa): lo
  que pasa en él dura poco más de un segundo, y quien no mira se lo pierde.

## Cómo se sincroniza una partida

Cada sala es un Durable Object, identificado por el código que los jugadores se
dictan en voz alta. Todos los móviles de la sala abren un WebSocket contra él,
y el objeto difunde la sala —gente, juego elegido y estado del juego— después
de cada cambio.

Seis decisiones que conviene conocer antes de tocar nada:

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
- **La hora es la del servidor, y el motor no tiene reloj.** Cada vista sale
  con la hora del servidor (`RoomView.now`), `useRoom` pone con ella en hora
  el móvil y las pantallas la reciben como `now()`: el reloj de cada móvil va a
  su aire, y en Visto y no visto los cubos tienen que esfumarse a la vez en
  todos. Un juego con reloj guarda en su estado horas, no cuentas atrás
  (cuándo aparecen los cubos, cuándo se cierra la ronda). Como el servidor sólo
  ejecuta el motor cuando llega una jugada, cuando a un móvil le parece que ya
  es la hora manda un aviso (`avanzar`) y el motor lo comprueba con la hora del
  servidor; si no toca, no pasa nada. Sin nadie mirando, la partida espera en
  vez de jugarse sola.

## Los slimes

Cada jugador es un slime: una gota de gelatina pequeñita, la mitad de su
peana, con mucha cara. Viven en `packages/game-kit/src/react/avatar`. Las
piezas se modelan en Blender y el resto (el color, la cara, qué lleva en la
cabeza, cómo se mueve) sale de la semilla en el navegador.

El estilo es el de los juegos de fiesta: todos con la misma forma de gota,
colores de mascota (amarillo, verde alienígena...), gorros de disfraz, de la
capucha de cangrejo al cono de obra, y caras que hacen gracia solas. La cara es
toda dibujo, con el mismo trazo de rotulador: ojos, cejas, nariz, boca, bigote
o pecas son planos, sin relieve; las gafas y los gorros sí son objetos.

- **La semilla es todo.** `look.ts` convierte los ocho caracteres de
  `profile.avatar` en un aspecto (color, cara, pelo, gorro y hasta el gesto
  favorito) con el mismo azar determinista de los juegos, así que todos los
  móviles ven el mismo slime sin que viaje nada más. Cambiar esas listas o el
  orden de las tiradas cambia la cara de todo el mundo a la vez: no rompe
  nada, porque sólo se guarda la semilla, pero conviene hacerlo a sabiendas.
  Por eso se siguen haciendo las tiradas de la ropa de cuando los avatares
  eran muñecos, y un test fija el aspecto de unas cuantas semillas.
- **Las piezas, de Blender.** `packages/game-kit/blender/munecos.py` genera el
  kit entero con código (así se regenera y se revisa en un diff) y lo exporta a
  `munecos.glb`, comprimido con Draco (unos 400 KB): la gota de gelatina, la
  cabeza de referencia, catorce peinados, veintiún gorros, gafas y monóculo.
  Lleva también el cuerpo y la ropa de cuando eran muñecos, que la web ya no
  usa. Para regenerarlo (con `--preview carpeta` saca además fotos de
  comprobación):

  ```bash
  blender --background --factory-startup --python packages/game-kit/blender/munecos.py -- packages/game-kit/src/react/avatar/munecos.glb
  ```

- **Montaje en la web.** `kit.ts` descarga el GLB la primera vez que hace
  falta y `slime.ts` monta cada slime. La parte de arriba de la gota es la
  cabeza de referencia a escala, así que le valen los pelos, los gorros y las
  gafas hechos para ella: `model.ts` decide dónde van los ojos y la boca, echa
  el pelo y el gorro hacia atrás lo justo para no taparlos y les da color. La
  cara se pinta en un lienzo (`face.ts`) que la gelatina lleva de textura y
  cambia con el gesto: ojos cerrados al parpadear, ^^ al celebrar, la O del
  susto. Las pupilas las pinta el sombreador sobre el blanco del ojo, así que
  se mueven cada fotograma sin volver a pintar el lienzo.
- **Gelatina, sin huesos.** `jelly.ts` deforma el slime punto a punto en el
  sombreador (se aplasta desparramándose por abajo, se estira como una gota,
  se dobla como un flan, tiembla ovalándose, se le ven ondas al caer) y la
  misma cuenta en TypeScript cuelga de la superficie deformada el gorro, las
  gafas y el bracito.
- **Muelles, no animaciones grabadas.** `slime-motion.ts` calcula cada pose
  con fórmulas y la mueve con muelles encadenados: la cima sigue a la base con
  retraso, así que cada golpe le sube por el cuerpo como una onda y da
  latigazos; nota los frenazos cuando lo cambian de sitio, y si cae de alto le
  saltan gotitas. Sabe saludar con un bracito que le sale del costado, saltar,
  aplastarse como una tortita, temblar como un flan, estirarse para mirar a lo
  lejos, botar, dar vueltas, inflarse como un globo (y salir disparado al
  desinflarse), tiritar de miedo y bailar. Los gestos salen solos de vez en
  cuando o al tocarlo, que le da un meneo. Para irse, se derrite en un charco.
- **Luz de estudio, slimes de terciopelo.** `scene.ts` pone una luz principal
  con sombras suaves, un contraluz y un entorno propio (una cúpula morada con
  tres focos). Todo es de terciopelo, como los muñecos flocados: mate, sin
  reflejos de los focos, con el brillo suave del terciopelo en los bordes. Si
  los fotogramas van lentos, el escenario baja solo la resolución y después
  quita las sombras.
- **Un lienzo para todos.** `<AvatarStage>` pone a la sala entera en una sola
  escena (`stage.ts`); `<Avatar>` es una foto fija del slime, hecha una vez por
  semilla con un renderizador compartido, para las fichas pequeñas de los
  juegos. three.js y el kit se cargan aparte y sólo cuando hacen falta:
  mientras llegan se ven las peanas (y los slimes caen sobre ellas al
  llegar), y sin WebGL, o si el kit no baja, se ven retratos planos.
- **El podio.** Con `variant="podio"`, el mismo escenario cierra una partida:
  cada uno en la columna de su puesto (`place`), de oro, plata o bronce, que
  sube del suelo. Caen del último al primero, como en una entrega de medallas,
  y el que gana no para de celebrarlo (bota, baila, se infla) mientras los
  demás le saludan (a los slimes se les puede decir qué gestos hacer por su
  cuenta). Visto y no visto lo usa en su clasificación.

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

- **Web** → Vercel, en `https://malitos.vercel.app` (`apps/web/vercel.json` ya
  declara el framework). La URL del Worker está en `apps/web/.env.production`:
  no es un secreto, porque acaba dentro de la web igualmente, y así cada
  despliegue la lleva sin tocar el panel de Vercel (si allí se define
  `VITE_REALTIME_URL`, gana ésa). Se mete en la web al compilar: cambiarla pide
  volver a desplegar.
- **Salas** → Cloudflare Workers: `pnpm --filter @mgames/realtime run deploy`. Con
  `run`: sin él, pnpm ejecuta su propio `pnpm deploy`, que no despliega nada
  sino que copia el paquete a una carpeta.
  `ALLOWED_ORIGINS`, en `wrangler.jsonc`, lleva los orígenes de la web (sin
  barra final, que es como los manda el navegador): los WebSockets no pasan por
  CORS, así que esa comprobación es lo único que evita que otra web abra salas
  contra el servidor. `pnpm dev` la vacía con `--var` para poder jugar desde
  localhost; las previews de Vercel, con otra URL en cada despliegue, no entran
  si no se añaden.
