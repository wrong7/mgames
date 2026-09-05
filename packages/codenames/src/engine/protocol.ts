import type { GameAction, GameState } from "./types.ts";

/**
 * Mensajes que viajan por el WebSocket entre los móviles y el Durable Object de
 * la sala. Los importan los dos lados, así que el protocolo no puede desincronizarse.
 *
 * El servidor difunde siempre el estado entero en lugar de parches: una partida
 * pesa poco más de un kilobyte y así no hay que razonar sobre mensajes perdidos
 * ni sobre en qué orden llegaron.
 */
export type ClientMessage =
	/** Primer mensaje al conectar: "dame el estado". */
	| { type: "hello" }
	/** Una jugada. El servidor la valida con el mismo reducer que el cliente. */
	| { type: "action"; action: GameAction };

export type ServerMessage =
	/** Estado completo de la sala. Sustituye lo que tenga el cliente. */
	| { type: "state"; state: GameState }
	/** Algo no se pudo aplicar. Informativo: el cliente ya tiene el estado bueno. */
	| { type: "error"; message: string };

export function parseServerMessage(raw: string): ServerMessage | null {
	try {
		const value = JSON.parse(raw) as ServerMessage;
		if (value?.type === "state" || value?.type === "error") return value;
		return null;
	} catch {
		return null;
	}
}

export function parseClientMessage(raw: string): ClientMessage | null {
	try {
		const value = JSON.parse(raw) as ClientMessage;
		if (value?.type === "hello" || value?.type === "action") return value;
		return null;
	} catch {
		return null;
	}
}
