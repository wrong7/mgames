import { createRng, type PlayerProfile } from "@mgames/game-kit";
import { layCubes } from "./layout.ts";
import {
	ANSWER_WINDOW_MS,
	INTRO_MS,
	levelFor,
	MAX_ANSWER,
	POINTS_FOR_FIRST,
	POINTS_FOR_HIT,
	RESULTS_MS,
	ROUND_COUNT,
} from "./rules.ts";
import type {
	Answer,
	Contestant,
	CubesAction,
	CubesState,
	CubesView,
	Phase,
	Round,
	RoundResult,
} from "./types.ts";

/** Sobre la mesa, sin empezar. */
export function createGame(seed: string, now: number = Date.now()): CubesState {
	return {
		phase: "sala",
		seed,
		match: 0,
		contestants: [],
		ready: {},
		round: null,
		nextAt: null,
		updatedAt: now,
	};
}

/**
 * La ronda `number` de la partida `match`: cuántos cubos, dónde y a qué hora
 * se ven.
 *
 * Los cubos salen de la semilla de la mesa y del número de partida y de ronda,
 * así que la misma semilla da siempre las mismas rondas y otra partida en la
 * misma mesa no repite tableros.
 */
export function buildRound(
	seed: string,
	match: number,
	number: number,
	participants: readonly string[],
	now: number,
): Round {
	const level = levelFor(number);
	const rng = createRng(seed, `cubos/partida-${match}/ronda-${number}`);
	const [min, max] = level.cubes;
	const count = min + rng.int(max - min + 1);
	const showAt = now + INTRO_MS;
	return {
		number,
		pattern: level.pattern,
		cubes: layCubes(level.pattern, count, rng),
		participants,
		showAt,
		hideAt: showAt + level.showMs,
		closesAt: null,
		answers: [],
	};
}

/**
 * Aplica una acción. Pura: mismas entradas, mismo resultado, en el navegador y
 * en el servidor.
 *
 * Después de cada acción, cualquiera, se mira si toca pasar a lo siguiente: la
 * última persona en decir "listo" arranca la ronda, y el último número que
 * faltaba la cierra. Devuelve el mismo objeto cuando no hay nada que cambiar.
 */
export function applyAction(
	state: CubesState,
	action: CubesAction,
	actorId: string,
	players: readonly PlayerProfile[],
	now: number = Date.now(),
): CubesState {
	return advance(act(state, action, actorId, players, now), players, now);
}

function act(
	state: CubesState,
	action: CubesAction,
	actorId: string,
	players: readonly PlayerProfile[],
	now: number,
): CubesState {
	switch (action.type) {
		case "listo": {
			// Con la ronda en marcha no hay nada para lo que estar listo. Y sólo
			// cuenta quien está en la sala: quien se ha ido no espera a nadie.
			if (state.phase === "ronda" || !players.some((p) => p.id === actorId)) return state;
			if ((state.ready[actorId] === true) === action.ready) return state;
			const ready = action.ready
				? { ...state.ready, [actorId]: true as const }
				: without(state.ready, actorId);
			return { ...state, ready, updatedAt: now };
		}

		case "responder": {
			const round = state.round;
			if (
				state.phase !== "ronda" ||
				!round ||
				!isAnswer(action.value) ||
				// Mientras se ven los cubos no se contesta: primero se miran, luego se cuenta.
				now < round.hideAt ||
				// Quien llegó con la ronda empezada la mira, pero no la juega.
				!round.participants.includes(actorId) ||
				round.answers.some((answer) => answer.playerId === actorId) ||
				// Tarde: la ronda ya está cerrada aunque aún no lo diga el estado.
				(round.closesAt !== null && now >= round.closesAt)
			) {
				return state;
			}
			return {
				...state,
				round: {
					...round,
					answers: [...round.answers, { playerId: actorId, value: action.value, at: now }],
					// El primero en contestar pone el reloj en marcha para los demás.
					closesAt: round.closesAt ?? now + ANSWER_WINDOW_MS,
				},
				updatedAt: now,
			};
		}

		case "avanzar":
			// No cambia nada por sí misma: sólo hace que se mire la hora.
			return state;
	}
}

/** Qué hay que hacer ahora: empezar la partida, cerrar la ronda o seguir a la siguiente. */
export type Step = "empezar" | "cerrar" | "seguir";

/**
 * Lo que hace falta saber para decidir si toca pasar a lo siguiente.
 *
 * Lo tienen igual el estado y la vista de cualquier móvil, así que la regla es
 * una sola: el motor la usa para avanzar y los móviles para saber cuándo
 * avisarle con `avanzar`.
 */
export interface Progress {
	phase: Phase;
	/** Quién ha dicho "listo". */
	ready: readonly string[];
	nextAt: number | null;
	round: {
		hideAt: number;
		closesAt: number | null;
		participants: readonly string[];
		/** Quién ha confirmado su número. */
		answered: readonly string[];
	} | null;
}

/**
 * Si toca pasar a lo siguiente, y a qué.
 *
 * `present` es quién está en la sala ahora: el motor no espera a quien se ha
 * ido, ni para decir "listo" ni para contestar.
 */
export function dueStep(progress: Progress, present: readonly string[], now: number): Step | null {
	const everyoneReady = present.length > 0 && present.every((id) => progress.ready.includes(id));

	switch (progress.phase) {
		case "sala":
		case "final":
			return everyoneReady ? "empezar" : null;

		case "resultado": {
			// Sin nadie en la sala no sigue sola: sería repartir una ronda a nadie.
			const timeUp = present.length > 0 && progress.nextAt !== null && now >= progress.nextAt;
			return everyoneReady || timeUp ? "seguir" : null;
		}

		case "ronda": {
			const round = progress.round;
			if (!round || now < round.hideAt) return null;
			if (round.closesAt !== null && now >= round.closesAt) return "cerrar";
			// Si ya han contestado todos los que siguen aquí, no hay que esperar al reloj.
			const waiting = round.participants.some(
				(id) => present.includes(id) && !round.answered.includes(id),
			);
			return waiting ? null : "cerrar";
		}
	}
}

/** El estado visto como `Progress`, para que el motor use la misma regla que los móviles. */
function progressOf(state: CubesState): Progress {
	const round = state.round;
	return {
		phase: state.phase,
		ready: Object.keys(state.ready),
		nextAt: state.nextAt,
		round: round && { ...round, answered: round.answers.map((answer) => answer.playerId) },
	};
}

function advance(state: CubesState, players: readonly PlayerProfile[], now: number): CubesState {
	const step = dueStep(
		progressOf(state),
		players.map((p) => p.id),
		now,
	);
	const played = state.round?.number ?? 0;

	switch (step) {
		case null:
			return state;
		case "empezar":
			// Partida nueva: marcadores a cero y otros tableros.
			return startRound({ ...state, match: state.match + 1, contestants: [] }, 1, players, now);
		case "cerrar":
			return closeRound(state, now);
		case "seguir":
			return played >= ROUND_COUNT
				? { ...state, phase: "final", ready: {}, nextAt: null, updatedAt: now }
				: startRound(state, played + 1, players, now);
	}
}

/** Reparte la ronda a quien esté en la sala, que entra en el marcador si no estaba. */
function startRound(
	state: CubesState,
	number: number,
	players: readonly PlayerProfile[],
	now: number,
): CubesState {
	return {
		...state,
		phase: "ronda",
		contestants: enlist(state.contestants, players),
		ready: {},
		round: buildRound(
			state.seed,
			state.match,
			number,
			players.map((p) => p.id),
			now,
		),
		nextAt: null,
		updatedAt: now,
	};
}

/** Cierra la ronda y reparte los puntos. */
function closeRound(state: CubesState, now: number): CubesState {
	const round = state.round;
	if (!round) return state;
	const results = new Map(scoreRound(round).map((result) => [result.playerId, result]));
	return {
		...state,
		phase: "resultado",
		contestants: state.contestants.map((contestant) => {
			const result = results.get(contestant.id);
			if (!result?.correct) return contestant;
			return {
				...contestant,
				points: contestant.points + result.points,
				hits: contestant.hits + 1,
				firsts: contestant.firsts + (result.first ? 1 : 0),
			};
		}),
		ready: {},
		nextAt: now + RESULTS_MS,
		updatedAt: now,
	};
}

/**
 * Cómo le ha ido a cada uno en la ronda: un punto por acertar y otro para el
 * primero que acertó, que es el primero de la lista de llegada con el número
 * bueno. Primero van los que contestaron, por orden; luego los que no.
 */
export function scoreRound(round: Round): RoundResult[] {
	const count = round.cubes.length;
	const firstHit = round.answers.find((answer) => answer.value === count)?.playerId;
	const answered = round.answers.map((answer): RoundResult => {
		const correct = answer.value === count;
		const first = answer.playerId === firstHit;
		return {
			playerId: answer.playerId,
			value: answer.value,
			ms: timeTaken(round, answer),
			correct,
			first,
			points: (correct ? POINTS_FOR_HIT : 0) + (first ? POINTS_FOR_FIRST : 0),
		};
	});
	const silent = round.participants
		.filter((id) => !round.answers.some((answer) => answer.playerId === id))
		.map(
			(id): RoundResult => ({
				playerId: id,
				value: null,
				ms: null,
				correct: false,
				first: false,
				points: 0,
			}),
		);
	return [...answered, ...silent];
}

/**
 * Lo que tardó en confirmar: desde que se esfumaron los cubos, que es cuando se
 * puede empezar a marcar. El motor no admite números antes, así que nunca es
 * negativo.
 */
function timeTaken(round: Round, answer: Answer): number {
	return answer.at - round.hideAt;
}

/** Los de la sala en el marcador: los nuevos entran a cero y los de antes, con su nombre y cara de ahora. */
function enlist(
	contestants: readonly Contestant[],
	players: readonly PlayerProfile[],
): Contestant[] {
	const current = new Map(players.map((p) => [p.id, p]));
	const known = contestants.map((contestant) => {
		const player = current.get(contestant.id);
		return player ? { ...contestant, name: player.name, avatar: player.avatar } : contestant;
	});
	const fresh = players
		.filter((p) => !contestants.some((contestant) => contestant.id === p.id))
		.map(({ id, name, avatar }) => ({ id, name, avatar, points: 0, hits: 0, firsts: 0 }));
	return [...known, ...fresh];
}

/**
 * Lo que ve un móvil concreto.
 *
 * Todo es público menos dos cosas: la semilla, que diría dónde caen los cubos
 * de las rondas que faltan, y los números de los demás mientras la ronda sigue
 * abierta. De los demás sólo se sabe si ya han contestado.
 */
export function project(state: CubesState, actorId: string): CubesView {
	const round = state.round;
	const closed = state.phase !== "ronda";
	const mine = round?.answers.find((answer) => answer.playerId === actorId);
	return {
		phase: state.phase,
		match: state.match,
		totalRounds: ROUND_COUNT,
		contestants: state.contestants,
		ready: Object.keys(state.ready),
		round: round && {
			number: round.number,
			pattern: round.pattern,
			cubes: round.cubes,
			participants: round.participants,
			showAt: round.showAt,
			hideAt: round.hideAt,
			closesAt: round.closesAt,
			answered: round.answers.map((answer) => answer.playerId),
			mine: mine ? { value: mine.value, ms: timeTaken(round, mine) } : null,
			results: closed ? scoreRound(round) : null,
		},
		nextAt: state.nextAt,
		updatedAt: state.updatedAt,
	};
}

/** Un puesto de la clasificación. Los empatados a puntos comparten puesto. */
export interface Standing {
	position: number;
	contestant: Contestant;
}

/** La clasificación, de más a menos puntos; a igualdad, por orden de llegada. */
export function standings(contestants: readonly Contestant[]): Standing[] {
	return [...contestants]
		.sort((a, b) => b.points - a.points)
		.map((contestant) => ({
			position: 1 + contestants.filter((other) => other.points > contestant.points).length,
			contestant,
		}));
}

/** Un número que se puede marcar: entero, de 0 a un cubo por casilla. */
export function isAnswer(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_ANSWER;
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
	const { [key]: _, ...rest } = record;
	return rest;
}
