import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerProfile } from "@mgames/game-kit";
import { buildBoard, CARD_COUNT, remainingFor } from "./board.ts";
import { applyAction, canStart, createGame } from "./state.ts";
import type { CardKind, GameAction, GameState, Team } from "./types.ts";
import { WORDS } from "./words.ts";

/** Índice de la primera carta de un tipo dado. */
const find = (state: GameState, kind: CardKind) => state.board.kinds.indexOf(kind);

const other = (team: Team): Team => (team === "azul" ? "rojo" : "azul");

const who = (id: string): PlayerProfile => ({ id, name: id, avatar: `cara-${id}` });
const jefeA = who("jefeA");
const agenteA = who("agenteA");
const jefeB = who("jefeB");
const agenteB = who("agenteB");
const miron = who("miron");

/** La gente de la sala en casi todos los tests: los cuatro que hacen falta. */
const mesa = [jefeA, agenteA, jefeB, agenteB];

const as = (state: GameState, action: GameAction, actor: PlayerProfile, players = mesa) =>
	applyAction(state, action, actor, players);

/** Los cuatro sentados —jefe y agente en el equipo que empieza (A) y en el otro (B)— y listos. */
function preparada(seed = "PARTIDA"): GameState {
	const fresh = createGame(seed);
	const a = fresh.board.startingTeam;
	const b = other(a);
	let state = fresh;
	state = as(state, { type: "sit", team: a, role: "jefe" }, jefeA);
	state = as(state, { type: "sit", team: a, role: "agente" }, agenteA);
	state = as(state, { type: "sit", team: b, role: "jefe" }, jefeB);
	state = as(state, { type: "sit", team: b, role: "agente" }, agenteB);
	for (const p of mesa) state = as(state, { type: "ready" }, p);
	return state;
}

/** Una partida ya empezada. */
const partida = (seed = "PARTIDA") => as(preparada(seed), { type: "start" }, jefeA);

const reveal = (state: GameState, index: number, actor: PlayerProfile = jefeA) =>
	as(state, { type: "reveal", index }, actor);
const vote = (state: GameState, index: number, actor: PlayerProfile = agenteA) =>
	as(state, { type: "vote", index }, actor);

describe("reparto", () => {
	it("da 25 palabras distintas de la baraja", () => {
		const { board } = createGame("SEMILLA");
		assert.equal(board.words.length, CARD_COUNT);
		assert.equal(new Set(board.words).size, CARD_COUNT);
		for (const word of board.words) assert.ok(WORDS.includes(word), `${word} no está en la baraja`);
	});

	it("reparte 9/8/7/1 y el equipo que empieza es el que tiene 9", () => {
		const { board } = createGame("SEMILLA");
		const count = (kind: CardKind) => board.kinds.filter((k) => k === kind).length;
		assert.equal(count(board.startingTeam), 9);
		assert.equal(count(other(board.startingTeam)), 8);
		assert.equal(count("neutral"), 7);
		assert.equal(count("asesino"), 1);
	});

	it("la misma semilla da el mismo tablero y semillas distintas dan tableros distintos", () => {
		assert.deepEqual(buildBoard("IGUAL"), buildBoard("IGUAL"));
		assert.notDeepEqual(buildBoard("UNA"), buildBoard("OTRA"));
	});

	it("reparte los dos equipos como equipo inicial según la semilla", () => {
		const equipos = new Set(
			Array.from({ length: 40 }, (_, i) => buildBoard(`semilla-${i}`).startingTeam),
		);
		assert.deepEqual([...equipos].sort(), ["azul", "rojo"]);
	});
});

describe("preparación", () => {
	it("empieza sin nadie sentado y sin poder arrancar", () => {
		const fresh = createGame("S");
		assert.equal(fresh.phase, "asientos");
		assert.equal(canStart(fresh, mesa), false);
		assert.equal(as(fresh, { type: "start" }, jefeA), fresh);
	});

	it("sentarse registra equipo y papel; repetirlo no cambia nada", () => {
		const state = as(createGame("S"), { type: "sit", team: "azul", role: "jefe" }, jefeA);
		assert.deepEqual(state.seats, { jefeA: { team: "azul", role: "jefe" } });
		assert.equal(as(state, { type: "sit", team: "azul", role: "jefe" }, jefeA), state);
	});

	it("listo se activa y se desactiva, y sólo con asiento", () => {
		const sin = createGame("S");
		assert.equal(as(sin, { type: "ready" }, jefeA), sin);
		const sentado = as(sin, { type: "sit", team: "azul", role: "jefe" }, jefeA);
		const listo = as(sentado, { type: "ready" }, jefeA);
		assert.deepEqual(listo.ready, { jefeA: true });
		assert.deepEqual(as(listo, { type: "ready" }, jefeA).ready, {});
	});

	it("cambiar de sitio o levantarse quita el listo", () => {
		const state = preparada();
		assert.equal(
			as(state, { type: "sit", team: "rojo", role: "agente" }, jefeA).ready.jefeA,
			undefined,
		);
		assert.equal(as(state, { type: "stand" }, jefeA).ready.jefeA, undefined);
	});

	it("con todos sentados y listos y las dos parejas completas, se puede empezar", () => {
		const state = preparada();
		assert.equal(canStart(state, mesa), true);
		assert.equal(partida().phase, "jugando");
	});

	it("no empieza si alguien no ha dicho listo", () => {
		const state = as(preparada(), { type: "ready" }, agenteB);
		assert.equal(canStart(state, mesa), false);
		assert.equal(as(state, { type: "start" }, jefeA), state);
	});

	it("no empieza si a un equipo le falta el jefe o el agente", () => {
		const state = preparada();
		const sinAgenteB = as(as(state, { type: "stand" }, agenteB), { type: "ready" }, agenteB);
		assert.equal(canStart(sinAgenteB, mesa), false);
		// Ni siquiera con todos los presentes listos, si están en el mismo lado.
		const b = other(state.board.startingTeam);
		let amontonados = as(state, { type: "sit", team: b, role: "agente" }, jefeB);
		amontonados = as(amontonados, { type: "ready" }, jefeB);
		assert.equal(canStart(amontonados, mesa), false);
	});

	it("no empieza si alguien de la sala sigue sin sentarse", () => {
		const state = preparada();
		assert.equal(canStart(state, [...mesa, miron]), false);
		assert.equal(as(state, { type: "start" }, jefeA, [...mesa, miron]), state);
	});

	it("quien se fue de la sala no bloquea el arranque aunque dejara el asiento", () => {
		const state = as(preparada(), { type: "ready" }, agenteB);
		// agenteB ya no está en la sala: su "no listo" no cuenta. Pero entonces al
		// equipo B le falta agente, así que hace falta otro.
		const sinB = mesa.filter((p) => p !== agenteB);
		assert.equal(canStart(state, sinB), false);
		const b = other(state.board.startingTeam);
		let conOtro = as(state, { type: "sit", team: b, role: "agente" }, miron);
		conOtro = as(conOtro, { type: "ready" }, miron);
		assert.equal(canStart(conOtro, [...sinB, miron]), true);
	});

	it("sólo alguien sentado puede pulsar empezar", () => {
		const state = preparada();
		assert.equal(as(state, { type: "start" }, miron), state);
		assert.equal(as(state, { type: "start" }, agenteB).phase, "jugando");
	});

	it("nadie toca el tablero antes de empezar", () => {
		const state = preparada();
		assert.equal(reveal(state, 0), state);
		assert.equal(vote(state, 0), state);
		assert.equal(as(state, { type: "endTurn" }, jefeA), state);
		assert.equal(as(state, { type: "restart", seed: "X" }, jefeA), state);
	});
});

describe("asientos durante la partida", () => {
	it("cambiar de sitio retira tu ficha", () => {
		const state = vote(partida(), 3);
		const moved = as(state, { type: "sit", team: state.turn, role: "jefe" }, agenteA);
		assert.deepEqual(moved.votes, {});
	});

	it("levantarse borra asiento y ficha", () => {
		const state = as(vote(partida(), 3), { type: "stand" }, agenteA);
		assert.equal(state.seats.agenteA, undefined);
		assert.deepEqual(state.votes, {});
	});

	it("quien mira sin sentarse no puede hacer nada", () => {
		const state = partida();
		assert.equal(vote(state, 3, miron), state);
		assert.equal(reveal(state, 3, miron), state);
		assert.equal(as(state, { type: "endTurn" }, miron), state);
		assert.equal(as(state, { type: "restart", seed: "X" }, miron), state);
	});

	it("repartir de nuevo conserva los asientos y sigue en juego", () => {
		const state = as(partida(), { type: "restart", seed: "X" }, jefeA);
		assert.equal(state.phase, "jugando");
		assert.deepEqual(state.seats, partida().seats);
	});
});

describe("quién puede destapar", () => {
	it("el jefe del equipo en turno destapa", () => {
		assert.equal(reveal(partida(), 0, jefeA).revealed[0], true);
	});

	it("un agente no destapa, aunque lo intente", () => {
		const state = partida();
		assert.equal(reveal(state, 0, agenteA), state);
	});

	it("el jefe del otro equipo tampoco destapa hasta que le toque", () => {
		const state = partida();
		assert.equal(reveal(state, 0, jefeB), state);
		const cambiado = as(state, { type: "endTurn" }, jefeA);
		assert.equal(reveal(cambiado, 0, jefeB).revealed[0], true);
	});

	it("sólo el jefe del equipo en turno pasa el turno", () => {
		const state = partida();
		assert.equal(as(state, { type: "endTurn" }, agenteA), state);
		assert.equal(as(state, { type: "endTurn" }, jefeB), state);
		assert.equal(as(state, { type: "endTurn" }, jefeA).turn, other(state.turn));
	});

	it("cualquier jefe puede volver a tapar y repartir de nuevo; un agente no", () => {
		const state = reveal(partida(), 0);
		assert.equal(as(state, { type: "unreveal", index: 0 }, jefeB).revealed[0], false);
		assert.equal(as(state, { type: "unreveal", index: 0 }, agenteA), state);
		assert.deepEqual(as(state, { type: "restart", seed: "X" }, jefeB).seats, state.seats);
		assert.equal(as(state, { type: "restart", seed: "X" }, agenteB), state);
	});
});

describe("destapar cartas", () => {
	it("acertar una carta propia conserva el turno", () => {
		const state = partida();
		const next = reveal(state, find(state, state.turn));
		assert.equal(next.turn, state.turn);
		assert.equal(next.winner, null);
	});

	it("una carta neutral cede el turno", () => {
		const state = partida();
		assert.equal(reveal(state, find(state, "neutral")).turn, other(state.turn));
	});

	it("una carta del rival cede el turno y le descuenta una carta", () => {
		const state = partida();
		const rival = other(state.turn);
		const antes = remainingFor(state.board, state.revealed, rival);
		const next = reveal(state, find(state, rival));
		assert.equal(next.turn, rival);
		assert.equal(remainingFor(next.board, next.revealed, rival), antes - 1);
	});

	it("el asesino da la victoria al otro equipo en el acto", () => {
		const state = partida();
		const next = reveal(state, find(state, "asesino"));
		assert.equal(next.winner, other(state.turn));
		assert.equal(next.endedBy, "asesino");
	});

	it("gana quien destapa todas sus cartas", () => {
		const game = partida("VICTORIA");
		const equipo = game.turn;
		let state = game;
		game.board.kinds.forEach((kind, index) => {
			if (kind === equipo) state = reveal(state, index);
		});
		assert.equal(state.winner, equipo);
		assert.equal(state.endedBy, "cartas");
		assert.equal(remainingFor(state.board, state.revealed, equipo), 0);
	});
});

describe("jugadas que no deben hacer nada", () => {
	const game = partida("BORDES");

	it("ignora índices fuera del tablero", () => {
		for (const index of [-1, CARD_COUNT, 99, 1.5, Number.NaN]) {
			assert.equal(reveal(game, index), game, `índice ${index}`);
		}
	});

	it("ignora destapar dos veces la misma carta", () => {
		const once = reveal(game, find(game, game.turn));
		assert.equal(reveal(once, find(game, game.turn)), once);
	});

	it("ignora jugadas con la partida terminada", () => {
		const acabada = reveal(game, find(game, "asesino"));
		assert.equal(as(acabada, { type: "reveal", index: find(game, "neutral") }, jefeB), acabada);
		assert.equal(as(acabada, { type: "endTurn" }, jefeB), acabada);
	});

	it("ignora volver a tapar una carta que no estaba destapada", () => {
		assert.equal(as(game, { type: "unreveal", index: 3 }, jefeA), game);
	});
});

describe("deshacer", () => {
	it("volver a tapar el asesino resucita la partida", () => {
		const game = partida("DESHACER");
		const index = find(game, "asesino");
		const perdida = reveal(game, index);
		const deshecha = as(perdida, { type: "unreveal", index }, jefeA);
		assert.equal(deshecha.winner, null);
		assert.equal(deshecha.endedBy, null);
		assert.equal(deshecha.revealed[index], false);
	});
});

describe("votos", () => {
	const game = partida("VOTOS");

	it("señalar una carta pone la ficha de quien vota", () => {
		assert.deepEqual(vote(game, 3).votes, { agenteA: 3 });
	});

	it("cada jugador tiene una sola ficha: votar otra carta la mueve", () => {
		assert.deepEqual(vote(vote(game, 3), 7).votes, { agenteA: 7 });
	});

	it("volver a señalar la misma carta retira la ficha", () => {
		assert.deepEqual(vote(vote(game, 3), 3).votes, {});
	});

	it("sólo señalan los agentes del equipo en turno", () => {
		assert.equal(vote(game, 3, agenteB), game);
		assert.equal(vote(game, 3, jefeA), game);
		const cambiado = as(game, { type: "endTurn" }, jefeA);
		assert.deepEqual(vote(cambiado, 3, agenteB).votes, { agenteB: 3 });
	});

	it("no se vota una carta ya destapada ni con la partida acabada", () => {
		const destapada = reveal(game, 3);
		assert.equal(vote(destapada, 3), destapada);
		const acabada = reveal(game, find(game, "asesino"));
		assert.equal(vote(acabada, 0), acabada);
	});

	it("destapar una carta propia retira sólo las fichas de esa carta", () => {
		const propia = find(game, game.turn);
		const otra = game.board.kinds.findIndex((k, i) => k === game.turn && i !== propia);
		const segundo = who("agenteA2");
		const sentado = as(game, { type: "sit", team: game.turn, role: "agente" }, segundo);
		const next = reveal(vote(vote(sentado, propia), otra, segundo), propia);
		assert.deepEqual(Object.keys(next.votes), ["agenteA2"]);
	});

	it("destapar una carta que cierra el turno retira todas las fichas", () => {
		const neutral = find(game, "neutral");
		assert.deepEqual(reveal(vote(game, neutral), neutral).votes, {});
	});

	it("pasar turno y repartir de nuevo limpian las fichas", () => {
		const state = vote(game, 3);
		assert.deepEqual(as(state, { type: "endTurn" }, jefeA).votes, {});
		assert.deepEqual(as(state, { type: "restart", seed: "X" }, jefeA).votes, {});
	});
});
