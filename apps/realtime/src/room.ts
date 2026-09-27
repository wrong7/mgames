import {
	arrive,
	departDue,
	type Emote,
	hostOf,
	leave,
	type PlayerProfile,
	parseClientMessage,
	parseProfile,
	parseRoomAction,
	type RoomAction,
	type RoomState,
	type RoomView,
	randomCode,
	type ServerMessage,
	scheduleDeparture,
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

/**
 * Cuánto se espera a quien cierra la página de la sala antes de sacarlo: lo
 * que tarda en volver una recarga, que también la cierra.
 */
const BYE_GRACE_MS = 10_000;

/**
 * Cuánto se espera a quien pierde la conexión sin despedirse.
 *
 * En el móvil, cerrar la web casi nunca avisa: se quita el navegador de un
 * manotazo o se bloquea el móvil y se guarda, y lo único que llega es que la
 * conexión se ha cortado, igual que al perder la cobertura. La sala y los
 * juegos piden que la pantalla no se apague sola, así que quien lleva un
 * minuto sin conexión se ha ido; y si no, al volver recupera su sitio.
 */
const LOST_GRACE_MS = 60_000;

/**
 * Entre dos gestos del mismo jugador, como poco. Un gesto dura más de un
 * segundo; más seguidos sólo se pisarían, y así nadie inunda la sala a toques.
 */
const EMOTE_GAP_MS = 500;

/** Lo que se guarda de una sala: su gente, su juego y la semilla de la partida. */
interface Room extends RoomState {
	seed: string;
}

/** Una sala tal y como está guardada: las de antes de las salidas no traen ni llegadas ni salidas. */
type StoredRoom = Omit<Room, "arrivals" | "departures"> &
	Partial<Pick<Room, "arrivals" | "departures">>;

/** Lo que va pegado a cada conexión: quién hay al otro lado y si se ha despedido. */
interface Attachment {
	profile: PlayerProfile;
	bye: boolean;
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
 *
 * Entrar es conectarse; salir, darle al botón o dejar la sala (las reglas
 * están en `presence.ts`, en game-kit). A quien deja la sala se le pone hora
 * de salida, que se guarda con ella y la cumple la alarma: la misma que la
 * hace caducar.
 */
export class GameRoom implements DurableObject {
	#room: Room | null = null;
	/** Cuándo hizo cada uno su último gesto. En memoria: si el objeto se duerme, da igual. */
	#lastEmote = new Map<string, number>();

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
		server.serializeAttachment({ profile, bye: false } satisfies Attachment);

		// Conectarse es entrar: no hay un "unirse" aparte. Quien vuelve tras una
		// recarga ya estaba; quien vuelve más tarde, recupera su sitio.
		const room = await this.#load();
		const next = arrive(room, profile, Date.now());
		if (next !== room) await this.#save(next);
		if (next.players !== room.players) {
			this.#broadcast();
		} else {
			send(server, { type: "state", state: this.#viewFor(next, profile.id) });
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

		const attachment = attachmentOf(ws);
		if (!attachment) {
			send(ws, { type: "error", message: "Conexión sin perfil" });
			return;
		}
		const actor = attachment.profile;

		if (message.type === "bye") {
			// La página se cierra: esta conexión deja de contar aunque tarde un poco
			// en cerrarse del todo.
			ws.serializeAttachment({ ...attachment, bye: true } satisfies Attachment);
			await this.#departing(actor.id, BYE_GRACE_MS);
			return;
		}

		if (message.type === "emote") {
			this.#relayEmote(ws, actor.id, message.emote);
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
		await this.#disconnected(ws);
		// El cierre se devuelve con su código, salvo los que no se pueden mandar:
		// 1005 (llegó sin código, como el `close()` de la página) y 1006 (se cortó
		// sin cierre: se fue la cobertura). Devolverlos tal cual lanza.
		ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.#disconnected(ws);
	}

	/** Vence un plazo: sale quien tenía hora y no ha vuelto, o caduca la sala entera. */
	async alarm(): Promise<void> {
		const room = await this.#stored();
		if (!room) return;
		const now = Date.now();

		if (now >= room.updatedAt + TTL_MS) {
			this.#room = null;
			await this.ctx.storage.deleteAll();
			for (const socket of this.ctx.getWebSockets()) {
				socket.close(1000, "La sala ha caducado");
			}
			return;
		}

		const next = departDue(room, now, this.#present());
		if (next === room) {
			await this.ctx.storage.setAlarm(wakeAt(room));
			return;
		}
		await this.#save(next);
		if (next.players !== room.players) this.#broadcast();
	}

	/**
	 * Un gesto: se reenvía a las demás conexiones tal cual, sin tocar la sala
	 * (no es estado: quien llega después no lo ve). Quien lo hace ya lo ha visto
	 * en su pantalla.
	 */
	#relayEmote(from: WebSocket, playerId: string, emote: Emote): void {
		const now = Date.now();
		if (now - (this.#lastEmote.get(playerId) ?? 0) < EMOTE_GAP_MS) return;
		this.#lastEmote.set(playerId, now);
		for (const socket of this.ctx.getWebSockets()) {
			if (socket !== from) send(socket, { type: "emote", playerId, emote });
		}
	}

	/** Se ha cerrado una conexión: su jugador empieza a irse si no tiene otra. */
	async #disconnected(ws: WebSocket): Promise<void> {
		const attachment = attachmentOf(ws);
		if (!attachment) return;
		await this.#departing(attachment.profile.id, attachment.bye ? BYE_GRACE_MS : LOST_GRACE_MS);
	}

	/** Pone hora de salida a quien ya no tiene la sala abierta en ningún sitio. */
	async #departing(playerId: string, grace: number): Promise<void> {
		if (this.#present().has(playerId)) return;
		const room = await this.#stored();
		if (!room) return;
		const next = scheduleDeparture(room, playerId, Date.now() + grace);
		if (next !== room) await this.#save(next);
	}

	/**
	 * Quién tiene la sala abierta ahora mismo: conexiones vivas que no se han
	 * despedido. La que se está cerrando ya no está abierta.
	 */
	#present(): Set<string> {
		const ids = new Set<string>();
		for (const socket of this.ctx.getWebSockets()) {
			if (socket.readyState !== WebSocket.OPEN) continue;
			const attachment = attachmentOf(socket);
			if (attachment && !attachment.bye) ids.add(attachment.profile.id);
		}
		return ids;
	}

	/** La sala en memoria o, si el objeto acaba de despertar, la del respaldo. */
	async #stored(): Promise<Room | null> {
		if (this.#room) return this.#room;
		const stored = await this.ctx.storage.get<StoredRoom>("room");
		if (!stored) return null;
		this.#room = revive(stored);
		return this.#room;
	}

	/** La sala; si no la hay, se abre una. */
	async #load(): Promise<Room> {
		const room = await this.#stored();
		if (room) return room;

		const fresh: Room = {
			seed: randomCode(16),
			players: [],
			arrivals: [],
			departures: {},
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
		await this.ctx.storage.setAlarm(wakeAt(room));
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
			const actorId = attachmentOf(socket)?.profile.id ?? "";
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
		case "leave":
			return leave(room, actor.id, now);

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

/** Cuándo tiene que despertar la sala: para sacar al próximo que se va o, si no, para caducar. */
function wakeAt(room: Room): number {
	return Math.min(room.updatedAt + TTL_MS, ...Object.values(room.departures));
}

/** Las salas guardadas antes de las salidas no traen su orden de llegada: es el de su gente. */
function revive(stored: StoredRoom): Room {
	return {
		...stored,
		arrivals: stored.arrivals ?? stored.players.map((p) => p.id),
		departures: stored.departures ?? {},
	};
}

/** Lo que se pegó a esta conexión al aceptarla, y si se ha despedido desde entonces. */
function attachmentOf(ws: WebSocket): Attachment | null {
	const value = ws.deserializeAttachment() as Partial<Attachment> | null;
	const profile = parseProfile(value?.profile);
	return profile ? { profile, bye: value?.bye === true } : null;
}

function send(socket: WebSocket, message: ServerMessage): void {
	try {
		socket.send(JSON.stringify(message));
	} catch {
		// El socket se cerró entre que lo listamos y le escribimos. La reconexión
		// del cliente se encarga; aquí no hay nada que arreglar.
	}
}
