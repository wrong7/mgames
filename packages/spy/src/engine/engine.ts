import type { GameEngine } from "@mgames/game-kit";
import { applyAction, createGame, project } from "./state.ts";
import type { SpyAction, SpyState, SpyView } from "./types.ts";

/**
 * Spyfall visto por el servidor de salas.
 *
 * A diferencia de Código Secreto, aquí `actorId` importa en todas las acciones:
 * cada móvil es un jugador con su propia carta, y quién envía la jugada es parte
 * de la jugada.
 */
export const engine: GameEngine<SpyState, SpyAction, SpyView> = {
	create: ({ seed, now }) => createGame(seed, now),
	apply: (state, action, { actor, now }) => applyAction(state, action, actor, now),
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
		case "unirse":
		case "salir":
		case "revelar":
		case "volver":
			return { type: action.type };
		default:
			return null;
	}
}
