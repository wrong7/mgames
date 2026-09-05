import type { GameEngine } from "@mgames/game-kit";
import { applyAction, createGame, project } from "./state.ts";
import type { SpyAction, SpyState, SpyView } from "./types.ts";

/**
 * Spyfall visto por el servidor de salas.
 *
 * El reparto se hace a la gente de la sala, que llega en el contexto: el juego
 * no lleva su propia lista ni pide a nadie que "se una". Lo que sí lleva es el
 * secreto, y `project` es lo que impide que salga del servidor.
 */
export const engine: GameEngine<SpyState, SpyAction, SpyView> = {
	create: ({ seed, now }) => createGame(seed, now),
	apply: (state, action, { players, now }) => applyAction(state, action, players, now),
	project,
	parseAction,
};

function parseAction(value: unknown): SpyAction | null {
	if (typeof value !== "object" || value === null) return null;
	const action = value as Record<string, unknown>;

	switch (action.type) {
		case "repartir":
			return typeof action.seed === "string" && action.seed.length > 0
				? { type: "repartir", seed: action.seed }
				: null;
		case "revelar":
		case "volver":
			return { type: action.type };
		default:
			return null;
	}
}
