import type { PlayerProfile } from "./profile.ts";
import type { RoomState } from "./room.ts";

/**
 * Quién está en la sala: cómo se entra, cómo se sale y cómo se vuelve.
 *
 * Entrar es conectarse. Salir es darle al botón o dejar la sala: cerrar la
 * pestaña, quitar el navegador, quedarse sin cobertura. Lo segundo no saca a
 * nadie en el acto: el servidor le pone hora de salida y, si vuelve antes —una
 * recarga vuelve enseguida—, aquí no ha pasado nada. Y quien sale así y vuelve
 * más tarde recupera su sitio en el orden de llegada, anfitrión incluido: en
 * una mesa de verdad, levantarse un momento no te quita la silla.
 *
 * Son puras, como los motores: devuelven la misma sala cuando no hay nada que
 * cambiar, y así quien las llama sabe si hay algo que guardar o difundir.
 */

/**
 * Llega alguien, o vuelve. Quien ya estaba se queda donde estaba, como mucho
 * con nombre o cara nuevos, y deja de tener hora de salida. Quien había salido
 * sin el botón vuelve a su sitio; quien no había estado nunca, detrás de todos.
 */
export function arrive<R extends RoomState>(room: R, profile: PlayerProfile, now: number): R {
	const departures = omit(room.departures, profile.id);
	const arrivals = room.arrivals.includes(profile.id)
		? room.arrivals
		: [...room.arrivals, profile.id];

	let players = room.players;
	const existing = players.find((p) => p.id === profile.id);
	if (!existing) {
		// Delante del primero que llegó después que él.
		const rank = arrivals.indexOf(profile.id);
		const next = players.findIndex((p) => arrivals.indexOf(p.id) > rank);
		players =
			next < 0
				? [...players, profile]
				: [...players.slice(0, next), profile, ...players.slice(next)];
	} else if (existing.name !== profile.name || existing.avatar !== profile.avatar) {
		players = players.map((p) => (p.id === profile.id ? profile : p));
	}

	if (players === room.players && arrivals === room.arrivals && departures === room.departures) {
		return room;
	}
	return {
		...room,
		players,
		arrivals,
		departures,
		updatedAt: players === room.players ? room.updatedAt : now,
	};
}

/** Se va con el botón: sale en el acto y del todo. Si vuelve, llega el último. */
export function leave<R extends RoomState>(room: R, playerId: string, now: number): R {
	if (!room.players.some((p) => p.id === playerId)) return room;
	return {
		...room,
		players: room.players.filter((p) => p.id !== playerId),
		arrivals: room.arrivals.filter((id) => id !== playerId),
		departures: omit(room.departures, playerId),
		updatedAt: now,
	};
}

/**
 * Alguien ha dejado la sala: sale a la hora `at` si no vuelve antes. Si ya
 * tenía una hora de salida anterior, se queda la anterior.
 *
 * Quien llama comprueba antes que no la tenga abierta en otro sitio (otra
 * pestaña, otro móvil con el mismo perfil).
 */
export function scheduleDeparture<R extends RoomState>(room: R, playerId: string, at: number): R {
	if (!room.players.some((p) => p.id === playerId)) return room;
	const current = room.departures[playerId];
	if (typeof current === "number" && current <= at) return room;
	return { ...room, departures: { ...room.departures, [playerId]: at } };
}

/**
 * Saca a quien le ha llegado la hora. `present` es quien tiene la sala
 * abierta ahora mismo: a ésos no se les saca aunque tuvieran hora, que es que
 * han vuelto.
 */
export function departDue<R extends RoomState>(
	room: R,
	now: number,
	present: ReadonlySet<string>,
): R {
	const gone = new Set<string>();
	const departures: Record<string, number> = {};
	for (const [id, at] of Object.entries(room.departures)) {
		// Quien ha vuelto se queda sin hora; los demás salen o siguen esperando.
		if (present.has(id)) continue;
		if (at <= now) gone.add(id);
		else departures[id] = at;
	}
	const waiting = Object.keys(departures).length;
	if (gone.size === 0 && waiting === Object.keys(room.departures).length) return room;
	if (gone.size === 0) return { ...room, departures };
	return {
		...room,
		players: room.players.filter((p) => !gone.has(p.id)),
		departures,
		updatedAt: now,
	};
}

/** El registro sin esa clave; el mismo si no la tenía. */
function omit<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
	if (!Object.hasOwn(record, key)) return record;
	return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}
