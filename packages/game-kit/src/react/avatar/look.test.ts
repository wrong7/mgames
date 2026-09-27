import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	avatarLook,
	EYES,
	HAIR_STYLES,
	HATS,
	hidesHair,
	MASCOT_SKIN,
	MOUTHS,
	SLIME_GESTURES,
} from "./look.ts";

/** Semillas fijas: con listas de veinte cosas, una tirada al azar fallaría de vez en cuando. */
const many = Array.from({ length: 800 }, (_, i) => avatarLook(`variedad-${i}`));

describe("aspecto del avatar", () => {
	it("la misma semilla da el mismo slime en cualquier móvil", () => {
		assert.deepEqual(avatarLook("K7QM2ABC"), avatarLook("K7QM2ABC"));
	});

	it("semillas distintas dan slimes distintos", () => {
		const looks = many.slice(0, 40).map((look) => JSON.stringify(look));
		assert.equal(new Set(looks).size, looks.length);
	});

	it("vale cualquier cadena, también las semillas de antes de los muñecos 3D", () => {
		// Los perfiles guardados traen semillas de ocho caracteres del alfabeto de
		// los códigos; los tests de los juegos usan cadenas cualquiera.
		for (const seed of ["K7QM2ABC", "cara-p1", "x", "ñandú 🦤"]) {
			const look = avatarLook(seed);
			assert.ok(HAIR_STYLES.includes(look.hair));
			assert.ok(look.hat === null || HATS.includes(look.hat));
			assert.ok(SLIME_GESTURES.includes(look.favorite));
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

	it("a nadie le cambia el slime: las tiradas de cuando eran muñecos se siguen haciendo", () => {
		// Valores de antes de quitar los muñecos. Si esto falla, se ha cambiado el
		// orden o las listas de las tiradas, y con ello la cara de todo el mundo.
		const pick = (seed: string) => {
			const { skin, hair, hat, hatColor, hatAccent, eyes, mouth, backdrop } = avatarLook(seed);
			return { skin, hair, hat, hatColor, hatAccent, eyes, mouth, backdrop };
		};
		assert.deepEqual(pick("K7QM2ABC"), {
			skin: "#ff6b5b",
			hair: "moño",
			hat: null,
			hatColor: "#8d99ae",
			hatAccent: "#f4f1ea",
			eyes: "vagos",
			mouth: "boquiabierta",
			backdrop: "#fdffb6",
		});
		assert.deepEqual(pick("cara-p1"), {
			skin: "#ffd23f",
			hair: "rizos",
			hat: null,
			hatColor: "#2b2d42",
			hatAccent: "#e84a5f",
			eyes: "redondos",
			mouth: "lengua",
			backdrop: "#ffc6ff",
		});
		assert.deepEqual(pick("3ZUQW5BZ"), {
			skin: "#b388eb",
			hair: "pinchos",
			hat: "pescador",
			hatColor: "#ff8c42",
			hatAccent: "#2b2d42",
			eyes: "saltones",
			mouth: "sonrisa",
			backdrop: "#9bf6ff",
		});
	});

	it("el segundo color del gorro no es el del gorro, salvo en los gorros crema", () => {
		// Si coincidían, el segundo pasa a crema; en un gorro crema, coincide igual.
		for (const look of many) {
			if (look.hatColor !== "#f4f1ea") assert.notEqual(look.hatAccent, look.hatColor);
		}
	});

	it("los slimes son siempre de un color de mascota, y no todos del mismo", () => {
		const colors = new Set(many.map((look) => look.skin));
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
