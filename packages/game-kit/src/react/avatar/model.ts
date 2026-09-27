import {
	Bone,
	Box3,
	Color,
	Euler,
	Group,
	type Material,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	Quaternion,
	SkinnedMesh,
	type Texture,
	Vector3,
} from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { type Expression, type EyeSpot, Face, type FacePlan } from "./face.ts";
import type { HeadForm, Kit, Piece } from "./kit.ts";
import { type AvatarLook, hidesHair } from "./look.ts";
import {
	type BodyMaterial,
	bodyMaterial,
	fixedMaterial,
	headMaterial,
	velvet,
} from "./materials.ts";

/**
 * El muñeco en 3D: de un aspecto (`look.ts`) y las piezas del kit de Blender
 * (`kit.ts`) a un grupo de three.js con los huesos a mano para animarlo.
 *
 * Todos tienen el mismo cuerpo y la misma cabeza: lo que cambia es lo que
 * llevan puesto y la cara. El cuerpo es el del kit, con su esqueleto y la ropa
 * pintada según la semilla. La cabeza cuelga del hueso "cabeza" con todo lo
 * suyo: la cara dibujada en su textura (`face.ts`), el pelo, el gorro y, si
 * toca, las gafas o el monóculo donde caigan los ojos.
 *
 * Medidas en "metros de muñeco": mide unos dos. Mira hacia +Z.
 */

const Y_AXIS = new Vector3(0, 1, 0);
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

/**
 * Un brazo: balanceo adelante (x) y hacia fuera (z) desde colgar recto, y el
 * codo. El codo dobla hacia delante; con el brazo girado sobre sí mismo
 * (`twist`, un cuarto de vuelta) dobla hacia arriba, como al sacar bíceps.
 */
export interface ArmPose {
	x: number;
	z: number;
	elbow: number;
	twist: number;
}

/** Una pierna: adelante (x < 0) o atrás, y rodilla. */
export interface LegPose {
	x: number;
	knee: number;
}

export interface DollPose {
	/** El tronco desde la cintura: adelante (x) y de lado (z). */
	spineX: number;
	spineZ: number;
	/** Hombros arriba (encogerse). */
	shrug: number;
	breath: number;
	headX: number;
	headY: number;
	headZ: number;
	/** El flan: la cabeza aplastada (> 0) o estirada. */
	jelly: number;
	armL: ArmPose;
	armR: ArmPose;
	/** Bíceps de sacar músculo, de 0 a 1. */
	muscle: number;
	legL: LegPose;
	legR: LegPose;
}

interface BoneRest {
	quaternion: Quaternion;
	position: Vector3;
}

const BONES = [
	"cadera",
	"columna",
	"pecho",
	"cabeza",
	"brazo.L",
	"antebrazo.L",
	"brazo.R",
	"antebrazo.R",
	"muslo.L",
	"pierna.L",
	"muslo.R",
	"pierna.R",
] as const;
type BoneName = (typeof BONES)[number];

/** El muñeco montado: su grupo, sus huesos y cómo ponerle una pose o una cara. */
export class Doll {
	/** En los pies. Saltos, giros y el aplastado al caer. */
	readonly root = new Group();
	/** Altura total, gorro incluido. */
	readonly height: number;
	/** Dónde está la cara (desde los pies) y cuánto abulta: para los retratos. */
	readonly face: { center: Vector3; size: number };
	/** Las pupilas que se mueven (las de los ojos con blanco). */
	readonly pupils: Pupil[];
	/** Entre los ojos: sus meneos son los que sacuden las pupilas sueltas. */
	readonly eyes: Object3D;
	/** Lo que gira solo: la hélice del gorro. */
	readonly spinner: Object3D | null;
	/** Lo que flota: la aureola. */
	readonly floater: Object3D | null;
	/**
	 * Cuánto se abren los brazos en reposo, desde colgar recto: lo justo para
	 * que las manos no se metan en la cadera y, con falda, queden por fuera.
	 */
	readonly restArm: number;

	#bones: Record<BoneName, Bone>;
	#rest = new Map<Bone, BoneRest>();
	/** Cuánto cuelga de lado cada brazo en reposo, para medir la pose desde colgar recto. */
	#armRest: { L: number; R: number };
	#elbowAxis: { L: Vector3; R: Vector3 };
	#kneeAxis: { L: Vector3; R: Vector3 };
	#paint: Face;
	#bodies: SkinnedMesh[];
	#muscle: number | undefined;
	#owned: (Material | Texture)[] = [];
	#euler = new Euler();
	#q = new Quaternion();

	constructor(parts: DollParts) {
		this.root.add(parts.armature);
		this.#bones = parts.bones;
		this.#paint = parts.face;
		this.#bodies = parts.bodies;
		this.#muscle = parts.bodies[0]?.morphTargetDictionary?.musculo;
		this.#owned = parts.owned;
		this.pupils = Array.from({ length: parts.face.pupils }, () => ({ loose: parts.face.loose }));
		this.eyes = parts.eyes;
		this.spinner = parts.spinner;
		this.floater = parts.floater;
		this.restArm = parts.restArm;

		this.root.updateMatrixWorld(true);
		for (const bone of Object.values(this.#bones)) {
			this.#rest.set(bone, {
				quaternion: bone.quaternion.clone(),
				position: bone.position.clone(),
			});
		}
		const world = (bone: Bone) => new Vector3().setFromMatrixPosition(bone.matrixWorld);
		const armDirection = (side: "L" | "R") =>
			world(this.#bones[`antebrazo.${side}`])
				.sub(world(this.#bones[`brazo.${side}`]))
				.normalize();
		const legDirection = (side: "L" | "R") =>
			world(this.#bones[`pierna.${side}`])
				.sub(world(this.#bones[`muslo.${side}`]))
				.normalize();
		this.#armRest = {
			L: Math.atan2(armDirection("L").x, -armDirection("L").y),
			R: Math.atan2(armDirection("R").x, -armDirection("R").y),
		};
		// Los ejes de codo y rodilla, en el espacio del hueso de arriba: el codo
		// dobla hacia delante y la rodilla hacia atrás, vaya el brazo como vaya.
		const local = (axis: Vector3, parent: Bone) =>
			axis.applyQuaternion(parent.getWorldQuaternion(new Quaternion()).invert()).normalize();
		this.#elbowAxis = {
			L: local(armDirection("L").cross(Z_AXIS), this.#bones["brazo.L"]),
			R: local(armDirection("R").cross(Z_AXIS), this.#bones["brazo.R"]),
		};
		const back = new Vector3(0, 0, -1);
		this.#kneeAxis = {
			L: local(legDirection("L").cross(back), this.#bones["muslo.L"]),
			R: local(legDirection("R").cross(back), this.#bones["muslo.R"]),
		};

		this.root.updateMatrixWorld(true);
		const box = new Box3().setFromObject(parts.head, true);
		this.height = box.max.y;
		this.face = parts.faceFrame;
	}

	/** Pone los huesos en una pose. Todo se mide desde el reposo. */
	pose(pose: DollPose): void {
		const bones = this.#bones;
		this.#turn(bones.columna, pose.spineX, 0, pose.spineZ);
		const chest = bones.pecho;
		const chestRest = this.#rest.get(chest);
		if (chestRest) chest.position.copy(chestRest.position).setY(chestRest.position.y + pose.shrug);
		chest.scale.set(1 + pose.breath, 1 + pose.breath * 0.5, 1 + pose.breath);
		this.#turn(bones.cabeza, pose.headX, pose.headY, pose.headZ);
		bones.cabeza.scale.set(1 + pose.jelly * 0.5, 1 - pose.jelly, 1 + pose.jelly * 0.5);

		for (const side of ["L", "R"] as const) {
			const arm = side === "L" ? pose.armL : pose.armR;
			const twist = side === "L" ? -arm.twist : arm.twist;
			this.#turn(bones[`brazo.${side}`], arm.x, 0, arm.z - this.#armRest[side], twist);
			this.#bend(bones[`antebrazo.${side}`], this.#elbowAxis[side], arm.elbow);
			const leg = side === "L" ? pose.legL : pose.legR;
			this.#turn(bones[`muslo.${side}`], leg.x, 0, 0);
			this.#bend(bones[`pierna.${side}`], this.#kneeAxis[side], leg.knee);
		}
		if (this.#muscle !== undefined) {
			for (const body of this.#bodies) {
				if (body.morphTargetInfluences) body.morphTargetInfluences[this.#muscle] = pose.muscle;
			}
		}
	}

	/** El gesto de la cara. */
	express(face: Expression): void {
		this.#paint.show(face);
	}

	/**
	 * Adónde mira la pupila `i`: `x` e `y` de -1 a 1 dentro del ojo (arriba es
	 * positivo) y `size` para encogerla del susto.
	 */
	gaze(i: number, x: number, y: number, size: number): void {
		this.#paint.gaze(i, x, y, size);
	}

	dispose(): void {
		for (const item of this.#owned) item.dispose();
		this.#paint.dispose();
		this.root.removeFromParent();
	}

	/**
	 * Giro desde el reposo, en los ejes del padre (que en reposo son los del
	 * mundo), y `twist` sobre el propio hueso.
	 */
	#turn(bone: Bone, x: number, y: number, z: number, twist = 0): void {
		const rest = this.#rest.get(bone);
		if (!rest) return;
		bone.quaternion.setFromEuler(this.#euler.set(x, y, z)).multiply(rest.quaternion);
		if (twist) bone.quaternion.multiply(this.#q.setFromAxisAngle(Y_AXIS, twist));
	}

	#bend(bone: Bone, axis: Vector3, angle: number): void {
		const rest = this.#rest.get(bone);
		if (!rest) return;
		bone.quaternion.copy(this.#q.setFromAxisAngle(axis, angle)).multiply(rest.quaternion);
	}
}

interface DollParts {
	armature: Object3D;
	bones: Record<BoneName, Bone>;
	bodies: SkinnedMesh[];
	head: Object3D;
	face: Face;
	faceFrame: { center: Vector3; size: number };
	eyes: Object3D;
	spinner: Object3D | null;
	floater: Object3D | null;
	restArm: number;
	owned: (Material | Texture)[];
}

export interface BuildOptions {
	/** Lado del lienzo de la cara, en píxeles: más grande para el perfil. */
	faceSize?: number;
}

/** Construye el muñeco de un aspecto. Mismo aspecto, mismo muñeco. */
export function buildAvatar(look: AvatarLook, kit: Kit, options: BuildOptions = {}): Doll {
	const owned: (Material | Texture)[] = [];
	const palette = new Palette(look, owned);

	// El cuerpo y lo que va cosido a él.
	const armature = cloneSkinned(kit.armature);
	const named = new Map<string, Object3D>();
	armature.traverse((object) => {
		const name = object.userData.name;
		if (typeof name === "string") named.set(name, object);
	});
	const bones = {} as Record<BoneName, Bone>;
	for (const name of BONES) {
		const bone = named.get(name);
		if (!(bone instanceof Bone)) throw new Error(`Al esqueleto le falta ${name}`);
		bones[name] = bone;
	}
	const wanted = new Set(["cuerpo"]);
	if (look.top === "vestido") wanted.add("ropa.vestido");
	else if (look.bottom === "falda") wanted.add("ropa.falda");
	if (look.top === "sudadera") wanted.add("ropa.capucha");
	if (look.top === "traje") wanted.add("extra.corbata");
	if (look.extra) wanted.add(`extra.${look.extra}`);
	for (const [name, object] of named) {
		if (/^(ropa|extra)\./.test(name) && !wanted.has(name)) object.removeFromParent();
	}
	armature.updateMatrixWorld(true);
	const neck = bones.cabeza.getWorldPosition(new Vector3());
	const body = named.get("cuerpo");
	const bodies: SkinnedMesh[] = [];
	const bodyPaint = bodyMaterial(look, kit.body);
	owned.push(bodyPaint);
	armature.traverse((object) => {
		if (!(object instanceof SkinnedMesh)) return;
		object.frustumCulled = false;
		object.castShadow = true;
		object.receiveShadow = true;
		if (object === body || object.parent === body) {
			prepareBody(object, bodyPaint);
			bodies.push(object);
		} else {
			object.material = palette.for(object.material);
		}
	});

	// La cabeza, con todo lo que lleva, cuelga del hueso del cuello.
	const head = new Group();
	bones.cabeza.add(head);
	const form = kit.head;
	const layout = planFace(look, kit, form);

	const faceSize = options.faceSize ?? 256;
	const face = new Face(look, layout.plan(faceSize), faceSize);
	const skull = form.mesh.clone();
	skull.position.set(0, 0, 0);
	skull.material = headMaterial(face);
	skull.castShadow = true;
	skull.receiveShadow = true;
	owned.push(skull.material);
	head.add(skull);

	// Entre los ojos: lo que se mide para sacudir las pupilas.
	const eyes = new Group();
	const [right, left] = layout.eyes;
	if (right && left) {
		eyes.position.copy(form.point(right.yaw, right.pitch)).add(form.point(left.yaw, left.pitch));
		eyes.position.multiplyScalar(0.5);
	}
	head.add(eyes);

	let spinner: Object3D | null = null;
	let floater: Object3D | null = null;
	for (const { piece, tilt } of layout.pieces) {
		const worn = piece.template.clone();
		dress(worn, palette);
		// Echado hacia atrás si hace falta, para que no tape los ojos.
		const pivot = new Group();
		pivot.position.copy(form.center);
		worn.position.copy(form.center).negate();
		pivot.add(worn);
		pivot.rotation.x = -tilt;
		head.add(pivot);
		if (piece.floats) floater = worn;
		if (piece.name === "gorro.helice") {
			const blades = kit.piece("gorro.helice.aspas");
			if (blades?.axis) {
				// La hélice gira sobre su eje: se cuelga de él.
				const propeller = blades.template.clone();
				dress(propeller, palette);
				const spin = new Group();
				spin.position.copy(blades.axis);
				propeller.position.copy(blades.axis).negate();
				spin.add(propeller);
				worn.add(spin);
				spinner = spin;
			}
		}
	}
	for (const prop of placeFaceProps(look, kit, form, layout)) {
		dress(prop, palette);
		head.add(prop);
	}

	return new Doll({
		armature,
		bones,
		bodies,
		head,
		face,
		faceFrame: {
			center: form.center.clone().add(neck),
			size: form.span / 1.08,
		},
		eyes,
		spinner,
		floater,
		restArm: look.top === "vestido" || look.bottom === "falda" ? 0.5 : 0.36,
		owned,
	});
}

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------

/**
 * Los materiales de un muñeco, por el nombre que traen del kit: "pelo" es el
 * color de pelo que le tocó, "gorro" el del gorro, "fijo.oro" el oro de todas
 * las coronas.
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
		if (!material) return this.#make("ropa");
		if (material.name.startsWith("fijo.") && material instanceof MeshStandardMaterial) {
			return fixedMaterial(material);
		}
		return this.#make(material.name);
	}

	/** Un material propio de este muñeco (se tira con él). */
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
		const hatAccent = look.topAccent !== look.hatColor ? look.topAccent : "#f4f1ea";
		switch (name) {
			case "pelo":
			case "pelo.negro":
				return this.#own("pelo", () => velvet(look.hairColor));
			case "pelo.rapado":
				return this.#own("rapado", () =>
					velvet(new Color(look.hairColor).lerp(new Color(look.skin), 0.35)),
				);
			case "gorro":
				return this.#own("gorro", () => velvet(look.hatColor));
			case "gorro.2":
				return this.#own("gorro.2", () => velvet(hatAccent));
			case "abajo":
				return this.#own("abajo", () => velvet(look.bottomColor));
			case "acento":
				return this.#own("acento", () => velvet(look.topAccent));
			default:
				return this.#own("ropa", () => velvet(look.topColor));
		}
	}
}

/** Pinta una pieza con los materiales de su muñeco y le pone sombras. */
export function dress(object: Object3D, palette: Palette): void {
	object.traverse((child) => {
		if (!(child instanceof Mesh)) return;
		child.material = palette.for(child.material);
		child.castShadow = true;
		child.receiveShadow = true;
	});
}

function prepareBody(mesh: SkinnedMesh, material: BodyMaterial): void {
	const geometry = mesh.geometry;
	// Las zonas de ropa vienen en las UV; el material las lee con otro nombre
	// para no chocar con las UV de las texturas.
	if (!geometry.getAttribute("zone")) {
		const uv = geometry.getAttribute("uv");
		if (uv) geometry.setAttribute("zone", uv);
	}
	mesh.material = material;
	mesh.morphTargetInfluences?.fill(0);
}

// ---------------------------------------------------------------------------
// La cara
// ---------------------------------------------------------------------------

export interface FaceLayout {
	/** Los ojos: guiñada, cabeceo y radio. El primero es el derecho del muñeco (-X). */
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
