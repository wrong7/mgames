import {
	Color,
	type Material,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	type Texture,
	Vector3,
} from "three";
import type { EyeSpot, FacePlan } from "./face.ts";
import type { HeadForm, Kit, Piece } from "./kit.ts";
import { type AvatarLook, hidesHair } from "./look.ts";
import { fixedMaterial, velvet } from "./materials.ts";

/**
 * Lo que un slime lleva en la cabeza, a partir de su aspecto (`look.ts`) y de
 * las piezas del kit de Blender (`kit.ts`): dónde van los ojos, la nariz y la
 * boca dibujados (`face.ts`), el pelo y el gorro echados hacia atrás lo justo
 * para no taparlos, las gafas o el monóculo donde caigan los ojos, y los
 * colores de todo ello. Lo monta `slime.ts`.
 *
 * Las piezas del kit están hechas para la cabeza de referencia (`kit.head`, el
 * "craneo"): la del slime es esa misma a otra escala. Mira hacia +Z.
 */

const Z_AXIS = new Vector3(0, 0, 1);

/** Dónde van los ojos y la boca, en cabeceo desde el centro de la cabeza. */
const FACE_LAYOUT = { eyes: 0.1, mouth: -0.4 };

/** Radio de cada nariz dibujada, para una cabeza como la de referencia. */
const NOSES: Record<AvatarLook["nose"], number> = {
	ninguna: 0,
	bolita: 0.036,
	narizota: 0.042,
	payaso: 0.046,
};

/** Cuánto del tamaño de ojo del aspecto se lleva cada estilo, y qué parte es pupila. */
const EYE_STYLES: Record<
	AvatarLook["eyes"],
	{ size: number; pupil: (look: AvatarLook) => number }
> = {
	saltones: { size: 1, pupil: (look) => look.pupil },
	redondos: { size: 0.72, pupil: (look) => 0.5 + look.pupil * 0.2 },
	vagos: { size: 0.72, pupil: (look) => 0.5 + look.pupil * 0.2 },
	brillantes: { size: 0.78, pupil: () => 0.78 },
	puntos: { size: 0.6, pupil: () => 0 },
	felices: { size: 0.62, pupil: () => 0 },
};

export interface Pupil {
	/** Suelta, como en los ojos saltones: se bambolea y la gravedad tira de ella. */
	loose: boolean;
}

export interface BuildOptions {
	/** Lado del lienzo de la cara, en píxeles: más grande para el perfil. */
	faceSize?: number;
}

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------

/**
 * Los materiales de un slime, por el nombre que traen las piezas del kit:
 * "pelo" es el color de pelo que le tocó, "gorro" el del gorro, "fijo.oro" el
 * oro de todas las coronas.
 */
export class Palette {
	#look: AvatarLook;
	#owned: (Material | Texture)[];
	#made = new Map<string, Material>();

	constructor(look: AvatarLook, owned: (Material | Texture)[]) {
		this.#look = look;
		this.#owned = owned;
	}

	for(source: Material | Material[]): Material {
		const material = Array.isArray(source) ? source[0] : source;
		if (!material) return this.#make("gorro");
		if (material.name.startsWith("fijo.") && material instanceof MeshStandardMaterial) {
			return fixedMaterial(material);
		}
		return this.#make(material.name);
	}

	/** Un material propio de este slime (se tira con él). */
	#own<T extends Material>(key: string, make: () => T): T {
		const cached = this.#made.get(key);
		if (cached) return cached as T;
		const material = make();
		this.#made.set(key, material);
		this.#owned.push(material);
		return material;
	}

	#make(name: string): Material {
		const look = this.#look;
		switch (name) {
			case "pelo":
			case "pelo.negro":
				return this.#own("pelo", () => velvet(look.hairColor));
			case "pelo.rapado":
				return this.#own("rapado", () =>
					velvet(new Color(look.hairColor).lerp(new Color(look.skin), 0.35)),
				);
			case "gorro.2":
				return this.#own("gorro.2", () => velvet(look.hatAccent));
			default:
				// "gorro", y cualquier otro que no sea un color fijo del kit.
				return this.#own("gorro", () => velvet(look.hatColor));
		}
	}
}

/** Pinta una pieza con los materiales de su slime y le pone sombras. */
export function dress(object: Object3D, palette: Palette): void {
	object.traverse((child) => {
		if (!(child instanceof Mesh)) return;
		child.material = palette.for(child.material);
		child.castShadow = true;
		child.receiveShadow = true;
	});
}

// ---------------------------------------------------------------------------
// La cara
// ---------------------------------------------------------------------------

export interface FaceLayout {
	/** Los ojos: guiñada, cabeceo y radio. El primero es el derecho del slime (-X). */
	eyes: { yaw: number; pitch: number; r: number }[];
	mouth: number;
	nose: number;
	/** Pelo y gorro, con cuánto hay que echarlos hacia atrás. */
	pieces: { piece: Piece; tilt: number }[];
	plan(size: number): FacePlan;
}

/**
 * Dónde va cada cosa en la cara. Los ojos mandan: si el pelo o el gorro bajan
 * tanto que los taparían, primero se echan hacia atrás (un gorro calado hacia
 * la nuca tiene su gracia) y, si no basta, la cara entera baja un poco.
 */
export function planFace(look: AvatarLook, kit: Kit, form: HeadForm): FaceLayout {
	const front = form.radius(Z_AXIS);
	// Las medidas de la cara están pensadas para una cabeza de 0.44 de fondo.
	const headScale = front / 0.44;
	const style = EYE_STYLES[look.eyes];
	const size = look.eyeSize * style.size * headScale;
	const pupil = style.pupil(look);
	const skew = look.eyeSkew;
	const radii = [size * (1 + skew / 2), size * (1 - skew / 2)] as const;
	// Juntos pero sin meterse uno en otro.
	const touching = Math.asin(Math.min(0.9, ((radii[0] + radii[1]) * 1.08) / (2 * front)));
	const yaw = Math.max(touching, 0.26 * look.eyeGap);
	const angular = Math.max(...radii) / front;

	const hairPiece =
		look.hair !== "calvo" && !(look.hat && hidesHair(look.hat))
			? kit.piece(`pelo.${look.hair}`)
			: undefined;
	const hatPiece = look.hat ? kit.piece(`gorro.${look.hat}`) : undefined;
	// Lo que tiene que quedar a la vista: el ojo entero y, encima, las cejas.
	const brows = look.brows !== "ninguna";
	const visible = FACE_LAYOUT.eyes + angular + (brows ? 0.14 : 0.05);
	const pieces: FaceLayout["pieces"] = [];
	let limit = Math.PI / 2;
	for (const piece of [hairPiece, hatPiece]) {
		if (!piece) continue;
		const reach = piece.front ?? Math.PI / 2;
		const tilt = Math.min(0.24, Math.max(0, visible - reach));
		limit = Math.min(limit, reach + tilt);
		pieces.push({ piece, tilt });
	}
	const drop = Math.max(0, visible - limit);
	const eyes = FACE_LAYOUT.eyes - drop;
	let mouth = Math.min(FACE_LAYOUT.mouth - drop * 0.5, eyes - angular - 0.2);
	const nose = (eyes - angular * 0.8 + mouth) / 2 + 0.02;
	// Una narizota no puede tapar la boca: la boca baja lo que haga falta.
	const noseSize = NOSES[look.nose] * headScale;
	if (noseSize > 0) mouth = Math.min(mouth, nose - (noseSize * 1.6) / front - 0.06);

	return {
		eyes: [
			{ yaw: -yaw, pitch: eyes, r: radii[0] },
			{ yaw, pitch: eyes, r: radii[1] },
		],
		mouth,
		nose,
		pieces,
		plan(canvas) {
			const scale = canvas / (2 * form.span);
			const px = (point: Vector3) => {
				const { u, v } = form.uv(point);
				return { x: u * canvas, y: v * canvas };
			};
			const eyeSpots: EyeSpot[] = [-yaw, yaw].map((y, i) => ({
				...px(form.point(y, eyes)),
				r: (radii[i] ?? size) * scale,
				pupil,
			}));
			const browPitch = eyes + angular + (look.eyes === "saltones" ? 0.09 : 0.11);
			const patchEye = look.face === "parche" ? (eyeSpots[0] ?? null) : null;
			return {
				scale,
				eyes: eyeSpots,
				brows: [-yaw, yaw].map((y, i) => ({
					...px(form.point(y * 1.05, browPitch)),
					w: (radii[i] ?? size) * scale * (look.eyes === "saltones" ? 1.6 : 2.1),
				})),
				browWidth: 0.034 * headScale * scale,
				mouth: { ...px(form.point(0, mouth)), w: 0.28 * headScale * scale },
				nose: { ...px(form.point(0, nose)), r: Math.max(noseSize, 0.03 * headScale) * scale },
				cheeks: [-1, 1].map((sx) => ({
					...px(form.point(sx * (yaw + 0.22), mouth + 0.15)),
					r: 0.08 * headScale * scale,
				})),
				patch: patchEye
					? { x: patchEye.x, y: patchEye.y, r: Math.max(patchEye.r, 0.09 * headScale * scale) }
					: null,
			};
		},
	};
}

/** Gafas y monóculo, colocados donde caen los ojos de esta cara. */
export function placeFaceProps(
	look: AvatarLook,
	kit: Kit,
	form: HeadForm,
	layout: FaceLayout,
): Object3D[] {
	const props: Object3D[] = [];
	const face = look.face;
	if (!face) return props;
	const [right, left] = layout.eyes;
	if (!right || !left) return props;
	const normal = new Vector3();
	// Un poco separadas de la cara, que los ojos están dibujados en ella.
	const reach = 0.025;
	const biggest = Math.max(right.r, left.r);
	if (face === "gafas-sol" || face === "gafas-redondas" || face === "gafas-corazon") {
		const piece = kit.piece(`cara.${face}`);
		if (!piece) return props;
		const a = form.point(right.yaw, right.pitch);
		const b = form.point(left.yaw, left.pitch);
		const glasses = piece.template.clone();
		form.normal(0, right.pitch, normal);
		glasses.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(normal, reach);
		glasses.quaternion.setFromUnitVectors(Z_AXIS, normal.lerp(Z_AXIS, 0.6).normalize());
		// Los cristales del kit están a ±0.15 y miden una décima de radio.
		glasses.scale.setScalar(Math.max(a.distanceTo(b) / 0.3, (biggest * 1.25) / 0.1));
		props.push(glasses);
	} else if (face === "monoculo") {
		const piece = kit.piece("cara.monoculo");
		if (!piece) return props;
		const monocle = piece.template.clone();
		form.normal(right.yaw, right.pitch, normal);
		monocle.position.copy(form.point(right.yaw, right.pitch)).addScaledVector(normal, reach);
		monocle.quaternion.setFromUnitVectors(Z_AXIS, normal.lerp(Z_AXIS, 0.5).normalize());
		monocle.scale.setScalar((right.r * 1.3) / 0.1);
		props.push(monocle);
	}
	return props;
}
