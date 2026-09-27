import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerProfile } from "@mgames/game-kit";
import { engine } from "./engine.ts";
import { ANSWER_WINDOW_MS, INTRO_MS, LEVELS, levelFor, RESULTS_MS, ROUND_COUNT } from "./rules.ts";
import { applyAction, buildRound, createGame, dueStep, project, standings } from "./state.ts";
import type { CubesAction, CubesState } from "./types.ts";

const players = (n: number): PlayerProfile[] =>
	Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}`, avatar: `cara${i}` }));

/** La hora a la que se sienta la mesa. Las demás se cuentan desde aquí. */
const T0 = 1_000_000;

const as = (
	state: CubesState,
	action: CubesAction,
	actorId: string,
	gente: readonly PlayerProfile[],
	now: number,
) => applyAction(state, action, actorId, gente, now);

/** Todos dicen "listo" a la vez: el último arranca la primera ronda. */
function empezada(gente = players(3), now = T0): CubesState {
	let state = createGame("MESA", now);
	for (const p of gente) state = as(state, { type: "listo", ready: true }, p.id, gente, now);
	return state;
}

/** La ronda en juego, con los cubos ya escondidos: se puede contestar. */
const contestando = (state: CubesState) => (state.round?.hideAt ?? 0) + 100;

const count = (state: CubesState) => state.round?.cubes.length ?? -1;

/** Una ronda contestada por todos con el número bueno, en orden: se cierra sola. */
function acertadaPorTodos(state: CubesState, gente: readonly PlayerProfile[]): CubesState {
	const at = contestando(state);
	let next = state;
	gente.forEach((p, i) => {
		next = as(next, { type: "responder", value: count(state) }, p.id, gente, at + i);
	});
	return next;
}

describe("empezar", () => {
	it("no empieza hasta que todos los de la sala han dicho listo", () => {
		const gente = players(3);
		let state = createGame("MESA", T0);
		state = as(state, { type: "listo", ready: true }, "p0", gente, T0);
		state = as(state, { type: "listo", ready: true }, "p1", gente, T0);
		assert.equal(state.phase, "sala");
		state = as(state, { type: "listo", ready: true }, "p2", gente, T0);
		assert.equal(state.phase, "ronda");
		assert.equal(state.round?.number, 1);
	});

	it("se puede dejar de estar listo, y quien no está en la sala no cuenta", () => {
		const gente = players(2);
		let state = createGame("MESA", T0);
		state = as(state, { type: "listo", ready: true }, "p0", gente, T0);
		state = as(state, { type: "listo", ready: false }, "p0", gente, T0);
		assert.deepEqual(state.ready, {});
		const antes = state;
		assert.equal(as(antes, { type: "listo", ready: true }, "fantasma", gente, T0), antes);
	});

	it("si se va el único que faltaba, empieza al avisar", () => {
		const gente = players(3);
		let state = createGame("MESA", T0);
		state = as(state, { type: "listo", ready: true }, "p0", gente, T0);
		state = as(state, { type: "listo", ready: true }, "p1", gente, T0);
		const quedan = gente.slice(0, 2);
		assert.equal(as(state, { type: "avanzar" }, "p0", quedan, T0 + 5).phase, "ronda");
	});

	it("reparte la primera ronda a todos, con la cuenta de preparados antes de los cubos", () => {
		const gente = players(4);
		const state = empezada(gente);
		const round = state.round;
		assert.ok(round);
		assert.deepEqual(round.participants, ["p0", "p1", "p2", "p3"]);
		assert.equal(round.showAt, T0 + INTRO_MS);
		assert.equal(round.hideAt, round.showAt + levelFor(1).showMs);
		assert.equal(round.closesAt, null);
		assert.deepEqual(
			state.contestants.map((c) => [c.id, c.points]),
			gente.map((p) => [p.id, 0]),
		);
		assert.deepEqual(state.ready, {});
	});

	it("cada ronda pone tantos cubos como dice su nivel", () => {
		for (const [i, level] of LEVELS.entries()) {
			for (const seed of ["A", "B", "C", "D", "E", "F"]) {
				const cubes = buildRound(seed, 1, i + 1, ["p0"], T0).cubes.length;
				assert.ok(cubes >= level.cubes[0] && cubes <= level.cubes[1], `ronda ${i + 1}: ${cubes}`);
			}
		}
	});
});

describe("contestar", () => {
	it("mientras se ven los cubos no se contesta", () => {
		const state = empezada();
		const round = state.round;
		assert.ok(round);
		const value = count(state);
		assert.equal(as(state, { type: "responder", value }, "p0", players(3), round.showAt), state);
		assert.equal(
			as(state, { type: "responder", value }, "p0", players(3), round.hideAt - 1),
			state,
		);
	});

	it("el primero en contestar pone la cuenta atrás para los demás", () => {
		const state = empezada();
		const at = contestando(state);
		const next = as(state, { type: "responder", value: 3 }, "p1", players(3), at);
		assert.equal(next.round?.closesAt, at + ANSWER_WINDOW_MS);
		assert.deepEqual(next.round?.answers, [{ playerId: "p1", value: 3, at }]);
		// El segundo no la mueve.
		const second = as(next, { type: "responder", value: 4 }, "p0", players(3), at + 1000);
		assert.equal(second.round?.closesAt, at + ANSWER_WINDOW_MS);
	});

	it("el número confirmado no se cambia", () => {
		const state = empezada();
		const at = contestando(state);
		const next = as(state, { type: "responder", value: 3 }, "p1", players(3), at);
		assert.equal(as(next, { type: "responder", value: 5 }, "p1", players(3), at + 10), next);
	});

	it("quien llegó con la ronda empezada no contesta", () => {
		const state = empezada();
		const conNuevo = [...players(3), { id: "nuevo", name: "Nuevo", avatar: "x" }];
		assert.equal(
			as(state, { type: "responder", value: 2 }, "nuevo", conNuevo, contestando(state)),
			state,
		);
	});

	it("fuera de tiempo no se apunta, y la ronda se cierra", () => {
		const gente = players(3);
		const state = empezada(gente);
		const at = contestando(state);
		const next = as(state, { type: "responder", value: 3 }, "p0", gente, at);
		const tarde = as(
			next,
			{ type: "responder", value: count(state) },
			"p1",
			gente,
			at + ANSWER_WINDOW_MS,
		);
		assert.equal(tarde.phase, "resultado");
		assert.equal(tarde.round?.answers.length, 1);
	});

	it("avisar antes de tiempo no hace nada; después, cierra la ronda", () => {
		const gente = players(3);
		const state = empezada(gente);
		const at = contestando(state);
		const next = as(state, { type: "responder", value: 3 }, "p0", gente, at);
		assert.equal(as(next, { type: "avanzar" }, "p2", gente, at + ANSWER_WINDOW_MS - 1), next);
		assert.equal(
			as(next, { type: "avanzar" }, "p2", gente, at + ANSWER_WINDOW_MS).phase,
			"resultado",
		);
	});

	it("sin que nadie conteste, la ronda espera", () => {
		const state = empezada();
		assert.equal(as(state, { type: "avanzar" }, "p0", players(3), T0 + 60_000), state);
	});

	it("cuando han contestado todos, se cierra sin esperar al reloj", () => {
		const gente = players(3);
		const cerrada = acertadaPorTodos(empezada(gente), gente);
		assert.equal(cerrada.phase, "resultado");
		assert.equal(cerrada.nextAt, (cerrada.updatedAt as number) + RESULTS_MS);
	});

	it("no se espera a quien se ha ido de la sala", () => {
		const gente = players(3);
		const state = empezada(gente);
		const at = contestando(state);
		let next = as(state, { type: "responder", value: 1 }, "p0", gente, at);
		next = as(next, { type: "responder", value: 1 }, "p1", gente, at);
		assert.equal(next.phase, "ronda");
		const quedan = gente.slice(0, 2);
		assert.equal(as(next, { type: "avanzar" }, "p0", quedan, at + 1).phase, "resultado");
	});
});

describe("puntos", () => {
	it("uno por acertar y otro para el primero en acertar, aunque antes alguien fallara", () => {
		const gente = players(4);
		const state = empezada(gente);
		const at = contestando(state);
		const bueno = count(state);
		let next = as(state, { type: "responder", value: bueno + 1 }, "p3", gente, at);
		next = as(next, { type: "responder", value: bueno }, "p1", gente, at + 200);
		next = as(next, { type: "responder", value: bueno }, "p0", gente, at + 400);
		next = as(next, { type: "avanzar" }, "p0", gente, at + ANSWER_WINDOW_MS);
		const points = Object.fromEntries(next.contestants.map((c) => [c.id, c.points]));
		assert.deepEqual(points, { p0: 1, p1: 2, p2: 0, p3: 0 });
		const p1 = next.contestants.find((c) => c.id === "p1");
		assert.deepEqual([p1?.hits, p1?.firsts], [1, 1]);
	});

	it("el resultado dice qué contestó cada uno, también quien no llegó a tiempo", () => {
		const gente = players(3);
		const state = empezada(gente);
		const at = contestando(state);
		let next = as(state, { type: "responder", value: count(state) }, "p2", gente, at);
		next = as(next, { type: "avanzar" }, "p2", gente, at + ANSWER_WINDOW_MS);
		const results = project(next, "p0").round?.results;
		assert.deepEqual(results, [
			{ playerId: "p2", value: count(state), ms: 100, correct: true, first: true, points: 2 },
			{ playerId: "p0", value: null, ms: null, correct: false, first: false, points: 0 },
			{ playerId: "p1", value: null, ms: null, correct: false, first: false, points: 0 },
		]);
	});

	it("el tiempo de cada uno cuenta desde que se esfuman los cubos, y el primero en acertar es el más rápido", () => {
		const gente = players(3);
		const state = empezada(gente);
		const hideAt = state.round?.hideAt as number;
		const bueno = count(state);
		let next = as(state, { type: "responder", value: bueno + 1 }, "p2", gente, hideAt + 900);
		next = as(next, { type: "responder", value: bueno }, "p0", gente, hideAt + 1450);
		next = as(next, { type: "responder", value: bueno }, "p1", gente, hideAt + 2000);
		const results = project(next, "p0").round?.results ?? [];
		assert.deepEqual(
			results.map((r) => [r.playerId, r.ms, r.first]),
			[
				["p2", 900, false],
				["p0", 1450, true],
				["p1", 2000, false],
			],
		);
	});

	it("la clasificación va de más a menos puntos y los empatados comparten puesto", () => {
		const c = (id: string, points: number) => ({
			id,
			name: id,
			avatar: id,
			points,
			hits: 0,
			firsts: 0,
		});
		const ranking = standings([c("a", 3), c("b", 5), c("c", 3), c("d", 1)]);
		assert.deepEqual(
			ranking.map((s) => [s.contestant.id, s.position]),
			[
				["b", 1],
				["a", 2],
				["c", 2],
				["d", 4],
			],
		);
	});
});

describe("entre rondas", () => {
	it("la siguiente empieza cuando todos dicen listo", () => {
		const gente = players(2);
		let state = acertadaPorTodos(empezada(gente), gente);
		const now = state.updatedAt + 1000;
		state = as(state, { type: "listo", ready: true }, "p0", gente, now);
		assert.equal(state.phase, "resultado");
		state = as(state, { type: "listo", ready: true }, "p1", gente, now);
		assert.equal(state.phase, "ronda");
		assert.equal(state.round?.number, 2);
		assert.equal(state.round?.showAt, now + INTRO_MS);
	});

	it("si alguien no dice listo, la siguiente empieza sola al acabarse el tiempo", () => {
		const gente = players(2);
		const state = acertadaPorTodos(empezada(gente), gente);
		const nextAt = state.nextAt as number;
		assert.equal(as(state, { type: "avanzar" }, "p0", gente, nextAt - 1), state);
		assert.equal(as(state, { type: "avanzar" }, "p0", gente, nextAt).round?.number, 2);
	});

	it("sin nadie en la sala, no sigue sola", () => {
		const gente = players(2);
		const state = acertadaPorTodos(empezada(gente), gente);
		assert.equal(as(state, { type: "avanzar" }, "p0", [], (state.nextAt as number) + 1), state);
	});

	it("quien entra entre rondas juega la siguiente, y entra en el marcador a cero", () => {
		const gente = players(2);
		const cerrada = acertadaPorTodos(empezada(gente), gente);
		const conNuevo = [...gente, { id: "nuevo", name: "Nuevo", avatar: "x" }];
		const next = as(cerrada, { type: "avanzar" }, "p0", conNuevo, cerrada.nextAt as number);
		assert.ok(next.round?.participants.includes("nuevo"));
		assert.equal(next.contestants.find((c) => c.id === "nuevo")?.points, 0);
		assert.equal(next.contestants.find((c) => c.id === "p0")?.points, 2);
	});

	it("tras la última ronda, la clasificación; y de ahí, otra partida desde cero", () => {
		const gente = players(2);
		let state = empezada(gente);
		for (let round = 1; round <= ROUND_COUNT; round++) {
			assert.equal(state.round?.number, round);
			state = acertadaPorTodos(state, gente);
			assert.equal(state.phase, "resultado");
			state = as(state, { type: "avanzar" }, "p0", gente, state.nextAt as number);
		}
		assert.equal(state.phase, "final");
		assert.equal(state.contestants.find((c) => c.id === "p0")?.points, ROUND_COUNT * 2);

		const primera = state;
		for (const p of gente) state = as(state, { type: "listo", ready: true }, p.id, gente, T0);
		assert.equal(state.phase, "ronda");
		assert.equal(state.match, primera.match + 1);
		assert.equal(state.round?.number, 1);
		assert.ok(state.contestants.every((c) => c.points === 0));
	});

	it("otra partida en la misma mesa no repite tableros", () => {
		const rondas = (match: number) =>
			Array.from({ length: ROUND_COUNT }, (_, i) =>
				buildRound("MESA", match, i + 1, [], T0).cubes.join(),
			);
		assert.notDeepEqual(rondas(1), rondas(2));
		assert.deepEqual(rondas(1), rondas(1));
	});
});

describe("lo que ve cada jugador", () => {
	/**
	 * La forma exacta de lo que sale hacia un móvil. Si alguien añade un campo al
	 * estado y se cuela en la vista (la semilla, los números de los demás), este
	 * test se rompe.
	 */
	const CLAVES_DE_LA_VISTA = [
		"contestants",
		"match",
		"nextAt",
		"phase",
		"ready",
		"round",
		"totalRounds",
		"updatedAt",
	];
	const CLAVES_DE_LA_RONDA = [
		"answered",
		"closesAt",
		"cubes",
		"hideAt",
		"mine",
		"number",
		"participants",
		"pattern",
		"results",
		"showAt",
	];

	it("la vista no lleva más campos que los previstos, y nunca la semilla", () => {
		const gente = players(3);
		const state = as(
			empezada(gente),
			{ type: "responder", value: 2 },
			"p0",
			gente,
			contestando(empezada(gente)),
		);
		const vista = project(state, "p1");
		assert.deepEqual(Object.keys(vista).sort(), CLAVES_DE_LA_VISTA);
		assert.deepEqual(Object.keys(vista.round ?? {}).sort(), CLAVES_DE_LA_RONDA);
		assert.ok(!JSON.stringify(vista).includes("MESA"));
	});

	it("con la ronda abierta, de los demás sólo se sabe que han contestado", () => {
		const gente = players(3);
		const base = empezada(gente);
		const state = as(base, { type: "responder", value: 7 }, "p0", gente, contestando(base));
		const suya = project(state, "p0").round;
		const otra = project(state, "p1").round;
		// Cada uno ve su número y lo que tardó; contestó 100 ms después de esfumarse los cubos.
		assert.deepEqual(suya?.mine, { value: 7, ms: 100 });
		assert.equal(otra?.mine, null);
		assert.deepEqual(otra?.answered, ["p0"]);
		assert.equal(otra?.results, null);
		assert.ok(!JSON.stringify(project(state, "p1")).includes('"value"'));
	});

	it("los móviles deciden cuándo avisar con la misma regla que el motor", () => {
		const gente = players(3);
		const ids = gente.map((p) => p.id);
		const base = empezada(gente);
		const at = contestando(base);
		const abierta = as(base, { type: "responder", value: 2 }, "p0", gente, at);
		const cerrada = as(abierta, { type: "avanzar" }, "p0", gente, at + ANSWER_WINDOW_MS);
		const cases: [CubesState, number][] = [
			[base, at],
			[abierta, at + 10],
			[abierta, at + ANSWER_WINDOW_MS],
			[cerrada, cerrada.updatedAt + 10],
			[cerrada, cerrada.nextAt as number],
		];
		for (const [state, now] of cases) {
			const avanza = engine.apply(
				state,
				{ type: "avanzar" },
				{
					seed: "",
					now,
					players: gente,
					actorId: "p0",
					actor: gente[0] as PlayerProfile,
				},
			);
			assert.equal(
				dueStep(project(state, "p1"), ids, now) !== null,
				avanza !== state,
				`${state.phase} a los ${now - T0} ms`,
			);
		}
	});
});

describe("mensajes que llegan por la red", () => {
	it("sólo acepta números que se pueden marcar", () => {
		assert.deepEqual(engine.parseAction({ type: "responder", value: 7 }), {
			type: "responder",
			value: 7,
		});
		for (const value of [-1, 2.5, 26, "7", null]) {
			assert.equal(engine.parseAction({ type: "responder", value }), null);
		}
		assert.equal(engine.parseAction({ type: "listo" }), null);
		assert.equal(engine.parseAction({ type: "hackear" }), null);
	});
});
