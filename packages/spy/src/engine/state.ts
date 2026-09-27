import { createRng, type PlayerProfile } from "@mgames/game-kit";
import { LOCATION_NAMES, LOCATIONS } from "./locations.ts";
import { MAX_PLAYERS, MIN_PLAYERS, spyCountFor } from "./rules.ts";
import type { Card, Round, SpyAction, SpyPlayer, SpyState, SpyView } from "./types.ts";

/** Sobre la mesa, sin repartir. */
export function createGame(_seed: string, now: number = Date.now()): SpyState {
	return { phase: "sala", round: null, updatedAt: now };
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
		participants: players.map(({ id, name, avatar }) => ({ id, name, avatar })),
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
	players: readonly PlayerProfile[],
	now: number = Date.now(),
): SpyState {
	switch (action.type) {
		case "repartir": {
			// Se reparte a quien esté en la sala ahora mismo, dentro de los límites del
			// juego. Con la ronda empezada no se vuelve a repartir: primero se destapa.
			if (
				state.phase === "jugando" ||
				players.length < MIN_PLAYERS ||
				players.length > MAX_PLAYERS ||
				!action.seed
			) {
				return state;
			}
			return { phase: "jugando", round: deal(players, action.seed), updatedAt: now };
		}

		case "revelar": {
			if (state.phase !== "jugando") return state;
			return { ...state, phase: "revelado", updatedAt: now };
		}

		case "volver": {
			if (state.phase === "sala") return state;
			return { phase: "sala", round: null, updatedAt: now };
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
		locations: LOCATION_NAMES,
		updatedAt: state.updatedAt,
	};

	if (!state.round || state.phase === "sala") {
		return { ...base, participants: [], card: null, reveal: null };
	}

	const round = state.round;
	const reveal =
		state.phase === "revelado"
			? {
					location: round.location,
					spies: round.participants.filter((p) => round.spyIds.includes(p.id)),
				}
			: null;

	return { ...base, participants: round.participants, card: cardFor(round, actorId), reveal };
}

function cardFor(round: Round, actorId: string): Card | null {
	if (round.spyIds.includes(actorId)) return { kind: "espia" };
	const role = round.roles[actorId];
	// Quien no está en el reparto está mirando por encima del hombro: sin carta.
	if (!role) return null;
	return { kind: "agente", location: round.location, role };
}
