import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng } from "@mgames/game-kit";
import { layCubes } from "./layout.ts";
import { BOARD_SIZE, CELL_COUNT, LEVELS } from "./rules.ts";
import type { Pattern } from "./types.ts";

const SEEDS = Array.from({ length: 150 }, (_, i) => `semilla-${i}`);

const lay = (pattern: Pattern, count: number, seed: string) =>
	layCubes(pattern, count, createRng(seed, "prueba"));

const rowOf = (cell: number) => Math.floor(cell / BOARD_SIZE);
const colOf = (cell: number) => cell % BOARD_SIZE;

/** Grupos de cubos que se tocan por un lado. */
function groups(cells: readonly number[]): number[][] {
	const left = new Set(cells);
	const found: number[][] = [];
	for (const start of cells) {
		if (!left.has(start)) continue;
		const group: number[] = [];
		const queue = [start];
		left.delete(start);
		while (queue.length > 0) {
			const cell = queue.pop() as number;
			group.push(cell);
			for (const next of cells) {
				const touching =
					Math.abs(rowOf(next) - rowOf(cell)) + Math.abs(colOf(next) - colOf(cell)) === 1;
				if (touching && left.has(next)) {
					left.delete(next);
					queue.push(next);
				}
			}
		}
		found.push(group);
	}
	return found;
}

describe("colocar los cubos", () => {
	it("pone exactamente los que tocan, cada uno en una casilla distinta del tablero", () => {
		for (const pattern of ["lineas", "formas", "mezcla", "sueltos"] as const) {
			for (const count of [3, 5, 8, 11, 15]) {
				for (const seed of SEEDS.slice(0, 40)) {
					const cells = lay(pattern, count, seed);
					assert.equal(cells.length, count, `${pattern} con ${count} (${seed})`);
					assert.equal(new Set(cells).size, count, `${pattern}: casillas repetidas`);
					for (const cell of cells) assert.ok(cell >= 0 && cell < CELL_COUNT);
					assert.deepEqual(
						cells,
						[...cells].sort((a, b) => a - b),
					);
				}
			}
		}
	});

	it("la misma semilla pone los mismos cubos y semillas distintas no", () => {
		assert.deepEqual(lay("formas", 9, "IGUAL"), lay("formas", 9, "IGUAL"));
		const distintos = new Set(SEEDS.map((seed) => lay("sueltos", 10, seed).join()));
		assert.ok(distintos.size > SEEDS.length * 0.9, "los tableros se repiten demasiado");
	});

	it("en fila son tramos rectos de al menos dos, paralelos y con una calle entre ellos", () => {
		for (const count of [3, 4, 5, 6, 7, 8, 10]) {
			for (const seed of SEEDS) {
				const cells = lay("lineas", count, seed);
				const rows = new Set(cells.map(rowOf));
				const cols = new Set(cells.map(colOf));
				// Cada tramo va por una fila o por una columna: se prueba de las dos formas.
				const lanesOk = (lane: (cell: number) => number, step: (cell: number) => number) => {
					const lanes = [...new Set(cells.map(lane))].sort((a, b) => a - b);
					const apart = lanes.every((l, i) => i === 0 || l - (lanes[i - 1] as number) >= 2);
					const straight = lanes.every((l) => {
						const steps = cells
							.filter((cell) => lane(cell) === l)
							.map(step)
							.sort((a, b) => a - b);
						return (
							steps.length >= 2 &&
							steps.every((s, i) => i === 0 || s === (steps[i - 1] as number) + 1)
						);
					});
					return apart && straight;
				};
				assert.ok(
					lanesOk(rowOf, colOf) || lanesOk(colOf, rowOf),
					`no son filas: ${cells.join(",")} (${count}, ${seed})`,
				);
				// Hasta cinco caben en un solo tramo, y así se ponen.
				if (count <= BOARD_SIZE) assert.ok(rows.size === 1 || cols.size === 1);
			}
		}
	});

	it("las figuras nunca dejan un cubo solo", () => {
		for (const level of LEVELS.filter((l) => l.pattern === "formas")) {
			for (let count = level.cubes[0]; count <= level.cubes[1]; count++) {
				for (const seed of SEEDS) {
					const sizes = groups(lay("formas", count, seed)).map((group) => group.length);
					assert.ok(
						sizes.every((size) => size >= 2),
						`cubo suelto con ${count} (${seed}): ${sizes}`,
					);
				}
			}
		}
	});

	it("la mezcla tiene una figura de al menos cuatro", () => {
		for (const level of LEVELS.filter((l) => l.pattern === "mezcla")) {
			for (let count = level.cubes[0]; count <= level.cubes[1]; count++) {
				for (const seed of SEEDS) {
					const biggest = Math.max(
						...groups(lay("mezcla", count, seed)).map((group) => group.length),
					);
					assert.ok(biggest >= 4, `sin figura con ${count} (${seed})`);
				}
			}
		}
	});
});
