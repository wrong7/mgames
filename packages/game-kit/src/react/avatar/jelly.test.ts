import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Matrix4, Vector3 } from "three";
import { JELLY_REST, Jelly } from "./jelly.ts";

const HEIGHT = 1.06;

const points = [
	new Vector3(0, 0, 0.3),
	new Vector3(0.4, 0.3, 0),
	new Vector3(-0.2, 0.7, 0.3),
	new Vector3(0, HEIGHT, 0),
];

const close = (a: Vector3, b: Vector3, message?: string) =>
	assert.ok(a.distanceTo(b) < 1e-6, `${message ?? ""} ${a.toArray()} ≠ ${b.toArray()}`);

describe("gelatina del slime", () => {
	it("en reposo no mueve nada, y sus anclas tampoco", () => {
		const jelly = new Jelly(HEIGHT);
		for (const p of points) close(jelly.deform(p, new Vector3()), p);
		const anchor = jelly.anchor(new Vector3(0, 0.9, 0), new Matrix4()).elements;
		const identity = new Matrix4().elements;
		assert.ok(anchor.every((value, i) => Math.abs(value - (identity[i] ?? 0)) < 1e-6));
	});

	it("aplastada no se despega del suelo, baja la cima y se ensancha más por abajo", () => {
		const jelly = new Jelly(HEIGHT);
		jelly.set({ ...JELLY_REST, squashBottom: 0.4, squashTop: 0.3 });
		const base = jelly.deform(new Vector3(0.3, 0, 0), new Vector3());
		assert.equal(base.y, 0);
		const top = jelly.deform(new Vector3(0, HEIGHT, 0), new Vector3());
		assert.ok(top.y < HEIGHT * 0.75, `la cima está en ${top.y}`);
		const low = jelly.deform(new Vector3(0.3, 0.1, 0), new Vector3()).x / 0.3;
		const high = jelly.deform(new Vector3(0.3, 0.9, 0), new Vector3()).x / 0.3;
		assert.ok(low > high && high > 1, `abajo ${low}, arriba ${high}`);
	});

	it("lo que cuelga de un ancla cae donde la gelatina deformada", () => {
		const jelly = new Jelly(HEIGHT);
		jelly.set({
			...JELLY_REST,
			squashBottom: 0.2,
			squashTop: -0.1,
			taper: 0.1,
			leanX: 0.15,
			whipZ: -0.1,
			twist: 0.4,
			ovalCos: 0.08,
			ovalSin: -0.05,
			ripple: 0.03,
			ripplePhase: 1.3,
		});
		const at = new Vector3(0, 0.8, 0.35);
		const anchor = jelly.anchor(at, new Matrix4());
		close(at.clone().applyMatrix4(anchor), jelly.deform(at, new Vector3()));
		// Y cerca del ancla, casi: es la deformación de ese sitio.
		const near = at.clone().add(new Vector3(0.01, 0.01, -0.01));
		assert.ok(
			near.clone().applyMatrix4(anchor).distanceTo(jelly.deform(near, new Vector3())) < 1e-3,
		);
	});
});
