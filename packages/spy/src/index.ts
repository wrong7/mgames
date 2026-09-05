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
	SpyPlayer,
	SpyState,
	SpyView,
} from "./engine/index.ts";
export {
	applyAction,
	createGame,
	deal,
	engine,
	LOCATION_NAMES,
	LOCATIONS,
	MAX_NAME_LENGTH,
	MAX_PLAYERS,
	MIN_PLAYERS,
	project,
	spyCountFor,
} from "./engine/index.ts";
export { manifest } from "./manifest.ts";
export { COLORS } from "./theme.ts";
export * from "./ui/index.ts";
