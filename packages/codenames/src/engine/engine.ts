import type { GameEngine } from "@mgames/game-kit";
import { CARD_COUNT } from "./board.ts";
import { applyAction, createGame } from "./state.ts";
import type { GameAction, GameState, Role, Team } from "./types.ts";

/**
 * Código Secreto visto por el servidor de salas.
 *
 * Aquí no hay secretos que proyectar: quien se sienta de jefe ha decidido ver la
 * clave. Lo que sí hace cumplir el motor es el asiento: sólo el jefe del equipo
 * en turno destapa y sólo sus agentes señalan, aunque otra pantalla intente
 * mandar la jugada.
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
		case "sit":
			return isTeam(action.team) && isRole(action.role)
				? { type: "sit", team: action.team, role: action.role }
				: null;
		case "stand":
			return { type: "stand" };
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

function isTeam(value: unknown): value is Team {
	return value === "azul" || value === "rojo";
}

function isRole(value: unknown): value is Role {
	return value === "jefe" || value === "agente";
}

function isCardIndex(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < CARD_COUNT;
}
