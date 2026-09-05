import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCATIONS } from "./locations.ts";
import { MAX_PLAYERS, MIN_PLAYERS, spyCountFor } from "./rules.ts";
import { applyAction, createGame, deal, project } from "./state.ts";
import type { SpyPlayer, SpyState } from "./types.ts";

const players = (n: number): SpyPlayer[] =>
	Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}` }));

/** Sala con `n` jugadores dentro. */
function salaCon(n: number): SpyState {
	return players(n).reduce<SpyState>(
		(state, player) => applyAction(state, { type: "unirse", name: player.name }, player.id),
		createGame("SALA"),
	);
}

const jugando = (n: number, seed = "RONDA") =>
	applyAction(salaCon(n), { type: "repartir", seed }, "p0");

describe("entrar y salir de la sala", () => {
	it("cada móvil entra una vez", () => {
		const sala = salaCon(4);
		assert.equal(sala.players.length, 4);
		assert.deepEqual(
			sala.players.map((p) => p.id),
			["p0", "p1", "p2", "p3"],
		);
	});

	it("volver a entrar con el mismo móvil cambia el nombre, no añade un jugador", () => {
		const sala = applyAction(salaCon(3), { type: "unirse", name: "Otro" }, "p1");
		assert.equal(sala.players.length, 3);
		assert.equal(sala.players.find((p) => p.id === "p1")?.name, "Otro");
	});

	it("ignora nombres vacíos y móviles sin identidad", () => {
		const sala = salaCon(3);
		assert.equal(applyAction(sala, { type: "unirse", name: "   " }, "p9"), sala);
		assert.equal(applyAction(sala, { type: "unirse", name: "Ana" }, ""), sala);
	});

	it("recorta los nombres largos en vez de rechazarlos", () => {
		const sala = applyAction(createGame("X"), { type: "unirse", name: "A".repeat(40) }, "p0");
		assert.equal(sala.players[0]?.name.length, 16);
	});

	it("no deja entrar por encima del máximo", () => {
		const llena = salaCon(MAX_PLAYERS);
		const sobra = applyAction(llena, { type: "unirse", name: "Tarde" }, "extra");
		assert.equal(sobra, llena);
	});

	it("nadie entra con la ronda empezada", () => {
		const ronda = jugando(4);
		assert.equal(applyAction(ronda, { type: "unirse", name: "Tarde" }, "nuevo"), ronda);
	});

	it("si alguien se va en mitad de la ronda, se vuelve a la sala", () => {
		const despues = applyAction(jugando(4), { type: "salir" }, "p2");
		assert.equal(despues.phase, "sala");
		assert.equal(despues.round, null);
		assert.equal(despues.players.length, 3);
	});
});

describe("repartir", () => {
	it("no reparte con menos jugadores del mínimo", () => {
		const pocos = salaCon(MIN_PLAYERS - 1);
		assert.equal(applyAction(pocos, { type: "repartir", seed: "S" }, "p0"), pocos);
	});

	it("reparte una localización del catálogo y un papel suyo a cada agente", () => {
		const state = jugando(6);
		const round = state.round;
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
	const CLAVES_DE_LA_VISTA = ["card", "locations", "phase", "players", "reveal", "updatedAt"];

	it("la vista no lleva más campos que los previstos, ni durante la ronda", () => {
		const state = jugando(5);
		for (const player of state.players) {
			const vista = project(state, player.id);
			assert.deepEqual(Object.keys(vista).sort(), CLAVES_DE_LA_VISTA);
			// De los demás sólo se sabe cómo se llaman.
			for (const otro of vista.players) {
				assert.deepEqual(Object.keys(otro).sort(), ["id", "name"]);
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
		for (const player of state.players) {
			const vista = project(state, player.id);
			// Sólo tu propia carta te dice que eres espía; la de nadie más lo dice.
			const seSabe = vista.card?.kind === "espia";
			assert.equal(seSabe, spyIds.includes(player.id));
		}
	});

	it("en la sala nadie tiene carta", () => {
		assert.equal(project(salaCon(4), "p0").card, null);
	});

	it("al destapar, todos ven la localización y el nombre del espía", () => {
		const state = applyAction(jugando(5), { type: "revelar" }, "p0");
		const spyId = state.round?.spyIds[0] as string;
		const spyName = state.players.find((p) => p.id === spyId)?.name;
		for (const player of state.players) {
			const vista = project(state, player.id);
			assert.equal(vista.reveal?.location, state.round?.location);
			assert.deepEqual(vista.reveal?.spyNames, [spyName]);
		}
	});

	it("quien mira sin jugar no recibe carta", () => {
		assert.equal(project(jugando(4), "mirón").card, null);
	});
});

describe("final de ronda", () => {
	it("sólo se destapa una ronda en curso", () => {
		const sala = salaCon(4);
		assert.equal(applyAction(sala, { type: "revelar" }, "p0"), sala);
	});

	it("volver a la sala conserva a los jugadores y borra el reparto", () => {
		const state = applyAction(
			applyAction(jugando(5), { type: "revelar" }, "p0"),
			{ type: "volver" },
			"p0",
		);
		assert.equal(state.phase, "sala");
		assert.equal(state.round, null);
		assert.equal(state.players.length, 5);
	});
});
