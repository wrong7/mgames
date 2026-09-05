import type { PlayerProfile } from "@mgames/game-kit";
import { buildBoard, CARD_COUNT, remainingFor } from "./board.ts";
import type { Board, GameAction, GameState, Seat, Team } from "./types.ts";

const other = (team: Team): Team => (team === "azul" ? "rojo" : "azul");

/** Estado inicial de una partida recién puesta sobre la mesa: nadie sentado aún. */
export function createGame(seed: string, now: number = Date.now()): GameState {
	const board = buildBoard(seed);
	return {
		board,
		seats: {},
		revealed: Array<boolean>(CARD_COUNT).fill(false),
		votes: {},
		turn: board.startingTeam,
		winner: null,
		endedBy: null,
		updatedAt: now,
	};
}

/**
 * Aplica una acción al estado. Función pura: mismo estado + misma acción =
 * mismo resultado, en el navegador y en el servidor.
 *
 * Devuelve el estado sin tocar cuando la acción no procede: índice fuera de
 * rango, partida terminada, carta ya destapada, o alguien haciendo algo que no
 * le toca por su asiento. Preferimos ignorar la jugada imposible antes que
 * lanzar: los mensajes llegan por red y de varios móviles a la vez, así que las
 * carreras son normales, no errores.
 */
export function applyAction(
	state: GameState,
	action: GameAction,
	actor: PlayerProfile,
	now: number = Date.now(),
): GameState {
	const seat = state.seats[actor.id];

	switch (action.type) {
		case "sit": {
			const next: Seat = { team: action.team, role: action.role };
			if (seat?.team === next.team && seat.role === next.role) return state;
			// Cambiar de sitio retira tu ficha: era de otro equipo o de otro papel.
			return {
				...state,
				seats: { ...state.seats, [actor.id]: next },
				votes: without(state.votes, actor.id),
				updatedAt: now,
			};
		}

		case "stand": {
			if (!seat) return state;
			return {
				...state,
				seats: without(state.seats, actor.id),
				votes: without(state.votes, actor.id),
				updatedAt: now,
			};
		}

		case "restart": {
			// Los asientos se conservan: la gente sigue donde estaba, cambia el tablero.
			if (seat?.role !== "jefe") return state;
			return { ...createGame(action.seed, now), seats: state.seats };
		}

		case "endTurn": {
			if (state.winner || !isTurnChief(seat, state.turn)) return state;
			// Cambia el equipo que adivina: lo que señalaba el anterior ya no cuenta.
			return { ...state, turn: other(state.turn), votes: {}, updatedAt: now };
		}

		case "vote": {
			if (
				state.winner ||
				!isValidIndex(action.index) ||
				state.revealed[action.index] ||
				seat?.role !== "agente" ||
				seat.team !== state.turn
			) {
				return state;
			}
			// Votar la carta que ya señalabas es retirar la ficha.
			const votes =
				state.votes[actor.id] === action.index
					? without(state.votes, actor.id)
					: { ...state.votes, [actor.id]: action.index };
			return { ...state, votes, updatedAt: now };
		}

		case "unreveal": {
			if (seat?.role !== "jefe" || !isValidIndex(action.index) || !state.revealed[action.index]) {
				return state;
			}
			const revealed = withRevealed(state.revealed, action.index, false);
			// Destapar puede haber terminado la partida; al deshacerlo, vuelve a estar viva.
			return { ...state, revealed, ...outcomeOf(state.board, revealed), updatedAt: now };
		}

		case "reveal": {
			if (
				state.winner ||
				!isValidIndex(action.index) ||
				state.revealed[action.index] ||
				!isTurnChief(seat, state.turn)
			) {
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
				// Las fichas sobre la carta destapada ya han cumplido. Si además cambia
				// el turno, las demás tampoco valen: era otro equipo el que señalaba.
				votes: keepsTurn ? withoutVotesOn(state.votes, action.index) : {},
				turn: keepsTurn ? state.turn : other(state.turn),
				...outcomeOf(state.board, revealed, state.turn),
				updatedAt: now,
			};
		}
	}
}

/** Sólo el jefe del equipo que está adivinando toca las cartas. */
function isTurnChief(seat: Seat | undefined, turn: Team): boolean {
	return seat?.role === "jefe" && seat.team === turn;
}

function isValidIndex(index: number): boolean {
	return Number.isInteger(index) && index >= 0 && index < CARD_COUNT;
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
	const { [key]: _, ...rest } = record;
	return rest;
}

function withoutVotesOn(votes: Readonly<Record<string, number>>, index: number) {
	return Object.fromEntries(Object.entries(votes).filter(([, i]) => i !== index));
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
