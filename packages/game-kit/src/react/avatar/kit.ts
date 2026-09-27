// Los juegos también compilan este fichero (lo importan a través del kit) y sin
// esta referencia no verían la declaración de los `?url`.
/// <reference path="./assets.d.ts" />
import { Mesh, type Object3D, Vector3 } from "three";
import dracoWasm from "three/addons/libs/draco/gltf/draco_decoder.wasm?url";
import dracoWrapper from "three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import kitUrl from "./munecos.glb?url";

/**
 * El kit de los slimes: las piezas que salen de Blender (`blender/munecos.py`).
 *
 * Es un GLB con la gelatina, la cabeza de referencia, los pelos, los gorros y
 * las gafas, comprimido con Draco. Se descarga una vez, cuando hace falta el
 * primer slime, y de ahí cada uno clona lo que le toque. Todos tienen la misma
 * forma, así que pelos y gorros se ponen tal cual salen de Blender.
 */

export interface Kit {
	/**
	 * La cabeza de referencia ("craneo"), para la que están hechos los pelos, los
	 * gorros y las gafas. Nadie la lleva: la del slime es ésta a otra escala.
	 */
	head: HeadForm;
	slime: SlimeKit;
	piece(name: string): Piece | undefined;
}

/**
 * El slime: su malla, sin huesos (la deforma `jelly.ts`), y la forma de su
 * parte de arriba, que es la cabeza de referencia a `scale`: a esa escala le
 * valen los mismos gorros, pelos y caras.
 */
export interface SlimeKit {
	mesh: Mesh;
	form: HeadForm;
	scale: number;
}

export interface Piece {
	name: string;
	template: Object3D;
	/** Hasta dónde baja por la frente, en cabeceo: los ojos tienen que quedar debajo. */
	front: number | null;
	/** Eje de lo que gira (la hélice), en el espacio de la cabeza. */
	axis: Vector3 | null;
	/** Flota sobre la cabeza (la aureola). */
	floats: boolean;
}

/** De Blender (Z arriba, mirando a -Y) a three.js (Y arriba, mirando a +Z). */
function fromBlender(values: unknown): Vector3 {
	const [x = 0, y = 0, z = 0] = Array.isArray(values) ? (values as number[]) : [];
	return new Vector3(x, z, -y);
}

/** Guiñada 0 es de frente (+Z) y positiva hacia la izquierda de la cabeza (+X); el cabeceo sube. */
function direction(yaw: number, pitch: number, out = new Vector3()): Vector3 {
	return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

const MAP_YAW = 36;
const MAP_PITCH = 19;

/**
 * La cabeza: su centro (sobre el cuello), cuánto mide la cara pintada y su
 * radio en cada dirección, para saber dónde cae cada rasgo.
 */
export class HeadForm {
	readonly mesh: Mesh;
	readonly center: Vector3;
	/** Media anchura del cuadrado de la cara: la textura va de -span a span. */
	readonly span: number;
	#map: Float32Array;

	constructor(mesh: Mesh) {
		this.mesh = mesh;
		const data = mesh.userData as Record<string, unknown>;
		this.center = fromBlender(data.centro);
		this.span = Number(data.cara);
		this.#map = Float32Array.from(data.mapa as number[]);
	}

	/** Del centro a la piel en la dirección `d` (unitaria). */
	radius(d: Vector3): number {
		const yaw = Math.atan2(d.x, d.z);
		const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
		const fi = ((yaw + Math.PI) / (2 * Math.PI)) * MAP_YAW;
		const fj = Math.max(
			0,
			Math.min(MAP_PITCH - 1.0001, ((pitch + Math.PI / 2) / Math.PI) * (MAP_PITCH - 1)),
		);
		const i0 = Math.floor(fi);
		const j0 = Math.floor(fj);
		const u = fi - i0;
		const v = fj - j0;
		const at = (i: number, j: number) =>
			this.#map[j * MAP_YAW + (((i % MAP_YAW) + MAP_YAW) % MAP_YAW)] ?? 0;
		const bottom = at(i0, j0) * (1 - u) + at(i0 + 1, j0) * u;
		const top = at(i0, j0 + 1) * (1 - u) + at(i0 + 1, j0 + 1) * u;
		return bottom * (1 - v) + top * v;
	}

	/** Un punto a `lift` de la piel, en el espacio del cuello. */
	point(yaw: number, pitch: number, lift = 0, out = new Vector3()): Vector3 {
		direction(yaw, pitch, out);
		return out.multiplyScalar(this.radius(out) + lift).add(this.center);
	}

	/** La normal de la piel en esa dirección. */
	normal(yaw: number, pitch: number, out = new Vector3()): Vector3 {
		const e = 0.01;
		const p = this.point(yaw, pitch);
		const a = this.point(yaw + e, pitch).sub(p);
		const b = this.point(yaw, pitch + e).sub(p);
		out.crossVectors(a, b).normalize();
		// Cerca de los polos la guiñada no mueve el punto: vale la dirección.
		return Number.isFinite(out.x) && out.lengthSq() > 0.5 ? out : direction(yaw, pitch, out);
	}

	/** Donde cae en la textura de la cara un punto de la piel: de 0 a 1, con la v hacia arriba. */
	uv(point: Vector3): { u: number; v: number } {
		return {
			u: 0.5 + point.x / (2 * this.span),
			v: 0.5 + (point.y - this.center.y) / (2 * this.span),
		};
	}
}

let pending: Promise<Kit> | undefined;
let ready: Kit | undefined;

/** El kit si ya está cargado. */
export function loadedKit(): Kit | undefined {
	return ready;
}

/** Descarga el kit (una sola vez). Si falla, el siguiente intento vuelve a probar. */
export function loadKit(): Promise<Kit> {
	if (!pending) {
		pending = (async () => {
			const draco = new DRACOLoader().setDecoderPath({ js: dracoWrapper, wasm: dracoWasm });
			const loader = new GLTFLoader().setDRACOLoader(draco);
			try {
				const gltf = await loader.loadAsync(kitUrl);
				ready = indexKit(gltf.scene);
				return ready;
			} finally {
				draco.dispose();
			}
		})();
		pending.catch(() => {
			pending = undefined;
		});
	}
	return pending;
}

function indexKit(scene: Object3D): Kit {
	const named = new Map<string, Object3D>();
	scene.traverse((object) => {
		const name = object.userData.name;
		if (typeof name === "string" && !named.has(name)) named.set(name, object);
	});
	const skull = named.get("craneo");
	const slime = named.get("baba");
	if (!(skull instanceof Mesh) || !(slime instanceof Mesh)) {
		throw new Error("Al kit le faltan piezas");
	}

	const pieces = new Map<string, Piece>();
	for (const [name, object] of named) {
		if (!/^(pelo|gorro|cara)\./.test(name) || object.parent !== scene) continue;
		const data = object.userData as Record<string, unknown>;
		pieces.set(name, {
			name,
			template: object,
			front: typeof data.frente === "number" ? data.frente : null,
			axis: data.eje ? fromBlender(data.eje) : null,
			floats: data.flota === true || data.flota === 1,
		});
	}

	return {
		head: new HeadForm(skull),
		slime: {
			mesh: slime,
			form: new HeadForm(slime),
			scale: Number(slime.userData.escala),
		},
		piece: (name) => pieces.get(name),
	};
}
