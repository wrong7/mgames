import type { Level } from "./types.ts";

/** El tablero es de 5x5 y los cubos no se apilan: nunca hay más de 25. */
export const BOARD_SIZE = 5;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

/** El número más alto que se puede marcar: uno por casilla. */
export const MAX_ANSWER = CELL_COUNT;

/**
 * La cuenta de "preparados" antes de que caigan los cubos: tres golpes de 800 ms.
 * Es lo que da tiempo a levantar la vista del móvil del de al lado.
 */
export const INTRO_MS = 2400;

/** Lo que tienen los demás para confirmar desde que contesta el primero. */
export const ANSWER_WINDOW_MS = 3000;

/**
 * Lo que dura el resultado si alguien no dice "listo". Da para comentar la
 * jugada; y con que falte uno que se ha distraído no se queda la mesa parada.
 */
export const RESULTS_MS = 15000;

/**
 * Las rondas de una partida, de la primera a la última.
 *
 * La dificultad sube por tres lados a la vez: más cubos, más desordenados y
 * menos tiempo para verlos. Primero van en fila (se cuentan por tramos), luego
 * en figuras que se reconocen de un vistazo, y al final cada uno donde cae.
 *
 * El tiempo no da para contarlos uno a uno, y es a propósito: hay que quedarse
 * con la foto y contar de memoria cuando ya no están.
 */
export const LEVELS: readonly Level[] = [
	{ pattern: "lineas", cubes: [3, 4], showMs: 1600 },
	{ pattern: "lineas", cubes: [5, 6], showMs: 1500 },
	{ pattern: "lineas", cubes: [7, 8], showMs: 1400 },
	{ pattern: "formas", cubes: [6, 8], showMs: 1400 },
	{ pattern: "formas", cubes: [8, 10], showMs: 1300 },
	{ pattern: "formas", cubes: [10, 12], showMs: 1300 },
	{ pattern: "mezcla", cubes: [9, 11], showMs: 1200 },
	{ pattern: "mezcla", cubes: [11, 13], showMs: 1200 },
	{ pattern: "sueltos", cubes: [10, 12], showMs: 1100 },
	{ pattern: "sueltos", cubes: [13, 15], showMs: 1000 },
];

export const ROUND_COUNT = LEVELS.length;

/** Cómo es la ronda `number` (de 1 a `ROUND_COUNT`). */
export function levelFor(number: number): Level {
	return LEVELS[Math.min(Math.max(number, 1), ROUND_COUNT) - 1] as Level;
}

/** Lo que se lleva quien acierta, y lo que se lleva de más el primero en acertar. */
export const POINTS_FOR_HIT = 1;
export const POINTS_FOR_FIRST = 1;
