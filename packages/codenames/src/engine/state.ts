import { buildBoard, CARD_COUNT, remainingFor } from "./board.ts";
import type { Board, GameAction, GameState, Team } from "./types.ts";

const other = (team: Team): Team => (team === "azul" ? "rojo" : "azul");

/** Estado inicial de una sala recién creada (o recién reiniciada). */
export function createGame(seed: string, now: number = Date.now()): GameState {
	const board = buildBoard(seed);
	return {
		board,
		revealed: Array<boolean>(CARD_COUNT).fill(false),
		turn: board.startingTeam,
		winner: null,
		endedBy: null,
		updatedAt: now,
	};
}

/**
 * Aplica una acción al estado. Función pura: mismo estado + misma acción =
 * mismo resultado, en el navegador y en el Durable Object.
 *
 * Devuelve el estado sin tocar cuando la acción no es válida (índice fuera de
 * rango, partida ya terminada, carta ya destapada). Preferimos ignorar la jugada
 * imposible antes que lanzar: los mensajes llegan por red y de varios móviles a
 * la vez, así que las carreras son normales, no errores.
 */
export function applyAction(
	state: GameState,
	action: GameAction,
	now: number = Date.now(),
): GameState {
	switch (action.type) {
		case "restart":
			return createGame(action.seed, now);

		case "endTurn": {
			if (state.winner) return state;
			return { ...state, turn: other(state.turn), updatedAt: now };
		}

		case "unreveal": {
			if (!isValidIndex(action.index) || !state.revealed[action.index]) return state;
			const revealed = withRevealed(state.revealed, action.index, false);
			// Destapar puede haber terminado la partida; al deshacerlo, vuelve a estar viva.
			return { ...state, revealed, ...outcomeOf(state.board, revealed), updatedAt: now };
		}

		case "reveal": {
			if (state.winner || !isValidIndex(action.index) || state.revealed[action.index]) {
				return state;
			}
			const revealed = withRevealed(state.revealed, action.index, true);
			const kind = state.board.kinds[action.index];

			// El turno sigue sólo si has acertado una carta tuya. Cualquier otra cosa
			// —neutral, carta del rival o el asesino— cierra el turno.
			const keepsTurn = kind === state.turn;

			return {
				...state,
				revealed,
				turn: keepsTurn ? state.turn : other(state.turn),
				...outcomeOf(state.board, revealed, state.turn),
				updatedAt: now,
			};
		}
	}
}

function isValidIndex(index: number): boolean {
	return Number.isInteger(index) && index >= 0 && index < CARD_COUNT;
}

function withRevealed(revealed: readonly boolean[], index: number, value: boolean): boolean[] {
	const next = [...revealed];
	next[index] = value;
	return next;
}

/**
 * Recalcula el final de la partida desde cero mirando el tablero.
 *
 * Lo derivamos en lugar de acumularlo para que deshacer una carta deshaga
 * también la victoria, sin llevar un historial.
 */
function outcomeOf(
	board: Board,
	revealed: readonly boolean[],
	revealingTeam?: Team,
): Pick<GameState, "winner" | "endedBy"> {
	const assassin = board.kinds.indexOf("asesino");
	if (assassin !== -1 && revealed[assassin]) {
		// Quien destapa al asesino pierde en el acto. Si no sabemos quién fue (por
		// ejemplo al recalcular), gana el equipo que no empezaba: sólo pasa en
		// estados reconstruidos, y el mensaje se corrige en la siguiente acción.
		const loser = revealingTeam ?? board.startingTeam;
		return { winner: loser === "azul" ? "rojo" : "azul", endedBy: "asesino" };
	}
	for (const team of ["azul", "rojo"] as const) {
		if (remainingFor(board, revealed, team) === 0) {
			return { winner: team, endedBy: "cartas" };
		}
	}
	return { winner: null, endedBy: null };
}
