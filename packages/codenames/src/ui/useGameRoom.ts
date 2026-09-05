import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyAction,
	createGame,
	type GameAction,
	type GameState,
	parseServerMessage,
} from "../engine/index.ts";

/** Cómo de conectada está esta pantalla con el resto del grupo. */
export type RoomStatus =
	/** Abriendo el WebSocket; aún no sabemos si hay sala. */
	| "conectando"
	/** En vivo: lo que toques lo ven los demás. */
	| "conectado"
	/**
	 * Sin servidor. El tablero se deriva del código, así que la partida se puede
	 * jugar igual, pero cada móvil lleva sus propias marcas.
	 */
	| "local";

export interface GameRoom {
	state: GameState;
	status: RoomStatus;
	/**
	 * `false` mientras se espera el primer estado del servidor.
	 *
	 * El tablero local y el de la sala son distintos —el servidor reparte con una
	 * semilla propia—, así que pintar antes de saberlo enseñaría 25 palabras que
	 * cambian medio segundo después. En local es `true` desde el principio: ahí el
	 * tablero local ya es el bueno.
	 */
	synced: boolean;
	dispatch: (action: GameAction) => void;
}

/** Reintento con espera creciente, para no martillear un servidor caído. */
const RETRY_MS = [1000, 2000, 5000, 10000] as const;

/**
 * Conecta esta pantalla con la sala `code`.
 *
 * El estado local es siempre jugable: arranca derivando el tablero del código y,
 * si el WebSocket conecta, el servidor pasa a mandar. Las jugadas se aplican en
 * el acto y además se envían — en móvil, esperar al servidor para pintar una
 * carta se nota, y el servidor va a confirmar lo mismo porque ejecuta este mismo
 * reducer.
 */
export function useGameRoom(code: string, realtimeUrl: string | undefined): GameRoom {
	const [state, setState] = useState<GameState>(() => createGame(code));
	const [status, setStatus] = useState<RoomStatus>(realtimeUrl ? "conectando" : "local");
	const [synced, setSynced] = useState(!realtimeUrl);
	const socketRef = useRef<WebSocket | null>(null);

	// Un código nuevo es una partida nueva: no arrastres el tablero anterior.
	useEffect(() => {
		setState(createGame(code));
		setSynced(!realtimeUrl);
	}, [code, realtimeUrl]);

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
			const socket = new WebSocket(roomUrl(realtimeUrl, code));
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				attempt = 0;
				setStatus("conectado");
				socket.send(JSON.stringify({ type: "hello" }));
			});

			socket.addEventListener("message", (event) => {
				const message = parseServerMessage(String(event.data));
				// El servidor es la fuente de verdad: su estado sustituye al local.
				if (message?.type === "state") {
					setState(message.state);
					setSynced(true);
				}
			});

			const reconnect = () => {
				if (cancelled) return;
				socketRef.current = null;
				setStatus("local");
				// Ya hay un tablero que enseñar: el que quedó de la sesión conectada, o
				// el local si nunca llegamos a conectar. En cualquier caso, jugable.
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
	}, [code, realtimeUrl]);

	const dispatch = useCallback((action: GameAction) => {
		setState((current) => applyAction(current, action));
		const socket = socketRef.current;
		if (socket?.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ type: "action", action }));
		}
	}, []);

	return { state, status, synced, dispatch };
}

function roomUrl(base: string, code: string): string {
	const url = new URL(`/room/${encodeURIComponent(code)}`, base);
	// Aceptamos la URL con esquema http(s) porque es lo que se escribe en un .env.
	url.protocol =
		url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : url.protocol;
	return url.toString();
}
