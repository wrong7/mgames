import { useCallback, useEffect, useRef, useState } from "react";
import type { AnyEngine } from "../engine.ts";
import type { PlayerProfile } from "../profile.ts";
import { parseServerMessage } from "../protocol.ts";
import type { RoomAction, RoomView } from "../room.ts";

/** Cómo de conectada está esta pantalla con el resto del grupo. */
export type RoomStatus =
	/** Abriendo el WebSocket; aún no sabemos si hay sala. */
	| "conectando"
	/** En vivo: lo que toques lo ven los demás. */
	| "conectado"
	/** Sin servidor. Sin sala no hay con quién jugar; se reintenta solo. */
	| "desconectado";

export interface Room {
	/** La sala tal y como la ve este móvil, o `null` hasta que el servidor conteste. */
	room: RoomView | null;
	status: RoomStatus;
	/** Acciones de la sala: elegir juego, salir. */
	dispatch: (action: RoomAction) => void;
	/** Una jugada del juego en marcha. */
	play: (action: unknown) => void;
	/** La hora del servidor según este móvil, en epoch ms. Ver `clockOffset`. */
	now: () => number;
}

export interface UseRoomOptions {
	/** Código de la sala: lo que los jugadores se dictan en voz alta. */
	code: string;
	/** Quién es este móvil. Entra en la sala al conectar. */
	profile: PlayerProfile;
	/** Origen del servidor de salas. */
	realtimeUrl: string | undefined;
	/**
	 * Los motores de los juegos, por slug. Sólo se usan para pintar una jugada
	 * antes de que el servidor conteste, en los juegos que no esconden nada.
	 */
	engines: Readonly<Record<string, AnyEngine>>;
}

/** Reintento con espera creciente, para no martillear un servidor caído. */
const RETRY_MS = [1000, 2000, 5000, 10000] as const;

/** Cuántas medidas del reloj del servidor se recuerdan. */
const CLOCK_SAMPLES = 8;

/**
 * Cuánto hay que sumar a `Date.now()` para tener la hora del servidor.
 *
 * Cada vista trae la hora a la que salió del servidor, y llega un poco
 * después: cada medida se queda corta por lo que tardó en viajar. La mayor de
 * las últimas es la del mensaje que menos tardó, que es la más cercana a la
 * verdad; quedarse sólo con las últimas deja que el reloj del móvil se corrija
 * a mitad de partida sin que una medida vieja lo impida para siempre.
 */
function clockOffset(samples: readonly number[]): number {
	return samples.length > 0 ? Math.max(...samples) : 0;
}

/**
 * Conecta esta pantalla con una sala.
 *
 * A diferencia de los juegos, la sala no existe sin servidor: es literalmente
 * el sitio donde están los demás. Por eso aquí no hay modo local, sólo un
 * estado de "desconectado" que se reintenta.
 */
export function useRoom({ code, profile, realtimeUrl, engines }: UseRoomOptions): Room {
	const [room, setRoom] = useState<RoomView | null>(null);
	const [status, setStatus] = useState<RoomStatus>("conectando");
	const socketRef = useRef<WebSocket | null>(null);

	// Se leen de refs para que `dispatch` y `play` no cambien de identidad en
	// cada render: los efectos que dependen de ellos no deben reejecutarse.
	const profileRef = useRef(profile);
	profileRef.current = profile;
	const enginesRef = useRef(engines);
	enginesRef.current = engines;
	const clockRef = useRef<number[]>([]);

	useEffect(() => {
		setRoom(null);
		if (!realtimeUrl || !code) {
			setStatus("desconectado");
			return;
		}

		let attempt = 0;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;

		const connect = () => {
			if (cancelled) return;
			setStatus("conectando");
			const socket = new WebSocket(roomUrl(realtimeUrl, code, profileRef.current));
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				attempt = 0;
				setStatus("conectado");
			});

			socket.addEventListener("message", (event) => {
				const message = parseServerMessage<RoomView>(String(event.data));
				if (message?.type !== "state") return;
				// Un servidor anterior al reloj no manda la hora: se sigue con la del móvil.
				if (typeof message.state.now === "number") {
					clockRef.current = [...clockRef.current, message.state.now - Date.now()].slice(
						-CLOCK_SAMPLES,
					);
				}
				// El servidor es la fuente de verdad: su vista sustituye a la local.
				setRoom(message.state);
			});

			const reconnect = () => {
				if (cancelled) return;
				socketRef.current = null;
				setStatus("desconectado");
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

	const send = useCallback((action: RoomAction) => {
		const socket = socketRef.current;
		if (socket?.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ type: "action", action }));
		}
	}, []);

	const play = useCallback(
		(action: unknown) => {
			send({ type: "game", action });

			// En los juegos sin secretos la vista es el estado entero, así que se
			// puede aplicar la jugada aquí mismo: el servidor va a confirmar lo mismo
			// porque ejecuta este motor. En móvil, esperar el viaje de ida y vuelta
			// para pintar una carta se nota en la mano.
			setRoom((current) => {
				if (!current?.game || current.view === null) return current;
				const engine = enginesRef.current[current.game];
				if (!engine || engine.project) return current;
				const parsed = engine.parseAction(action);
				if (parsed === null) return current;
				const me = profileRef.current;
				const next = engine.apply(current.view, parsed, {
					seed: "",
					now: Date.now(),
					players: current.players,
					actorId: me.id,
					actor: me,
				});
				return next === current.view ? current : { ...current, view: next };
			});
		},
		[send],
	);

	const now = useCallback(() => Date.now() + clockOffset(clockRef.current), []);

	return { room, status, dispatch: send, play, now };
}

function roomUrl(base: string, code: string, profile: PlayerProfile): string {
	const url = new URL(`/room/${encodeURIComponent(code)}`, base);
	// El perfil viaja en la conexión, no en cada mensaje: el servidor lo necesita
	// desde el principio para sentar al jugador y saber qué cara enseñar.
	url.searchParams.set("jugador", profile.id);
	url.searchParams.set("nombre", profile.name);
	url.searchParams.set("avatar", profile.avatar);
	// Aceptamos la URL con esquema http(s) porque es lo que se escribe en un .env.
	if (url.protocol === "https:") url.protocol = "wss:";
	else if (url.protocol === "http:") url.protocol = "ws:";
	return url.toString();
}
