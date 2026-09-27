import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMOTES, parseEmote } from "./emote.ts";
import { parseClientMessage, parseServerMessage } from "./protocol.ts";
import { SLIME_GESTURES } from "./react/avatar/look.ts";

describe("mensajes que llegan por la red", () => {
	it("la despedida es un mensaje que el servidor entiende", () => {
		assert.deepEqual(parseClientMessage('{"type":"bye"}'), { type: "bye" });
		assert.equal(parseClientMessage('{"type":"adios"}'), null);
	});

	it("un gesto sólo vale si existe, y no se cuela nada más", () => {
		assert.deepEqual(parseClientMessage('{"type":"emote","emote":"baila","extra":1}'), {
			type: "emote",
			emote: "baila",
		});
		assert.equal(parseClientMessage('{"type":"emote","emote":"hackear"}'), null);
		assert.equal(parseClientMessage('{"type":"emote"}'), null);
	});

	it("el gesto que reenvía el servidor dice de quién es", () => {
		assert.deepEqual(parseServerMessage('{"type":"emote","playerId":"ana","emote":"saluda"}'), {
			type: "emote",
			playerId: "ana",
			emote: "saluda",
		});
		assert.equal(parseServerMessage('{"type":"emote","emote":"saluda"}'), null);
		assert.equal(parseServerMessage('{"type":"emote","playerId":"ana","emote":"x"}'), null);
	});
});

describe("gestos", () => {
	it("son los del slime, en su orden: el favorito de nadie cambia", () => {
		assert.equal(SLIME_GESTURES, EMOTES);
		assert.deepEqual(
			[...EMOTES],
			[
				"saluda",
				"salto",
				"aplasta",
				"flan",
				"estira",
				"rebota",
				"vuelta",
				"infla",
				"tiembla",
				"baila",
			],
		);
	});

	it("se reconocen por su nombre", () => {
		for (const emote of EMOTES) assert.equal(parseEmote(emote), emote);
		assert.equal(parseEmote("constructor"), null);
		assert.equal(parseEmote(3), null);
	});
});
