/** En qué momento está la partida. */
export type Phase =
	/** Sobre la mesa, sin repartir. Se ve quién hay en la sala, nada más. */
	| "sala"
	/** Ronda en curso: cada uno tiene su carta y se hacen preguntas. */
	| "jugando"
	/** Se ha destapado: todos ven la localización y quién era el espía. */
	| "revelado";

/** Un jugador de la ronda, con lo que hace falta para nombrarlo y pintarlo. */
export interface SpyPlayer {
	/** El identificador del móvil. */
	id: string;
	name: string;
	/** Semilla de su cara. */
	avatar: string;
}

/**
 * El reparto de una ronda. Es el secreto de la partida: nunca sale del servidor
 * entero, sólo proyectado con `project`.
 *
 * Guarda a los participantes en vez de mirar la sala: quien entra en la sala a
 * mitad de ronda no está en el reparto, y quien se va sigue contando hasta que
 * se destape.
 */
export interface Round {
	participants: readonly SpyPlayer[];
	location: string;
	/** Quiénes son espías. Uno normalmente; dos cuando la mesa es grande. */
	spyIds: readonly string[];
	/** Papel de cada jugador dentro de la localización. Los espías no aparecen. */
	roles: Readonly<Record<string, string>>;
}

export interface SpyState {
	phase: Phase;
	round: Round | null;
	/** Quién ha dicho "listo" para la ronda que viene. Sólo cuenta en la sala. */
	ready: Readonly<Record<string, true>>;
	/**
	 * Cuándo se reparte, con la hora del servidor: están todos listos y corre la
	 * cuenta atrás. `null` mientras falte alguien.
	 */
	dealAt: number | null;
	/** Rondas repartidas en la partida: con la semilla de la sala, dan la de cada una. */
	dealt: number;
	updatedAt: number;
}

/** La carta que le ha tocado a este jugador. */
export type Card = { kind: "espia" } | { kind: "agente"; location: string; role: string };

/**
 * Lo que se le manda a un móvil concreto.
 *
 * Nunca incluye el reparto de los demás: si estuviera, bastaría abrir las
 * herramientas de desarrollo para saber quién es el espía, y el juego entero
 * consiste en no saberlo.
 *
 * Tampoco la lista de sitios posibles: con ella delante, el espía elegía de un
 * catálogo en vez de sacar el sitio de lo que oye.
 */
export interface SpyView {
	phase: Phase;
	/** Quiénes juegan esta ronda. Vacío mientras no haya ronda. */
	participants: readonly SpyPlayer[];
	/** La carta de quien mira. `null` mientras no haya ronda o si no está en ella. */
	card: Card | null;
	/**
	 * La verdad, sólo cuando la ronda ya se ha destapado. Los espías van con su
	 * cara, no sólo con el nombre: el final se cuenta enseñando quién era.
	 */
	reveal: { location: string; spies: readonly SpyPlayer[] } | null;
	/** Quién ha dicho "listo" para la ronda que viene. Vacío durante la ronda. */
	ready: readonly string[];
	/** Cuándo se reparte (hora de la sala), si ya están todos listos. */
	dealAt: number | null;
	updatedAt: number;
}

export type SpyAction =
	/**
	 * "Listo" para la ronda que viene, o ya no. Cuando lo están todos los de la
	 * sala, empieza la cuenta atrás y al acabar se reparte solo.
	 */
	| { type: "listo"; ready: boolean }
	/**
	 * Aviso de un móvil: le parece que toca empezar la cuenta, pararla o repartir
	 * (ver `dealStep`). El motor lo comprueba con su hora y con la gente de la sala.
	 */
	| { type: "avanzar" }
	/** Destapar: se acabó, que se vea quién era. */
	| { type: "revelar" }
	/** Volver a la mesa sin ronda: para la siguiente, otra vez todos listos. */
	| { type: "volver" };
