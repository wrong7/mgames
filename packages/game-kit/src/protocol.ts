/**
 * Mensajes entre los móviles de una sala y el servidor.
 *
 * Es el mismo protocolo para todos los juegos: el servidor no interpreta las
 * acciones, sólo se las pasa al motor del juego. Por eso `action` viaja como
 * `unknown` y es el motor quien la valida con su `parseAction`.
 *
 * El servidor difunde siempre el estado entero en lugar de parches: una partida
 * pesa poco más de un kilobyte y así no hay que razonar sobre mensajes perdidos
 * ni sobre en qué orden llegaron.
 */
export type ClientMessage =
	/** Primer mensaje al conectar: "dame el estado". */
	| { type: "hello" }
	/** Una jugada. El servidor la valida antes de aplicarla. */
	| { type: "action"; action: unknown }
	/**
	 * "Me voy": la página de la sala se cierra, se recarga o se va a otra. No
	 * es el botón de salir: si vuelve enseguida, como tras una recarga, sigue
	 * donde estaba.
	 */
	| { type: "bye" };

export type ServerMessage<State = unknown> =
	/** Estado completo de la sala. Sustituye lo que tenga el cliente. */
	| { type: "state"; state: State }
	/** Algo no se pudo aplicar. Informativo: el cliente ya tiene el estado bueno. */
	| { type: "error"; message: string };

export function parseServerMessage<State>(raw: string): ServerMessage<State> | null {
	const value = parseJson(raw) as ServerMessage<State> | null;
	if (value?.type === "state" || value?.type === "error") return value;
	return null;
}

export function parseClientMessage(raw: string): ClientMessage | null {
	const value = parseJson(raw) as ClientMessage | null;
	if (value?.type === "hello" || value?.type === "action" || value?.type === "bye") return value;
	return null;
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
