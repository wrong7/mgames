import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerProfile } from "@mgames/game-kit";
import { LOCATIONS } from "./locations.ts";
import { DEAL_COUNTDOWN_MS, MAX_PLAYERS, MIN_PLAYERS, spyCountFor } from "./rules.ts";
import { allReady, applyAction, createGame, deal, dealStep, project } from "./state.ts";
import type { SpyAction, SpyState } from "./types.ts";

const players = (n: number): PlayerProfile[] =>
	Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}`, avatar: `cara${i}` }));

/** La hora a la que se sienta la mesa. Las demás se cuentan desde aquí. */
const T0 = 1_000_000;
const SEMILLA = "SALA";

/** Una jugada de `actorId` con `gente` en la sala, a la hora `now`. */
const juega = (
	state: SpyState,
	action: SpyAction,
	gente: readonly PlayerProfile[],
	actorId = "p0",
	now = T0,
	seed = SEMILLA,
) => applyAction(state, action, { players: gente, actorId, seed, now });

/** Dicen "listo" los de `quienes`, con `gente` en la sala. */
const listos = (state: SpyState, gente: readonly PlayerProfile[], quienes = gente, now = T0) =>
	quienes.reduce((s, p) => juega(s, { type: "listo", ready: true }, gente, p.id, now), state);

/** Todos listos y, al acabar la cuenta atrás, el aviso: una ronda repartida a `n` jugadores. */
const jugando = (n: number, seed = SEMILLA) => {
	const gente = players(n);
	const contando = listos(createGame(seed, T0), gente);
	return juega(contando, { type: "avanzar" }, gente, "p0", T0 + DEAL_COUNTDOWN_MS, seed);
};

const revelada = (n: number) => juega(jugando(n), { type: "revelar" }, players(n));

describe("listo y cuenta atrás", () => {
	it("nadie reparte a mano: hasta que no dicen listo todos, no hay cuenta atrás", () => {
		const gente = players(4);
		const casi = listos(createGame(SEMILLA, T0), gente, gente.slice(0, 3));
		assert.equal(casi.dealAt, null);
		assert.equal(juega(casi, { type: "avanzar" }, gente, "p0", T0 + 60_000), casi);
	});

	it("cuando lo dice el último empieza la cuenta de 3 segundos, y al acabar se reparte", () => {
		const gente = players(4);
		const contando = listos(createGame(SEMILLA, T0), gente);
		assert.equal(contando.phase, "sala");
		assert.equal(contando.dealAt, T0 + DEAL_COUNTDOWN_MS);
		assert.equal(DEAL_COUNTDOWN_MS, 3000);
		// Avisar antes de tiempo no hace nada; al acabar la cuenta, sí.
		const pronto = juega(contando, { type: "avanzar" }, gente, "p1", T0 + DEAL_COUNTDOWN_MS - 1);
		assert.equal(pronto, contando);
		const ronda = juega(contando, { type: "avanzar" }, gente, "p1", T0 + DEAL_COUNTDOWN_MS);
		assert.equal(ronda.phase, "jugando");
		assert.deepEqual(ronda.ready, {});
		assert.equal(ronda.dealAt, null);
	});

	it("quien se echa atrás para la cuenta; al volver a decir listo, empieza de nuevo", () => {
		const gente = players(3);
		const contando = listos(createGame(SEMILLA, T0), gente);
		const parada = juega(contando, { type: "listo", ready: false }, gente, "p2", T0 + 1000);
		assert.equal(parada.dealAt, null);
		assert.equal(juega(parada, { type: "avanzar" }, gente, "p0", T0 + 10_000).phase, "sala");
		const otra = juega(parada, { type: "listo", ready: true }, gente, "p2", T0 + 5000);
		assert.equal(otra.dealAt, T0 + 5000 + DEAL_COUNTDOWN_MS);
	});

	it("si entra alguien durante la cuenta, se para hasta que diga listo", () => {
		const contando = listos(createGame(SEMILLA, T0), players(3));
		const conOtro = juega(contando, { type: "avanzar" }, players(4), "p0", T0 + DEAL_COUNTDOWN_MS);
		assert.equal(conOtro.phase, "sala");
		assert.equal(conOtro.dealAt, null);
	});

	it("si se va el único que faltaba, el aviso empieza la cuenta", () => {
		const gente = players(4);
		const casi = listos(createGame(SEMILLA, T0), gente, gente.slice(0, 3));
		const sinEl = players(3);
		const contando = juega(casi, { type: "avanzar" }, sinEl, "p0", T0 + 2000);
		assert.equal(contando.dealAt, T0 + 2000 + DEAL_COUNTDOWN_MS);
		const ronda = juega(contando, { type: "avanzar" }, sinEl, "p0", T0 + 2000 + DEAL_COUNTDOWN_MS);
		assert.deepEqual(
			ronda.round?.participants.map((p) => p.id),
			sinEl.map((p) => p.id),
		);
	});

	it("sin la gente que hace falta no hay cuenta, aunque estén todos listos", () => {
		for (const n of [MIN_PLAYERS - 1, MAX_PLAYERS + 1]) {
			const todos = listos(createGame(SEMILLA, T0), players(n));
			assert.equal(todos.dealAt, null, `con ${n} jugadores`);
			assert.equal(juega(todos, { type: "avanzar" }, players(n), "p0", T0 + 60_000).phase, "sala");
		}
	});

	it("quien no está en la sala no dice listo, y durante la ronda no se dice", () => {
		const sala = createGame(SEMILLA, T0);
		assert.equal(juega(sala, { type: "listo", ready: true }, players(3), "mirón"), sala);
		const ronda = jugando(4);
		assert.equal(juega(ronda, { type: "listo", ready: true }, players(4), "p1"), ronda);
		assert.equal(juega(ronda, { type: "avanzar" }, players(4), "p1", T0 + 60_000), ronda);
	});

	it("la pantalla decide cuándo avisar con la misma regla que el motor", () => {
		const gente = players(3);
		const ids = gente.map((p) => p.id);
		const contando = listos(createGame(SEMILLA, T0), gente);
		const vista = project(contando, "p0");
		assert.equal(dealStep(vista, ids, T0 + 100), null);
		assert.equal(dealStep(vista, ids, T0 + DEAL_COUNTDOWN_MS), "repartir");
		assert.equal(dealStep(vista, [...ids, "p3"], T0 + 100), "parar");
		const parada = juega(contando, { type: "listo", ready: false }, gente, "p1", T0 + 100);
		assert.equal(dealStep(project(parada, "p0"), ["p0", "p2"], T0 + 200), null);
		assert.ok(allReady(vista.ready, ids));
	});
});

describe("repartir", () => {
	it("reparte a quien está en la sala en ese momento, y lo recuerda", () => {
		const round = jugando(5).round;
		assert.ok(round);
		assert.deepEqual(
			round.participants.map((p) => p.id),
			players(5).map((p) => p.id),
		);
	});

	it("reparte una localización del catálogo y un papel suyo a cada agente", () => {
		const round = jugando(6).round;
		assert.ok(round);
		const location = LOCATIONS.find((l) => l.name === round.location);
		assert.ok(location, "la localización tiene que estar en el catálogo");
		for (const role of Object.values(round.roles)) {
			assert.ok(location.roles.includes(role), `${role} no es un papel de ${round.location}`);
		}
	});

	it("todos los jugadores son o espías o agentes, y nadie las dos cosas", () => {
		for (const n of [3, 4, 5, 6, 7, 8]) {
			const round = jugando(n).round;
			assert.ok(round);
			const agentes = Object.keys(round.roles);
			assert.equal(round.spyIds.length, spyCountFor(n), `espías con ${n} jugadores`);
			assert.equal(agentes.length + round.spyIds.length, n, `reparto con ${n} jugadores`);
			for (const spy of round.spyIds) assert.ok(!agentes.includes(spy));
		}
	});

	it("no repite papel dentro de una ronda", () => {
		for (const n of [3, 5, 8]) {
			const roles = Object.values(jugando(n).round?.roles ?? {});
			assert.equal(new Set(roles).size, roles.length, `papeles repetidos con ${n} jugadores`);
		}
	});

	it("la misma semilla reparte igual y semillas distintas reparten distinto", () => {
		const gente = players(6);
		assert.deepEqual(deal(gente, "MISMA"), deal(gente, "MISMA"));
		assert.notDeepEqual(deal(gente, "UNA"), deal(gente, "OTRA"));
	});

	it("cada ronda de la partida se reparte distinto, y la semilla la pone el servidor", () => {
		const gente = players(5);
		const primera = jugando(5, "PARTIDA");
		const vuelta = juega(juega(primera, { type: "revelar" }, gente), { type: "volver" }, gente);
		const segunda = juega(
			listos(vuelta, gente),
			{ type: "avanzar" },
			gente,
			"p0",
			T0 + 60_000,
			"PARTIDA",
		);
		assert.equal(segunda.dealt, 2);
		assert.deepEqual(primera.round, deal(gente, "PARTIDA/ronda-1"));
		assert.deepEqual(segunda.round, deal(gente, "PARTIDA/ronda-2"));
		assert.notDeepEqual(segunda.round, primera.round);
	});

	it("el espía no es siempre el mismo", () => {
		const gente = players(5);
		const espias = new Set(
			Array.from({ length: 30 }, (_, i) => deal(gente, `semilla-${i}`).spyIds[0]),
		);
		assert.ok(espias.size > 1, "el reparto está sesgado hacia un jugador");
	});

	it("las partidas guardadas antes del listo siguen valiendo", () => {
		const antigua = { phase: "sala", round: null, updatedAt: T0 } as unknown as SpyState;
		assert.deepEqual(project(antigua, "p0").ready, []);
		assert.equal(listos(antigua, players(3)).dealAt, T0 + DEAL_COUNTDOWN_MS);
	});
});

describe("lo que ve cada jugador", () => {
	/**
	 * La forma exacta de lo que sale hacia un móvil.
	 *
	 * Se comprueba la lista cerrada de claves, y no que falte alguna concreta,
	 * porque el riesgo real es el contrario: que alguien añada un campo al estado
	 * y se cuele en la vista sin que nadie se dé cuenta. Con esta lista, ese
	 * descuido rompe el test.
	 */
	// Sin la lista de sitios posibles: se lo pondría fácil al espía.
	const CLAVES_DE_LA_VISTA = [
		"card",
		"dealAt",
		"participants",
		"phase",
		"ready",
		"reveal",
		"updatedAt",
	];

	it("la vista no lleva más campos que los previstos, ni durante la ronda", () => {
		const state = jugando(5);
		for (const player of players(5)) {
			const vista = project(state, player.id);
			assert.deepEqual(Object.keys(vista).sort(), CLAVES_DE_LA_VISTA);
			// De los demás sólo se sabe cómo se llaman y qué cara tienen.
			for (const otro of vista.participants) {
				assert.deepEqual(Object.keys(otro).sort(), ["avatar", "id", "name"]);
			}
		}
	});

	it("el espía sabe que lo es y su carta no dice dónde está", () => {
		const state = jugando(5);
		const spyId = state.round?.spyIds[0] as string;
		const vista = project(state, spyId);
		// La carta es exactamente esto: ni localización, ni papel, ni pistas.
		assert.deepEqual(vista.card, { kind: "espia" });
		assert.equal(vista.reveal, null);
	});

	it("un agente ve su localización y su papel", () => {
		const state = jugando(5);
		const agentId = Object.keys(state.round?.roles ?? {})[0] as string;
		const vista = project(state, agentId);
		assert.deepEqual(vista.card, {
			kind: "agente",
			location: state.round?.location,
			role: state.round?.roles[agentId],
		});
		assert.equal(vista.reveal, null);
	});

	it("nadie puede deducir quién es el espía antes de destapar", () => {
		const state = jugando(6);
		const spyIds = state.round?.spyIds ?? [];
		for (const player of players(6)) {
			const vista = project(state, player.id);
			// Sólo tu propia carta te dice que eres espía; la de nadie más lo dice.
			assert.equal(vista.card?.kind === "espia", spyIds.includes(player.id));
		}
	});

	it("sobre la mesa sin repartir nadie tiene carta", () => {
		assert.equal(project(createGame("SALA"), "p0").card, null);
	});

	it("al destapar, todos ven la localización y quién era el espía, con su cara", () => {
		const state = revelada(5);
		const spyId = state.round?.spyIds[0] as string;
		const spy = players(5).find((p) => p.id === spyId);
		for (const player of players(5)) {
			const vista = project(state, player.id);
			assert.equal(vista.reveal?.location, state.round?.location);
			assert.deepEqual(vista.reveal?.spies, [
				{ id: spy?.id, name: spy?.name, avatar: spy?.avatar },
			]);
		}
	});

	it("quien entra a mitad de ronda no recibe carta", () => {
		assert.equal(project(jugando(4), "mirón").card, null);
	});
});

describe("final de ronda", () => {
	it("sólo se destapa una ronda en curso", () => {
		const sala = createGame(SEMILLA, T0);
		assert.equal(juega(sala, { type: "revelar" }, players(4)), sala);
	});

	it("volver borra el reparto, y para la siguiente hay que decir listo otra vez", () => {
		const gente = players(5);
		const state = juega(revelada(5), { type: "volver" }, gente);
		assert.equal(state.phase, "sala");
		assert.equal(state.round, null);
		assert.deepEqual(state.ready, {});
		assert.equal(juega(state, { type: "avanzar" }, gente, "p0", T0 + 60_000), state);
		const otra = juega(listos(state, gente), { type: "avanzar" }, gente, "p0", T0 + 60_000);
		assert.equal(otra.phase, "jugando");
	});
});
