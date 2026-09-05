import { parseClientMessage, randomCode, type ServerMessage } from "@mgames/game-kit";
import { type AnyEngine, findEngine } from "./engines.ts";

/**
 * Una sala vive 24 horas desde la última jugada.
 *
 * Suficiente para retomar la partida al día siguiente y corto para que un código
 * de cuatro caracteres se libere pronto: son 31^4 combinaciones y la gracia es
 * poder dictarlas en voz alta.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Lo que se guarda de una sala. El juego va junto al estado porque el objeto no lo sabe. */
interface Room {
	game: string;
	seed: string;
	state: unknown;
}

/**
 * Una partida, con un Durable Object por sala.
 *
 * El objeto no sabe a qué se está jugando: busca el motor por el slug que viene
 * en la URL y le pasa las acciones. Todo lo específico de cada juego vive en su
 * paquete, que es también el que corre en el navegador.
 *
 * El estado vive en memoria y es lo que se sirve en cada mensaje. Además se
 * copia a `ctx.storage` después de cada jugada: los móviles cierran el
 * WebSocket en cuanto se bloquea la pantalla, y sin esa copia una sala se
 * perdería cada vez que el grupo deja de mirar el móvil a la vez. La copia es
 * un respaldo, no la fuente de verdad — nunca se lee mientras el objeto esté
 * despierto.
 */
export class GameRoom implements DurableObject {
	#room: Room | null = null;

	constructor(private readonly ctx: DurableObjectState) {}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Se esperaba una conexión WebSocket", { status: 426 });
		}

		const url = new URL(request.url);
		const game = url.searchParams.get("juego") ?? "";
		const playerId = url.searchParams.get("jugador") ?? "";
		if (!findEngine(game)) {
			return new Response("Juego desconocido", { status: 404 });
		}

		const pair = new WebSocketPair();
		const [client, server] = [pair[0], pair[1]];

		// Hibernación: Cloudflare puede descargar el objeto de memoria mientras
		// nadie habla y devolvérnoslo con los sockets intactos cuando llegue un
		// mensaje. La etiqueta sobrevive a eso, así que es donde guardamos quién es
		// cada conexión.
		this.ctx.acceptWebSocket(server, [`jugador:${playerId}`]);

		const room = await this.#load(game);
		// `game` está validado justo arriba, así que la sala existe o se acaba de
		// crear; el `if` es para el compilador, no para un caso real.
		if (room) {
			send(server, { type: "state", state: viewFor(findEngine(room.game), room.state, playerId) });
		}

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== "string") return;

		const message = parseClientMessage(raw);
		if (!message) {
			send(ws, { type: "error", message: "Mensaje no reconocido" });
			return;
		}

		const room = await this.#load();
		if (!room) {
			send(ws, { type: "error", message: "La sala ya no existe" });
			return;
		}

		const engine = findEngine(room.game);
		if (!engine) {
			send(ws, { type: "error", message: "Juego desconocido" });
			return;
		}

		if (message.type === "hello") {
			send(ws, { type: "state", state: viewFor(engine, room.state, this.#playerIdOf(ws)) });
			return;
		}

		const action = engine.parseAction(message.action);
		if (!action) {
			send(ws, { type: "error", message: "Jugada no reconocida" });
			return;
		}

		const next = engine.apply(room.state, action, {
			seed: room.seed,
			now: Date.now(),
			actorId: this.#playerIdOf(ws),
		});
		// Una jugada imposible (carta ya destapada, partida terminada) devuelve el
		// mismo estado. No es un error —dos móviles pueden tocar la misma carta a la
		// vez— pero tampoco hay nada que difundir.
		if (next === room.state) return;

		await this.#save({ ...room, state: next });
		this.#broadcast(engine, next);
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		// 1006 es un cierre sin despedida (se fue la cobertura); devolverlo tal cual
		// es un error de protocolo, así que se normaliza.
		//
		// Desconectarse no saca a nadie de la partida: en un juego presencial el
		// móvil se bloquea cada dos minutos y el jugador sigue sentado a la mesa.
		ws.close(code === 1006 ? 1000 : code, reason);
	}

	/** Vence el plazo: la sala desaparece entera. */
	async alarm(): Promise<void> {
		this.#room = null;
		await this.ctx.storage.deleteAll();
		for (const socket of this.ctx.getWebSockets()) {
			socket.close(1000, "La sala ha caducado");
		}
	}

	/**
	 * La sala en memoria; si el objeto acaba de despertar, la recupera del respaldo.
	 *
	 * Con `game` crea la sala si no existía —conectarse a un código libre es lo que
	 * abre la partida—; sin él sólo devuelve lo que haya.
	 */
	async #load(game?: string): Promise<Room | null> {
		if (this.#room) return this.#room;

		const stored = await this.ctx.storage.get<Room>("room");
		if (stored) {
			this.#room = stored;
			return stored;
		}

		if (!game) return null;
		const engine = findEngine(game);
		if (!engine) return null;

		// Primera conexión a este código: se reparte una partida nueva. La semilla
		// es aleatoria y no el código de la sala, para que nadie pueda deducir el
		// reparto desde fuera.
		const seed = randomCode(16);
		const fresh: Room = { game, seed, state: engine.create({ seed, now: Date.now() }) };
		await this.#save(fresh);
		return fresh;
	}

	async #save(room: Room): Promise<void> {
		this.#room = room;
		await this.ctx.storage.put("room", room);
		// El plazo se cuenta desde la última jugada, no desde que se creó la sala.
		await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
	}

	/** Quién hay al otro lado de este socket, según la etiqueta puesta al aceptarlo. */
	#playerIdOf(ws: WebSocket): string {
		const tag = this.ctx.getTags(ws).find((t) => t.startsWith("jugador:"));
		return tag ? tag.slice("jugador:".length) : "";
	}

	/**
	 * Manda el estado a todos, cada uno con lo suyo.
	 *
	 * La vista se calcula por socket, no una vez para todos: es lo que impide que
	 * el secreto de un jugador viaje al móvil de otro, donde bastaría abrir las
	 * herramientas de desarrollo para leerlo.
	 */
	#broadcast(engine: AnyEngine, state: unknown): void {
		for (const socket of this.ctx.getWebSockets()) {
			send(socket, { type: "state", state: viewFor(engine, state, this.#playerIdOf(socket)) });
		}
	}
}

function viewFor(engine: AnyEngine | undefined, state: unknown, actorId: string): unknown {
	// Sin `project`, el estado entero es público y va tal cual.
	return engine?.project ? engine.project(state, actorId) : state;
}

function send(socket: WebSocket, message: ServerMessage): void {
	try {
		socket.send(JSON.stringify(message));
	} catch {
		// El socket se cerró entre que lo listamos y le escribimos. La reconexión
		// del cliente se encarga; aquí no hay nada que arreglar.
	}
}
