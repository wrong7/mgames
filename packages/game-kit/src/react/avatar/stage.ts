import {
	AdditiveBlending,
	CanvasTexture,
	CircleGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	Scene,
	SRGBColorSpace,
	TorusGeometry,
	Vector2,
	Vector3,
	type WebGLRenderer,
} from "three";
import { type Kit, loadedKit, loadKit } from "./kit.ts";
import { avatarLook } from "./look.ts";
import type { Entrance, PuppetOptions } from "./motion.ts";
import {
	aimKey,
	createRenderer,
	radialTexture,
	type Studio,
	studioEnvironment,
	studioLights,
} from "./scene.ts";
import { buildSlime } from "./slime.ts";
import { SlimePuppet } from "./slime-motion.ts";

/**
 * El escenario: los slimes de la sala, cada uno en su peana.
 *
 * Es la pantalla de espera de los juegos de consola —la del grupo que va
 * llegando mientras alguien elige a qué jugar—: cada uno que entra cae del
 * cielo sobre una peana nueva, los demás se recolocan dando un saltito y la
 * cámara se aleja lo justo para que quepan todos.
 *
 * Una sola escena y un solo lienzo para todos: un WebGL por slime agotaría
 * los contextos que da el navegador mucho antes de llenar la sala.
 *
 * Las piezas de los slimes (el kit de Blender) se descargan aparte. Mientras
 * llegan ya se ven las peanas; los slimes caen sobre ellas en cuanto están.
 *
 * Al acabar una partida hace de podio: las peanas suben sobre columnas de oro,
 * plata y bronce, los slimes caen del último al primero y el que gana no para
 * de celebrarlo mientras los demás le saludan.
 */

export interface StageActor {
	id: string;
	/** La semilla del slime: `profile.avatar`. */
	seed: string;
	/** Peana con el aro en blanco: para señalar quién mira. */
	highlight?: boolean;
	/**
	 * En el podio, el puesto. El 1, el 2 y el 3 suben a su escalón de oro, plata
	 * y bronce; los empatados comparten altura, y los demás se quedan en el
	 * suelo. Fuera del podio no se usa.
	 */
	place?: number;
}

export type StageVariant = "sala" | "solo" | "podio";

export interface StageOptions {
	/**
	 * `sala`: todos en formación con su nombre. `solo`: uno, grande, para el
	 * perfil. `podio`: los que han ganado, cada uno en el escalón de su puesto.
	 */
	variant: StageVariant;
	/** `prefers-reduced-motion`: casi quietos y sin caídas. */
	calm: boolean;
	/** El nombre de cada uno, ya en el DOM: el escenario sólo lo coloca. */
	label: (id: string) => HTMLElement | undefined;
	/** No han llegado las piezas de los slimes: quien llama pinta la versión plana. */
	onFail?: () => void;
}

export interface Stage {
	setActors(actors: readonly StageActor[]): void;
	/** Tamaño del lienzo en píxeles CSS. */
	setSize(width: number, height: number): void;
	/** Un toque en el lienzo: el slime tocado hace un gesto. Devuelve quién era. */
	tap(x: number, y: number): string | null;
	dispose(): void;
}

/** `null` si no hay WebGL: quien llama pinta la versión plana. */
export function createStage(canvas: HTMLCanvasElement, options: StageOptions): Stage | null {
	const renderer = createRenderer({ canvas, powerPreference: "default" });
	return renderer ? new AvatarStage(renderer, options) : null;
}

const PEDESTAL_R = 0.62;
const PEDESTAL_TOP = 0.14;
/** Cuánto sube cada fila de atrás: gradas, para que se vean las caras. */
const ROW_RISE = 0.85;
const ROW_DEPTH = 1.3;
const SPACING = 1.3;

/** La altura del escalón de cada puesto del podio. Del cuarto para abajo, el suelo. */
const PODIUM_STEP: Readonly<Record<number, number>> = { 1: 1, 2: 0.68, 3: 0.42 };
/** Entre columnas del podio, casi nada: un podio es un bloque. */
const PODIUM_SPACING = 1.3;

/** Los colores de cada escalón: el cuerpo, la tapa y el aro que brilla. */
const MEDALS: Readonly<Record<number, { body: string; top: string; rim: string }>> = {
	1: { body: "#d9a521", top: "#ffd24d", rim: "#fff0a8" },
	// Un gris algo verdoso: la luz del estudio es morada y un gris neutro sale lila.
	2: { body: "#b3c0bb", top: "#e6eeea", rim: "#f4fbf8" },
	3: { body: "#a9612f", top: "#d98b52", rim: "#ffd3ad" },
};

/**
 * Lo que hace cada uno en el podio: el que gana lo celebra a menudo (bota,
 * baila, se infla) y los demás le saludan, se estiran para verlo o se chafan
 * de pena.
 */
const PODIUM_MOOD = {
	winner: { gestures: ["rebota", "baila", "salto", "infla", "vuelta"], every: [1.2, 2.6] },
	rest: { gestures: ["saluda", "saluda", "estira", "aplasta"], every: [2.2, 4.5] },
} as const;

/** Lo que el escenario necesita de cada slime: su malla, cómo se mueve y cómo entra y sale. */
interface Actor {
	readonly rig: {
		readonly root: Object3D;
		/** Lo que suelta y va aparte, en la peana: las gotitas del slime. */
		readonly effects?: Object3D;
		readonly height: number;
		dispose(): void;
	};
	facing: number;
	readonly gone: boolean;
	update(dt: number): void;
	enter(kind: Entrance, delay?: number): void;
	leave(): void;
	play(): void;
	hop(): void;
}

interface Spot {
	x: number;
	y: number;
	z: number;
	row: number;
}

interface Slot {
	id: string;
	seed: string;
	/** La peana entera: se desliza a su sitio. */
	group: Group;
	/** Lo que crece al aparecer y mengua al irse. */
	pedestal: Group;
	/** Sobre la peana: donde se planta el slime. */
	stand: Group;
	body: Mesh;
	top: Mesh;
	rim: Mesh;
	glow: Mesh;
	shadow: Mesh;
	hit: Mesh;
	/** En el podio: la columna del escalón, que sube desde el suelo, su número y su sombra. */
	column: Mesh | null;
	badge: Mesh | null;
	ground: Mesh | null;
	/** En el podio, el puesto: de él salen la altura, el color y lo que hace. */
	place: number | undefined;
	/** `null` mientras no llegan las piezas de los slimes. */
	puppet: Actor | null;
	/** Hacia dónde mira el slime en su sitio. */
	facing: number;
	/** Slimes anteriores terminando de irse (tras cambiar de cara). */
	leaving: Actor[];
	spot: Spot;
	/** De 0 a 1: cuánto ha crecido la peana. */
	grown: number;
	removing: boolean;
}

class AvatarStage implements Stage {
	#renderer: WebGLRenderer;
	#options: StageOptions;
	#scene = new Scene();
	#camera = new PerspectiveCamera(26, 1, 0.1, 100);
	#view = { width: 1, height: 1 };
	#cameraGoal = { position: new Vector3(0, 2.2, 12), target: new Vector3(0, 1, 0) };
	#cameraLook = new Vector3(0, 1, 0);
	#slots = new Map<string, Slot>();
	#order: string[] = [];
	#last = -1;
	#firstBatch = true;
	#raycaster = new Raycaster();
	#scratch = new Vector3();
	#studio: Studio;
	#quality = new Quality();
	#kit: Kit | undefined = loadedKit();
	#disposed = false;
	/**
	 * La altura que se encuadra aunque midan menos. Los slimes son pequeñitos y
	 * se encuadran más altos de lo que son: así se ven pequeñitos en sus peanas,
	 * en vez de que la cámara se acerque hasta hacerlos enormes.
	 */
	#tall: number;
	/** La sombra de contacto del slime en su peana. */
	#footprint: number;
	/**
	 * Hacia dónde miran: solo, un pelín de lado; en la sala, un poco hacia el
	 * centro del grupo. Poco: un slime es casi todo cara, y girado de más
	 * parece que mira de lado.
	 */
	#turn: { solo: number; toCenter: number };

	// Piezas de peana, compartidas por todas.
	#shared = {
		body: new CylinderGeometry(PEDESTAL_R, PEDESTAL_R + 0.04, PEDESTAL_TOP, 48),
		top: new CircleGeometry(PEDESTAL_R - 0.02, 48),
		rim: new TorusGeometry(PEDESTAL_R - 0.01, 0.02, 8, 64),
		plane: new PlaneGeometry(1, 1),
		hit: new CylinderGeometry(0.6, 0.6, 2.4, 8),
		inlay: new TorusGeometry(PEDESTAL_R * 0.72, 0.008, 6, 64),
		bodyMaterial: new MeshStandardMaterial({ color: "#3a2c8f", roughness: 0.45, metalness: 0.15 }),
		topMaterial: new MeshStandardMaterial({ color: "#6556e0", roughness: 0.3, metalness: 0.1 }),
		rimMaterial: new MeshBasicMaterial({ color: "#8fe6ff", toneMapped: false }),
		rimHighlight: new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
		glow: new MeshBasicMaterial({
			map: radialTexture("rgba(110, 215, 255, 0.85)", "rgba(110, 215, 255, 0)"),
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			toneMapped: false,
		}),
		shadow: new MeshBasicMaterial({
			map: radialTexture("rgba(18, 8, 48, 0.4)", "rgba(18, 8, 48, 0)"),
			transparent: true,
			depthWrite: false,
		}),
		floor: new MeshBasicMaterial({
			map: radialTexture("rgba(150, 120, 255, 0.35)", "rgba(150, 120, 255, 0)"),
			transparent: true,
			depthWrite: false,
		}),
		invisible: new MeshBasicMaterial({ visible: false }),
		// El podio: una columna de alto uno que se estira hasta su escalón.
		column: new CylinderGeometry(PEDESTAL_R - 0.03, PEDESTAL_R + 0.03, 1, 48),
		badge: new PlaneGeometry(0.4, 0.4),
	};

	/** Materiales de cada escalón del podio y los números de delante, hechos al pedirlos. */
	#medals = new Map<
		number,
		{
			body: MeshStandardMaterial;
			top: MeshStandardMaterial;
			rim: MeshBasicMaterial;
			badge: MeshBasicMaterial;
		}
	>();

	constructor(renderer: WebGLRenderer, options: StageOptions) {
		this.#renderer = renderer;
		this.#options = options;
		this.#tall = options.variant === "solo" ? 1.35 : 1.2;
		this.#footprint = 0.8;
		this.#turn = { solo: 0.12, toCenter: 0.04 };
		renderer.setPixelRatio(this.#quality.pixelRatio);
		this.#studio = studioLights(this.#scene);
		this.#scene.environment = studioEnvironment(renderer);
		this.#scene.environmentIntensity = 1;

		// El resplandor morado del suelo es del escenario de la sala, que va sobre
		// su cielo morado. El podio sale dentro de los juegos, cada uno con su
		// fondo, y ahí sería una mancha: cada columna lleva su sombra y basta.
		if (options.variant !== "podio") {
			const floor = new Mesh(this.#shared.plane, this.#shared.floor);
			floor.rotation.x = -Math.PI / 2;
			floor.scale.setScalar(options.variant === "solo" ? 4 : 11);
			floor.position.y = -0.005;
			this.#scene.add(floor);
		}

		if (!this.#kit) {
			loadKit().then(
				(kit) => this.#arrive(kit),
				() => {
					if (!this.#disposed) options.onFail?.();
				},
			);
		}
		renderer.setAnimationLoop(this.#frame);
	}

	setActors(actors: readonly StageActor[]): void {
		const wanted = new Set(actors.map((actor) => actor.id));
		const fresh: Slot[] = [];
		const podium = this.#options.variant === "podio";

		for (const actor of actors) {
			const slot = this.#slots.get(actor.id);
			if (!slot) {
				const created = this.#createSlot(actor);
				this.#slots.set(actor.id, created);
				fresh.push(created);
				continue;
			}
			// Quien pasa a ganar (o deja de hacerlo) cambia de humor: vuelve a salir con el nuevo.
			const moodChanged = podium && (slot.place === 1) !== (actor.place === 1);
			slot.place = actor.place;
			this.#dress(slot, actor.highlight ?? false);
			if (moodChanged && !slot.removing) {
				this.#swapPuppet(slot, actor.seed);
			} else if (slot.removing) {
				// Volvió antes de terminar de irse: se queda donde estaba.
				slot.removing = false;
				this.#swapPuppet(slot, actor.seed);
			} else if (slot.seed !== actor.seed) {
				this.#swapPuppet(slot, actor.seed);
			}
		}

		for (const [id, slot] of this.#slots) {
			if (!wanted.has(id) && !slot.removing) {
				slot.removing = true;
				slot.puppet?.leave();
			}
		}

		this.#order = actors.map((actor) => actor.id);
		this.#layout(fresh);

		// Los que ya estaban cuando se abre la sala entran en cascada; los que
		// llegan después, de uno en uno según llegan. En el podio suben al revés,
		// del último al primero, como en una entrega de medallas: el que gana, al
		// final, cuando ya están todos mirando.
		const stagger = this.#firstBatch ? 0.14 : 0;
		fresh.forEach((slot, i) => {
			const delay = podium ? 0.6 + (fresh.length - 1 - i) * 0.55 : 0.15 + i * stagger;
			slot.puppet?.enter("cae", delay);
		});
		if (actors.length > 0) this.#firstBatch = false;
	}

	setSize(width: number, height: number): void {
		if (width <= 0 || height <= 0) return;
		this.#view = { width, height };
		this.#renderer.setSize(width, height, false);
		this.#camera.aspect = width / height;
		this.#camera.updateProjectionMatrix();
		// La formación depende de la forma del escenario: al girar el móvil cabe
		// más gente por fila.
		this.#layout([]);
	}

	tap(x: number, y: number): string | null {
		const pointer = new Vector2((x / this.#view.width) * 2 - 1, -(y / this.#view.height) * 2 + 1);
		this.#raycaster.setFromCamera(pointer, this.#camera);
		const targets = [...this.#slots.values()]
			.filter((slot) => !slot.removing)
			.map((slot) => slot.hit);
		const hit = this.#raycaster.intersectObjects(targets, false)[0];
		if (!hit) return null;
		const slot = [...this.#slots.values()].find((candidate) => candidate.hit === hit.object);
		if (!slot) return null;
		slot.puppet?.play();
		return slot.id;
	}

	dispose(): void {
		this.#disposed = true;
		this.#renderer.setAnimationLoop(null);
		for (const slot of this.#slots.values()) {
			slot.puppet?.rig.dispose();
			for (const puppet of slot.leaving) puppet.rig.dispose();
		}
		this.#slots.clear();
		const shared = this.#shared;
		for (const geometry of [
			shared.body,
			shared.top,
			shared.rim,
			shared.inlay,
			shared.plane,
			shared.hit,
			shared.column,
			shared.badge,
		])
			geometry.dispose();
		for (const material of [shared.glow, shared.shadow, shared.floor]) material.map?.dispose();
		for (const material of Object.values(shared)) if ("isMaterial" in material) material.dispose();
		for (const medal of this.#medals.values()) {
			medal.badge.map?.dispose();
			for (const material of Object.values(medal)) material.dispose();
		}
		this.#medals.clear();
		this.#renderer.dispose();
		// Soltar el contexto ya, sin esperar al recolector: los móviles dan pocos
		// y entrar y salir de la sala varias veces los agotaría.
		this.#renderer.forceContextLoss();
	}

	// -------------------------------------------------------------------------

	#createSlot(actor: StageActor): Slot {
		const shared = this.#shared;
		const group = new Group();
		const pedestal = new Group();
		pedestal.scale.setScalar(0.001);
		group.add(pedestal);

		const body = new Mesh(shared.body, shared.bodyMaterial);
		body.position.y = PEDESTAL_TOP / 2;
		body.receiveShadow = true;
		const top = new Mesh(shared.top, shared.topMaterial);
		top.rotation.x = -Math.PI / 2;
		top.position.y = PEDESTAL_TOP + 0.001;
		top.receiveShadow = true;
		const rim = new Mesh(shared.rim, actor.highlight ? shared.rimHighlight : shared.rimMaterial);
		rim.rotation.x = Math.PI / 2;
		rim.position.y = PEDESTAL_TOP;
		// Un aro fino por dentro, como el grabado de una peana de verdad.
		const inlay = new Mesh(shared.inlay, shared.rimMaterial);
		inlay.rotation.x = Math.PI / 2;
		inlay.position.y = PEDESTAL_TOP + 0.002;
		const glow = new Mesh(shared.plane, shared.glow);
		glow.rotation.x = -Math.PI / 2;
		glow.scale.setScalar(2.6);
		glow.position.y = -0.01;
		pedestal.add(body, top, rim, inlay, glow);

		const shadow = new Mesh(shared.plane, shared.shadow);
		shadow.rotation.x = -Math.PI / 2;
		shadow.position.y = PEDESTAL_TOP + 0.003;
		pedestal.add(shadow);

		const stand = new Group();
		stand.position.y = PEDESTAL_TOP;
		group.add(stand);

		const hit = new Mesh(shared.hit, shared.invisible);
		hit.position.y = 1.2;
		group.add(hit);

		// En el podio, bajo la peana va la columna del escalón con su número
		// delante y su sombra en el suelo. Empiezan sin alto: suben desde el
		// suelo con la peana encima.
		let column: Mesh | null = null;
		let badge: Mesh | null = null;
		let ground: Mesh | null = null;
		if (this.#options.variant === "podio") {
			column = new Mesh(shared.column, shared.bodyMaterial);
			column.castShadow = true;
			column.receiveShadow = true;
			column.scale.set(1, 0.001, 1);
			badge = new Mesh(shared.badge, shared.invisible);
			badge.position.z = PEDESTAL_R + 0.03;
			badge.visible = false;
			ground = new Mesh(shared.plane, shared.shadow);
			ground.rotation.x = -Math.PI / 2;
			ground.scale.setScalar(PEDESTAL_R * 3.4);
			group.add(column, badge, ground);
		}

		this.#scene.add(group);
		const slot: Slot = {
			id: actor.id,
			seed: actor.seed,
			group,
			pedestal,
			stand,
			body,
			top,
			rim,
			glow,
			shadow,
			hit,
			column,
			badge,
			ground,
			place: actor.place,
			puppet: this.#kit ? this.#makePuppet(this.#kit, actor.seed, actor.place) : null,
			facing: 0,
			leaving: [],
			spot: { x: 0, y: 0, z: 0, row: 0 },
			grown: 0,
			removing: false,
		};
		this.#dress(slot, actor.highlight ?? false);
		if (slot.puppet) this.#mount(slot, slot.puppet);
		return slot;
	}

	/** La peana del color que le toca: la de siempre, o la del escalón de su puesto en el podio. */
	#dress(slot: Slot, highlight: boolean): void {
		const shared = this.#shared;
		const medal = this.#medal(slot.place);
		slot.body.material = medal?.body ?? shared.bodyMaterial;
		slot.top.material = medal?.top ?? shared.topMaterial;
		slot.rim.material = highlight ? shared.rimHighlight : (medal?.rim ?? shared.rimMaterial);
		if (slot.column) slot.column.material = medal?.body ?? shared.bodyMaterial;
		if (slot.badge) slot.badge.material = medal?.badge ?? shared.invisible;
		// El resplandor de la peana es de la sala, como el del suelo; en lo alto
		// de una columna, además, se quedaría flotando.
		slot.glow.visible = this.#options.variant !== "podio";
	}

	/** Los materiales del escalón de un puesto, o nada si ese puesto no sube al podio. */
	#medal(place: number | undefined) {
		if (this.#options.variant !== "podio" || place === undefined) return undefined;
		const colors = MEDALS[place];
		if (!colors) return undefined;
		let medal = this.#medals.get(place);
		if (!medal) {
			medal = {
				// Mates, como los slimes: con brillo de metal reflejarían la cúpula
				// morada del estudio y la plata saldría lila.
				body: new MeshStandardMaterial({ color: colors.body, roughness: 0.75, metalness: 0.05 }),
				top: new MeshStandardMaterial({ color: colors.top, roughness: 0.6, metalness: 0.05 }),
				rim: new MeshBasicMaterial({ color: colors.rim, toneMapped: false }),
				badge: new MeshBasicMaterial({
					map: placeTexture(place),
					transparent: true,
					depthWrite: false,
					toneMapped: false,
				}),
			};
			this.#medals.set(place, medal);
		}
		return medal;
	}

	#makePuppet(kit: Kit, seed: string, place?: number): Actor {
		const look = avatarLook(seed);
		const solo = this.#options.variant === "solo";
		const build = { faceSize: solo ? 512 : 256 };
		const mood =
			this.#options.variant !== "podio"
				? undefined
				: place === 1
					? PODIUM_MOOD.winner
					: PODIUM_MOOD.rest;
		const motion: PuppetOptions = {
			calm: this.#options.calm,
			every: mood?.every ?? (solo ? [2.5, 6] : [4, 11]),
			gestures: mood?.gestures,
		};
		return new SlimePuppet(buildSlime(look, kit, build), look.tempo, look.favorite, motion);
	}

	/** Planta a un slime en su peana, con lo que suelte aparte (las gotitas). */
	#mount(slot: Slot, puppet: Actor): void {
		slot.stand.add(puppet.rig.root);
		if (puppet.rig.effects) slot.stand.add(puppet.rig.effects);
	}

	/** Cambio de cara: el de antes se derrite y el nuevo brota en su sitio. */
	#swapPuppet(slot: Slot, seed: string): void {
		slot.seed = seed;
		if (slot.puppet) {
			slot.puppet.leave();
			slot.leaving.push(slot.puppet);
		}
		if (!this.#kit) {
			slot.puppet = null;
			return;
		}
		const puppet = this.#makePuppet(this.#kit, seed, slot.place);
		puppet.facing = slot.facing;
		// El de antes tarda en irse (se derrite): el nuevo brota del charco.
		puppet.enter("aparece", this.#options.calm ? 0 : 0.45);
		this.#mount(slot, puppet);
		slot.puppet = puppet;
	}

	/** Llegan las piezas: cada peana recibe a su slime, que cae del cielo. */
	#arrive(kit: Kit): void {
		if (this.#disposed) return;
		this.#kit = kit;
		// En el podio, del último al primero, como al montar (ver `setActors`).
		const podium = this.#options.variant === "podio";
		let delay = podium ? 0.3 : 0.1;
		for (const id of podium ? [...this.#order].reverse() : this.#order) {
			const slot = this.#slots.get(id);
			if (!slot || slot.puppet || slot.removing) continue;
			const puppet = this.#makePuppet(kit, slot.seed, slot.place);
			puppet.facing = slot.facing;
			puppet.enter("cae", delay);
			delay += podium ? 0.55 : 0.14;
			this.#mount(slot, puppet);
			slot.puppet = puppet;
		}
		this.#frameCamera();
	}

	/** Manda a cada uno a su sitio y encuadra. Los recién llegados aparecen ya en él. */
	#layout(fresh: readonly Slot[]): void {
		const spots = this.#formation(this.#order.length);
		// Las columnas del podio salen del suelo: el recién llegado empieza abajo y sube.
		const rise = this.#options.variant === "podio";
		this.#order.forEach((id, index) => {
			const slot = this.#slots.get(id) as Slot;
			const spot = spots[index] as Spot;
			const moved =
				Math.hypot(slot.spot.x - spot.x, slot.spot.z - spot.z, slot.spot.y - spot.y) > 0.2;
			slot.spot = spot;
			if (fresh.includes(slot)) slot.group.position.set(spot.x, rise ? 0 : spot.y, spot.z);
			else if (moved) slot.puppet?.hop();
			slot.facing =
				this.#options.variant === "solo" ? this.#turn.solo : -spot.x * this.#turn.toCenter;
			if (slot.puppet) slot.puppet.facing = slot.facing;
		});
		this.#frameCamera();
	}

	/**
	 * Dónde va cada uno. Si caben en una fila, en uve como en una foto de grupo:
	 * el primero (el anfitrión) delante y en el centro, y el resto alternando a
	 * los lados, un paso atrás y otro adelante. Si no, gradas: cada fila sube un
	 * poco y se corre medio hueco, para que las caras de atrás asomen entre las
	 * de delante.
	 */
	#formation(count: number): Spot[] {
		if (this.#options.variant === "podio") return this.#podium(count);
		if (count <= 1) return [{ x: 0, y: 0, z: 0, row: 0 }];

		const perRow = this.#perRow(count);

		if (count <= perRow) {
			const spacing = count <= 3 ? 1.45 : SPACING;
			return centerOut(count).map((column, rank) => {
				const offset = column - (count - 1) / 2;
				// Por parejas desde el centro: una delante, otra detrás. Es la uve.
				const pair = Math.floor((rank + (count % 2)) / 2);
				const z = pair % 2 ? -0.55 : -0.1 * pair;
				return { x: offset * spacing, y: 0, z, row: 0 };
			});
		}

		const rows = Math.ceil(count / perRow);
		// Delante los justos: las filas de atrás, más lejos, caben más apretadas.
		const sizes = Array.from({ length: rows }, (_, row) => {
			const base = Math.floor(count / rows);
			return base + (row >= rows - (count % rows) ? 1 : 0);
		});
		const spots: Spot[] = [];
		sizes.forEach((size, row) => {
			// Dos filas seguidas con la misma paridad quedarían en columna, cada
			// uno tapando al de detrás: se corren un cuarto de hueco cada una.
			const previous = sizes[row - 1] ?? sizes[row + 1];
			const shift =
				previous !== undefined && previous % 2 === size % 2 ? (row % 2 ? 0.25 : -0.25) : 0;
			for (const column of centerOut(size)) {
				const offset = column - (size - 1) / 2 + shift;
				spots.push({
					x: offset * SPACING,
					y: row * ROW_RISE,
					z: -row * ROW_DEPTH - 0.06 * offset * offset,
					row,
				});
			}
		});
		return spots;
	}

	/**
	 * El podio: el primero en el centro, el segundo a su derecha (la izquierda
	 * de quien mira), el tercero al otro lado y los demás, si los hay, hacia
	 * fuera. Todos en la misma línea, cada uno a la altura de su escalón.
	 */
	#podium(count: number): Spot[] {
		// Si son pares no hay columna en medio: el primero va en la de la derecha
		// de las dos (según se mira), y así el segundo queda a su derecha.
		const columns = centerOut(count, Math.floor(count / 2));
		return this.#order.map((id, rank) => {
			const place = this.#slots.get(id)?.place;
			const offset = (columns[rank] as number) - (count - 1) / 2;
			const step = place === undefined ? 0 : (PODIUM_STEP[place] ?? 0);
			return { x: offset * PODIUM_SPACING, y: step, z: 0, row: 0 };
		});
	}

	/**
	 * Cuántos por fila: el reparto con el que salen más grandes. Una fila más
	 * ancha pide alejar la cámara a lo ancho y una grada más, a lo alto; en un
	 * móvil en vertical suelen ganar dos filas, y en una pantalla apaisada, una
	 * sola fila larga.
	 *
	 * Con dos filas como mucho los nombres no pisan a nadie —los de delante van
	 * bajo la peana y los de atrás sobre la cabeza—; con tres, los de en medio
	 * tapan el cuerpo de los de detrás. Por eso cada fila de más se cobra: sólo
	 * compensa cuando sin ella saldrían diminutos.
	 */
	#perRow(count: number): number {
		const { width, height } = this.#view;
		let best = { perRow: count, score: 0 };
		for (let perRow = Math.min(count, 7); perRow >= 2; perRow--) {
			const rows = Math.ceil(count / perRow);
			const across = Math.min(count, perRow);
			// Medidas aproximadas en unidades del escenario: cada grada suma su
			// subida más lo que asoma por estar un paso más atrás.
			const size = Math.min(width / (across * SPACING + 0.4), height / (2.4 + (rows - 1) * 1.25));
			const score = size * 0.8 ** Math.max(0, rows - 2);
			// De más a menos por fila: ante un empate gana la de menos filas.
			if (score > best.score * 1.02) best = { perRow, score };
		}
		return best.perRow;
	}

	/**
	 * Busca la cámara que encuadra a todos: prueba, mide cuánto sobra o falta
	 * en pantalla y corrige, unas pocas veces. Converge en cuatro o cinco
	 * vueltas porque la perspectiva apenas deforma a estas distancias.
	 */
	#frameCamera(): void {
		const { width, height } = this.#view;
		const variant = this.#options.variant;
		const solo = variant === "solo";
		const podium = variant === "podio";
		const active = this.#order
			.map((id) => this.#slots.get(id))
			.filter((slot): slot is Slot => slot !== undefined && !slot.removing);
		const tiers = active.some((slot) => slot.spot.row > 0);

		const points: Vector3[] = [];
		for (const slot of active) {
			const { x, y, z } = slot.spot;
			const top = y + PEDESTAL_TOP + Math.max(slot.puppet?.rig.height ?? 0, this.#tall) + 0.05;
			// En el podio se encuadra desde el suelo: las columnas también cuentan.
			const bottom = podium ? 0 : y;
			for (const dx of [-PEDESTAL_R, PEDESTAL_R]) {
				for (const dz of [-PEDESTAL_R, PEDESTAL_R]) {
					points.push(new Vector3(x + dx, bottom, z + dz), new Vector3(x + dx, top, z + dz));
				}
			}
		}
		if (points.length === 0) points.push(new Vector3(-1, 0, 0), new Vector3(1, 2, 0));
		if (variant === "sala" && active.length <= 2) {
			// Uno o dos solos no llenan el escenario: se deja sitio a los que vienen.
			points.push(new Vector3(-2, 0, 0), new Vector3(2, 0, 0));
		}

		// Márgenes en píxeles: abajo, sitio para los nombres bajo las peanas;
		// arriba, para los de las gradas, que van sobre la cabeza. El slime
		// solo necesita aire para saltar y dejar sitio a los botones de debajo;
		// en el podio, el que gana salta al celebrarlo y los nombres ocupan dos líneas.
		const margin = solo
			? { top: 56, bottom: 64, side: 32 }
			: podium
				? { top: 30, bottom: 52, side: 12 }
				: { top: tiers ? 34 : 10, bottom: 34, side: 12 };
		const safe = {
			left: -1 + (2 * margin.side) / width,
			right: 1 - (2 * margin.side) / width,
			bottom: -1 + (2 * margin.bottom) / height,
			top: 1 - (2 * margin.top) / height,
		};

		const pitch = solo ? 0.1 : tiers ? 0.3 : 0.2;
		const direction = new Vector3(0, Math.sin(pitch), Math.cos(pitch));
		const camera = this.#camera.clone();
		const target = points
			.reduce((sum, p) => sum.add(p), new Vector3())
			.multiplyScalar(1 / points.length);
		let distance = 12;
		const halfFov = ((camera.fov / 2) * Math.PI) / 180;
		const right = new Vector3();
		const up = new Vector3();
		for (let i = 0; i < 6; i++) {
			camera.position.copy(target).addScaledVector(direction, distance);
			camera.lookAt(target);
			camera.updateMatrixWorld();
			let minX = Infinity;
			let maxX = -Infinity;
			let minY = Infinity;
			let maxY = -Infinity;
			for (const point of points) {
				const p = point.clone().project(camera);
				minX = Math.min(minX, p.x);
				maxX = Math.max(maxX, p.x);
				minY = Math.min(minY, p.y);
				maxY = Math.max(maxY, p.y);
			}
			const scale = Math.max(
				(maxX - minX) / (safe.right - safe.left),
				(maxY - minY) / (safe.top - safe.bottom),
			);
			const halfHeight = Math.tan(halfFov) * distance;
			right.setFromMatrixColumn(camera.matrixWorld, 0);
			up.setFromMatrixColumn(camera.matrixWorld, 1);
			target
				.addScaledVector(
					right,
					((minX + maxX) / 2 - (safe.left + safe.right) / 2) * halfHeight * camera.aspect,
				)
				.addScaledVector(up, ((minY + maxY) / 2 - (safe.bottom + safe.top) / 2) * halfHeight);
			distance *= scale;
		}
		this.#cameraGoal.target.copy(target);
		this.#cameraGoal.position.copy(target).addScaledVector(direction, distance);

		// La sombra de la luz principal, justa para abarcarlos a todos: cuanto
		// más ajustada, más definición tiene.
		const center = new Vector3();
		for (const point of points) center.add(point);
		center.multiplyScalar(1 / points.length);
		const reach = points.reduce((max, point) => Math.max(max, point.distanceTo(center)), 0);
		aimKey(this.#studio, center, reach + 0.6);
		// Antes del primer fotograma no hay de dónde venir: se planta ahí.
		if (this.#last < 0) {
			this.#camera.position.copy(this.#cameraGoal.position);
			this.#cameraLook.copy(this.#cameraGoal.target);
			this.#camera.lookAt(this.#cameraLook);
		}
	}

	#frame = (time: number): void => {
		// Acotado por los dos lados: tras un rato en segundo plano no se salta
		// medio gesto de golpe, y un reloj que vuelve atrás no congela la escena.
		const elapsed = this.#last < 0 ? 0 : (time - this.#last) / 1000;
		const dt = Math.min(Math.max(elapsed, 0), 0.1);
		this.#last = time;
		if (this.#quality.measure(elapsed)) this.#applyQuality();

		const ease = 1 - Math.exp(-dt * 7);
		for (const [id, slot] of this.#slots) {
			slot.group.position.lerp(this.#scratch.set(slot.spot.x, slot.spot.y, slot.spot.z), ease);

			slot.puppet?.update(dt);
			for (const puppet of slot.leaving) puppet.update(dt);
			const done = slot.leaving.filter((puppet) => puppet.gone);
			if (done.length > 0) {
				for (const puppet of done) {
					slot.stand.remove(puppet.rig.root);
					puppet.rig.dispose();
				}
				slot.leaving = slot.leaving.filter((puppet) => !puppet.gone);
			}

			// La peana crece al llegar y, cuando su slime ya se ha ido, mengua.
			const gone = slot.puppet?.gone ?? true;
			const goal = slot.removing ? (gone ? 0 : 1) : 1;
			slot.grown += (goal - slot.grown) * Math.min(1, dt * (goal > slot.grown ? 6 : 9));
			slot.pedestal.scale.setScalar(Math.max(0.001, grow(slot.grown)));

			// La columna del podio llega del suelo a la peana, que va subiendo, y
			// el número sale en cuanto cabe en ella.
			if (slot.column && slot.badge && slot.ground) {
				const rise = Math.max(slot.group.position.y, 0.001);
				const width = Math.max(0.001, grow(slot.grown));
				slot.column.scale.set(width, rise, width);
				slot.column.position.y = -rise / 2;
				slot.badge.position.y = -rise / 2;
				slot.badge.visible = rise > 0.3 && slot.grown > 0.5;
				// La sombra se queda en el suelo mientras la peana sube.
				slot.ground.position.y = -rise + 0.002;
				slot.ground.scale.setScalar(PEDESTAL_R * 3.4 * width);
			}

			// Sombra de contacto: más pequeña y clara cuanto más alto salta.
			const root = slot.puppet?.rig.root;
			const lift = Math.max(0, root?.position.y ?? 0);
			const shadowScale = (this.#footprint / (1 + lift * 0.7)) * (root?.visible ? 1 : 0.001);
			slot.shadow.scale.setScalar(Math.max(0.001, shadowScale));

			if (slot.removing && gone && slot.grown < 0.02) {
				this.#scene.remove(slot.group);
				slot.puppet?.rig.dispose();
				this.#slots.delete(id);
			}
		}

		const follow = 1 - Math.exp(-dt * 4);
		this.#camera.position.lerp(this.#cameraGoal.position, follow);
		this.#cameraLook.lerp(this.#cameraGoal.target, follow);
		this.#camera.lookAt(this.#cameraLook);

		this.#renderer.render(this.#scene, this.#camera);
		this.#placeLabels();
	};

	/** Baja un escalón de calidad: menos píxeles, luego sin sombras. */
	#applyQuality(): void {
		this.#renderer.setPixelRatio(this.#quality.pixelRatio);
		this.#renderer.setSize(this.#view.width, this.#view.height, false);
		this.#studio.key.castShadow = this.#quality.shadows;
	}

	/** Los nombres son HTML (nítidos, accesibles); aquí sólo se colocan. */
	#placeLabels(): void {
		if (this.#options.variant === "solo") return;
		// En el podio, en el suelo delante de cada columna, como la placa de un trofeo.
		const podium = this.#options.variant === "podio";
		const { width, height } = this.#view;
		const point = new Vector3();
		for (const slot of this.#slots.values()) {
			const element = this.#options.label(slot.id);
			if (!element) continue;
			const { x, y, z } = slot.group.position;
			const above = !podium && slot.spot.row > 0;
			if (above) point.set(x, y + PEDESTAL_TOP + (slot.puppet?.rig.height ?? this.#tall) + 0.1, z);
			else point.set(x, podium ? 0 : y, z + PEDESTAL_R);
			point.project(this.#camera);
			const px = ((point.x + 1) / 2) * width;
			const py = ((1 - point.y) / 2) * height;
			element.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, ${above ? "calc(-100% - 2px)" : "6px"})`;
			element.style.opacity = String(slot.removing ? 0 : Math.min(1, slot.grown * 1.5));
		}
	}
}

/**
 * Columnas de dentro afuera: la de `center` primero, luego alternando a los
 * lados, empezando por la izquierda de quien mira.
 */
function centerOut(count: number, center = (count - 1) / 2): number[] {
	return Array.from({ length: count }, (_, i) => i).sort(
		(a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b,
	);
}

/** El número de un escalón del podio, en blanco con borde, para pegarlo delante de la columna. */
function placeTexture(place: number): CanvasTexture {
	const size = 128;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d");
	if (context) {
		const text = String(place);
		context.font = `900 ${size * 0.78}px system-ui, sans-serif`;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.lineJoin = "round";
		context.lineWidth = size * 0.12;
		context.strokeStyle = "rgba(40, 22, 8, 0.45)";
		context.strokeText(text, size / 2, size * 0.54);
		context.fillStyle = "#ffffff";
		context.fillText(text, size / 2, size * 0.54);
	}
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
}

/** Crecer pasándose un poco, como un muelle. */
function grow(x: number): number {
	const k = Math.min(1, Math.max(0, x));
	return 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
}

/**
 * Calidad adaptativa. Un móvil de gama baja con diez slimes, sombras y a
 * doble resolución puede no llegar; en vez de adivinarlo por el modelo, se
 * mira cuánto tardan los fotogramas y, si van lentos un par de segundos
 * seguidos, se baja un escalón. Nunca se vuelve a subir: ir y venir se notaría
 * más que quedarse un poco más borroso.
 */
class Quality {
	/** Escalones, de mejor a peor: resolución y sombras. */
	static #steps = [
		{ ratio: 2, shadows: true },
		{ ratio: 1.5, shadows: true },
		{ ratio: 1.5, shadows: false },
		{ ratio: 1, shadows: false },
	] as const;

	#step = 0;
	#average = 1 / 60;
	/** Segundos de gracia: al empezar se compilan sombreadores y todo va a tirones. */
	#grace = 2;
	#slowFor = 0;

	get pixelRatio(): number {
		const step = Quality.#steps[this.#step] ?? Quality.#steps[0];
		return Math.min(window.devicePixelRatio || 1, step.ratio);
	}

	get shadows(): boolean {
		return (Quality.#steps[this.#step] ?? Quality.#steps[0]).shadows;
	}

	/** Anota un fotograma. Devuelve `true` si toca bajar la calidad. */
	measure(elapsed: number): boolean {
		// Más de un cuarto de segundo es que la pestaña estuvo en segundo plano.
		if (elapsed <= 0 || elapsed > 0.25) return false;
		if (this.#grace > 0) {
			this.#grace -= elapsed;
			return false;
		}
		this.#average += (elapsed - this.#average) * 0.05;
		// Por debajo de unos 36 fotogramas por segundo, la animación ya se nota.
		this.#slowFor = this.#average > 1 / 36 ? this.#slowFor + elapsed : 0;
		if (this.#slowFor < 2 || this.#step >= Quality.#steps.length - 1) return false;
		this.#step++;
		this.#slowFor = 0;
		this.#grace = 1.5;
		return true;
	}
}
