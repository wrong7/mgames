import type { GameEngine } from "@mgames/game-kit";
import { CARD_COUNT } from "./board.ts";
import { applyAction, createGame } from "./state.ts";
import type { GameAction, GameState } from "./types.ts";

/**
 * Código Secreto visto por el servidor de salas.
 *
 * El actor importa para los votos —cada ficha lleva la cara de quien la puso—
 * pero no para destapar: el servidor no sabe quién es jefe y quién agente,
 * porque el papel se elige en la pantalla. Que un agente no destape lo
 * garantiza su interfaz, que no le ofrece el gesto; lo que sí garantiza el
 * motor es que nadie vote una carta ya destapada ni con la partida acabada.
 */
export const engine: GameEngine<GameState, GameAction> = {
	create: ({ seed, now }) => createGame(seed, now),
	apply: (state, action, { actor, now }) => applyAction(state, action, actor, now),
	parseAction,
};

function parseAction(value: unknown): GameAction | null {
	if (typeof value !== "object" || value === null) return null;
	const action = value as Record<string, unknown>;

	switch (action.type) {
		case "vote":
		case "reveal":
		case "unreveal":
			return isCardIndex(action.index) ? { type: action.type, index: action.index } : null;
		case "endTurn":
			return { type: "endTurn" };
		case "restart":
			return typeof action.seed === "string" && action.seed.length > 0
				? { type: "restart", seed: action.seed }
				: null;
		default:
			return null;
	}
}

function isCardIndex(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < CARD_COUNT;
}
