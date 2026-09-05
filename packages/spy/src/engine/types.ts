/** En qué momento está la sala. */
export type Phase =
	/** Esperando a que entre la gente. Se ven los nombres, nada más. */
	| "sala"
	/** Ronda en curso: cada uno tiene su carta y se hacen preguntas. */
	| "jugando"
	/** Se ha destapado: todos ven la localización y quién era el espía. */
	| "revelado";

export interface SpyPlayer {
	/** El identificador del móvil. */
	id: string;
	name: string;
	/** Semilla de su cara, para pintarla en la lista. */
	avatar: string;
}

/**
 * El reparto de una ronda. Es el secreto de la partida: nunca sale del servidor
 * entero, sólo proyectado con `project`.
 */
export interface Round {
	location: string;
	/** Quiénes son espías. Uno normalmente; dos cuando la mesa es grande. */
	spyIds: readonly string[];
	/** Papel de cada jugador dentro de la localización. Los espías no aparecen. */
	roles: Readonly<Record<string, string>>;
}

export interface SpyState {
	phase: Phase;
	players: readonly SpyPlayer[];
	round: Round | null;
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
 */
export interface SpyView {
	phase: Phase;
	players: readonly SpyPlayer[];
	/** La carta de quien mira. `null` mientras no haya ronda. */
	card: Card | null;
	/** La verdad, sólo cuando la ronda ya se ha destapado. */
	reveal: { location: string; spyNames: readonly string[] } | null;
	/** El catálogo de localizaciones posibles. Público desde el principio. */
	locations: readonly string[];
	updatedAt: number;
}

export type SpyAction =
	/** Entrar en la sala. El nombre y la cara vienen con quien envía la acción. */
	| { type: "unirse" }
	/** Salir de la sala (alguien se va a casa). */
	| { type: "salir" }
	/** Repartir una ronda nueva. La semilla la pone quien reparte. */
	| { type: "repartir"; seed: string }
	/** Destapar: se acabó, que se vea quién era. */
	| { type: "revelar" }
	/** Volver a la sala sin perder a los jugadores. */
	| { type: "volver" };
