import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	avatarLook,
	EYES,
	GESTURES,
	HAIR_STYLES,
	HATS,
	hidesHair,
	MASCOT_SKIN,
	MOUTHS,
	slimeColor,
	TOPS,
} from "./look.ts";

/** Semillas fijas: con listas de veinte cosas, una tirada al azar fallaría de vez en cuando. */
const many = Array.from({ length: 800 }, (_, i) => avatarLook(`variedad-${i}`));

describe("aspecto del avatar", () => {
	it("la misma semilla da el mismo muñeco en cualquier móvil", () => {
		assert.deepEqual(avatarLook("K7QM2ABC"), avatarLook("K7QM2ABC"));
	});

	it("semillas distintas dan muñecos distintos", () => {
		const looks = many.slice(0, 40).map((look) => JSON.stringify(look));
		assert.equal(new Set(looks).size, looks.length);
	});

	it("vale cualquier cadena, también las semillas de antes de los muñecos 3D", () => {
		// Los perfiles guardados traen semillas de ocho caracteres del alfabeto de
		// los códigos; los tests de los juegos usan cadenas cualquiera.
		for (const seed of ["K7QM2ABC", "cara-p1", "x", "ñandú 🦤"]) {
			const look = avatarLook(seed);
			assert.ok(HAIR_STYLES.includes(look.hair));
			assert.ok(TOPS.includes(look.top));
			assert.ok(look.hat === null || HATS.includes(look.hat));
			assert.ok(GESTURES.includes(look.favorite));
			assert.match(look.skin, /^#[0-9a-f]{6}$/);
			assert.ok(look.eyeSize >= 0.1 && look.eyeSize <= 0.16);
			assert.ok(look.pupil > 0 && look.pupil < 1);
		}
	});

	it("reparte de todo: tirar la semilla unas cuantas veces enseña variedad", () => {
		const seen = <T>(pick: (look: (typeof many)[number]) => T) => new Set(many.map(pick));
		assert.equal(seen((look) => look.hair).size, HAIR_STYLES.length, "algún peinado no sale nunca");
		assert.equal(seen((look) => look.hat).size, HATS.length + 1, "algún gorro no sale nunca");
		assert.equal(seen((look) => look.eyes).size, EYES.length, "algunos ojos no salen nunca");
		assert.equal(seen((look) => look.mouth).size, MOUTHS.length, "alguna boca no sale nunca");
		const bareheaded = many.filter((look) => look.hat === null).length / many.length;
		assert.ok(bareheaded > 0.4 && bareheaded < 0.6, `${bareheaded} sin gorro`);
		// Los ojos saltones son la seña de la casa: tienen que ser los más vistos.
		const googly = many.filter((look) => look.eyes === "saltones").length / many.length;
		assert.ok(googly > 0.35, `${googly} con ojos saltones`);
	});

	it("no repite color entre la prenda y su detalle", () => {
		for (const look of many) assert.notEqual(look.topAccent, look.topColor);
	});

	it("los slimes son siempre de un color de mascota, y no todos del mismo", () => {
		const colors = new Set(many.map(slimeColor));
		for (const color of colors) assert.ok((MASCOT_SKIN as readonly string[]).includes(color));
		assert.equal(colors.size, MASCOT_SKIN.length);
	});

	it("los adornos dejan ver el pelo; los gorros no", () => {
		assert.equal(hidesHair(null), false);
		assert.equal(hidesHair("corona"), false);
		assert.equal(hidesHair("gorra"), true);
		assert.equal(hidesHair("cangrejo"), true);
	});
});
