/** Los dos equipos. En castellano porque también son las etiquetas que se ven. */
export type Team = "azul" | "rojo";

/** Qué esconde cada casilla del tablero. */
export type CardKind = Team | "neutral" | "asesino";

/** El tablero de una partida: inmutable desde que se reparte hasta que se reinicia. */
export interface Board {
	/** Las 25 palabras, en el orden en que se pintan (fila a fila). */
	words: readonly string[];
	/** Qué es cada una de esas 25 palabras. Sólo lo ve el jefe de espías. */
	kinds: readonly CardKind[];
	/** Equipo que empieza; es el que tiene 9 cartas en lugar de 8. */
	startingTeam: Team;
}

/**
 * Todo el estado de una sala.
 *
 * Es lo que el Durable Object guarda en memoria y difunde por WebSocket, y
 * también lo que cada móvil tiene en su store: cliente y servidor comparten
 * exactamente este tipo y el mismo reducer, así que no hay dos versiones de las
 * reglas que puedan divergir.
 */
export interface GameState {
	board: Board;
	/** 25 booleanos: qué cartas se han destapado ya. */
	revealed: readonly boolean[];
	/** Equipo al que le toca dar pista. */
	turn: Team;
	/** Equipo ganador, o `null` si la partida sigue en juego. */
	winner: Team | null;
	/** Por qué se acabó: útil para el mensaje final. */
	endedBy: "cartas" | "asesino" | null;
	/** Marca de tiempo de la última acción (epoch ms). Ordena estados en el cliente. */
	updatedAt: number;
}

/** Las acciones que un jugador puede provocar. */
export type GameAction =
	/** Destapar una carta. Es la única jugada real del juego. */
	| { type: "reveal"; index: number }
	/** Volver a tapar una carta: en el móvil se toca donde no se quiere. */
	| { type: "unreveal"; index: number }
	/** Pasar el turno al otro equipo tras dar la pista. */
	| { type: "endTurn" }
	/** Repartir un tablero nuevo en la misma sala, sin que nadie tenga que reconectarse. */
	| { type: "restart"; seed: string };
