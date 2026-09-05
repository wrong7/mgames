import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameEngine } from "../engine.ts";
import { parseServerMessage } from "../protocol.ts";
import { readPlayerId } from "./player.ts";

/** Cómo de conectada está esta pantalla con el resto del grupo. */
export type RoomStatus =
	/** Abriendo el WebSocket; aún no sabemos si hay sala. */
	| "conectando"
	/** En vivo: lo que toques lo ven los demás. */
	| "conectado"
	/** Sin servidor. Lo que se ve es el estado local, que puede no ser el del grupo. */
	| "local";

export interface GameRoom<Action, View> {
	/**
	 * Lo que este jugador puede ver. En los juegos sin secretos es el estado
	 * entero; en los que reparten cartas, sólo la suya y lo público.
	 */
	view: View;
	status: RoomStatus;
	/**
	 * `false` mientras se espera el primer estado del servidor.
	 *
	 * El estado local y el de la sala pueden no coincidir, así que pintar antes de
	 * saberlo enseñaría algo que cambia medio segundo después. Sin servidor es
	 * `true` desde el principio: ahí el estado local ya es el único que hay.
	 */
	synced: boolean;
	/** Identificador de este móvil. Lo necesitan los juegos con cartas por jugador. */
	playerId: string;
	dispatch: (action: Action) => void;
}

export interface UseGameRoomOptions<State, Action, View> {
	/** El motor del juego: se usa para el estado inicial y para las jugadas locales. */
	engine: GameEngine<State, Action, View>;
	/** Slug del juego, para dirigir la conexión a la sala correcta. */
	game: string;
	/** Código de la sala: lo que los jugadores se dictan en voz alta. */
	code: string;
	/** Origen del servidor de salas. Sin él se juega en local. */
	realtimeUrl?: string;
}

/** Reintento con espera creciente, para no martillear un servidor caído. */
const RETRY_MS = [1000, 2000, 5000, 10000] as const;

/**
 * Conecta esta pantalla con una sala.
 *
 * Las jugadas se aplican en el acto y además se envían: en móvil, esperar al
 * servidor para pintar una carta se nota, y el servidor va a confirmar lo mismo
 * porque ejecuta este mismo motor.
 */
export function useGameRoom<State, Action, View>({
	engine,
	game,
	code,
	realtimeUrl,
}: UseGameRoomOptions<State, Action, View>): GameRoom<Action, View> {
	const playerId = useMemo(() => readPlayerId(), []);
	const [view, setView] = useState<View>(() =>
		project(engine, engine.create({ seed: code, now: Date.now() }), playerId),
	);
	const [status, setStatus] = useState<RoomStatus>(realtimeUrl ? "conectando" : "local");
	const [synced, setSynced] = useState(!realtimeUrl);
	const socketRef = useRef<WebSocket | null>(null);

	// El motor no cambia durante la vida de una pantalla, pero leerlo de una ref
	// evita que `dispatch` cambie de identidad en cada render.
	const engineRef = useRef(engine);
	engineRef.current = engine;

	/**
	 * El estado completo tal y como lo ve este móvil cuando no hay servidor.
	 *
	 * Va en una ref porque no es lo que se pinta —eso es `view`— pero sí lo que
	 * hay que ir aplicando para que un juego sin secretos siga siendo jugable sin
	 * conexión.
	 */
	const localRef = useRef<State | null>(null);

	// Un código nuevo es una partida nueva: no arrastres el estado anterior.
	useEffect(() => {
		const fresh = engineRef.current.create({ seed: code, now: Date.now() });
		localRef.current = fresh;
		setView(project(engineRef.current, fresh, playerId));
		setSynced(!realtimeUrl);
	}, [code, playerId, realtimeUrl]);

	useEffect(() => {
		if (!realtimeUrl || !code) {
			setStatus("local");
			setSynced(true);
			return;
		}

		let attempt = 0;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;

		const connect = () => {
			if (cancelled) return;
			const socket = new WebSocket(roomUrl(realtimeUrl, game, code, playerId));
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				attempt = 0;
				setStatus("conectado");
				socket.send(JSON.stringify({ type: "hello" }));
			});

			socket.addEventListener("message", (event) => {
				const message = parseServerMessage<View>(String(event.data));
				// El servidor es la fuente de verdad: su vista sustituye a la local.
				if (message?.type === "state") {
					setView(message.state);
					setSynced(true);
				}
			});

			const reconnect = () => {
				if (cancelled) return;
				socketRef.current = null;
				setStatus("local");
				// Ya hay algo que enseñar: lo que quedó de la sesión conectada, o el
				// estado local si nunca llegamos a conectar.
				setSynced(true);
				const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] as number;
				attempt++;
				retryTimer = setTimeout(connect, wait);
			};

			socket.addEventListener("close", reconnect);
			socket.addEventListener("error", () => socket.close());
		};

		connect();

		return () => {
			cancelled = true;
			clearTimeout(retryTimer);
			socketRef.current?.close();
			socketRef.current = null;
		};
	}, [code, game, playerId, realtimeUrl]);

	const dispatch = useCallback(
		(action: Action) => {
			const socket = socketRef.current;
			const connected = socket?.readyState === WebSocket.OPEN;
			if (connected) socket?.send(JSON.stringify({ type: "action", action }));

			const engine = engineRef.current;
			const local = localRef.current;
			if (!local) return;

			const next = engine.apply(local, action, { seed: code, now: Date.now(), actorId: playerId });
			localRef.current = next;

			// Con secretos que repartir, el estado local no puede adivinar lo que el
			// servidor va a decidir, así que se espera su respuesta. Sin ellos se
			// pinta ya: el servidor va a confirmar lo mismo porque ejecuta este motor.
			if (!engine.project || !connected) setView(project(engine, next, playerId));
		},
		[code, playerId],
	);

	return { view, status, synced, playerId, dispatch };
}

function project<State, Action, View>(
	engine: GameEngine<State, Action, View>,
	state: State,
	actorId: string,
): View {
	// Sin `project`, la vista es el estado: el juego no esconde nada.
	return engine.project ? engine.project(state, actorId) : (state as unknown as View);
}

function roomUrl(base: string, game: string, code: string, playerId: string): string {
	const url = new URL(`/room/${encodeURIComponent(game)}/${encodeURIComponent(code)}`, base);
	// El identificador del móvil viaja en la conexión, no en cada mensaje: el
	// servidor lo necesita desde el principio para saber a quién le habla.
	url.searchParams.set("jugador", playerId);
	// Aceptamos la URL con esquema http(s) porque es lo que se escribe en un .env.
	if (url.protocol === "https:") url.protocol = "wss:";
	else if (url.protocol === "http:") url.protocol = "ws:";
	return url.toString();
}
