import {
	type Matrix4,
	Vector2,
	Vector3,
	Vector4,
	type WebGLProgramParametersWithUniforms,
} from "three";

/**
 * La gelatina: cómo se deforma el slime, punto a punto.
 *
 * Nada de escalar la malla entera: cada punto se mueve según su altura, y así
 * el slime se aplasta desparramándose por abajo, se estira como una gota, se
 * dobla como un flan con la cima dando latigazos, tiembla ovalándose, se le
 * ven ondas al caer y respira con una onda que le sube por el cuerpo. La
 * cuenta está dos veces, igual: en GLSL para la malla (y para su sombra) y en
 * TypeScript para colgar de la superficie deformada lo que no es gelatina (el
 * gorro, las gafas, el bracito, los ojos que mueven las pupilas).
 *
 * Todo en el espacio del slime del kit: el suelo en y = 0 y la cima en
 * `height`. Los números son proporciones, no metros.
 */
export interface JellyShape {
	/** Aplastado (> 0) o estirado (< 0), abajo y arriba: la cima va con retraso. */
	squashBottom: number;
	squashTop: number;
	/** Gota: > 0 ancho arriba y estrecho abajo (subiendo), < 0 al revés (cayendo). */
	taper: number;
	/** Inclinado como un flan (hacia +x su izquierda, +z delante), y el latigazo de la cima. */
	leanX: number;
	leanZ: number;
	whipX: number;
	whipZ: number;
	/** La cima girada respecto a la base, en radianes. */
	twist: number;
	/**
	 * Óvalo que tiembla: se estira en una dirección y se encoge en la otra.
	 * Va en dos componentes (A·cos 2φ, A·sin 2φ) para que cada golpe se sume
	 * al temblor que ya hay, venga de donde venga.
	 */
	ovalCos: number;
	ovalSin: number;
	/** Ondas que suben por la superficie al caer, y la respiración, más lenta. */
	ripple: number;
	ripplePhase: number;
	breath: number;
	breathPhase: number;
	inflate: number;
	/** Derretido en un charco: 0 entero, 1 plano. */
	melt: number;
}

export const JELLY_REST: JellyShape = {
	squashBottom: 0,
	squashTop: 0,
	taper: 0,
	leanX: 0,
	leanZ: 0,
	whipX: 0,
	whipZ: 0,
	twist: 0,
	ovalCos: 0,
	ovalSin: 0,
	ripple: 0,
	ripplePhase: 0,
	breath: 0,
	breathPhase: 0,
	inflate: 0,
	melt: 0,
};

const GLSL = /* glsl */ `
uniform vec4 uJellySquash;
uniform vec4 uJellyLean;
uniform vec4 uJellyWobble;
uniform vec4 uJellyRipple;
uniform vec2 uJellyShape;

vec3 jelly(vec3 p) {
	float height = uJellySquash.w;
	float h = clamp(p.y / height, 0.0, 1.0);
	vec2 q = p.xz;

	float turn = uJellyWobble.z * h * h;
	float c = cos(turn);
	float s = sin(turn);
	q = vec2(c * q.x + s * q.y, c * q.y - s * q.x);

	vec2 oval = uJellyWobble.xy * (0.35 + 0.65 * h);
	q = vec2((1.0 + oval.x) * q.x + oval.y * q.y, oval.y * q.x + (1.0 - oval.x) * q.y);

	float squash = mix(uJellySquash.x, uJellySquash.y, h);
	float wide = pow(max(1.0 - squash, 0.25), -mix(0.62, 0.3, h));
	wide *= max(1.0 + uJellySquash.z * (h - 0.4) * 1.5, 0.3);
	wide *= 1.0 + uJellyShape.x * (0.1 + 0.3 * smoothstep(0.1, 0.7, h));
	wide *= 1.0 + uJellyRipple.x * sin(h * 10.0 - uJellyRipple.y) * (0.3 + 0.7 * h);
	wide *= 1.0 + uJellyRipple.z * sin(h * 3.5 - uJellyRipple.w);
	wide *= 1.0 + uJellyShape.y * 0.7 * (1.0 - h);
	q *= wide;

	float y = height * (h - uJellySquash.x * h - (uJellySquash.y - uJellySquash.x) * h * h * 0.5);
	y *= (1.0 - 0.85 * uJellyShape.y) * (1.0 + 0.12 * uJellyShape.x * h);

	vec2 bend = uJellyLean.xy * h * h + uJellyLean.zw * h * h * h;
	q += bend * height;
	y -= 0.4 * height * dot(bend, bend);

	return vec3(q.x, y, q.y);
}

vec3 jellyNormal(vec3 p, vec3 n) {
	vec3 t = abs(n.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), n));
	vec3 b = cross(n, t);
	vec3 o = jelly(p);
	vec3 m = cross(jelly(p + t * 0.01) - o, jelly(p + b * 0.01) - o);
	float l = length(m);
	if (l < 1e-8) return n;
	m /= l;
	return dot(m, n) < 0.0 ? -m : m;
}
`;

const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

const A = new Vector3();
const B = new Vector3();
const X = new Vector3();
const Y = new Vector3();
const Z = new Vector3();

export class Jelly {
	readonly uniforms = {
		uJellySquash: { value: new Vector4() },
		uJellyLean: { value: new Vector4() },
		uJellyWobble: { value: new Vector4() },
		uJellyRipple: { value: new Vector4() },
		uJellyShape: { value: new Vector2() },
	};
	#shape: JellyShape = { ...JELLY_REST };
	#height: number;

	constructor(height: number) {
		this.#height = height;
		this.set(JELLY_REST);
	}

	set(shape: JellyShape): void {
		this.#shape = { ...shape };
		const u = this.uniforms;
		u.uJellySquash.value.set(shape.squashBottom, shape.squashTop, shape.taper, this.#height);
		u.uJellyLean.value.set(shape.leanX, shape.leanZ, shape.whipX, shape.whipZ);
		u.uJellyWobble.value.set(shape.ovalCos, shape.ovalSin, shape.twist, 0);
		u.uJellyRipple.value.set(shape.ripple, shape.ripplePhase, shape.breath, shape.breathPhase);
		u.uJellyShape.value.set(shape.inflate, shape.melt);
	}

	/** Dónde queda el punto `p` del slime en reposo. La misma cuenta que el sombreador. */
	deform(p: Vector3, out: Vector3): Vector3 {
		const j = this.#shape;
		const height = this.#height;
		const h = Math.min(1, Math.max(0, p.y / height));
		let qx = p.x;
		let qz = p.z;

		const turn = j.twist * h * h;
		const c = Math.cos(turn);
		const s = Math.sin(turn);
		[qx, qz] = [c * qx + s * qz, c * qz - s * qx];

		const oa = j.ovalCos * (0.35 + 0.65 * h);
		const ob = j.ovalSin * (0.35 + 0.65 * h);
		[qx, qz] = [(1 + oa) * qx + ob * qz, ob * qx + (1 - oa) * qz];

		const squash = j.squashBottom + (j.squashTop - j.squashBottom) * h;
		let wide = Math.max(1 - squash, 0.25) ** -(0.62 + (0.3 - 0.62) * h);
		wide *= Math.max(1 + j.taper * (h - 0.4) * 1.5, 0.3);
		wide *= 1 + j.inflate * (0.1 + 0.3 * smoothstep(0.1, 0.7, h));
		wide *= 1 + j.ripple * Math.sin(h * 10 - j.ripplePhase) * (0.3 + 0.7 * h);
		wide *= 1 + j.breath * Math.sin(h * 3.5 - j.breathPhase);
		wide *= 1 + j.melt * 0.7 * (1 - h);
		qx *= wide;
		qz *= wide;

		let y = height * (h - j.squashBottom * h - (j.squashTop - j.squashBottom) * h * h * 0.5);
		y *= (1 - 0.85 * j.melt) * (1 + 0.12 * j.inflate * h);

		const bx = j.leanX * h * h + j.whipX * h * h * h;
		const bz = j.leanZ * h * h + j.whipZ * h * h * h;
		qx += bx * height;
		qz += bz * height;
		y -= 0.4 * height * (bx * bx + bz * bz);

		return out.set(qx, y, qz);
	}

	/**
	 * La deformación alrededor de `point`, como una transformación: lo que se
	 * cuelga de ella (colocado en reposo) se aplasta, se estira, se inclina y
	 * gira con la gelatina de ese sitio.
	 */
	anchor(point: Vector3, out: Matrix4): Matrix4 {
		const e = 0.02;
		const o = this.deform(point, A);
		const x = this.deform(B.copy(point).setX(point.x + e), X)
			.sub(o)
			.divideScalar(e);
		const y = this.deform(B.copy(point).setY(point.y + e), Y)
			.sub(o)
			.divideScalar(e);
		const z = this.deform(B.copy(point).setZ(point.z + e), Z)
			.sub(o)
			.divideScalar(e);
		const { x: px, y: py, z: pz } = point;
		return out.set(
			x.x,
			y.x,
			z.x,
			o.x - (x.x * px + y.x * py + z.x * pz),
			x.y,
			y.y,
			z.y,
			o.y - (x.y * px + y.y * py + z.y * pz),
			x.z,
			y.z,
			z.z,
			o.z - (x.z * px + y.z * py + z.z * pz),
			0,
			0,
			0,
			1,
		);
	}

	/** Mete la deformación en un sombreador: el de la malla o el de su sombra. */
	patch(shader: WebGLProgramParametersWithUniforms): void {
		Object.assign(shader.uniforms, this.uniforms);
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", `#include <common>\n${GLSL}`)
			.replace(
				"#include <beginnormal_vertex>",
				"#include <beginnormal_vertex>\n\tobjectNormal = jellyNormal(position, objectNormal);",
			)
			.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\n\ttransformed = jelly(position);",
			);
	}
}
