import type { GameEngine } from "@mgames/game-kit";
import { applyAction, createGame, isAnswer, project } from "./state.ts";
import type { CubesAction, CubesState, CubesView } from "./types.ts";

/**
 * Visto y no visto, visto por el servidor de salas.
 *
 * Es el primer juego con reloj, y el motor sigue sin tenerlo: el servidor sólo
 * lo ejecuta cuando llega una jugada. Las horas (cuándo aparecen los cubos,
 * cuándo se cierra la ronda) van en el estado, cada móvil las mira con el reloj
 * de la sala, y cuando a uno le parece que ya toca, manda `avanzar`. El motor
 * lo comprueba con la hora del servidor: si aún no toca, no pasa nada.
 *
 * Proyecta la vista de cada uno para que el número de los demás no viaje hasta
 * que se cierra la ronda.
 */
export const engine: GameEngine<CubesState, CubesAction, CubesView> = {
	create: ({ seed, now }) => createGame(seed, now),
	apply: (state, action, { actorId, players, now }) =>
		applyAction(state, action, actorId, players, now),
	project,
	parseAction,
};

function parseAction(value: unknown): CubesAction | null {
	if (typeof value !== "object" || value === null) return null;
	const action = value as Record<string, unknown>;

	switch (action.type) {
		case "listo":
			return typeof action.ready === "boolean" ? { type: "listo", ready: action.ready } : null;
		case "responder":
			return isAnswer(action.value) ? { type: "responder", value: action.value } : null;
		case "avanzar":
			return { type: "avanzar" };
		default:
			return null;
	}
}
