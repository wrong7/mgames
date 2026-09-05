import { createRng } from "@mgames/game-kit";
import { LOCATION_NAMES, LOCATIONS } from "./locations.ts";
import { MAX_PLAYERS, MIN_PLAYERS, normalizeName, spyCountFor } from "./rules.ts";
import type { Card, Round, SpyAction, SpyPlayer, SpyState, SpyView } from "./types.ts";

/** Una sala vacía, esperando a que llegue la gente. */
export function createGame(_seed: string, now: number = Date.now()): SpyState {
	return { phase: "sala", players: [], round: null, updatedAt: now };
}

/**
 * Reparte una ronda: una localización, un espía (o dos) y un papel para cada uno
 * de los demás.
 *
 * Determinista a partir de la semilla, como todo lo demás: el servidor y
 * cualquier móvil llegarían al mismo reparto con la misma entrada.
 */
export function deal(players: readonly SpyPlayer[], seed: string): Round {
	const rng = createRng(seed, "spy/reparto");
	const location = rng.pick(LOCATIONS);

	const shuffled = rng.shuffle(players);
	const spies = shuffled.slice(0, spyCountFor(players.length));
	const agents = shuffled.slice(spies.length);

	// Hay siete papeles y como mucho seis agentes, así que ninguno se repite.
	const roles = rng.sample(location.roles, agents.length);

	return {
		location: location.name,
		spyIds: spies.map((player) => player.id),
		roles: Object.fromEntries(agents.map((player, i) => [player.id, roles[i] as string])),
	};
}

/**
 * Aplica una acción. Pura: mismas entradas, mismo resultado, en el navegador y
 * en el servidor.
 *
 * Devuelve el mismo objeto cuando la acción no procede. No es un error: los
 * mensajes llegan de varios móviles a la vez y alguno siempre llega tarde.
 */
export function applyAction(
	state: SpyState,
	action: SpyAction,
	actorId: string,
	now: number = Date.now(),
): SpyState {
	switch (action.type) {
		case "unirse": {
			const name = normalizeName(action.name);
			if (!name || !actorId) return state;

			const existing = state.players.find((player) => player.id === actorId);
			// Volver a entrar con el mismo móvil no crea un jugador nuevo: es el que
			// recargó la página o volvió de bloquear la pantalla.
			if (existing) {
				if (existing.name === name) return state;
				return {
					...state,
					players: state.players.map((p) => (p.id === actorId ? { ...p, name } : p)),
					updatedAt: now,
				};
			}

			// Con la ronda empezada no entra nadie: le tocaría una carta que no existe.
			if (state.phase !== "sala" || state.players.length >= MAX_PLAYERS) return state;

			return { ...state, players: [...state.players, { id: actorId, name }], updatedAt: now };
		}

		case "salir": {
			if (!state.players.some((player) => player.id === actorId)) return state;
			const players = state.players.filter((player) => player.id !== actorId);
			// Si se va alguien en mitad de la ronda, el reparto deja de tener sentido:
			// se vuelve a la sala en lugar de dejar una partida coja.
			return {
				...state,
				players,
				phase: state.phase === "jugando" ? "sala" : state.phase,
				round: state.phase === "jugando" ? null : state.round,
				updatedAt: now,
			};
		}

		case "repartir": {
			if (state.players.length < MIN_PLAYERS || !action.seed) return state;
			return {
				...state,
				phase: "jugando",
				round: deal(state.players, action.seed),
				updatedAt: now,
			};
		}

		case "revelar": {
			if (state.phase !== "jugando") return state;
			return { ...state, phase: "revelado", updatedAt: now };
		}

		case "volver": {
			if (state.phase === "sala") return state;
			return { ...state, phase: "sala", round: null, updatedAt: now };
		}
	}
}

/**
 * Lo que ve un móvil concreto.
 *
 * Es la función que sostiene el juego: el reparto completo se queda en el
 * servidor y cada uno recibe su carta y nada más. Hasta que la ronda se destapa,
 * y entonces se ve todo.
 */
export function project(state: SpyState, actorId: string): SpyView {
	const base = {
		phase: state.phase,
		players: state.players,
		locations: LOCATION_NAMES,
		updatedAt: state.updatedAt,
	};

	if (!state.round || state.phase === "sala") {
		return { ...base, card: null, reveal: null };
	}

	if (state.phase === "revelado") {
		const spyNames = state.round.spyIds.map(
			(id) => state.players.find((player) => player.id === id)?.name ?? "alguien",
		);
		return {
			...base,
			card: cardFor(state.round, actorId),
			reveal: { location: state.round.location, spyNames },
		};
	}

	return { ...base, card: cardFor(state.round, actorId), reveal: null };
}

function cardFor(round: Round, actorId: string): Card | null {
	if (round.spyIds.includes(actorId)) return { kind: "espia" };
	const role = round.roles[actorId];
	// Quien no está en el reparto está mirando por encima del hombro: sin carta.
	if (!role) return null;
	return { kind: "agente", location: round.location, role };
}
