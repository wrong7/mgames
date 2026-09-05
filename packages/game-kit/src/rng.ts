/**
 * Generación pseudoaleatoria determinista.
 *
 * Todos los juegos de mgames funcionan sin backend: los jugadores se sincronizan
 * tecleando el mismo "código" en sus móviles. Ese código es la semilla, así que
 * la misma semilla tiene que producir exactamente el mismo resultado en todos los
 * dispositivos, para siempre. Por eso no usamos `Math.random()` en ninguna parte
 * del estado compartido de un juego.
 */

/** xmur3: string -> generador de semillas de 32 bits. */
function xmur3(str: string): () => number {
	let h = 1779033703 ^ str.length;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return h >>> 0;
	};
}

/** mulberry32: PRNG rápido de 32 bits con buena distribución. */
function mulberry32(a: number): () => number {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface Rng {
	/** Float en [0, 1). */
	next(): number;
	/** Entero en [0, max). */
	int(max: number): number;
	/** Un elemento cualquiera de la lista. */
	pick<T>(items: readonly T[]): T;
	/** Copia barajada (Fisher-Yates); no muta la entrada. */
	shuffle<T>(items: readonly T[]): T[];
	/** `count` elementos distintos, en orden aleatorio. */
	sample<T>(items: readonly T[], count: number): T[];
}

/**
 * Crea un RNG determinista a partir de una semilla.
 *
 * El `namespace` separa usos distintos de la misma semilla: con el código "K7QM",
 * `createRng("K7QM", "palabras")` y `createRng("K7QM", "clave")` dan secuencias
 * independientes, así que un juego puede derivar varias cosas del mismo código.
 */
export function createRng(seed: string, namespace = ""): Rng {
	const seedFn = xmur3(`${namespace}::${seed}`);
	const random = mulberry32(seedFn());

	const int = (max: number) => Math.floor(random() * max);

	const shuffle = <T>(items: readonly T[]): T[] => {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = int(i + 1);
			[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
		}
		return copy;
	};

	return {
		next: random,
		int,
		pick: (items) => {
			if (items.length === 0) throw new Error("pick() sobre una lista vacía");
			return items[int(items.length)] as (typeof items)[number];
		},
		shuffle,
		sample: (items, count) => shuffle(items).slice(0, count),
	};
}
