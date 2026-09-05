/**
 * Lo que comparten todos los juegos de la colección: cómo se describen a sí
 * mismos, cómo se generan los códigos de sala y cómo se reparte al azar sin que
 * dos móviles obtengan cosas distintas.
 *
 * Nada de aquí toca el DOM ni React — eso vive en `@mgames/game-kit/react` —
 * para que el servidor de salas pueda importarlo tal cual.
 */
export { CODE_LENGTH, isCompleteCode, normalizeCode, randomCode } from "./code.ts";
export type { GameManifest } from "./manifest.ts";
export { createRng, type Rng } from "./rng.ts";
