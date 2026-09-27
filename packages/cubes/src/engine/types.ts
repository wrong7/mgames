/** En qué momento está la partida. */
export type Phase =
	/** Sobre la mesa, sin empezar. Cada uno dice "listo" y al estarlo todos, arranca. */
	| "sala"
	/**
	 * Una ronda en marcha. Dentro hay tres momentos que no cambian el estado,
	 * sólo la hora: la cuenta de "preparados", los cubos a la vista y el hueco
	 * para contestar. Cada móvil sabe en cuál está mirando el reloj de la sala.
	 */
	| "ronda"
	/** La ronda cerrada: se ven los cubos otra vez y lo que contestó cada uno. */
	| "resultado"
	/** Se acabaron las rondas: la clasificación. */
	| "final";

/** Cómo se colocan los cubos de una ronda, de más fácil a más difícil de contar. */
export type Pattern =
	/** En filas rectas: se cuenta por tramos. */
	| "lineas"
	/** Figuras sueltas (una ele, una cruz, un cuadrado): se reconocen y se suman. */
	| "formas"
	/** Una figura y el resto sueltos. */
	| "mezcla"
	/** Cada uno donde le ha caído. */
	| "sueltos";

/** Cómo es una ronda: la dificultad sale de aquí. */
export interface Level {
	pattern: Pattern;
	/** Cuántos cubos puede haber, los dos extremos incluidos. */
	cubes: readonly [number, number];
	/** Cuánto tiempo se ven, en milisegundos. */
	showMs: number;
}

/** Un jugador, con lo que hace falta para nombrarlo y pintarlo. */
export interface CubesPlayer {
	/** El identificador del móvil. */
	id: string;
	name: string;
	/** Semilla de su cara. */
	avatar: string;
}

/** Un jugador de la partida con su marcador. */
export interface Contestant extends CubesPlayer {
	points: number;
	/** Rondas acertadas. */
	hits: number;
	/** Rondas en las que fue el primero en acertar. */
	firsts: number;
}

/** Un número confirmado. Ya no se puede cambiar. */
export interface Answer {
	playerId: string;
	value: number;
	/** Cuándo llegó, con la hora del servidor. */
	at: number;
}

export interface Round {
	/** De 1 al número de rondas. */
	number: number;
	pattern: Pattern;
	/** Casillas con cubo: fila * 5 + columna, en orden de lectura. */
	cubes: readonly number[];
	/**
	 * Quién juega la ronda: los de la sala cuando empezó. Quien entra con la
	 * ronda en marcha la mira y juega la siguiente.
	 */
	participants: readonly string[];
	/** Cuándo aparecen los cubos. Antes, la cuenta de "preparados". */
	showAt: number;
	/** Cuándo desaparecen. Desde ahí se puede contestar. */
	hideAt: number;
	/**
	 * Cuándo se cierra. Lo pone el primero que contesta: desde ese momento, los
	 * demás tienen unos segundos para confirmar el suyo.
	 */
	closesAt: number | null;
	/** Por orden de llegada: el primero que acierta se lleva el punto extra. */
	answers: readonly Answer[];
}

/**
 * Todo el estado de una partida, tal y como lo guarda el servidor.
 *
 * Nunca sale entero: lleva la semilla, que diría dónde caen los cubos de todas
 * las rondas, y los números que va confirmando cada uno, que no deben verse
 * antes de cerrar. Lo que ve cada móvil sale de `project`.
 */
export interface CubesState {
	phase: Phase;
	/** De ella salen los cubos de todas las rondas de todas las partidas de esta mesa. */
	seed: string;
	/** Cuántas partidas se han empezado aquí: cambia los tableros de la siguiente. */
	match: number;
	/** Quién ha jugado alguna ronda de esta partida, por orden de llegada, y cómo va. */
	contestants: readonly Contestant[];
	/** Quién ha dicho "listo" para lo siguiente: empezar, otra ronda u otra partida. */
	ready: Readonly<Record<string, true>>;
	/** La ronda en marcha, o la última que se jugó. */
	round: Round | null;
	/** En el resultado: a esta hora empieza la siguiente ronda aunque falte alguien por estar listo. */
	nextAt: number | null;
	updatedAt: number;
}

/** Un número confirmado, con lo que se tardó en confirmarlo. */
export interface TimedAnswer {
	value: number;
	/**
	 * Milisegundos desde que se esfumaron los cubos, que es cuando se puede
	 * empezar a marcar, hasta que el número llegó al servidor. Se mide con su
	 * reloj, el mismo que decide quién fue el primero: así el más rápido de la
	 * lista es siempre el que se lleva el punto extra.
	 */
	ms: number;
}

/** Cómo le fue a cada uno en una ronda ya cerrada. */
export interface RoundResult {
	playerId: string;
	/** Lo que confirmó, o `null` si se le acabó el tiempo. */
	value: number | null;
	/** Lo que tardó en confirmarlo (ver `TimedAnswer`), o `null` si no llegó. */
	ms: number | null;
	correct: boolean;
	/** Fue el primero en acertar. */
	first: boolean;
	/** Lo que se lleva: uno por acertar y otro por ser el primero. */
	points: number;
}

/** La ronda tal y como la ve un móvil. */
export interface RoundView {
	number: number;
	pattern: Pattern;
	/**
	 * Dónde están los cubos. Viaja desde el principio porque todos tienen que
	 * verlos a la vez: el móvil los pinta sólo mientras toca.
	 */
	cubes: readonly number[];
	participants: readonly string[];
	showAt: number;
	hideAt: number;
	closesAt: number | null;
	/** Quién ha confirmado ya, por orden. Sin el número. */
	answered: readonly string[];
	/** El número que confirmó quien mira, y lo que tardó, si lo ha hecho. */
	mine: TimedAnswer | null;
	/** Lo que contestó cada uno. Sólo con la ronda cerrada. */
	results: readonly RoundResult[] | null;
}

/**
 * Lo que se le manda a un móvil.
 *
 * No lleva la semilla ni, mientras la ronda sigue abierta, el número de nadie
 * más: si viajara, bastaría abrir las herramientas de desarrollo para copiar la
 * respuesta del que ya ha contestado.
 */
export interface CubesView {
	phase: Phase;
	match: number;
	totalRounds: number;
	contestants: readonly Contestant[];
	ready: readonly string[];
	round: RoundView | null;
	nextAt: number | null;
	updatedAt: number;
}

export type CubesAction =
	/** Estar listo (o dejar de estarlo) para lo siguiente: empezar, otra ronda u otra partida. */
	| { type: "listo"; ready: boolean }
	/** Confirmar cuántos cubos había. No hay vuelta atrás. */
	| { type: "responder"; value: number }
	/**
	 * Avisar de que puede que toque pasar a lo siguiente: se ha acabado el
	 * tiempo o se ha ido de la sala alguien a quien se esperaba.
	 *
	 * Existe porque el motor no tiene reloj propio: el servidor sólo lo ejecuta
	 * cuando llega una jugada. Los móviles la mandan cuando su reloj dice que ya
	 * toca, y el motor comprueba con la hora del servidor si es verdad; si no,
	 * no pasa nada.
	 */
	| { type: "avanzar" };
