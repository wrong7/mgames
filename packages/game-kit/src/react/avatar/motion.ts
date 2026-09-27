import { type Object3D, Quaternion, Vector3 } from "three";
import type { Expression } from "./face.ts";
import { GESTURES, type Gesture } from "./look.ts";
import type { Doll } from "./model.ts";

/**
 * Cómo se mueve un muñeco.
 *
 * No hay animaciones grabadas: cada fotograma se calcula una pose a partir del
 * reloj —respirar, balancearse, parpadear— y, encima, el gesto que toque, que
 * entra y sale mezclándose para no dar tirones. La pose mueve los huesos del
 * esqueleto (hombros, codos, cadera, rodillas, cuello) y cambia la cara
 * pintada: ojos cerrados al parpadear, ^^ al celebrar, la O del susto.
 *
 * La gracia está en lo que no se controla del todo: las pupilas de los ojos
 * saltones van sueltas, con muelle y gravedad, y se quedan atrás cuando el
 * muñeco salta o se gira; los brazos siguen a la pose con retraso, como fideos;
 * la cabeza tiembla como un flan al aterrizar. Todo eso son muelles sencillos,
 * y cada muñeco lleva su propio ritmo (`look.tempo`), así que diez en fila no
 * se mueven como un coro.
 *
 * Nada de esto tiene que coincidir entre móviles: la cara sale de la semilla,
 * pero cuándo hace el tonto cada uno es cosa de cada pantalla.
 */

interface Pose {
	/** Altura sobre la peana. */
	y: number;
	/** Giro sobre sí mismo, además de hacia dónde mira. */
	spin: number;
	/** Aplastado (> 0) o estirado (< 0), desde los pies. */
	squash: number;
	/** Escala general: para aparecer y desaparecer. */
	scale: number;
	bodyX: number;
	bodyZ: number;
	/** Hombros arriba. */
	shrug: number;
	breath: number;
	headX: number;
	headY: number;
	headZ: number;
	/** Brazos: adelante (x < 0) y hacia fuera (z), desde colgar recto; y el codo. */
	armLX: number;
	armLZ: number;
	elbowL: number;
	armRX: number;
	armRZ: number;
	elbowR: number;
	/** Brazos girados sobre sí mismos: el codo dobla hacia arriba en vez de hacia delante. */
	twistL: number;
	twistR: number;
	/** Piernas: adelante (x < 0); y la rodilla. */
	legLX: number;
	legRX: number;
	kneeL: number;
	kneeR: number;
	happy: number;
	open: number;
	/** Cejas: arriba del susto (1) o fruncidas del esfuerzo (-1). */
	browUp: number;
	/** Adónde mirar (-1 a 1 por eje) y cuánto manda eso sobre la mirada suelta. */
	gazeX: number;
	gazeY: number;
	gaze: number;
	/** Pupilas dando vueltas. */
	dizzy: number;
	/** Ojos como platos. */
	wide: number;
	/** Pupilas diminutas: terror. */
	tiny: number;
	/** Bíceps inflados. */
	muscle: number;
}

/** El codo, flojo, cuando no hace nada. */
const REST_ELBOW = 0.18;

/** La pose de estar quieto, con los brazos a `arm` radianes de colgar recto. */
function restPose(arm: number): Pose {
	return {
		y: 0,
		spin: 0,
		squash: 0,
		scale: 1,
		bodyX: 0,
		bodyZ: 0,
		shrug: 0,
		breath: 0,
		headX: 0,
		headY: 0,
		headZ: 0,
		armLX: 0,
		armLZ: arm,
		elbowL: REST_ELBOW,
		armRX: 0,
		armRZ: -arm,
		elbowR: REST_ELBOW,
		twistL: 0,
		twistR: 0,
		legLX: 0,
		legRX: 0,
		kneeL: 0,
		kneeR: 0,
		happy: 0,
		open: 0,
		browUp: 0,
		gazeX: 0,
		gazeY: 0,
		gaze: 0,
		dizzy: 0,
		wide: 0,
		tiny: 0,
		muscle: 0,
	};
}

/** Cuánto dura cada gesto, en segundos (a ritmo 1). */
const DURATION: Record<Gesture, number> = {
	saludo: 1.8,
	salto: 1.0,
	baile: 2.6,
	vuelta: 1.1,
	celebra: 1.8,
	mira: 2.4,
	aplaude: 1.6,
	encoge: 1.3,
	culazo: 2.2,
	flexiona: 1.9,
	gallina: 2.6,
	grita: 1.5,
};

export interface PuppetOptions {
	/** `prefers-reduced-motion`: se queda casi quieto y no hace gestos solo. */
	calm?: boolean;
	/** Cada cuánto hace algo por su cuenta, en segundos (mínimo y máximo). */
	every?: readonly [number, number];
	/**
	 * Los gestos que hace por su cuenta y al tocarlo. Sin decir nada, cualquiera,
	 * con querencia por su favorito; en un podio, el que gana sólo celebra.
	 */
	gestures?: readonly Gesture[];
}

export type Entrance = "cae" | "aparece";

/** Un muelle de hasta tres ejes: una pupila, un brazo con su codo. */
interface Spring {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
}

const spring = (x = 0, y = 0, z = 0): Spring => ({ x, y, z, vx: 0, vy: 0, vz: 0 });

export class Puppet {
	readonly rig: Doll;
	/** Hacia dónde mira en reposo (giro en Y). */
	facing = 0;
	#tempo: number;
	#favorite: Gesture;
	#calm: boolean;
	#every: readonly [number, number];
	#gestures: readonly Gesture[] | undefined;
	#time: number;
	#gesture: { kind: Gesture; t: number; duration: number; side: 1 | -1 } | null = null;
	#untilGesture: number;
	#blink = { wait: 1 + Math.random() * 3, t: -1 };
	#entrance: { kind: Entrance; t: number } | null = null;
	#exit: { t: number } | null = null;
	#hop: { t: number } | null = null;
	#gone = false;
	#closed = 0;
	/** Mareo que queda después de un golpe: se va pasando solo. */
	#daze = 0;
	#floaterRest: number;

	// Muelles: pupilas, brazos y el temblor de la cabeza.
	#gaze: Gaze;
	#arms: { left: Spring; right: Spring };
	#jelly = { value: 0, velocity: 0 };
	#lastY = 0;
	#lastVY = 0;

	constructor(rig: Doll, tempo: number, favorite: Gesture, options: PuppetOptions = {}) {
		this.rig = rig;
		this.#tempo = tempo;
		this.#favorite = favorite;
		this.#calm = options.calm ?? false;
		this.#every = options.every ?? [4, 11];
		this.#gestures = options.gestures?.length ? options.gestures : undefined;
		this.#time = Math.random() * 100;
		this.#untilGesture = this.#nextWait();
		this.#floaterRest = rig.floater?.position.y ?? 0;
		this.#gaze = new Gaze(rig.pupils);
		this.#arms = {
			left: spring(0, rig.restArm, REST_ELBOW),
			right: spring(0, -rig.restArm, REST_ELBOW),
		};
		this.#apply(restPose(rig.restArm), 0);
	}

	/** Si ya ha terminado de irse y se puede quitar de la escena. */
	get gone(): boolean {
		return this.#gone;
	}

	get busy(): boolean {
		return this.#gesture !== null || this.#entrance !== null || this.#exit !== null;
	}

	/**
	 * Entra en escena: cayendo del cielo sobre su peana (al llegar a la sala) o
	 * apareciendo de golpe con un saltito (al cambiar de cara).
	 */
	enter(kind: Entrance, delay = 0): void {
		this.#entrance = { kind, t: this.#calm ? 0 : -delay };
		this.rig.root.visible = this.#calm || delay <= 0;
	}

	/** Se va: salta, gira y se encoge hasta desaparecer. */
	leave(): void {
		if (this.#exit) return;
		this.#entrance = null;
		this.#gesture = null;
		this.#exit = { t: 0 };
	}

	/** Un gesto ahora mismo; sin decir cuál, uno al azar con querencia por su favorito. */
	play(kind?: Gesture): void {
		if (this.#exit || this.#entrance) return;
		const chosen = kind ?? this.#pick();
		const gesture = this.#calm ? "saludo" : chosen;
		this.#gesture = {
			kind: gesture,
			t: 0,
			duration: DURATION[gesture],
			side: Math.random() < 0.5 ? 1 : -1,
		};
		this.#untilGesture = this.#nextWait();
	}

	/** Un saltito, para cuando se cambia de sitio en la formación. */
	hop(): void {
		if (this.#calm || this.#exit) return;
		this.#hop = { t: 0 };
	}

	update(dt: number): void {
		const step = Math.min(Math.max(dt, 0), 0.05);
		this.#time += step * this.#tempo;
		const t = this.#time;
		const pose = restPose(this.rig.restArm);
		const calm = this.#calm ? 0.35 : 1;

		// Reposo: respira, se balancea, mira un poco alrededor.
		pose.breath = 0.012 * Math.sin(t * 2.2) * calm;
		pose.bodyZ = 0.035 * Math.sin(t * 1.1) * calm;
		pose.headZ = 0.06 * Math.sin(t * 0.9 + 1.3) * calm;
		pose.headY = 0.16 * Math.sin(t * 0.33 + 0.4) * calm;
		pose.headX = 0.03 * Math.sin(t * 1.3) * calm;
		const armSwing = 0.035 * Math.sin(t * 2.2 + 0.5) * calm;
		pose.armLZ = this.rig.restArm + armSwing;
		pose.armRZ = -this.rig.restArm - armSwing;
		pose.armLX = 0.06 * Math.sin(t * 1.1 + 0.3) * calm;
		pose.armRX = -pose.armLX;
		pose.dizzy = Math.min(1, this.#daze);
		this.#daze = Math.max(0, this.#daze - step * 0.9);

		this.#updateGesture(step, pose);
		this.#updateHop(step, pose);
		this.#updateEntrance(step, pose);
		this.#updateExit(step, pose);
		this.#updateBlink(step, pose);

		if (!this.#calm && !this.busy) {
			this.#untilGesture -= step;
			if (this.#untilGesture <= 0) this.play();
		}

		if (this.rig.spinner) this.rig.spinner.rotation.y += step * 14;
		if (this.rig.floater) {
			this.rig.floater.position.y = this.#floaterRest + 0.03 * Math.sin(t * 2.4);
		}

		this.#apply(pose, step);
	}

	// -------------------------------------------------------------------------

	#updateGesture(dt: number, pose: Pose): void {
		const gesture = this.#gesture;
		if (!gesture) return;
		gesture.t += dt * this.#tempo;
		const { t: g, duration, side } = gesture;
		if (g >= duration) {
			this.#gesture = null;
			return;
		}
		// Entra y sale mezclándose con el reposo: sin tirones al empezar ni al acabar.
		const w = Math.min(1, g / 0.15, (duration - g) / 0.22);
		const target = { ...pose };
		const beat = g * Math.PI * 2 * 2.2;

		switch (gesture.kind) {
			case "saludo": {
				// Brazo arriba y la mano de lado a lado desde el codo.
				const wave = Math.sin(g * 14);
				if (side > 0) {
					target.armLZ = 1.6;
					target.armLX = -0.25;
					target.twistL = 1.35;
					target.elbowL = 0.95 + 0.4 * wave;
				} else {
					target.armRZ = -1.6;
					target.armRX = -0.25;
					target.twistR = 1.35;
					target.elbowR = 0.95 + 0.4 * wave;
				}
				target.headZ = -side * 0.12;
				target.bodyZ = -side * 0.05;
				target.happy = g > 0.2 ? 1 : 0;
				target.browUp = 0.5;
				target.gaze = 0.8;
				break;
			}
			case "salto": {
				const crouch = 0.18;
				const air = 0.5;
				if (g < crouch) {
					// Coge impulso: se agacha doblando rodillas, brazos atrás.
					const k = smooth(g / crouch);
					target.y = -0.1 * k;
					target.legLX = target.legRX = -0.5 * k;
					target.kneeL = target.kneeR = 1.0 * k;
					target.bodyX = 0.2 * k;
					target.armLZ = 0.3;
					target.armRZ = -0.3;
					target.armLX = target.armRX = 0.7;
					target.browUp = -0.5;
				} else if (g < crouch + air) {
					const k = (g - crouch) / air;
					target.y = 0.95 * 4 * k * (1 - k);
					target.squash = k < 0.3 ? -0.12 * (1 - k / 0.3) : 0;
					target.armLZ = 2.6;
					target.armRZ = -2.6;
					target.elbowL = target.elbowR = 0.2;
					target.legLX = target.legRX = -0.6 * Math.sin(k * Math.PI);
					target.kneeL = target.kneeR = 1.2 * Math.sin(k * Math.PI);
					target.happy = 1;
					target.open = 1;
					target.wide = 1;
					target.browUp = 1;
				} else {
					const k = (g - crouch - air) / (duration - crouch - air);
					target.squash = 0.2 * Math.exp(-6 * k) * Math.cos(k * 12);
					target.happy = 1;
				}
				break;
			}
			case "baile": {
				target.bodyZ = 0.18 * Math.sin(beat);
				target.y = 0.07 * Math.abs(Math.sin(beat));
				target.armLZ = 1.3 + 0.8 * Math.sin(beat);
				target.armRZ = -(1.3 - 0.8 * Math.sin(beat));
				target.elbowL = 1.1 + 0.5 * Math.sin(beat);
				target.elbowR = 1.1 - 0.5 * Math.sin(beat);
				target.twistL = target.twistR = 1.1;
				target.headX = 0.1 * Math.sin(beat * 2);
				target.headZ = -0.12 * Math.sin(beat);
				target.legLX = -0.35 * Math.max(0, Math.sin(beat));
				target.legRX = -0.35 * Math.max(0, -Math.sin(beat));
				target.kneeL = 0.7 * Math.max(0, Math.sin(beat));
				target.kneeR = 0.7 * Math.max(0, -Math.sin(beat));
				target.spin = 0.35 * Math.sin(beat * 0.5);
				target.happy = 1;
				target.gazeX = 0.6 * Math.sin(beat * 0.5);
				target.gaze = 0.7;
				break;
			}
			case "vuelta": {
				const k = g / duration;
				target.y = 0.5 * 4 * k * (1 - k);
				// Acaba antes de que el gesto se desvanezca y entonces vale 0, que es lo
				// mismo que una vuelta: si no, al mezclarse con el reposo la desharía.
				target.spin = k < 0.8 ? side * Math.PI * 2 * smooth(k / 0.8) : 0;
				target.armLZ = 1.35;
				target.armRZ = -1.35;
				target.elbowL = target.elbowR = 0.05;
				target.kneeL = target.kneeR = 0.5 * Math.sin(k * Math.PI);
				target.open = k > 0.2 && k < 0.8 ? 1 : 0;
				target.wide = 1;
				// Tanta vuelta marea.
				if (k > 0.85) this.#daze = Math.max(this.#daze, 1.2);
				break;
			}
			case "celebra": {
				// Puños arriba, dando golpes al aire.
				const pump = Math.sin(g * 16);
				target.armLZ = 2.6 + 0.15 * pump;
				target.armRZ = -(2.6 + 0.15 * Math.sin(g * 16 + 0.6));
				target.elbowL = 0.5 + 0.35 * pump;
				target.elbowR = 0.5 + 0.35 * Math.sin(g * 16 + 0.6);
				target.y = 0.14 * Math.abs(Math.sin(g * Math.PI * 2.5));
				target.headX = -0.12;
				target.happy = 1;
				target.open = 1;
				target.browUp = 1;
				target.gazeY = 0.7;
				target.gaze = 0.8;
				break;
			}
			case "mira": {
				// Mano de visera y mirar a lo lejos: a un lado, al otro, y vuelta.
				const k = g / duration;
				const look = k < 0.45 ? smooth(k / 0.45) : k < 0.55 ? 1 : 1 - 2 * smooth((k - 0.55) / 0.45);
				target.headY = side * 0.75 * look;
				target.spin = side * 0.2 * look;
				if (side > 0) {
					target.armRZ = -0.55;
					target.armRX = -1.45;
					target.elbowR = 2.05;
				} else {
					target.armLZ = 0.55;
					target.armLX = -1.45;
					target.elbowL = 2.05;
				}
				target.headX = -0.08;
				target.gazeX = side * look;
				target.gaze = 1;
				target.browUp = -0.4;
				break;
			}
			case "aplaude": {
				const clap = Math.sin(g * 18);
				target.armLX = target.armRX = -1.05;
				target.armLZ = -0.3 + 0.22 * clap;
				target.armRZ = 0.3 - 0.22 * clap;
				target.elbowL = target.elbowR = 0.85;
				target.y = 0.03 * Math.abs(Math.sin(g * 9));
				target.happy = 1;
				target.open = 1;
				target.browUp = 0.6;
				break;
			}
			case "encoge": {
				// Ni idea: hombros arriba y las palmas al cielo.
				const k = Math.sin(Math.min(1, g / 0.35) * (Math.PI / 2));
				target.armLZ = 0.55 * k;
				target.armRZ = -0.55 * k;
				target.armLX = target.armRX = -0.35 * k;
				target.elbowL = target.elbowR = REST_ELBOW + 1.3 * k;
				target.shrug = 0.05 * k;
				target.headZ = side * 0.22 * k;
				target.browUp = 0.9 * k;
				target.gazeX = side * 0.7;
				target.gazeY = 0.5;
				target.gaze = k;
				break;
			}
			case "culazo": {
				// Resbala, cae de culo, se queda sentado mareado y se levanta de un brinco.
				const fall = 0.3;
				const seated = 1.55;
				const sit = -HIP_DROP;
				if (g < fall) {
					const k = smooth(g / fall);
					target.legLX = target.legRX = -1.5 * k;
					target.y = sit * k + 0.12 * Math.sin(k * Math.PI);
					target.bodyX = -0.35 * k;
					target.armLZ = 2.3;
					target.armRZ = -2.3;
					target.open = 1;
					target.wide = 1;
					target.tiny = 1;
					target.browUp = 1;
					target.gazeY = 0.8;
					target.gaze = 1;
				} else if (g < seated) {
					target.legLX = target.legRX = -1.5;
					target.kneeL = 0.15;
					target.kneeR = 0.3;
					target.y = sit;
					target.bodyX = -0.15;
					target.armLX = target.armRX = 0.55;
					target.armLZ = 0.55;
					target.armRZ = -0.55;
					target.elbowL = target.elbowR = 0.1;
					target.headZ = 0.1 * Math.sin(g * 5);
					target.browUp = 0.4;
					if (g < fall + 0.1) this.#daze = Math.max(this.#daze, 1.4);
				} else {
					const k = (g - seated) / (duration - seated);
					target.legLX = target.legRX = -1.5 * (1 - smooth(k * 1.6));
					target.kneeL = target.kneeR = 1.2 * Math.sin(Math.min(1, k * 1.6) * Math.PI);
					target.y = sit * (1 - smooth(k * 1.4)) + 0.4 * Math.sin(Math.min(1, k * 1.2) * Math.PI);
					target.armLZ = 1.8 * Math.sin(k * Math.PI);
					target.armRZ = -1.8 * Math.sin(k * Math.PI);
				}
				break;
			}
			case "flexiona": {
				// Saca bíceps: brazos en cruz, antebrazos arriba, y se le hinchan.
				const k = smooth(g / 0.3);
				target.armLZ = 1.45 * k + 0.1 * Math.sin(g * 10) * k;
				target.armRZ = -(1.45 * k + 0.1 * Math.sin(g * 10 + 1) * k);
				target.armLX = target.armRX = 0.1 * k;
				target.twistL = target.twistR = 1.5 * k;
				target.elbowL = target.elbowR = REST_ELBOW + 1.95 * k;
				target.muscle = smooth((g - 0.2) / 0.35) * (1 - smooth((g - duration + 0.4) / 0.3));
				target.shrug = 0.02 * k;
				target.headX = -0.12 * k;
				target.browUp = -0.8;
				target.gazeX = side * 0.6;
				target.gaze = k;
				break;
			}
			case "gallina": {
				// El baile de la gallina: manos en los sobacos, aletea, picotea y cloquea.
				const flap = Math.abs(Math.sin(g * 13));
				const peck = Math.sin(g * 6.5);
				target.armLZ = 0.55 + 0.55 * flap;
				target.armRZ = -(0.55 + 0.55 * flap);
				target.armLX = target.armRX = 0.2;
				target.twistL = target.twistR = 1.3;
				target.elbowL = target.elbowR = 2.4;
				target.headX = 0.25 * peck;
				target.headZ = 0.08 * Math.sin(g * 3.2);
				target.y = 0.04 * Math.abs(peck);
				target.legLX = -0.3 * Math.max(0, peck);
				target.legRX = -0.3 * Math.max(0, -peck);
				target.kneeL = 0.6 * Math.max(0, peck);
				target.kneeR = 0.6 * Math.max(0, -peck);
				target.open = peck > 0.55 ? 1 : 0;
				target.gazeX = 0.5 * Math.sin(g * 2.2);
				target.gaze = 0.6;
				break;
			}
			case "grita": {
				// Grito de terror: manos a la cara, ojos como platos y temblando entero.
				target.open = 1;
				target.wide = 1;
				target.tiny = 1;
				target.browUp = 1;
				target.armLZ = 0.75 + 0.05 * Math.sin(g * 61);
				target.armRZ = -(0.75 + 0.05 * Math.sin(g * 57));
				target.armLX = target.armRX = -1.55;
				target.elbowL = target.elbowR = 2.35;
				target.bodyZ = 0.05 * Math.sin(g * 55);
				target.headZ = 0.06 * Math.sin(g * 47);
				target.y = 0.02 * Math.abs(Math.sin(g * 40));
				target.kneeL = target.kneeR = 0.2;
				target.gaze = 1;
				break;
			}
		}

		blend(pose, target, w);
	}

	#updateHop(dt: number, pose: Pose): void {
		const hop = this.#hop;
		if (!hop) return;
		hop.t += dt;
		const duration = 0.45;
		if (hop.t >= duration) {
			this.#hop = null;
			return;
		}
		const k = hop.t / duration;
		pose.y += 0.4 * 4 * k * (1 - k);
		pose.armLZ = Math.max(pose.armLZ, 1.0 * Math.sin(k * Math.PI));
		pose.armRZ = Math.min(pose.armRZ, -1.0 * Math.sin(k * Math.PI));
		pose.kneeL = pose.kneeR = 0.6 * Math.sin(k * Math.PI);
	}

	#updateEntrance(dt: number, pose: Pose): void {
		const entrance = this.#entrance;
		if (!entrance) return;
		entrance.t += dt;
		const t = entrance.t;
		if (t < 0) {
			this.rig.root.visible = false;
			return;
		}
		this.rig.root.visible = true;
		if (this.#calm) {
			this.#entrance = null;
			return;
		}

		if (entrance.kind === "aparece") {
			const duration = 0.45;
			if (t >= duration) {
				this.#entrance = null;
				return;
			}
			const k = t / duration;
			pose.scale = backOut(Math.min(1, k * 1.4));
			pose.y += 0.3 * 4 * k * (1 - k);
			pose.happy = 1;
			pose.open = 1;
			pose.wide = 1;
			return;
		}

		// Cae del cielo agitando los brazos como un molinillo y aterriza de golpe.
		const height = 3.2;
		const gravity = 24;
		const fall = Math.sqrt((2 * height) / gravity);
		if (t < fall) {
			pose.y = height - 0.5 * gravity * t * t;
			pose.squash = -0.14;
			pose.armLZ = 1.6 + 1.1 * Math.sin(t * 16);
			pose.armRZ = -(1.6 + 1.1 * Math.sin(t * 16 + 2));
			pose.elbowL = 0.6 + 0.5 * Math.sin(t * 16 + 1);
			pose.elbowR = 0.6 + 0.5 * Math.sin(t * 16 + 3);
			pose.legLX = 0.6 * Math.sin(t * 17);
			pose.legRX = -0.6 * Math.sin(t * 17);
			pose.kneeL = 0.5 + 0.5 * Math.sin(t * 17 + 1);
			pose.kneeR = 0.5 - 0.5 * Math.sin(t * 17 + 1);
			pose.open = 1;
			pose.wide = 1;
			pose.tiny = 1;
			pose.browUp = 1;
			pose.gazeY = -0.8;
			pose.gaze = 1;
			return;
		}
		const k = t - fall;
		if (k > 0.9) {
			this.#entrance = null;
			this.play("saludo");
			return;
		}
		if (k < 0.05) this.#daze = Math.max(this.#daze, 1);
		pose.squash = 0.32 * Math.exp(-7 * k) * Math.cos(k * 16);
		pose.kneeL = pose.kneeR = 0.5 * Math.exp(-6 * k);
	}

	#updateExit(dt: number, pose: Pose): void {
		const exit = this.#exit;
		if (!exit) return;
		exit.t += dt;
		const duration = 0.42;
		const k = Math.min(1, exit.t / duration);
		pose.y += 0.8 * Math.sin(k * Math.PI * 0.6);
		pose.spin += k * k * Math.PI * 3;
		pose.scale = 1 - smooth(k);
		pose.happy = 1;
		pose.wide = 1;
		if (k >= 1) {
			this.#gone = true;
			this.rig.root.visible = false;
		}
	}

	#updateBlink(dt: number, pose: Pose): void {
		const blink = this.#blink;
		if (blink.t >= 0) {
			blink.t += dt;
			if (blink.t > 0.14) {
				blink.t = -1;
				blink.wait = 1.8 + Math.random() * 3.5;
			}
		} else {
			blink.wait -= dt;
			if (blink.wait <= 0) blink.t = 0;
		}
		const closed = blink.t >= 0 ? Math.sin((blink.t / 0.14) * Math.PI) : 0;
		this.#closed = pose.happy > 0.5 || pose.wide > 0.5 ? 0 : closed;
	}

	/** Los brazos siguen a la pose con retraso y rebote: fideos, no palos. */
	#updateArms(dt: number, pose: Pose): void {
		if (dt <= 0) return;
		// Aceleración vertical del cuerpo: al saltar, los brazos se quedan atrás.
		const vy = (pose.y - this.#lastY) / dt;
		const ay = Math.max(-60, Math.min(60, (vy - this.#lastVY) / dt));
		this.#lastY = pose.y;
		this.#lastVY = vy;
		const stiffness = this.#gesture || this.#entrance ? 420 : 150;
		const damping = this.#gesture || this.#entrance ? 16 : 12;
		for (const [state, x, z, elbow, side] of [
			[this.#arms.left, pose.armLX, pose.armLZ, pose.elbowL, 1],
			[this.#arms.right, pose.armRX, pose.armRZ, pose.elbowR, -1],
		] as const) {
			state.vx += (stiffness * (x - state.x) - damping * state.vx) * dt;
			state.vy += (stiffness * (z - state.y) - damping * state.vy - side * ay * 0.9) * dt;
			state.vz += (stiffness * 1.4 * (elbow - state.z) - damping * state.vz + ay * 0.5) * dt;
			state.x += state.vx * dt;
			state.y += state.vy * dt;
			state.z = Math.max(0, Math.min(2.6, state.z + state.vz * dt));
		}
		// El flan de la cabeza: los frenazos verticales lo hacen temblar.
		const jelly = this.#jelly;
		jelly.velocity += (-320 * jelly.value - 7 * jelly.velocity + ay * 0.012) * dt;
		jelly.value = Math.max(-0.2, Math.min(0.2, jelly.value + jelly.velocity * dt));
	}

	#apply(pose: Pose, dt: number): void {
		const rig = this.rig;
		const { root } = rig;
		root.position.y = pose.y;
		root.rotation.y = this.facing + pose.spin;
		const s = pose.scale;
		root.scale.set(s * (1 + pose.squash * 0.5), s * (1 - pose.squash), s * (1 + pose.squash * 0.5));

		this.#updateArms(dt, pose);
		const { left, right } = this.#arms;
		rig.pose({
			spineX: pose.bodyX,
			spineZ: pose.bodyZ,
			shrug: pose.shrug,
			breath: pose.breath,
			headX: pose.headX,
			headY: pose.headY,
			headZ: pose.headZ,
			jelly: this.#jelly.value,
			armL: { x: left.x, z: left.y, elbow: left.z, twist: pose.twistL },
			armR: { x: right.x, z: right.y, elbow: right.z, twist: pose.twistR },
			muscle: pose.muscle,
			legL: { x: pose.legLX, knee: pose.kneeL },
			legR: { x: pose.legRX, knee: pose.kneeR },
		});
		rig.express(expression(pose, this.#closed));
		this.#gaze.update(dt, this.#time, pose, rig.eyes, (i, x, y, size) => rig.gaze(i, x, y, size));
	}

	#pick(): Gesture {
		const only = this.#gestures;
		if (only) return only[Math.floor(Math.random() * only.length)] as Gesture;
		if (Math.random() < 0.4) return this.#favorite;
		return GESTURES[Math.floor(Math.random() * GESTURES.length)] as Gesture;
	}

	#nextWait(): number {
		const [min, max] = this.#every;
		return min + Math.random() * (max - min);
	}
}

/** Lo que de una pose le importa a la cara. */
export interface FacePose {
	happy: number;
	open: number;
	browUp: number;
	dizzy: number;
	wide: number;
	tiny: number;
}

/** La cara pintada que va con la pose: se lee de un vistazo, sin medias tintas. */
export function expression(pose: FacePose, closed: number): Expression {
	const scared = pose.tiny > 0.5;
	const eyes =
		pose.dizzy > 0.5
			? "mareo"
			: scared && pose.wide > 0.5
				? "platos"
				: pose.happy > 0.5
					? "felices"
					: closed > 0.5
						? "cerrados"
						: "abiertos";
	const mouth =
		pose.open > 0.5
			? scared
				? "grito"
				: "abierta"
			: pose.dizzy > 0.5
				? "ondulada"
				: pose.browUp < -0.6
					? "mueca"
					: "normal";
	const brows = pose.browUp > 0.4 ? 1 : pose.browUp < -0.4 ? -1 : 0;
	return { eyes, mouth, brows };
}

/** Adónde quiere mirar la pose, y lo que le pasa a las pupilas. */
export interface GazePose {
	gazeX: number;
	gazeY: number;
	gaze: number;
	dizzy: number;
	tiny: number;
}

/**
 * Las pupilas de una cara: cada una con su muelle hacia donde mira, la
 * gravedad si va suelta y el traqueteo del cuerpo, que las deja atrás al
 * saltar. Cuando nadie les dice nada, miran a un sitio, luego a otro, y de vez
 * en cuando se ponen bizcas o cada una por su lado.
 */
export class Gaze {
	#springs: Spring[];
	#loose: boolean[];
	#look = { wait: 0.5, targets: [] as { x: number; y: number }[] };
	#position = new Vector3();
	#velocity = new Vector3();
	#ready = false;

	constructor(pupils: readonly { loose: boolean }[]) {
		this.#springs = pupils.map(() => spring(0, -0.1));
		this.#loose = pupils.map((pupil) => pupil.loose);
		this.#look.targets = pupils.map(() => ({ x: 0, y: 0 }));
	}

	/** Mueve las pupilas; `set` las pone en la cara. `eyes` es lo que se mide para las sacudidas. */
	update(
		dt: number,
		time: number,
		pose: GazePose,
		eyes: Object3D,
		set: (i: number, x: number, y: number, size: number) => void,
	): void {
		if (this.#springs.length === 0 || dt <= 0) return;
		this.#wander(dt);

		// Lo que se ha movido el ojo en el mundo: sus sacudidas empujan las
		// pupilas sueltas, que se quedan atrás como las de plástico.
		eyes.updateWorldMatrix(true, false);
		const position = new Vector3().setFromMatrixPosition(eyes.matrixWorld);
		const velocity = position.clone().sub(this.#position).divideScalar(dt);
		const shake = velocity.clone().sub(this.#velocity).divideScalar(dt);
		if (!this.#ready) shake.set(0, 0, 0);
		else if (shake.length() > 600) shake.setLength(600);
		this.#position.copy(position);
		this.#velocity.copy(velocity);
		this.#ready = true;
		const inverse = new Quaternion().setFromRotationMatrix(eyes.matrixWorld).invert();
		shake.applyQuaternion(inverse);

		this.#springs.forEach((state, i) => {
			const wander = this.#look.targets[i] ?? { x: 0, y: 0 };
			// El mareo gana a todo: cada ojo da vueltas a su aire.
			const spinAngle = time * 11 * (i % 2 ? -1 : 1) + i * 2;
			let tx = wander.x + (pose.gazeX - wander.x) * pose.gaze;
			let ty = wander.y + (pose.gazeY - wander.y) * pose.gaze;
			tx += (Math.cos(spinAngle) * 0.8 - tx) * pose.dizzy;
			ty += (Math.sin(spinAngle) * 0.8 - ty) * pose.dizzy;

			const [stiffness, damping, gravity, jolt] = this.#loose[i]
				? [55, 5, 5, 0.035]
				: [170, 22, 0, 0.006];
			const ax = stiffness * (tx - state.x) - damping * state.vx - shake.x * jolt;
			const ay = stiffness * (ty - state.y) - damping * state.vy - shake.y * jolt - gravity;
			state.vx += ax * dt;
			state.vy += ay * dt;
			state.x += state.vx * dt;
			state.y += state.vy * dt;
			// Dentro del ojo: si se sale, rebota contra el borde.
			const length = Math.hypot(state.x, state.y);
			if (length > 1) {
				const nx = state.x / length;
				const ny = state.y / length;
				state.x = nx;
				state.y = ny;
				const outward = state.vx * nx + state.vy * ny;
				if (outward > 0) {
					state.vx -= 1.6 * outward * nx;
					state.vy -= 1.6 * outward * ny;
				}
			}
			set(i, state.x, state.y, 1 - 0.55 * pose.tiny);
		});
	}

	#wander(dt: number): void {
		const look = this.#look;
		look.wait -= dt;
		if (look.wait > 0) return;
		look.wait = 0.7 + Math.random() * 2.2;
		const roll = Math.random();
		const count = look.targets.length;
		if (roll < 0.1 && count === 2) {
			// Bizco: cada ojo hacia la nariz.
			look.targets = [
				{ x: 0.75, y: -0.1 },
				{ x: -0.75, y: -0.1 },
			];
		} else if (roll < 0.18 && count === 2) {
			// Cada uno a lo suyo.
			look.targets = look.targets.map(() => ({
				x: Math.random() * 1.6 - 0.8,
				y: Math.random() * 1.4 - 0.6,
			}));
			look.wait = 0.8 + Math.random();
		} else {
			const x = roll < 0.4 ? 0 : Math.random() * 1.4 - 0.7;
			const y = roll < 0.4 ? 0 : Math.random() * 1.0 - 0.45;
			look.targets = look.targets.map(() => ({ x, y }));
		}
	}
}

/** Cuánto baja la cadera al sentarse de culo: casi toda la pierna. */
const HIP_DROP = 0.31;

const POSE_KEYS = Object.keys(restPose(0)) as (keyof Pose)[];

function blend(pose: Pose, target: Pose, w: number): void {
	for (const key of POSE_KEYS) pose[key] += (target[key] - pose[key]) * w;
}

export function smooth(x: number): number {
	const k = Math.min(1, Math.max(0, x));
	return k * k * (3 - 2 * k);
}

/** Se pasa un poco del final y vuelve: lo que hace que algo "aparezca" con gracia. */
export function backOut(x: number): number {
	const c = 1.9;
	const k = x - 1;
	return 1 + (c + 1) * k * k * k + c * k * k;
}
