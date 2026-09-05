/** Los dos equipos. En castellano porque también son las etiquetas que se ven. */
export type Team = "azul" | "rojo";

/** Qué esconde cada casilla del tablero. */
export type CardKind = Team | "neutral" | "asesino";

/** Desde qué lado de la mesa juega cada uno. */
export type Role = "jefe" | "agente";

/** El tablero de una partida: inmutable desde que se reparte hasta que se reinicia. */
export interface Board {
	/** Las 25 palabras, en el orden en que se pintan (fila a fila). */
	words: readonly string[];
	/** Qué es cada una de esas 25 palabras. Sólo lo ve el jefe de espías. */
	kinds: readonly CardKind[];
	/** Equipo que empieza; es el que tiene 9 cartas en lugar de 8. */
	startingTeam: Team;
}

/** Dónde se ha sentado un jugador. */
export interface Seat {
	team: Team;
	role: Role;
}

/**
 * Todo el estado de una partida.
 *
 * Es lo que el servidor guarda y difunde, y también lo que cada móvil tiene:
 * cliente y servidor comparten exactamente este tipo y el mismo reducer, así
 * que no hay dos versiones de las reglas que puedan divergir. Nada de aquí es
 * secreto: quien se sienta de jefe ha decidido ver la clave.
 */
export interface GameState {
	board: Board;
	/**
	 * Asiento de cada jugador, por identificador de móvil. Es lo que permite al
	 * motor hacer cumplir quién destapa y quién señala, en vez de fiarlo a la
	 * pantalla. Quien no está aquí mira sin jugar.
	 */
	seats: Readonly<Record<string, Seat>>;
	/** 25 booleanos: qué cartas se han destapado ya. */
	revealed: readonly boolean[];
	/**
	 * Carta señalada por cada agente, por identificador de móvil. Una ficha por
	 * persona: señalar otra carta la mueve, señalar la misma la retira. Los
	 * agentes no destapan nada —eso lo hace su jefe—, así que esto es su única
	 * forma de "tocar" el tablero.
	 */
	votes: Readonly<Record<string, number>>;
	/** Equipo al que le toca. */
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
	/** Sentarse en un equipo con un papel, o cambiarse de sitio. */
	| { type: "sit"; team: Team; role: Role }
	/** Levantarse: volver a mirar sin jugar. */
	| { type: "stand" }
	/** Señalar una carta (o dejar de señalarla). Lo hacen los agentes del equipo en turno. */
	| { type: "vote"; index: number }
	/** Destapar una carta. Lo hace el jefe del equipo en turno, cuando su equipo se decide. */
	| { type: "reveal"; index: number }
	/** Volver a tapar una carta: en el móvil se toca donde no se quiere. Cualquier jefe. */
	| { type: "unreveal"; index: number }
	/** Pasar el turno al otro equipo. El jefe del equipo en turno. */
	| { type: "endTurn" }
	/** Repartir un tablero nuevo conservando los asientos. Cualquier jefe. */
	| { type: "restart"; seed: string };
