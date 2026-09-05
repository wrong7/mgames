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
	/** Quiénes juegan esta ronda. Vacío mientras no haya ronda. */
	participants: readonly SpyPlayer[];
	/** La carta de quien mira. `null` mientras no haya ronda o si no está en ella. */
	card: Card | null;
	/** La verdad, sólo cuando la ronda ya se ha destapado. */
	reveal: { location: string; spyNames: readonly string[] } | null;
	/** El catálogo de localizaciones posibles. Público desde el principio. */
	locations: readonly string[];
	updatedAt: number;
}

export type SpyAction =
	/** Repartir una ronda nueva a quien esté en la sala. La semilla la pone quien reparte. */
	| { type: "repartir"; seed: string }
	/** Destapar: se acabó, que se vea quién era. */
	| { type: "revelar" }
	/** Volver a la mesa sin ronda, para repartir otra. */
	| { type: "volver" };
