import {
	Box3,
	Group,
	LatheGeometry,
	type Material,
	Mesh,
	type Object3D,
	SphereGeometry,
	type Texture,
	Vector2,
	Vector3,
} from "three";
import { type Expression, Face } from "./face.ts";
import { JELLY_REST, Jelly, type JellyShape } from "./jelly.ts";
import type { Kit } from "./kit.ts";
import type { AvatarLook } from "./look.ts";
import { slimeMaterial, slimeShadowMaterial, velvet } from "./materials.ts";
import {
	type BuildOptions,
	dress,
	Palette,
	type Pupil,
	placeFaceProps,
	planFace,
} from "./model.ts";

/**
 * Los slimes: gotas de gelatina con cara, que es lo que es cada jugador.
 *
 * El slime es una sola malla del kit, sin huesos: se deforma entera en el
 * sombreador (`jelly.ts`). Su parte de arriba es la cabeza de referencia del
 * kit a escala, así que le valen la cara dibujada, los gorros, los pelos y las
 * gafas hechos para ella; lo que no es gelatina (el gorro, las gafas, el
 * bracito) va colgado de la superficie deformada, y se aplasta, se inclina y
 * gira con ella.
 *
 * Para saludar le sale del costado un bracito, y al chafarse contra el suelo
 * le saltan gotitas.
 */

/** Lo que mueve la animación en un slime, aparte de moverlo entero. */
export interface SlimePose extends JellyShape {
	/** El bracito: cuánto ha salido (0 a 1), cuánto se levanta y de qué lado (1 su izquierda). */
	arm: number;
	armAngle: number;
	armSide: 1 | -1;
}

export const SLIME_REST: SlimePose = { ...JELLY_REST, arm: 0, armAngle: 0, armSide: 1 };

/**
 * Lo que mide el slime respecto a la pieza del kit: pequeñito, que ocupe la
 * mitad de su peana. La cara, en cambio, se sigue leyendo bien: es casi toda
 * la parte de arriba.
 */
const SIZE = 0.5;

/** Un slime montado: su malla, lo que lleva colgado y cómo ponerle una pose o una cara. */
export class SlimeDoll {
	/** En la base. Saltos, giros y aparecer y desaparecer. */
	readonly root = new Group();
	/** Las gotitas: van en la peana, no en el slime, que al saltar no se las lleva. */
	readonly splash: Splash;
	/** Lo que hay que poner en la peana además del slime: las gotitas. */
	readonly effects: Object3D;
	/** Altura total, gorro incluido. */
	readonly height: number;
	/** Dónde está la cara (desde el suelo) y cuánto abulta: para los retratos. */
	readonly face: { center: Vector3; size: number };
	readonly pupils: Pupil[];
	/** Entre los ojos: sus meneos son los que sacuden las pupilas sueltas. */
	readonly eyes: Object3D;
	readonly spinner: Object3D | null;
	readonly floater: Object3D | null;

	#jelly: Jelly;
	#anchors: { hat: Anchor; face: Anchor; arm: Anchor };
	#arm: Object3D;
	/** De dónde sale el bracito por su izquierda, en reposo. */
	#armAt: Vector3;
	#paint: Face;
	#owned: (Material | Texture)[];

	constructor(parts: SlimeParts) {
		this.root.add(parts.body);
		this.#jelly = parts.jelly;
		this.#anchors = parts.anchors;
		this.#arm = parts.arm;
		this.#armAt = parts.anchors.arm.at.clone();
		this.#paint = parts.face;
		this.#owned = parts.owned;
		this.splash = parts.splash;
		this.effects = parts.splash.group;
		this.pupils = Array.from({ length: parts.face.pupils }, () => ({ loose: parts.face.loose }));
		this.eyes = parts.eyes;
		this.spinner = parts.spinner;
		this.floater = parts.floater;
		this.face = parts.faceFrame;
		this.pose(SLIME_REST);
		this.root.updateMatrixWorld(true);
		this.height = new Box3().setFromObject(this.root, true).max.y;
	}

	pose(pose: SlimePose): void {
		const jelly = this.#jelly;
		jelly.set(pose);
		const { hat, face, arm } = this.#anchors;
		hat.follow(jelly);
		face.follow(jelly);

		const side = pose.armSide;
		arm.at.set(this.#armAt.x * side, this.#armAt.y, this.#armAt.z);
		arm.follow(jelly);
		const limb = this.#arm;
		limb.visible = pose.arm > 0.02;
		limb.scale.setScalar(Math.max(0.001, pose.arm));
		limb.position.copy(arm.at);
		// Sin levantar sale de lado y un poco hacia arriba; levantado del todo,
		// casi recto hacia arriba.
		limb.rotation.set(0, 0, -side * (1.3 - pose.armAngle));
	}

	express(face: Expression): void {
		this.#paint.show(face);
	}

	gaze(i: number, x: number, y: number, size: number): void {
		this.#paint.gaze(i, x, y, size);
	}

	dispose(): void {
		for (const item of this.#owned) item.dispose();
		this.#paint.dispose();
		this.root.removeFromParent();
		this.splash.group.removeFromParent();
	}
}

/** Un punto de la gelatina del que cuelgan cosas que no se deforman. */
class Anchor {
	readonly group = new Group();
	readonly at: Vector3;

	constructor(at: Vector3) {
		this.at = at;
		this.group.matrixAutoUpdate = false;
	}

	follow(jelly: Jelly): void {
		jelly.anchor(this.at, this.group.matrix);
		this.group.matrixWorldNeedsUpdate = true;
	}
}

interface Drop {
	mesh: Mesh;
	velocity: Vector3;
	size: number;
	/** Segundos desde que tocó el suelo; negativo mientras vuela. */
	landed: number;
}

const UP = new Vector3(0, 1, 0);
const HEADING = new Vector3();
let dropShape: SphereGeometry | undefined;

/**
 * Las gotitas que saltan al chafarse: vuelan estiradas, caen en la peana (o
 * fuera, al suelo), se aplastan y se encogen hasta desaparecer.
 */
export class Splash {
	readonly group = new Group();
	#material: Material;
	#drops: Drop[] = [];

	constructor(material: Material) {
		this.#material = material;
	}

	/** Un chapoteo en `at` (en la peana), de fuerza 0 a 1. */
	burst(at: Vector3, strength: number): void {
		const count = Math.round(3 + strength * 5);
		for (let i = 0; i < count; i++) {
			const drop = this.#drops.find((candidate) => !candidate.mesh.visible) ?? this.#make();
			if (!drop) return;
			const angle = Math.random() * Math.PI * 2;
			const out = (0.4 + Math.random() * 0.6) * (0.6 + strength * 0.7);
			drop.velocity.set(
				Math.cos(angle) * out,
				(1.1 + Math.random() * 1.1) * (0.6 + strength * 0.5),
				Math.sin(angle) * out,
			);
			drop.mesh.position.set(
				at.x + Math.cos(angle) * 0.2,
				at.y + 0.06,
				at.z + Math.sin(angle) * 0.2,
			);
			drop.size = 0.02 + Math.random() * 0.022;
			drop.mesh.scale.setScalar(drop.size);
			drop.mesh.visible = true;
			drop.landed = -1;
		}
	}

	update(dt: number): void {
		for (const drop of this.#drops) {
			const { mesh, velocity, size } = drop;
			if (!mesh.visible) continue;
			if (drop.landed < 0) {
				velocity.y -= 14 * dt;
				mesh.position.addScaledVector(velocity, dt);
				// Estirada en el aire, en la dirección en que va.
				const stretch = 1 + Math.min(0.8, velocity.length() * 0.12);
				mesh.scale.set(size, size * stretch, size);
				mesh.quaternion.setFromUnitVectors(UP, HEADING.copy(velocity).normalize());
				// Cae en la peana si está encima; si no, sigue hasta el suelo.
				const floor = Math.hypot(mesh.position.x, mesh.position.z) < 0.58 ? 0.004 : -0.136;
				if (mesh.position.y <= floor && velocity.y < 0) {
					mesh.position.y = floor;
					mesh.quaternion.identity();
					drop.landed = 0;
				}
			} else {
				drop.landed += dt;
				const k = drop.landed / 0.45;
				const flat = Math.min(1, k * 5);
				const shrink = Math.max(0, 1 - Math.max(0, (k - 0.35) / 0.65));
				const wide = size * (1 + 0.9 * flat) * shrink;
				mesh.scale.set(wide, size * (1 - 0.7 * flat) * shrink + 0.0001, wide);
				if (k >= 1) mesh.visible = false;
			}
		}
	}

	#make(): Drop | undefined {
		if (this.#drops.length >= 12) return undefined;
		dropShape ??= new SphereGeometry(1, 12, 8);
		const mesh = new Mesh(dropShape, this.#material);
		mesh.castShadow = true;
		mesh.visible = false;
		this.group.add(mesh);
		const drop: Drop = { mesh, velocity: new Vector3(), size: 0.03, landed: -1 };
		this.#drops.push(drop);
		return drop;
	}
}

interface SlimeParts {
	body: Object3D;
	jelly: Jelly;
	anchors: { hat: Anchor; face: Anchor; arm: Anchor };
	arm: Object3D;
	face: Face;
	faceFrame: { center: Vector3; size: number };
	eyes: Object3D;
	spinner: Object3D | null;
	floater: Object3D | null;
	splash: Splash;
	owned: (Material | Texture)[];
}

/**
 * El bracito: gordo donde sale de la barriga, una muñeca fina y una manopla
 * redonda. De abajo arriba, (radio, altura).
 */
const ARM_PROFILE = [
	[0, -0.05],
	[0.115, -0.03],
	[0.112, 0.04],
	[0.086, 0.14],
	[0.072, 0.23],
	[0.092, 0.29],
	[0.087, 0.35],
	[0.056, 0.39],
	[0, 0.4],
] as const;

let armShape: LatheGeometry | undefined;

/** Construye el slime de un aspecto. Mismo aspecto, mismo slime. */
export function buildSlime(look: AvatarLook, kit: Kit, options: BuildOptions = {}): SlimeDoll {
	const owned: (Material | Texture)[] = [];
	const color = look.skin;
	const palette = new Palette(look, owned);

	const geometry = kit.slime.mesh.geometry;
	geometry.computeBoundingBox();
	const top = geometry.boundingBox?.max.y ?? 1;
	const deformer = new Jelly(top);

	const form = kit.slime.form;
	const layout = planFace(look, kit, form);
	const faceSize = options.faceSize ?? 256;
	const face = new Face(look, layout.plan(faceSize), faceSize);
	const skin = slimeMaterial(face, deformer);
	const shadow = slimeShadowMaterial(deformer);
	owned.push(skin, shadow);
	const body = new Mesh(geometry, skin);
	body.customDepthMaterial = shadow;
	body.castShadow = true;
	body.receiveShadow = true;
	// Deformado se sale de su caja de reposo.
	body.frustumCulled = false;

	// Todo se coloca a la medida del kit y en reposo; `small` lo encoge entero.
	const small = new Group();
	small.scale.setScalar(SIZE);
	small.add(body);

	// El gorro y el pelo cuelgan de lo alto de la cabeza; las gafas y los ojos,
	// de la cara; el bracito, del costado.
	const [right, left] = layout.eyes;
	const eyesAt =
		right && left
			? form.point(right.yaw, right.pitch).add(form.point(left.yaw, left.pitch)).multiplyScalar(0.5)
			: form.point(0, 0.1);
	const armAt = form.point(Math.PI / 2, -0.55);
	armAt.x -= 0.06;
	const anchors = {
		hat: new Anchor(new Vector3(0, form.center.y + 0.65 * (top - form.center.y), 0)),
		face: new Anchor(eyesAt.clone()),
		arm: new Anchor(armAt),
	};
	small.add(anchors.hat.group, anchors.face.group, anchors.arm.group);

	let spinner: Object3D | null = null;
	let floater: Object3D | null = null;
	for (const { piece, tilt } of layout.pieces) {
		const worn = piece.template.clone();
		dress(worn, palette);
		// Los gorros y pelos del kit, a la escala del slime: el centro de la
		// cabeza de referencia, en el centro de la de gelatina.
		const holder = new Group();
		holder.scale.setScalar(kit.slime.scale);
		holder.position.copy(kit.head.center).multiplyScalar(-kit.slime.scale);
		holder.add(worn);
		const pivot = new Group();
		pivot.position.copy(form.center);
		pivot.rotation.x = -tilt;
		pivot.add(holder);
		anchors.hat.group.add(pivot);
		if (piece.floats) floater = worn;
		if (piece.name === "gorro.helice") {
			const blades = kit.piece("gorro.helice.aspas");
			if (blades?.axis) {
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
		anchors.face.group.add(prop);
	}

	// Entre los ojos, para las sacudidas de las pupilas.
	const eyes = new Group();
	eyes.position.copy(eyesAt);
	anchors.face.group.add(eyes);

	// El bracito, escondido dentro hasta que saluda, y las gotitas: del mismo
	// terciopelo que el slime.
	const goo = velvet(color);
	owned.push(goo);
	armShape ??= new LatheGeometry(
		ARM_PROFILE.map(([r, y]) => new Vector2(r, y)),
		18,
	);
	const arm = new Mesh(armShape, goo);
	arm.castShadow = true;
	anchors.arm.group.add(arm);

	return new SlimeDoll({
		body: small,
		jelly: deformer,
		anchors,
		arm,
		face,
		faceFrame: {
			center: form.center.clone().multiplyScalar(SIZE),
			size: (form.span / 1.08) * SIZE,
		},
		eyes,
		spinner,
		floater,
		splash: new Splash(goo),
		owned,
	});
}
