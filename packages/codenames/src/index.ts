/**
 * Código Secreto: motor e interfaz.
 *
 * El motor se exporta además por `@mgames/codenames/engine`, sin React, para que
 * el servidor de salas pueda ejecutar exactamente las mismas reglas.
 */

export type {
	// El tipo se renombra porque `Board` es también el componente que lo pinta.
	Board as BoardData,
	CardKind,
	GameAction,
	GameState,
	Team,
} from "./engine/index.ts";
export {
	applyAction,
	BOARD_COLS,
	BOARD_ROWS,
	buildBoard,
	CARD_COUNT,
	createGame,
	engine,
	remainingFor,
	WORDS,
} from "./engine/index.ts";
export { manifest } from "./manifest.ts";
export { COLORS } from "./theme.ts";
export * from "./ui/index.ts";
