/**
 * Lo que comparten todos los juegos de la colección: cómo se describen a sí
 * mismos, cómo se generan los códigos de sala, cómo se reparte al azar sin que
 * dos móviles obtengan cosas distintas y qué forma tiene su motor.
 *
 * Nada de aquí toca el DOM ni React — eso vive en `@mgames/game-kit/react` —
 * para que el servidor de salas pueda importarlo tal cual.
 */
export { CODE_LENGTH, isCompleteCode, normalizeCode, randomCode } from "./code.ts";
export type { ActorContext, AnyEngine, EngineContext, GameEngine } from "./engine.ts";
export type { GameManifest } from "./manifest.ts";
export { arrive, departDue, leave, scheduleDeparture } from "./presence.ts";
export {
	MAX_NAME_LENGTH,
	normalizeName,
	type PlayerProfile,
	parseProfile,
} from "./profile.ts";
export {
	type ClientMessage,
	parseClientMessage,
	parseServerMessage,
	type ServerMessage,
} from "./protocol.ts";
export { createRng, type Rng } from "./rng.ts";
export {
	type GameScreenProps,
	hostOf,
	parseRoomAction,
	type RoomAction,
	type RoomState,
	type RoomView,
} from "./room.ts";
