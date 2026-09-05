import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODE_LENGTH, isCompleteCode, normalizeCode, randomCode } from "./code.ts";
import { createRng } from "./rng.ts";

describe("códigos de sala", () => {
	it("genera códigos de la longitud pedida y sin caracteres confundibles", () => {
		for (let i = 0; i < 200; i++) {
			const code = randomCode();
			assert.equal(code.length, CODE_LENGTH);
			assert.match(code, /^[A-HJ-NP-Z2-9]+$/, `"${code}" tiene caracteres ambiguos`);
			assert.ok(!/[ILO01]/.test(code), `"${code}" contiene un carácter confundible`);
		}
	});

	it("normaliza a mayúsculas y descarta lo que no pertenece al alfabeto", () => {
		assert.equal(normalizeCode("k7qm"), "K7QM");
		assert.equal(normalizeCode("k7 qm"), "K7QM");
		assert.equal(normalizeCode("k-7-q-m"), "K7QM");
		// I, L, O, 0 y 1 no existen en el alfabeto: se caen en vez de adivinarse.
		assert.equal(normalizeCode("KILO"), "K");
		assert.equal(normalizeCode(""), "");
	});

	it("recorta a la longitud máxima", () => {
		assert.equal(normalizeCode("ABCDEFGH"), "ABCD");
		assert.equal(normalizeCode("ABCDEFGH", 6), "ABCDEF");
	});

	it("sólo considera completo un código de la longitud exacta", () => {
		assert.equal(isCompleteCode("ABC"), false);
		assert.equal(isCompleteCode("ABCD"), true);
	});
});

describe("generación determinista", () => {
	it("la misma semilla da la misma secuencia", () => {
		const seq = () => Array.from({ length: 20 }, () => createRng("X").next());
		assert.deepEqual(seq(), seq());
	});

	it("semillas distintas dan secuencias distintas", () => {
		assert.notDeepEqual(
			Array.from({ length: 10 }, () => createRng("A").next()),
			Array.from({ length: 10 }, () => createRng("B").next()),
		);
	});

	it("el espacio de nombres separa usos de la misma semilla", () => {
		assert.notEqual(createRng("K7QM", "palabras").next(), createRng("K7QM", "clave").next());
	});

	it("baraja sin perder ni duplicar elementos y sin tocar la entrada", () => {
		const original = Array.from({ length: 50 }, (_, i) => i);
		const barajado = createRng("BARAJA").shuffle(original);
		assert.deepEqual(
			[...barajado].sort((a, b) => a - b),
			original,
		);
		assert.deepEqual(
			original,
			Array.from({ length: 50 }, (_, i) => i),
		);
	});

	it("sample devuelve elementos distintos", () => {
		const muestra = createRng("MUESTRA").sample(
			Array.from({ length: 100 }, (_, i) => i),
			25,
		);
		assert.equal(muestra.length, 25);
		assert.equal(new Set(muestra).size, 25);
	});

	it("int se queda dentro del rango", () => {
		const rng = createRng("RANGO");
		for (let i = 0; i < 500; i++) {
			const n = rng.int(7);
			assert.ok(Number.isInteger(n) && n >= 0 && n < 7, `${n} fuera de rango`);
		}
	});

	it("pick sobre una lista vacía es un error de programación, no un undefined silencioso", () => {
		assert.throws(() => createRng("VACIO").pick([]));
	});
});
