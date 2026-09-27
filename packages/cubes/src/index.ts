/**
 * Visto y no visto: motor e interfaz.
 *
 * El motor se exporta además por `@mgames/cubes/engine`, sin React, para que el
 * servidor de salas pueda llevar las rondas y proyectar lo que ve cada uno.
 */

export type {
	Contestant,
	CubesAction,
	CubesState,
	CubesView,
	Pattern,
	Phase,
	Round,
	RoundResult,
	RoundView,
	TimedAnswer,
} from "./engine/index.ts";
export {
	applyAction,
	createGame,
	dueStep,
	engine,
	LEVELS,
	project,
	ROUND_COUNT,
	standings,
} from "./engine/index.ts";
export { manifest } from "./manifest.ts";
export { COLORS } from "./theme.ts";
export * from "./ui/index.ts";
