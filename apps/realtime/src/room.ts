import {
	applyAction,
	createGame,
	type GameState,
	parseClientMessage,
	type ServerMessage,
} from "@mgames/codenames/engine";
import { randomCode } from "@mgames/game-kit";

/**
 * Una sala vive 24 horas desde la última jugada.
 *
 * Suficiente para retomar la partida al día siguiente y corto para que un código
 * de cuatro caracteres se libere pronto: son 31^4 combinaciones y la gracia es
 * poder dictarlas en voz alta.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * El estado de una partida, con un Durable Object por sala.
 *
 * El estado vive en memoria y es lo que se sirve en cada mensaje. Además se
 * copia a `ctx.storage` después de cada jugada: los móviles cierran el
 * WebSocket en cuanto se bloquea la pantalla, y sin esa copia una sala se
 * perdería cada vez que el grupo deja de mirar el móvil a la vez. La copia es
 * un respaldo, no la fuente de verdad — nunca se lee mientras el objeto esté
 * despierto.
 */
export class GameRoom implements DurableObject {
	#state: GameState | null = null;

	constructor(private readonly ctx: DurableObjectState) {}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Se esperaba una conexión WebSocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = [pair[0], pair[1]];

		// Hibernación: Cloudflare puede descargar el objeto de memoria mientras
		// nadie habla y devolvérnoslo con los sockets intactos cuando llegue un
		// mensaje. Por eso el estado se rehidrata desde el respaldo en `#load`.
		this.ctx.acceptWebSocket(server);

		const state = await this.#load();
		send(server, { type: "state", state });

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== "string") return;

		const message = parseClientMessage(raw);
		if (!message) {
			send(ws, { type: "error", message: "Mensaje no reconocido" });
			return;
		}

		const current = await this.#load();

		if (message.type === "hello") {
			send(ws, { type: "state", state: current });
			return;
		}

		const next = applyAction(current, message.action);
		// Una jugada imposible (carta ya destapada, partida terminada) devuelve el
		// mismo estado. No es un error —dos móviles pueden tocar la misma carta a la
		// vez— pero tampoco hay nada que difundir.
		if (next === current) return;

		await this.#save(next);
		this.#broadcast({ type: "state", state: next });
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		// 1006 es un cierre sin despedida (se fue la cobertura); devolverlo tal cual
		// es un error de protocolo, así que se normaliza.
		ws.close(code === 1006 ? 1000 : code, reason);
	}

	/** Vence el plazo: la sala desaparece entera. */
	async alarm(): Promise<void> {
		this.#state = null;
		await this.ctx.storage.deleteAll();
		for (const socket of this.ctx.getWebSockets()) {
			socket.close(1000, "La sala ha caducado");
		}
	}

	/** Estado en memoria; si el objeto acaba de despertar, lo recupera del respaldo. */
	async #load(): Promise<GameState> {
		if (this.#state) return this.#state;

		const stored = await this.ctx.storage.get<GameState>("state");
		if (stored) {
			this.#state = stored;
			return stored;
		}

		// Primera conexión a este código: se reparte una partida nueva. La semilla
		// es aleatoria y no el código de la sala, para que nadie pueda deducir el
		// tablero desde fuera.
		const fresh = createGame(randomCode(16));
		await this.#save(fresh);
		return fresh;
	}

	async #save(state: GameState): Promise<void> {
		this.#state = state;
		await this.ctx.storage.put("state", state);
		// El plazo se cuenta desde la última jugada, no desde que se creó la sala.
		await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
	}

	#broadcast(message: ServerMessage): void {
		for (const socket of this.ctx.getWebSockets()) {
			send(socket, message);
		}
	}
}

function send(socket: WebSocket, message: ServerMessage): void {
	try {
		socket.send(JSON.stringify(message));
	} catch {
		// El socket se cerró entre que lo listamos y le escribimos. La reconexión
		// del cliente se encarga; aquí no hay nada que arreglar.
	}
}
