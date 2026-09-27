import type { PlayerProfile } from "./profile.ts";

/**
 * La sala: el grupo de gente que se ha juntado, antes y por encima de cualquier
 * juego.
 *
 * Se entra con un código y ahí se está toda la noche. Dentro se elige a qué
 * jugar, se juega, y se vuelve a la sala a elegir otra cosa sin que nadie tenga
 * que teclear nada de nuevo. Es el modelo de los juegos de sobremesa de
 * consola: la sala es la mesa, el juego es lo que hay encima ahora mismo.
 */
export interface RoomState {
	/** Quién está dentro, por orden de llegada. */
	players: readonly PlayerProfile[];
	/**
	 * Todos los que han pasado por la sala, por orden de llegada, menos los que
	 * se fueron con el botón: quien sale sin él y vuelve recupera su sitio.
	 */
	arrivals: readonly string[];
	/**
	 * Quién ha dejado la sala y a qué hora sale si no vuelve antes (epoch ms).
	 * Mientras tanto sigue dentro: una recarga no se nota.
	 */
	departures: Readonly<Record<string, number>>;
	/** Slug del juego en marcha, o `null` si se está eligiendo. */
	game: string | null;
	/** Estado del juego en marcha, tal y como lo guarda su motor. */
	gameState: unknown;
	updatedAt: number;
}

/**
 * Lo que un móvil recibe de la sala.
 *
 * `host` es quien manda en la sala —elige el juego, lo cierra— y es siempre el
 * primero que entró. No hay más jerarquía que ésa: es la forma más simple de
 * que no haya cinco dedos cambiando de juego a la vez.
 */
export interface RoomView<GameView = unknown> {
	players: readonly PlayerProfile[];
	host: string | null;
	game: string | null;
	/** La vista del juego para quien mira, ya proyectada por su motor. */
	view: GameView | null;
	updatedAt: number;
	/**
	 * La hora del servidor al mandar esta vista (epoch ms).
	 *
	 * Es lo que deja a los juegos con reloj contar con la misma hora en todos los
	 * móviles: el reloj de cada uno va a su aire, a veces por segundos, y en un
	 * juego donde algo se ve un segundo eso es la ronda entera.
	 */
	now: number;
}

export type RoomAction =
	/** Irse de la sala. Entrar es automático al conectar. */
	| { type: "leave" }
	/** El anfitrión pone un juego sobre la mesa. */
	| { type: "selectGame"; game: string }
	/** El anfitrión lo recoge: de vuelta a elegir. */
	| { type: "exitGame" }
	/** Una jugada del juego en marcha. La valida su motor. */
	| { type: "game"; action: unknown };

export function parseRoomAction(value: unknown): RoomAction | null {
	if (typeof value !== "object" || value === null) return null;
	const action = value as Record<string, unknown>;
	switch (action.type) {
		case "leave":
		case "exitGame":
			return { type: action.type };
		case "selectGame":
			return typeof action.game === "string" && action.game
				? { type: "selectGame", game: action.game }
				: null;
		case "game":
			return "action" in action ? { type: "game", action: action.action } : null;
		default:
			return null;
	}
}

/** Quién manda: el primero que llegó y sigue dentro. */
export function hostOf(players: readonly PlayerProfile[]): string | null {
	return players[0]?.id ?? null;
}

/**
 * Lo que la sala le da a la pantalla de un juego.
 *
 * Es el contrato entre `apps/web` y cada paquete: el juego recibe su vista, la
 * gente de la sala y una función para jugar, y no sabe nada de WebSockets ni
 * de rutas. `onExit` sólo llega al anfitrión, que es quien puede recoger el
 * juego de la mesa.
 */
export interface GameScreenProps<View, Action> {
	code: string;
	profile: PlayerProfile;
	players: readonly PlayerProfile[];
	host: string | null;
	/** Si la pantalla está en vivo con el resto de la sala. */
	live: boolean;
	view: View;
	play: (action: Action) => void;
	/**
	 * La hora de la sala en epoch ms: la del servidor, no la del móvil. Es la
	 * que usan los motores para decidir si algo llegó a tiempo, así que un juego
	 * con cuenta atrás tiene que contar con ésta y no con `Date.now()`.
	 */
	now: () => number;
	onExit?: () => void;
}
