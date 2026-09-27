/**
 * El Espía: motor e interfaz.
 *
 * El motor se exporta además por `@mgames/spy/engine`, sin React, para que el
 * servidor de salas pueda repartir las cartas y proyectar lo que ve cada uno.
 */

export type {
	Card,
	Location,
	Phase,
	Round,
	SpyAction,
	SpyContext,
	SpyPlayer,
	SpyState,
	SpyView,
} from "./engine/index.ts";
export {
	allReady,
	applyAction,
	createGame,
	DEAL_COUNTDOWN_MS,
	deal,
	dealStep,
	engine,
	LOCATIONS,
	MAX_PLAYERS,
	MIN_PLAYERS,
	project,
	spyCountFor,
} from "./engine/index.ts";
export { manifest } from "./manifest.ts";
export { COLORS } from "./theme.ts";
export * from "./ui/index.ts";
