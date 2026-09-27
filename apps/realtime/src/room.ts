import {
	hostOf,
	type PlayerProfile,
	parseClientMessage,
	parseProfile,
	parseRoomAction,
	type RoomAction,
	type RoomState,
	type RoomView,
	randomCode,
	type ServerMessage,
} from "@mgames/game-kit";
import { findEngine } from "./engines.ts";

/**
 * Una sala vive 24 horas desde la última jugada.
 *
 * Suficiente para retomar la partida al día siguiente y corto para que un código
 * de cuatro caracteres se libere pronto: son 31^4 combinaciones y la gracia es
 * poder dictarlas en voz alta.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Lo que se guarda de una sala: su gente, su juego y la semilla de la partida. */
interface Room extends RoomState {
	seed: string;
}

/**
 * Una sala, con un Durable Object por código.
 *
 * El objeto lleva la gente y el juego que hay sobre la mesa; el juego en sí lo
 * lleva su motor, que se busca por slug y al que se le pasan las jugadas. Todo
 * lo específico de cada juego vive en su paquete, que es también el que corre
 * en el navegador.
 *
 * El estado vive en memoria y es lo que se sirve en cada mensaje. Además se
 * copia a `ctx.storage` después de cada cambio: los móviles cierran el
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
		const profile = parseProfile({
			id: url.searchParams.get("jugador"),
			name: url.searchParams.get("nombre"),
			avatar: url.searchParams.get("avatar"),
		});
		if (!profile) {
			return new Response("Falta el perfil del jugador", { status: 400 });
		}

		const pair = new WebSocketPair();
		const [client, server] = [pair[0], pair[1]];

		// Hibernación: Cloudflare puede descargar el objeto de memoria mientras
		// nadie habla y devolvérnoslo con los sockets intactos cuando llegue un
		// mensaje. El adjunto del socket sobrevive a eso, así que es donde va quién
		// hay al otro lado de cada conexión.
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(profile);

		// Conectarse es entrar: no hay un "unirse" aparte. Quien vuelve tras
		// bloquear la pantalla ya estaba, y como mucho trae nombre o cara nuevos.
		const room = await this.#load();
		const joined = withPlayer(room, profile);
		if (joined !== room) {
			await this.#save({ ...joined, updatedAt: Date.now() });
			this.#broadcast();
		} else {
			send(server, { type: "state", state: this.#viewFor(room, profile.id) });
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

		const actor = profileOf(ws);
		if (!actor) {
			send(ws, { type: "error", message: "Conexión sin perfil" });
			return;
		}

		const room = await this.#load();

		if (message.type === "hello") {
			send(ws, { type: "state", state: this.#viewFor(room, actor.id) });
			return;
		}

		const action = parseRoomAction(message.action);
		if (!action) {
			send(ws, { type: "error", message: "Acción no reconocida" });
			return;
		}

		const next = applyRoomAction(room, action, actor, Date.now());
		// Una acción que no procede (juego desconocido, jugada imposible, alguien
		// que no es el anfitrión eligiendo juego) devuelve la misma sala. No es un
		// error —varios móviles tocan a la vez— pero tampoco hay nada que difundir.
		if (next === room) return;

		await this.#save(next);
		this.#broadcast();
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		// 1006 es un cierre sin despedida (se fue la cobertura); devolverlo tal cual
		// es un error de protocolo, así que se normaliza.
		//
		// Desconectarse no saca a nadie de la sala: en un juego presencial el móvil
		// se bloquea cada dos minutos y el jugador sigue sentado a la mesa. Salir
		// es una acción explícita.
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

	/** La sala en memoria; si el objeto acaba de despertar, la recupera del respaldo. */
	async #load(): Promise<Room> {
		if (this.#room) return this.#room;

		const stored = await this.ctx.storage.get<Room>("room");
		if (stored) {
			this.#room = stored;
			return stored;
		}

		const fresh: Room = {
			seed: randomCode(16),
			players: [],
			game: null,
			gameState: null,
			updatedAt: Date.now(),
		};
		await this.#save(fresh);
		return fresh;
	}

	async #save(room: Room): Promise<void> {
		this.#room = room;
		await this.ctx.storage.put("room", room);
		// El plazo se cuenta desde el último cambio, no desde que se creó la sala.
		await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
	}

	/**
	 * Manda la sala a todos, cada uno con lo suyo.
	 *
	 * La vista del juego se calcula por socket, no una vez para todos: es lo que
	 * impide que el secreto de un jugador viaje al móvil de otro, donde bastaría
	 * abrir las herramientas de desarrollo para leerlo.
	 */
	#broadcast(): void {
		const room = this.#room;
		if (!room) return;
		for (const socket of this.ctx.getWebSockets()) {
			const actorId = profileOf(socket)?.id ?? "";
			send(socket, { type: "state", state: this.#viewFor(room, actorId) });
		}
	}

	#viewFor(room: Room, actorId: string): RoomView {
		const engine = room.game ? findEngine(room.game) : undefined;
		const view =
			engine && room.game
				? engine.project
					? engine.project(room.gameState, actorId)
					: room.gameState
				: null;
		return {
			players: room.players,
			host: hostOf(room.players),
			game: room.game,
			view,
			updatedAt: room.updatedAt,
			// Se pone al mandar, no al guardar: es lo que usan los móviles para
			// poner su reloj en hora con el de la sala.
			now: Date.now(),
		};
	}
}

/**
 * Las reglas de la sala. Pura, como los motores: mismas entradas, mismo
 * resultado, y el mismo objeto cuando no hay nada que cambiar.
 */
function applyRoomAction(room: Room, action: RoomAction, actor: PlayerProfile, now: number): Room {
	const isHost = hostOf(room.players) === actor.id;

	switch (action.type) {
		case "leave": {
			if (!room.players.some((p) => p.id === actor.id)) return room;
			return { ...room, players: room.players.filter((p) => p.id !== actor.id), updatedAt: now };
		}

		case "selectGame": {
			const engine = findEngine(action.game);
			if (!isHost || !engine || room.game) return room;
			// Cada partida tiene su propia semilla: el mismo juego dos veces en la
			// misma sala no reparte lo mismo.
			const seed = randomCode(16);
			return {
				...room,
				seed,
				game: action.game,
				gameState: engine.create({ seed, now, players: room.players }),
				updatedAt: now,
			};
		}

		case "exitGame": {
			if (!isHost || !room.game) return room;
			return { ...room, game: null, gameState: null, updatedAt: now };
		}

		case "game": {
			const engine = room.game ? findEngine(room.game) : undefined;
			if (!engine) return room;
			const parsed = engine.parseAction(action.action);
			if (parsed === null) return room;
			const next = engine.apply(room.gameState, parsed, {
				seed: room.seed,
				now,
				players: room.players,
				actorId: actor.id,
				actor,
			});
			if (next === room.gameState) return room;
			return { ...room, gameState: next, updatedAt: now };
		}
	}
}

/** La sala con este jugador dentro, al día. La misma sala si ya estaba tal cual. */
function withPlayer(room: Room, profile: PlayerProfile): Room {
	const existing = room.players.find((p) => p.id === profile.id);
	if (!existing) return { ...room, players: [...room.players, profile] };
	if (existing.name === profile.name && existing.avatar === profile.avatar) return room;
	return { ...room, players: room.players.map((p) => (p.id === profile.id ? profile : p)) };
}

/** Quién hay al otro lado de este socket, según lo adjuntado al aceptarlo. */
function profileOf(ws: WebSocket): PlayerProfile | null {
	return parseProfile(ws.deserializeAttachment());
}

function send(socket: WebSocket, message: ServerMessage): void {
	try {
		socket.send(JSON.stringify(message));
	} catch {
		// El socket se cerró entre que lo listamos y le escribimos. La reconexión
		// del cliente se encarga; aquí no hay nada que arreglar.
	}
}
