import type { GameEngine } from "@mgames/game-kit";
import { CARD_COUNT } from "./board.ts";
import { applyAction, createGame } from "./state.ts";
import type { GameAction, GameState } from "./types.ts";

/**
 * Código Secreto visto por el servidor de salas.
 *
 * No usa `actorId`: en este juego cualquiera de la mesa puede destapar cualquier
 * carta, igual que cualquiera puede alargar la mano sobre el tablero de cartón.
 * Quién puede tocar qué lo arregla la gente hablando, no el software.
 */
export const engine: GameEngine<GameState, GameAction> = {
	create: ({ seed, now }) => createGame(seed, now),
	apply: (state, action, { now }) => applyAction(state, action, now),
	parseAction,
};

function parseAction(value: unknown): GameAction | null {
	if (typeof value !== "object" || value === null) return null;
	const action = value as Record<string, unknown>;

	switch (action.type) {
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
