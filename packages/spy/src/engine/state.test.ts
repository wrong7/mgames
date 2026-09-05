import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerProfile } from "@mgames/game-kit";
import { LOCATIONS } from "./locations.ts";
import { MAX_PLAYERS, MIN_PLAYERS, spyCountFor } from "./rules.ts";
import { applyAction, createGame, deal, project } from "./state.ts";
import type { SpyState } from "./types.ts";

const players = (n: number): PlayerProfile[] =>
	Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}`, avatar: `cara${i}` }));

/** Una ronda repartida a `n` jugadores. */
const jugando = (n: number, seed = "RONDA") =>
	applyAction(createGame("SALA"), { type: "repartir", seed }, players(n));

const revelada = (n: number) => applyAction(jugando(n), { type: "revelar" }, players(n));

describe("repartir", () => {
	it("no reparte con menos jugadores del mínimo ni con más del máximo", () => {
		const sala = createGame("SALA");
		assert.equal(
			applyAction(sala, { type: "repartir", seed: "S" }, players(MIN_PLAYERS - 1)),
			sala,
		);
		assert.equal(
			applyAction(sala, { type: "repartir", seed: "S" }, players(MAX_PLAYERS + 1)),
			sala,
		);
	});

	it("no reparte con una ronda en marcha: primero hay que destapar", () => {
		const ronda = jugando(4);
		assert.equal(applyAction(ronda, { type: "repartir", seed: "OTRA" }, players(4)), ronda);
	});

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

	it("el espía no es siempre el mismo", () => {
		const gente = players(5);
		const espias = new Set(
			Array.from({ length: 30 }, (_, i) => deal(gente, `semilla-${i}`).spyIds[0]),
		);
		assert.ok(espias.size > 1, "el reparto está sesgado hacia un jugador");
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
	const CLAVES_DE_LA_VISTA = ["card", "locations", "participants", "phase", "reveal", "updatedAt"];

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

	it("al destapar, todos ven la localización y el nombre del espía", () => {
		const state = revelada(5);
		const spyId = state.round?.spyIds[0] as string;
		const spyName = players(5).find((p) => p.id === spyId)?.name;
		for (const player of players(5)) {
			const vista = project(state, player.id);
			assert.equal(vista.reveal?.location, state.round?.location);
			assert.deepEqual(vista.reveal?.spyNames, [spyName]);
		}
	});

	it("quien entra a mitad de ronda no recibe carta", () => {
		assert.equal(project(jugando(4), "mirón").card, null);
	});
});

describe("final de ronda", () => {
	it("sólo se destapa una ronda en curso", () => {
		const sala = createGame("SALA");
		assert.equal(applyAction(sala, { type: "revelar" }, players(4)), sala);
	});

	it("volver borra el reparto y deja repartir otra vez", () => {
		const state: SpyState = applyAction(revelada(5), { type: "volver" }, players(5));
		assert.equal(state.phase, "sala");
		assert.equal(state.round, null);
		assert.equal(applyAction(state, { type: "repartir", seed: "X" }, players(5)).phase, "jugando");
	});
});
