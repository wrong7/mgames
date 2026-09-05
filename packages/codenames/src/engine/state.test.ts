import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBoard, CARD_COUNT, remainingFor } from "./board.ts";
import { applyAction, createGame } from "./state.ts";
import type { CardKind, GameState, Team } from "./types.ts";
import { WORDS } from "./words.ts";

/** Índice de la primera carta de un tipo dado. */
const find = (state: GameState, kind: CardKind) => state.board.kinds.indexOf(kind);

const other = (team: Team): Team => (team === "azul" ? "rojo" : "azul");

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

describe("destapar cartas", () => {
	it("acertar una carta propia conserva el turno", () => {
		const game = createGame("TURNOS");
		const next = applyAction(game, { type: "reveal", index: find(game, game.turn) });
		assert.equal(next.turn, game.turn);
		assert.equal(next.winner, null);
	});

	it("una carta neutral cede el turno", () => {
		const game = createGame("TURNOS");
		const next = applyAction(game, { type: "reveal", index: find(game, "neutral") });
		assert.equal(next.turn, other(game.turn));
	});

	it("una carta del rival cede el turno y le descuenta una carta", () => {
		const game = createGame("TURNOS");
		const rival = other(game.turn);
		const antes = remainingFor(game.board, game.revealed, rival);
		const next = applyAction(game, { type: "reveal", index: find(game, rival) });
		assert.equal(next.turn, rival);
		assert.equal(remainingFor(next.board, next.revealed, rival), antes - 1);
	});

	it("el asesino da la victoria al otro equipo en el acto", () => {
		const game = createGame("TURNOS");
		const next = applyAction(game, { type: "reveal", index: find(game, "asesino") });
		assert.equal(next.winner, other(game.turn));
		assert.equal(next.endedBy, "asesino");
	});

	it("gana quien destapa todas sus cartas", () => {
		const game = createGame("VICTORIA");
		const equipo = game.turn;
		let state = game;
		game.board.kinds.forEach((kind, index) => {
			if (kind === equipo) state = applyAction(state, { type: "reveal", index });
		});
		assert.equal(state.winner, equipo);
		assert.equal(state.endedBy, "cartas");
		assert.equal(remainingFor(state.board, state.revealed, equipo), 0);
	});
});

describe("jugadas que no deben hacer nada", () => {
	const game = createGame("BORDES");

	it("ignora índices fuera del tablero", () => {
		for (const index of [-1, CARD_COUNT, 99, 1.5, Number.NaN]) {
			assert.equal(applyAction(game, { type: "reveal", index }), game, `índice ${index}`);
		}
	});

	it("ignora destapar dos veces la misma carta", () => {
		const once = applyAction(game, { type: "reveal", index: 0 });
		assert.equal(applyAction(once, { type: "reveal", index: 0 }), once);
	});

	it("ignora jugadas con la partida terminada", () => {
		const acabada = applyAction(game, { type: "reveal", index: find(game, "asesino") });
		assert.equal(applyAction(acabada, { type: "reveal", index: find(game, "neutral") }), acabada);
	});

	it("ignora volver a tapar una carta que no estaba destapada", () => {
		assert.equal(applyAction(game, { type: "unreveal", index: 3 }), game);
	});
});

describe("deshacer", () => {
	it("volver a tapar el asesino resucita la partida", () => {
		const game = createGame("DESHACER");
		const index = find(game, "asesino");
		const perdida = applyAction(game, { type: "reveal", index });
		const deshecha = applyAction(perdida, { type: "unreveal", index });
		assert.equal(deshecha.winner, null);
		assert.equal(deshecha.endedBy, null);
		assert.equal(deshecha.revealed[index], false);
	});
});

describe("turno y reparto", () => {
	it("pasar turno alterna de equipo", () => {
		const game = createGame("PASAR");
		assert.equal(applyAction(game, { type: "endTurn" }).turn, other(game.turn));
	});

	it("no se puede pasar turno con la partida acabada", () => {
		const game = createGame("PASAR");
		const acabada = applyAction(game, { type: "reveal", index: find(game, "asesino") });
		assert.equal(applyAction(acabada, { type: "endTurn" }), acabada);
	});

	it("repartir de nuevo deja el tablero limpio", () => {
		const game = createGame("REPARTO");
		const jugada = applyAction(game, { type: "reveal", index: 0 });
		const nueva = applyAction(jugada, { type: "restart", seed: "OTRA" });
		assert.ok(nueva.revealed.every((r) => r === false));
		assert.equal(nueva.winner, null);
		assert.notDeepEqual(nueva.board.words, game.board.words);
		assert.equal(nueva.turn, nueva.board.startingTeam);
	});
});
