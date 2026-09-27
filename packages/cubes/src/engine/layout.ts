import type { Rng } from "@mgames/game-kit";
import { BOARD_SIZE, CELL_COUNT } from "./rules.ts";
import type { Pattern } from "./types.ts";

/** Una casilla como fila y columna, que es como se piensan las figuras. */
type Cell = readonly [row: number, col: number];

const cellIndex = ([row, col]: Cell) => row * BOARD_SIZE + col;

const inside = ([row, col]: Cell) => row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

/**
 * Dónde caen los cubos de una ronda: `count` casillas distintas del tablero,
 * colocadas según el patrón y en orden de lectura.
 *
 * Determinista con el generador que se le pase, como todo lo que acaba en el
 * estado: la misma semilla pone los mismos cubos en el servidor y en los tests.
 */
export function layCubes(pattern: Pattern, count: number, rng: Rng): number[] {
	const cells = Math.min(Math.max(Math.round(count), 1), CELL_COUNT);
	switch (pattern) {
		case "lineas":
			return sorted(lines(cells, rng));
		case "formas":
			return sorted(shapes(cells, rng));
		case "mezcla":
			return sorted(mixed(cells, rng));
		case "sueltos":
			return sorted(scatter(cells, new Set(), rng));
	}
}

function sorted(cells: Iterable<number>): number[] {
	return [...cells].sort((a, b) => a - b);
}

/**
 * Tramos rectos, todos en la misma dirección y con una calle libre entre
 * ellos: se cuentan por tramos ("cuatro y tres") sin que se junten.
 *
 * Hasta cinco cubos, un solo tramo; a partir de ahí, los menos posibles. Ningún
 * tramo baja de dos, que un cubo suelto ya no es una fila.
 */
function lines(count: number, rng: Rng): Set<number> {
	const lengths = splitInto(count, Math.ceil(count / BOARD_SIZE), rng);
	const across = rng.next() < 0.5;
	const lanes = rng.shuffle(pickLanes(lengths.length, rng));
	const cells = new Set<number>();
	lengths.forEach((length, i) => {
		const lane = lanes[i] as number;
		const start = rng.int(BOARD_SIZE - length + 1);
		for (let step = start; step < start + length; step++) {
			cells.add(cellIndex(across ? [lane, step] : [step, lane]));
		}
	});
	return cells;
}

/** Reparte `count` en `parts` tramos de entre 2 y 5, no siempre iguales. */
function splitInto(count: number, parts: number, rng: Rng): number[] {
	const lengths = Array.from(
		{ length: parts },
		(_, i) => Math.floor(count / parts) + (i < count % parts ? 1 : 0),
	);
	// Unos cuantos trasvases al azar para que "8" no sea siempre "4 y 4".
	for (let i = 0; i < parts * 2; i++) {
		const from = rng.int(parts);
		const to = rng.int(parts);
		if (from !== to && (lengths[from] as number) > 2 && (lengths[to] as number) < BOARD_SIZE) {
			lengths[from] = (lengths[from] as number) - 1;
			lengths[to] = (lengths[to] as number) + 1;
		}
	}
	return lengths;
}

/** `count` filas (o columnas) distintas, con al menos una libre entre cada dos si caben. */
function pickLanes(count: number, rng: Rng): number[] {
	const all = combinations(
		Array.from({ length: BOARD_SIZE }, (_, i) => i),
		count,
	);
	const apart = all.filter((lanes) =>
		lanes.every((lane, i) => i === 0 || lane - (lanes[i - 1] as number) >= 2),
	);
	return rng.pick(apart.length > 0 ? apart : all);
}

function combinations<T>(items: readonly T[], size: number): T[][] {
	if (size === 0) return [[]];
	return items.flatMap((item, i) =>
		combinations(items.slice(i + 1), size - 1).map((rest) => [item, ...rest]),
	);
}

/**
 * Figuras que se reconocen de un vistazo: el que sabe que una cruz son cinco
 * cuenta figuras en vez de cubos. Van dibujadas fila a fila (`#` es un cubo) y
 * se giran y se voltean al colocarlas.
 */
const SHAPES: readonly (readonly Cell[])[] = [
	// Dos y tres: los rellenos para cuadrar la cuenta.
	["##"],
	["###"],
	["#.", "##"],
	// Cuatro: cuadrado, ele, te y zeta.
	["##", "##"],
	["#.", "#.", "##"],
	["###", ".#."],
	["##.", ".##"],
	// Cinco: cruz, u, ele grande, escalera y te grande.
	[".#.", "###", ".#."],
	["#.#", "###"],
	["#..", "#..", "###"],
	["#..", "##.", ".##"],
	["###", ".#.", ".#."],
	// Seis: rectángulo y pirámide de escalones.
	["###", "###"],
	["#..", "##.", "###"],
	// Siete: la hache. Ocho: el marco. Nueve: el bloque.
	["#.#", "###", "#.#"],
	["###", "#.#", "###"],
	["###", "###", "###"],
].map(drawn);

/** De dibujo a casillas: cada `#` de cada fila es un cubo. */
function drawn(rows: readonly string[]): Cell[] {
	return rows.flatMap((line, row) =>
		[...line].flatMap((mark, col): Cell[] => (mark === "#" ? [[row, col]] : [])),
	);
}

/** Intentos de colocar una partida entera de figuras antes de conformarse con menos. */
const LAYOUT_TRIES = 40;
/** Intentos de encajar una figura concreta en el tablero. */
const PLACE_TRIES = 24;

/**
 * Figuras separadas hasta sumar `count`.
 *
 * Primero se intenta que no se toquen, que es lo que hace que se lean como
 * figuras; si no caben así, se dejan tocar; y si ni así, lo que falte va suelto.
 */
function shapes(count: number, rng: Rng): Set<number> {
	for (const apart of [true, false]) {
		for (let attempt = 0; attempt < LAYOUT_TRIES; attempt++) {
			const cells = fillWithShapes(count, new Set(), apart, rng);
			if (cells.size === count) return cells;
		}
	}
	const cells = fillWithShapes(count, new Set(), false, rng);
	return scatter(count - cells.size, cells, rng, cells);
}

/**
 * Una figura grande y el resto sueltos por el tablero.
 *
 * La figura se lleva algo más de la mitad: se reconoce, se suma de golpe, y
 * los sueltos hay que contarlos uno a uno.
 */
function mixed(count: number, rng: Rng): Set<number> {
	const target = Math.max(4, Math.ceil(count * 0.55));
	const fitting = SHAPES.filter((shape) => shape.length <= target && shape.length >= 4);
	for (let attempt = 0; attempt < LAYOUT_TRIES; attempt++) {
		const cells = new Set<number>();
		const shape = pickBySize(fitting, rng);
		if (!place(shape, cells, cells, rng)) continue;
		// Los sueltos, sin pegarse a la figura para que ésta siga leyéndose como tal.
		const loose = scatter(count - cells.size, withNeighbours(cells), rng);
		if (loose.size === count - cells.size) {
			for (const cell of loose) cells.add(cell);
			return cells;
		}
	}
	return scatter(count, new Set(), rng);
}

/** Va poniendo figuras hasta llegar a `count` o no poder poner más. */
function fillWithShapes(count: number, cells: Set<number>, apart: boolean, rng: Rng): Set<number> {
	let remaining = count - cells.size;
	while (remaining > 0) {
		// Nunca dejar un cubo solo al final: una figura de uno no es una figura.
		const left = remaining;
		const fitting = SHAPES.filter(
			(shape) => shape.length <= left && (left - shape.length === 0 || left - shape.length >= 2),
		);
		let placed = false;
		// Se prueban primero las grandes, pero no siempre la misma.
		for (const shape of orderBySize(fitting, rng)) {
			if (place(shape, cells, apart ? withNeighbours(cells) : cells, rng)) {
				placed = true;
				break;
			}
		}
		if (!placed) return cells;
		remaining = count - cells.size;
	}
	return cells;
}

/** Las figuras en un orden al azar que tira hacia las grandes. */
function orderBySize(options: readonly (readonly Cell[])[], rng: Rng): (readonly Cell[])[] {
	const pool = [...options];
	const ordered: (readonly Cell[])[] = [];
	while (pool.length > 0) {
		const shape = pickBySize(pool, rng);
		ordered.push(shape);
		pool.splice(pool.indexOf(shape), 1);
	}
	return ordered;
}

/** Una figura al azar, con más probabilidad cuanto más grande. */
function pickBySize(options: readonly (readonly Cell[])[], rng: Rng): readonly Cell[] {
	const total = options.reduce((sum, shape) => sum + shape.length ** 2, 0);
	let roll = rng.next() * total;
	for (const shape of options) {
		roll -= shape.length ** 2;
		if (roll < 0) return shape;
	}
	return options[options.length - 1] as readonly Cell[];
}

/**
 * Intenta poner la figura, girada y volteada al azar, en un sitio que no pise
 * nada de `blocked`. Si lo consigue, la añade a `cells`.
 */
function place(shape: readonly Cell[], cells: Set<number>, blocked: ReadonlySet<number>, rng: Rng) {
	for (let attempt = 0; attempt < PLACE_TRIES; attempt++) {
		const turned = orient(shape, rng.int(4), rng.next() < 0.5);
		const height = Math.max(...turned.map(([row]) => row)) + 1;
		const width = Math.max(...turned.map(([, col]) => col)) + 1;
		if (height > BOARD_SIZE || width > BOARD_SIZE) continue;
		const top = rng.int(BOARD_SIZE - height + 1);
		const left = rng.int(BOARD_SIZE - width + 1);
		const placed = turned.map(([row, col]) => cellIndex([top + row, left + col]));
		if (placed.some((cell) => blocked.has(cell))) continue;
		for (const cell of placed) cells.add(cell);
		return true;
	}
	return false;
}

/** La figura girada `turns` cuartos de vuelta, volteada si toca, y pegada a la esquina. */
function orient(shape: readonly Cell[], turns: number, flip: boolean): Cell[] {
	let cells: Cell[] = shape.map(([row, col]) => [row, flip ? -col : col]);
	for (let i = 0; i < turns; i++) cells = cells.map(([row, col]) => [col, -row]);
	const minRow = Math.min(...cells.map(([row]) => row));
	const minCol = Math.min(...cells.map(([, col]) => col));
	return cells.map(([row, col]) => [row - minRow, col - minCol]);
}

/** Las casillas y las que tocan con ellas por un lado. */
function withNeighbours(cells: ReadonlySet<number>): Set<number> {
	const around = new Set(cells);
	for (const cell of cells) {
		const row = Math.floor(cell / BOARD_SIZE);
		const col = cell % BOARD_SIZE;
		for (const next of [
			[row - 1, col],
			[row + 1, col],
			[row, col - 1],
			[row, col + 1],
		] as const) {
			if (inside(next)) around.add(cellIndex(next));
		}
	}
	return around;
}

/**
 * `count` casillas al azar fuera de `blocked`, añadidas a `into`.
 *
 * Si no quedan bastantes casillas libres, pone las que puede: quien la llama
 * comprueba si le basta.
 */
function scatter(
	count: number,
	blocked: ReadonlySet<number>,
	rng: Rng,
	into: Set<number> = new Set(),
): Set<number> {
	const free = Array.from({ length: CELL_COUNT }, (_, i) => i).filter(
		(cell) => !blocked.has(cell) && !into.has(cell),
	);
	for (const cell of rng.sample(free, count)) into.add(cell);
	return into;
}
