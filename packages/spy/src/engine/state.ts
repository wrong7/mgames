import { createRng, type PlayerProfile } from "@mgames/game-kit";
import { LOCATIONS } from "./locations.ts";
import { DEAL_COUNTDOWN_MS, MAX_PLAYERS, MIN_PLAYERS, spyCountFor } from "./rules.ts";
import type { Card, Round, SpyAction, SpyPlayer, SpyState, SpyView } from "./types.ts";

/** Sobre la mesa, sin repartir. */
export function createGame(_seed: string, now: number = Date.now()): SpyState {
	return { phase: "sala", round: null, ready: {}, dealAt: null, dealt: 0, updatedAt: now };
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

/** Lo que el motor necesita saber de cada jugada, además de la jugada. */
export interface SpyContext {
	/** La gente de la sala ahora mismo: a quien se espera y a quien se reparte. */
	players: readonly PlayerProfile[];
	actorId: string;
	/** La semilla de la partida: la de cada ronda sale de ésta y de su número. */
	seed: string;
	now: number;
}

/**
 * Aplica una acción. Pura: mismas entradas, mismo resultado, en el navegador y
 * en el servidor.
 *
 * Devuelve el mismo objeto cuando la acción no procede. No es un error: los
 * mensajes llegan de varios móviles a la vez y alguno siempre llega tarde.
 */
export function applyAction(stored: SpyState, action: SpyAction, ctx: SpyContext): SpyState {
	const state = current(stored);
	const { players, actorId, now } = ctx;

	switch (action.type) {
		case "listo": {
			// Sólo en la sala y sólo quien está en ella: los demás no se esperan.
			if (state.phase !== "sala" || !players.some((p) => p.id === actorId)) return stored;
			if (Boolean(state.ready[actorId]) === action.ready) return stored;
			const ready = action.ready
				? { ...state.ready, [actorId]: true as const }
				: without(state.ready, actorId);
			return settle({ ...state, ready, updatedAt: now }, ctx);
		}

		case "avanzar": {
			const next = settle(state, ctx);
			return next === state ? stored : next;
		}

		case "revelar": {
			if (state.phase !== "jugando") return stored;
			return { ...state, phase: "revelado", updatedAt: now };
		}

		case "volver": {
			if (state.phase === "sala") return stored;
			return { ...state, phase: "sala", round: null, ready: {}, dealAt: null, updatedAt: now };
		}
	}
}

/**
 * Qué toca en la sala con esta gente y a esta hora. Es la misma regla en el
 * motor y en la pantalla, que así sabe cuándo avisar:
 *
 * - `contar`: están todos listos y no corre la cuenta atrás, porque el último
 *   acaba de decirlo o porque se ha ido el único que faltaba.
 * - `repartir`: están todos listos y la cuenta ha llegado a cero.
 * - `parar`: corre la cuenta, pero ya no están todos: alguien se ha echado
 *   atrás o acaba de entrar.
 */
export function dealStep(
	view: Pick<SpyView, "phase" | "ready" | "dealAt">,
	present: readonly string[],
	now: number,
): "contar" | "repartir" | "parar" | null {
	if (view.phase !== "sala") return null;
	const all = allReady(view.ready, present);
	if (all && view.dealAt === null) return "contar";
	if (all && view.dealAt !== null && now >= view.dealAt) return "repartir";
	if (!all && view.dealAt !== null) return "parar";
	return null;
}

/** Si se puede jugar con la gente de la sala y han dicho listo todos. */
export function allReady(ready: readonly string[], present: readonly string[]): boolean {
	return (
		present.length >= MIN_PLAYERS &&
		present.length <= MAX_PLAYERS &&
		present.every((id) => ready.includes(id))
	);
}

/** Hace lo que toque en la sala (ver `dealStep`); la misma sala si no toca nada. */
function settle(state: SpyState, { players, seed, now }: SpyContext): SpyState {
	const present = players.map((p) => p.id);
	const step = dealStep(
		{ phase: state.phase, ready: Object.keys(state.ready), dealAt: state.dealAt },
		present,
		now,
	);
	switch (step) {
		case "contar":
			return { ...state, dealAt: now + DEAL_COUNTDOWN_MS, updatedAt: now };
		case "parar":
			return { ...state, dealAt: null, updatedAt: now };
		case "repartir": {
			// Cada ronda, su semilla: la de la partida, que no sale del servidor, y su
			// número. Así nadie elige el reparto desde su móvil.
			const dealt = state.dealt + 1;
			return {
				phase: "jugando",
				round: deal(players, `${seed}/ronda-${dealt}`),
				ready: {},
				dealAt: null,
				dealt,
				updatedAt: now,
			};
		}
		case null:
			return state;
	}
}

/** Las partidas guardadas antes del "listo" no traen sus campos: se completan. */
function current(state: SpyState): SpyState {
	const stored: Partial<SpyState> = state;
	if (stored.ready && stored.dealAt !== undefined && stored.dealt !== undefined) return state;
	return {
		...state,
		ready: stored.ready ?? {},
		dealAt: stored.dealAt ?? null,
		dealt: stored.dealt ?? 0,
	};
}

function without(record: Readonly<Record<string, true>>, key: string): Record<string, true> {
	return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/**
 * Lo que ve un móvil concreto.
 *
 * Es la función que sostiene el juego: el reparto completo se queda en el
 * servidor y cada uno recibe su carta y nada más. Hasta que la ronda se destapa,
 * y entonces se ve todo.
 */
export function project(stored: SpyState, actorId: string): SpyView {
	const state = current(stored);
	const sala = state.phase === "sala";
	const base = {
		phase: state.phase,
		ready: sala ? Object.keys(state.ready) : [],
		dealAt: sala ? state.dealAt : null,
		updatedAt: state.updatedAt,
	};

	if (!state.round || sala) {
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
