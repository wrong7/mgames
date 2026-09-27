import { createRng, type Rng } from "../../rng.ts";

/**
 * De semilla a slime: de qué color es cada uno y qué lleva.
 *
 * El avatar de un jugador es sólo su semilla (`profile.avatar`, ocho
 * caracteres). Todo lo demás —color, cara, pelo, gorro, hasta la forma de
 * moverse— sale de aquí, así que cada móvil de la sala construye exactamente
 * el mismo slime sin que viaje nada más que esa cadena. "Otra cara" no edita
 * el aspecto: tira otra semilla.
 *
 * El estilo es de juego de fiesta: todos con la misma forma de gota, colores
 * de mascota y caras dibujadas que hacen gracia por sí solas. Mucho de la
 * gracia está en las combinaciones raras (un slime amarillo con ojos saltones
 * y chistera), así que las tiradas son casi todas independientes: que salga lo
 * que salga.
 *
 * La contrapartida es que el aspecto depende del orden de las tiradas y de las
 * listas de este fichero. Añadir un gorro o reordenar una paleta cambia la cara
 * de todo el mundo a la vez — sin romper nada, porque no se guarda el aspecto,
 * sólo la semilla —, así que conviene hacerlo a sabiendas. Por lo mismo se
 * siguen haciendo las tiradas de cuando los avatares eran muñecos con ropa: sin
 * ellas, a todo el que ya tenía su slime le saldría otro.
 *
 * Es código puro: sin three.js ni DOM. Lo usan también el retrato provisional
 * (antes de que cargue el 3D) y los tests.
 */

export const HAIR_STYLES = [
	"corto",
	"flequillo",
	"pinchos",
	"tupe",
	"afro",
	"melena",
	"coleta",
	"moño",
	"coletas",
	"cresta",
	"rizos",
	"rapado",
	"tres-pelos",
	"calvo",
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/**
 * Lo que se lleva en la cabeza. Los "gorros" tapan el cráneo y esconden el
 * volumen del pelo; los "adornos" se ponen encima y lo dejan a la vista.
 */
export const HATS = [
	"gorra",
	"gorro",
	"chistera",
	"vaquero",
	"pescador",
	"bruja",
	"seta",
	"vikingo",
	"helice",
	"cocinero",
	"trampero",
	"cangrejo",
	"rana",
	"cono",
	"corona",
	"fiesta",
	"orejas",
	"auriculares",
	"aureola",
	"cuernos",
	"flor",
] as const;
export type Hat = (typeof HATS)[number];

/** Los que no tapan el pelo: van encima de lo que haya. */
const ADORNMENTS: readonly Hat[] = [
	"corona",
	"fiesta",
	"orejas",
	"auriculares",
	"aureola",
	"cuernos",
	"flor",
];

export function hidesHair(hat: Hat | null): boolean {
	return hat !== null && !ADORNMENTS.includes(hat);
}

/**
 * Los ojos, que son media gracia. Todos van dibujados en la cara, pero la
 * pupila se mueve: los saltones son grandes y la llevan suelta, así que se
 * bambolea y mira donde le da la gana; los redondos y los brillantes miran con
 * más formalidad; los vagos van a media asta; y los puntos y los felices no
 * tienen blanco.
 */
export const EYES = ["saltones", "redondos", "vagos", "brillantes", "puntos", "felices"] as const;
export type Eyes = (typeof EYES)[number];

export const BROWS = [
	"normales",
	"enfadadas",
	"preocupadas",
	"levantadas",
	"uniceja",
	"ninguna",
] as const;
export type Brows = (typeof BROWS)[number];

/** Narices dibujadas: una bolita, una narizota de patata o la roja de payaso. */
export const NOSES = ["ninguna", "bolita", "narizota", "payaso"] as const;
export type Nose = (typeof NOSES)[number];

export const MOUTHS = [
	"sonrisa",
	"risa",
	"o",
	"boquiabierta",
	"gato",
	"lengua",
	"dientes",
	"recta",
	"torcida",
	"ondulada",
] as const;
export type Mouth = (typeof MOUTHS)[number];

/** Lo que se lleva en la cara: las gafas y el monóculo son objetos; lo demás, dibujo. */
export const FACE_EXTRAS = [
	"gafas-sol",
	"gafas-redondas",
	"gafas-corazon",
	"parche",
	"bigote",
	"monoculo",
	"tirita",
	"pecas",
] as const;
export type FaceExtra = (typeof FACE_EXTRAS)[number];

/** Lo que hace un slime por su cuenta de vez en cuando, o al tocarlo. */
export const SLIME_GESTURES = [
	"saluda",
	"salto",
	"aplasta",
	"flan",
	"estira",
	"rebota",
	"vuelta",
	"infla",
	"tiembla",
	"baila",
] as const;
export type SlimeGesture = (typeof SLIME_GESTURES)[number];

export interface AvatarLook {
	/** El color de la gelatina: siempre uno de mascota (`MASCOT_SKIN`). */
	skin: string;
	hair: HairStyle;
	hairColor: string;
	hat: Hat | null;
	hatColor: string;
	/** El segundo color del gorro: la visera, la cinta, el pompón. */
	hatAccent: string;
	eyes: Eyes;
	/** Tamaño de los ojos: de lentejas a platos. */
	eyeSize: number;
	/** Cuánto más grande es un ojo que el otro. Poco, pero se nota. */
	eyeSkew: number;
	/** Separación de los ojos: de casi juntos (bizcos de nacimiento) a muy separados. */
	eyeGap: number;
	/** Tamaño de la pupila respecto al ojo: pequeña es alucinado; grande, tierno. */
	pupil: number;
	/** Párpados a media asta: la cara de "otra vez no". */
	sleepy: boolean;
	brows: Brows;
	nose: Nose;
	mouth: Mouth;
	blush: boolean;
	face: FaceExtra | null;
	/** Fondo del retrato redondo. */
	backdrop: string;
	/** Ritmo al moverse: 1 es el normal; hay quien va más acelerado. */
	tempo: number;
	/** El gesto que más repite. Es lo que hace que cada uno parezca alguien. */
	favorite: SlimeGesture;
}

/** Los colores de slime: el amarillo de siempre, el verde de alienígena... */
export const MASCOT_SKIN = [
	"#ffd23f",
	"#ff9f43",
	"#7ed957",
	"#5bc0eb",
	"#b388eb",
	"#ff85b3",
	"#ff6b5b",
	"#3dd6c6",
] as const;

const NATURAL_HAIR = [
	"#231c1e",
	"#3f2719",
	"#6c4327",
	"#9a6235",
	"#dfb65b",
	"#f1dea0",
	"#c4572b",
	"#c8c3bc",
] as const;

const FANTASY_HAIR = ["#ff6fae", "#9d6bff", "#4c8dff", "#2cc4b0", "#5ecf6a", "#ef4f4f"] as const;

/** Colores vivos, que se distingan de lejos en una peana: los de los gorros. */
export const CLOTHES = [
	"#e84a5f",
	"#ff8c42",
	"#ffd23f",
	"#3bb273",
	"#2ec4b6",
	"#3a86ff",
	"#5e60ce",
	"#9b5de5",
	"#f15bb5",
	"#f4f1ea",
	"#2b2d42",
	"#8d99ae",
	"#8a5a44",
	"#6b8f3c",
	"#1d3557",
	"#f4a3a8",
] as const;

const BACKDROPS = [
	"#ffd6a5",
	"#fdffb6",
	"#caffbf",
	"#9bf6ff",
	"#a0c4ff",
	"#bdb2ff",
	"#ffc6ff",
	"#ffadad",
] as const;

/** El slime de una semilla. La misma semilla da siempre el mismo slime. */
export function avatarLook(seed: string): AvatarLook {
	// "muñeco" porque es lo que eran: cambiarlo cambiaría todas las tiradas.
	const rng = createRng(seed, "muñeco");
	const between = (min: number, max: number) => min + rng.next() * (max - min);

	// El orden de las tiradas es parte del formato: ver la nota de arriba.
	// Primero, si era de piel de persona o de mascota. El de mascota ya tiene su
	// color; el de persona lo saca de su ropa, más abajo, que un slime color
	// carne (o negro, donde no se vería la cara) no tiene gracia.
	const human = rng.next() < 0.55;
	const mascot = rng.pick(MASCOT_SKIN);
	const hair = weighted<HairStyle>(rng, [
		["corto", 3],
		["flequillo", 2],
		["pinchos", 2],
		["tupe", 1.5],
		["afro", 1.5],
		["melena", 1.5],
		["coleta", 1.2],
		["moño", 1.2],
		["coletas", 1],
		["cresta", 0.8],
		["rizos", 1.5],
		["rapado", 1],
		["tres-pelos", 1],
		["calvo", 0.6],
	]);
	const hairColor = rng.next() < 0.7 ? rng.pick(NATURAL_HAIR) : rng.pick(FANTASY_HAIR);
	const hat = rng.next() < 0.5 ? rng.pick(HATS) : null;
	const hatColor = rng.pick(CLOTHES);
	const eyes = weighted<Eyes>(rng, [
		["saltones", 5],
		["redondos", 1.6],
		["vagos", 1.3],
		["brillantes", 0.9],
		["puntos", 0.8],
		["felices", 0.6],
	]);
	const eyeSize = between(0.1, 0.16);
	const eyeSkew = rng.next() < 0.45 ? between(0.06, 0.2) : 0;
	const eyeGap = between(0.95, 1.35);
	const pupil = between(0.3, 0.62);
	const sleepy = rng.next() < 0.22;
	const brows = weighted<Brows>(rng, [
		["normales", 3],
		["enfadadas", 1.5],
		["preocupadas", 1.2],
		["levantadas", 1],
		["uniceja", 0.6],
		["ninguna", 1.6],
	]);
	const nose = weighted<Nose>(rng, [
		["ninguna", 3],
		["bolita", 2.5],
		["narizota", 1.2],
		["payaso", 0.4],
	]);
	const mouth = weighted<Mouth>(rng, [
		["sonrisa", 2.5],
		["risa", 1.5],
		["o", 1],
		["boquiabierta", 0.8],
		["gato", 1],
		["lengua", 1],
		["dientes", 1.2],
		["recta", 1.2],
		["torcida", 1.2],
		["ondulada", 0.8],
	]);
	const blush = rng.next() < 0.4;
	const face = rng.next() < 0.3 ? rng.pick(FACE_EXTRAS) : null;
	// La ropa del muñeco. De ella quedan su color, que da el del slime de piel de
	// persona, y el del detalle, que es el segundo color del gorro; el resto se
	// tira y se descarta en el mismo orden de siempre: prenda, pantalón y su
	// color, algo cruzado (a veces), calzado y su color.
	rng.next();
	const clothes = rng.pick(CLOTHES);
	const accent = pickOther(rng, CLOTHES, clothes);
	rng.next();
	rng.next();
	if (rng.next() < 0.35) rng.next();
	rng.next();
	rng.next();
	const backdrop = rng.pick(BACKDROPS);
	const tempo = between(0.85, 1.2);
	const favorite = rng.pick(SLIME_GESTURES);

	const skin = human
		? (MASCOT_SKIN[Math.max(0, CLOTHES.indexOf(clothes)) % MASCOT_SKIN.length] ?? mascot)
		: mascot;

	return {
		skin,
		hair,
		hairColor,
		hat,
		hatColor,
		// Si coincide con el del gorro, no se vería: crema.
		hatAccent: accent !== hatColor ? accent : "#f4f1ea",
		eyes,
		eyeSize,
		eyeSkew,
		eyeGap,
		pupil,
		sleepy,
		brows,
		nose,
		mouth,
		blush,
		face,
		backdrop,
		tempo,
		favorite,
	};
}

function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
	const total = options.reduce((sum, [, weight]) => sum + weight, 0);
	let roll = rng.next() * total;
	for (const [value, weight] of options) {
		roll -= weight;
		if (roll < 0) return value;
	}
	return (options[options.length - 1] as readonly [T, number])[0];
}

/** Un color de la lista que no sea `avoid`: un gorro rojo con la cinta roja no se ve. */
function pickOther<T>(rng: Rng, items: readonly T[], avoid: T): T {
	const pool = items.filter((item) => item !== avoid);
	return rng.pick(pool.length > 0 ? pool : items);
}
