import { createRng } from "@mgames/game-kit";
import type { Board, CardKind, Team } from "./types.ts";
import { WORDS } from "./words.ts";

/** El tablero es 5x5: 25 cartas. */
export const BOARD_COLS = 5;
export const BOARD_ROWS = 5;
export const CARD_COUNT = BOARD_COLS * BOARD_ROWS;

/**
 * Reparto de las 25 cartas. El equipo que empieza tiene una carta de más: por eso
 * empieza, y por eso el otro equipo tiene ventaja en el desempate.
 */
const CARDS_STARTING_TEAM = 9;
const CARDS_SECOND_TEAM = 8;
const CARDS_NEUTRAL = 7;
const CARDS_ASSASSIN = 1;

/**
 * Reparte un tablero a partir de una semilla.
 *
 * Determinista a propósito: la misma semilla da el mismo tablero en el servidor
 * y en cualquier móvil. Eso permite que una sala se reconstruya sola si el
 * Durable Object se recicla, y que el juego siga siendo jugable sin conexión.
 */
export function buildBoard(seed: string): Board {
	const rng = createRng(seed, "codenames/board");

	const startingTeam: Team = rng.next() < 0.5 ? "azul" : "rojo";
	const secondTeam: Team = startingTeam === "azul" ? "rojo" : "azul";

	const kinds: CardKind[] = [
		...Array<CardKind>(CARDS_STARTING_TEAM).fill(startingTeam),
		...Array<CardKind>(CARDS_SECOND_TEAM).fill(secondTeam),
		...Array<CardKind>(CARDS_NEUTRAL).fill("neutral"),
		...Array<CardKind>(CARDS_ASSASSIN).fill("asesino"),
	];

	return {
		words: rng.sample(WORDS, CARD_COUNT),
		kinds: rng.shuffle(kinds),
		startingTeam,
	};
}

/** Cuántas cartas le quedan por destapar a un equipo. */
export function remainingFor(board: Board, revealed: readonly boolean[], team: Team): number {
	let left = 0;
	for (let i = 0; i < board.kinds.length; i++) {
		if (board.kinds[i] === team && !revealed[i]) left++;
	}
	return left;
}
