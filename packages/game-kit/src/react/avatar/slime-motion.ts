import { Vector3 } from "three";
import type { Gesture } from "./look.ts";
import { backOut, type Entrance, expression, Gaze, type PuppetOptions, smooth } from "./motion.ts";
import type { SlimeDoll } from "./slime.ts";

/**
 * Cómo se mueve un slime.
 *
 * Como los muñecos (`motion.ts`): cada fotograma sale una pose del reloj y del
 * gesto que toque. Pero la pose sólo dice adónde quiere ir la gelatina; lo que
 * se ve lo mueven muelles, y es ahí donde está la gracia:
 *
 * - Abajo y arriba se aplastan cada uno con su muelle, y el de arriba sigue al
 *   de abajo con retraso: al caer, el golpe sube por el cuerpo como una onda.
 * - El cuerpo se inclina con su muelle y la cima, con otro, da latigazos. Los
 *   dos notan los frenazos: si lo mueven de sitio, se queda atrás y se
 *   bambolea.
 * - Tiembla ovalándose, con muy poco freno, y cada golpe (caer, que lo toquen,
 *   un gesto) le da un meneo más.
 * - Al subir se estira como una gota, ancha arriba; al caer, al revés.
 * - Al aterrizar se chafa, se le ven ondas por la piel y, si ha caído de alto,
 *   le saltan gotitas.
 * - Quieto nunca está: respira con una onda que le sube por el cuerpo y de vez
 *   en cuando le da un temblorcito.
 */

/** Lo que hace un slime por su cuenta de vez en cuando, o al tocarlo. */
export const SLIME_GESTURES = [
	"saluda",
	"salto",
	"aplasta",
	"flan",
	"estira",
	"rebota",
	"vuelta",
	"infla",
	"tiembla",
	"baila",
] as const;
export type SlimeGesture = (typeof SLIME_GESTURES)[number];

/** Cuánto dura cada gesto, en segundos (a ritmo 1). */
const DURATION: Record<SlimeGesture, number> = {
	saluda: 1.9,
	salto: 1.4,
	aplasta: 2,
	flan: 2,
	estira: 2.4,
	rebota: 2,
	vuelta: 1.7,
	infla: 2.8,
	tiembla: 1.6,
	baila: 2.6,
};

/** El favorito de su muñeco, en gelatina: lo más parecido que sabe hacer. */
const FAVORITE: Record<Gesture, SlimeGesture> = {
	saludo: "saluda",
	salto: "salto",
	baile: "baila",
	vuelta: "vuelta",
	celebra: "rebota",
	mira: "estira",
	aplaude: "flan",
	encoge: "aplasta",
	culazo: "aplasta",
	flexiona: "infla",
	gallina: "flan",
	grita: "tiembla",
};

/** Los botes de "rebota", cada uno más bajo, y la gravedad con la que caen. */
const BOUNCES = [0.45, 0.3, 0.16] as const;
const GRAVITY = 24;

/** Adónde quiere ir la gelatina (lo siguen los muelles) y todo lo demás. */
interface Pose {
	/** Altura sobre la peana, y desplazado de su sitio (el globo que hace eses). */
	y: number;
	x: number;
	z: number;
	/** Giro sobre sí mismo, además de hacia dónde mira. */
	spin: number;
	/** Escala general: para aparecer y desaparecer. */
	scale: number;
	/** Aplastado (> 0) o estirado (< 0). */
	squash: number;
	/** Gota: ancho arriba (> 0) o abajo (< 0), además del que da la velocidad. */
	taper: number;
	/** Inclinado: hacia su izquierda (x) y hacia delante (z). */
	leanX: number;
	leanZ: number;
	/** Hacia dónde mira la cima respecto al cuerpo. */
	turn: number;
	/** Muelles menos frenados: tiembla más rato. */
	loose: number;
	melt: number;
	inflate: number;
	/** Tiritar: rápido y sin muelle. */
	shiver: number;
	/** El bracito: fuera (1) o dentro, y cuánto se levanta. */
	arm: number;
	armAngle: number;
	happy: number;
	open: number;
	browUp: number;
	gazeX: number;
	gazeY: number;
	gaze: number;
	dizzy: number;
	wide: number;
	tiny: number;
	/** Ojos apretados. */
	shut: number;
}

function restPose(): Pose {
	return {
		y: 0,
		x: 0,
		z: 0,
		spin: 0,
		scale: 1,
		squash: 0,
		taper: 0,
		leanX: 0,
		leanZ: 0,
		turn: 0,
		loose: 0,
		melt: 0,
		inflate: 0,
		shiver: 0,
		arm: 0,
		armAngle: 0,
		happy: 0,
		open: 0,
		browUp: 0,
		gazeX: 0,
		gazeY: 0,
		gaze: 0,
		dizzy: 0,
		wide: 0,
		tiny: 0,
		shut: 0,
	};
}

/** Un muelle de un eje. */
interface Wobble {
	value: number;
	velocity: number;
}

const wobble = (): Wobble => ({ value: 0, velocity: 0 });

/** Un paso de muelle; devuelve la aceleración, que otro muelle puede notar. */
function follow(state: Wobble, target: number, stiffness: number, damping: number, dt: number) {
	const acceleration = stiffness * (target - state.value) - damping * state.velocity;
	state.velocity += acceleration * dt;
	state.value += state.velocity * dt;
	return acceleration;
}

/** Topes de un muelle: se queda en el borde sin seguir empujando. */
function limit(state: Wobble, min: number, max: number) {
	if (state.value < min) {
		state.value = min;
		state.velocity = Math.max(0, state.velocity);
	} else if (state.value > max) {
		state.value = max;
		state.velocity = Math.min(0, state.velocity);
	}
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Un golpe a la gelatina: cuánto se aplasta de repente, cuánto tiembla, cuántas ondas. */
interface Kick {
	squash?: number;
	oval?: number;
	ripple?: number;
	leanX?: number;
	leanZ?: number;
}

export class SlimePuppet {
	readonly rig: SlimeDoll;
	/** Hacia dónde mira en reposo (giro en Y). */
	facing = 0;
	#tempo: number;
	#favorite: SlimeGesture;
	#calm: boolean;
	#every: readonly [number, number];
	#time: number;
	#gesture: {
		kind: SlimeGesture;
		t: number;
		duration: number;
		side: 1 | -1;
		/** Los golpes que ya le ha dado a la gelatina. */
		kicks: number;
	} | null = null;
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

	// La gelatina: muelles de abajo y de arriba, del cuerpo y de la cima.
	#gaze: Gaze;
	#squashLow = wobble();
	#squashHigh = wobble();
	#taper = wobble();
	#leanX = wobble();
	#leanZ = wobble();
	#whipX = wobble();
	#whipZ = wobble();
	#ovalCos = wobble();
	#ovalSin = wobble();
	/** Hacia dónde mira la cima en el mundo: el cuerpo gira y ella lo sigue. */
	#top = wobble();
	#topGoal = 0;
	#arm = wobble();
	#armSide: 1 | -1 = 1;
	#ripple = { amount: 0, phase: 0 };
	#breath = 0;
	/** Cuándo le toca el próximo temblorcito estando quieto. */
	#untilJiggle = 1 + Math.random() * 2;
	// Por dónde va en el mundo, para notar frenazos y aterrizajes.
	#where = new Vector3();
	#speed = new Vector3();
	#tracking = false;

	constructor(rig: SlimeDoll, tempo: number, favorite: Gesture, options: PuppetOptions = {}) {
		this.rig = rig;
		this.#tempo = tempo;
		this.#favorite = FAVORITE[favorite];
		this.#calm = options.calm ?? false;
		this.#every = options.every ?? [4, 11];
		this.#time = Math.random() * 100;
		this.#untilGesture = this.#nextWait();
		this.#floaterRest = rig.floater?.position.y ?? 0;
		this.#gaze = new Gaze(rig.pupils);
		this.#apply(restPose(), 0);
	}

	/** Si ya ha terminado de irse y se puede quitar de la escena. */
	get gone(): boolean {
		return this.#gone;
	}

	get busy(): boolean {
		return this.#gesture !== null || this.#entrance !== null || this.#exit !== null;
	}

	/**
	 * Entra en escena: cayendo del cielo como una gota que se chafa contra su
	 * peana (al llegar a la sala) o brotando como una burbuja (al cambiar de cara).
	 */
	enter(kind: Entrance, delay = 0): void {
		this.#entrance = { kind, t: this.#calm ? 0 : -delay };
		this.rig.root.visible = this.#calm || delay <= 0;
	}

	/** Se va: se derrite en un charco que se encoge hasta desaparecer. */
	leave(): void {
		if (this.#exit) return;
		this.#entrance = null;
		this.#gesture = null;
		this.#exit = { t: 0 };
		this.#kick({ ripple: 0.03, oval: 0.4 });
	}

	/**
	 * Un gesto ahora mismo; sin decir cuál, uno al azar con querencia por su
	 * favorito. Empiece como empiece, antes le da un meneo: es lo que se nota
	 * al tocarlo.
	 */
	play(kind?: SlimeGesture): void {
		if (this.#exit || this.#entrance) return;
		const chosen = kind ?? this.#pick();
		const gesture = this.#calm ? "saluda" : chosen;
		const side = Math.random() < 0.5 ? 1 : -1;
		this.#gesture = { kind: gesture, t: 0, duration: DURATION[gesture], side, kicks: 0 };
		// El bracito cambia de lado sólo si está dentro.
		if (this.#arm.value < 0.05) this.#armSide = side;
		this.#kick({ squash: 1.6, oval: 0.55, ripple: 0.012 });
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
		const pose = restPose();
		const calm = this.#calm ? 0.35 : 1;

		// Reposo: respira, se mece un poco y mira alrededor (poco: girar la cima
		// es girar la cara entera).
		pose.squash = 0.025 * Math.sin(t * 2.2) * calm;
		pose.leanX = 0.035 * Math.sin(t * 1.1) * calm;
		pose.leanZ = 0.02 * Math.sin(t * 1.3 + 0.7) * calm;
		pose.turn = 0.08 * Math.sin(t * 0.33 + 0.4) * calm;
		pose.dizzy = Math.min(1, this.#daze);
		this.#daze = Math.max(0, this.#daze - step * 0.9);
		// Y de vez en cuando, un temblorcito sin motivo.
		this.#untilJiggle -= step;
		if (this.#untilJiggle <= 0) {
			this.#untilJiggle = 1.8 + Math.random() * 3;
			if (!this.busy) this.#kick({ oval: 0.22 * calm, ripple: 0.004 * calm });
		}

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
		this.rig.splash.update(step);
	}

	// -------------------------------------------------------------------------

	#updateGesture(dt: number, pose: Pose): void {
		const gesture = this.#gesture;
		if (!gesture) return;
		const before = gesture.t;
		gesture.t += dt * this.#tempo;
		const { t: g, duration, side } = gesture;
		if (g >= duration) {
			this.#gesture = null;
			return;
		}
		/** Si el gesto acaba de pasar por el segundo `at`: para dar un golpe una sola vez. */
		const passes = (at: number) => before < at && g >= at;
		// Entra y sale mezclándose con el reposo: sin tirones al empezar ni al acabar.
		const w = Math.min(1, g / 0.15, (duration - g) / 0.22);
		const target = { ...pose };

		switch (gesture.kind) {
			case "saluda": {
				// Le sale un bracito del costado, de golpe, y saluda con él.
				const wave = Math.sin(g * 13);
				target.arm = g > 0.1 ? 1 : 0;
				target.armAngle = 0.6 + 0.3 * wave;
				target.leanX = side * (0.08 + 0.025 * wave);
				target.squash = g < 0.3 ? 0.12 * Math.sin((g / 0.3) * Math.PI) : 0;
				target.happy = g > 0.2 ? 1 : 0;
				target.browUp = 0.5;
				target.gaze = 0.8;
				if (passes(0.14)) this.#kick({ oval: 0.35, ripple: 0.008, leanX: -side * 0.6 });
				break;
			}
			case "salto": {
				const crouch = 0.32;
				const air = 0.5;
				if (g < crouch) {
					// Coge impulso: se chafa, se ensancha por abajo y aprieta los ojos.
					const k = smooth(g / crouch);
					target.squash = 0.36 * k;
					target.taper = -0.12 * k;
					target.leanZ = 0.05 * k;
					target.browUp = -0.8;
					target.shut = k > 0.4 ? 1 : 0;
				} else if (g < crouch + air) {
					// Sale disparado estirado; arriba se redondea y cae (el aterrizaje
					// lo chafa solo: ver `#updateJelly`).
					const k = (g - crouch) / air;
					target.y = 0.7 * 4 * k * (1 - k);
					target.squash = k < 0.5 ? -0.3 * (1 - 2 * k) : -0.06 * (2 * k - 1);
					target.happy = 1;
					target.open = 1;
					target.browUp = 1;
				} else {
					target.happy = 1;
				}
				break;
			}
			case "aplasta": {
				// Plano como una tortita, aguanta apretando los ojos y vuelve de golpe:
				// boing, y tiembla un buen rato.
				const down = 0.12;
				const up = 1;
				if (g < up) {
					target.squash = 0.5 * smooth(g / down) + (g > down ? 0.02 * Math.sin(g * 37) : 0);
					target.taper = -0.1;
					target.shut = 1;
					target.browUp = -1;
				} else {
					const k = (g - up) / (duration - up);
					target.squash = -0.18 * Math.max(0, 1 - k * 3);
					target.y = 0.16 * Math.sin(Math.min(1, k * 2.5) * Math.PI);
					target.loose = 0.7;
					target.wide = 1;
					target.open = k < 0.4 ? 1 : 0;
					target.browUp = 1;
				}
				if (passes(up)) this.#kick({ squash: -4, oval: 0.7, ripple: 0.03 });
				break;
			}
			case "flan": {
				// Como un flan al que le dan un toque: se bambolea entero, con la cima
				// dando latigazos, y le encanta.
				target.loose = 1;
				target.happy = 1;
				target.open = g < 1.2 ? 1 : 0;
				if (passes(0.02)) this.#kick({ leanX: side * 3.6, oval: 1, squash: 1.5, ripple: 0.025 });
				if (passes(0.55)) this.#kick({ leanZ: 2.4, oval: 0.6, ripple: 0.015 });
				if (passes(1.05)) this.#kick({ leanX: -side * 1.6, oval: 0.4 });
				break;
			}
			case "estira": {
				// De puntillas: se estira todo lo que da y mira a lo lejos, a un lado y al otro.
				const k = g / duration;
				const up = smooth(g / 0.35) * (1 - smooth((g - duration + 0.4) / 0.35));
				const look = k < 0.45 ? smooth(k / 0.45) : k < 0.55 ? 1 : 1 - 2 * smooth((k - 0.55) / 0.45);
				target.squash = -0.36 * up;
				target.taper = 0.1 * up;
				target.leanZ = 0.04 * up;
				target.leanX = side * 0.06 * look;
				target.turn = side * 0.55 * look;
				target.gazeX = side * look;
				target.gaze = 1;
				target.browUp = -0.4;
				if (passes(duration - 0.3)) this.#kick({ squash: 2, oval: 0.3 });
				break;
			}
			case "rebota": {
				// Botando como una pelota, cada bote más bajo: se chafa en cada uno.
				let k = g - 0.14;
				if (k < 0) {
					target.squash = 0.24 * smooth(g / 0.14);
					break;
				}
				for (const height of BOUNCES) {
					const air = 2 * Math.sqrt((2 * height) / GRAVITY);
					if (k < air) {
						const a = k / air;
						target.y = height * 4 * a * (1 - a);
						target.squash = -0.14 * Math.abs(1 - 2 * a);
						break;
					}
					k -= air;
				}
				target.happy = 1;
				target.open = 1;
				break;
			}
			case "vuelta": {
				// Una vuelta entera de un saltito: la cima se queda atrás y se
				// retuerce, y dando vueltas se ensancha. Al parar, meneo y mareo.
				const k = g / duration;
				const spin = Math.min(1, k / 0.6);
				// Acabada vale 0, que es lo mismo que una vuelta: al mezclarse con el
				// reposo no se deshace.
				target.spin = spin < 1 ? side * Math.PI * 2 * smooth(spin) : 0;
				target.y = spin < 1 ? 0.22 * Math.sin(spin * Math.PI) : 0;
				target.inflate = spin < 1 ? 0.25 * Math.sin(spin * Math.PI) : 0;
				target.squash = spin < 1 ? 0.1 * Math.sin(spin * Math.PI) : 0;
				target.wide = 1;
				target.open = k > 0.1 && spin < 1 ? 1 : 0;
				if (passes(0.6 * duration)) this.#kick({ oval: 0.8, ripple: 0.02 });
				if (spin >= 1) this.#daze = Math.max(this.#daze, 1.3);
				break;
			}
			case "infla": {
				// Se hincha como un globo a soplidos, aguanta a punto de reventar y lo
				// suelta: sale disparado haciendo eses mientras se desinfla, tiritando.
				const fill = 1;
				const hold = 1.45;
				if (g < fill) {
					const k = g / fill;
					target.inflate = smooth(k) + 0.06 * Math.sin(k * Math.PI * 6);
					target.y = 0.1 * smooth(k);
					target.browUp = -1;
					target.shut = k > 0.15 ? 1 : 0;
					for (const puff of [0.25, 0.58, 0.9]) {
						if (passes(puff)) this.#kick({ ripple: 0.014, oval: 0.15 });
					}
				} else if (g < hold) {
					target.inflate = 1 + 0.03 * Math.sin(g * 40);
					target.y = 0.1 + 0.02 * Math.sin(g * 9);
					target.shiver = 0.25;
					target.wide = 1;
					target.browUp = 1;
				} else {
					const k = (g - hold) / (duration - hold);
					const flight = Math.min(1, k / 0.55);
					target.inflate = 1 - smooth(k / 0.45);
					target.spin = flight < 1 ? side * Math.PI * 4 * smooth(flight) : 0;
					target.y = 0.1 * (1 - flight) + 0.6 * Math.sin(flight * Math.PI);
					target.x = 0.25 * Math.sin(flight * Math.PI * 3) * (1 - flight);
					target.z = 0.15 * Math.sin(flight * Math.PI * 2);
					target.shiver = flight < 1 ? 0.8 : 0;
					target.open = flight < 1 ? 1 : 0;
					target.wide = flight < 1 ? 1 : 0;
					if (flight >= 1) this.#daze = Math.max(this.#daze, 1.3);
				}
				if (passes(hold)) this.#kick({ oval: 0.6, ripple: 0.03 });
				break;
			}
			case "tiembla": {
				// Tiritando de miedo: encogido, echado atrás, con los ojos como platos
				// y castañeteando.
				target.shiver = 1;
				target.squash = 0.15;
				target.leanZ = -0.06;
				target.wide = 1;
				target.tiny = 1;
				target.browUp = 1;
				target.open = Math.sin(g * 28) > 0 ? 1 : 0;
				target.gazeX = side * 0.35 * Math.sin(g * 3);
				target.gaze = 1;
				break;
			}
			case "baila": {
				// Se mece de lado a lado, bota al ritmo y saca el bracito; la cima va
				// detrás del cuerpo en cada vaivén.
				const beat = g * Math.PI * 2 * 2.2;
				target.leanX = 0.12 * Math.sin(beat / 2);
				target.turn = 0.3 * Math.sin(beat / 2);
				target.squash = 0.1 * Math.sin(beat);
				target.y = 0.05 * Math.abs(Math.sin(beat));
				target.arm = 1;
				target.armAngle = 0.3 + 0.35 * Math.sin(beat);
				target.happy = 1;
				target.open = Math.sin(beat) > 0.3 ? 1 : 0;
				target.gazeX = 0.6 * Math.sin(beat / 2);
				target.gaze = 0.7;
				for (let i = 0; i < 6; i++) {
					if (passes(i / 2.2)) this.#kick({ ripple: 0.008, oval: 0.12 });
				}
				break;
			}
		}

		blend(pose, target, w);
	}

	#updateHop(dt: number, pose: Pose): void {
		const hop = this.#hop;
		if (!hop) return;
		hop.t += dt;
		const crouch = 0.1;
		const air = 0.38;
		if (hop.t >= crouch + air) {
			this.#hop = null;
			return;
		}
		if (hop.t < crouch) {
			pose.squash += 0.2 * smooth(hop.t / crouch);
			return;
		}
		const k = (hop.t - crouch) / air;
		pose.y += 0.26 * 4 * k * (1 - k);
		pose.squash -= 0.12 * Math.abs(1 - 2 * k);
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
			// Brota como una burbuja y se queda temblando.
			const duration = 0.5;
			if (t >= duration) {
				this.#entrance = null;
				return;
			}
			const k = t / duration;
			if (t - dt <= 0) this.#kick({ oval: 0.5, ripple: 0.02 });
			pose.scale = backOut(Math.min(1, k * 1.4));
			pose.squash = -0.2 * (1 - k);
			pose.y += 0.2 * 4 * k * (1 - k);
			pose.happy = 1;
			pose.open = 1;
			pose.wide = 1;
			return;
		}

		// Cae del cielo como una gota, bamboleándose, y se chafa al llegar.
		const height = 3.2;
		const fall = Math.sqrt((2 * height) / GRAVITY);
		if (t < fall) {
			pose.y = height - 0.5 * GRAVITY * t * t;
			pose.squash = -0.25;
			pose.leanX = 0.1 * Math.sin(t * 11);
			pose.open = 1;
			pose.wide = 1;
			pose.tiny = 1;
			pose.browUp = 1;
			pose.gazeY = -0.8;
			pose.gaze = 1;
			return;
		}
		const k = t - fall;
		if (k > 1.1) {
			this.#entrance = null;
			this.play("saluda");
			return;
		}
		if (k < 0.05) this.#daze = Math.max(this.#daze, 1);
		pose.squash = 0.15 * Math.exp(-4 * k);
		pose.loose = 0.5;
	}

	#updateExit(dt: number, pose: Pose): void {
		const exit = this.#exit;
		if (!exit) return;
		exit.t += dt;
		// Se derrite en un charco, que luego se encoge hasta desaparecer.
		const duration = 0.85;
		const k = Math.min(1, exit.t / duration);
		pose.melt = smooth(k / 0.6);
		pose.scale = 1 - smooth((k - 0.55) / 0.45);
		pose.happy = 1;
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
		this.#closed = pose.happy > 0.5 || pose.wide > 0.5 ? 0 : Math.max(closed, pose.shut);
	}

	/** Un golpe a la gelatina: los muelles lo notan y se ponen a temblar. */
	#kick(kick: Kick): void {
		this.#squashLow.velocity += kick.squash ?? 0;
		this.#leanX.velocity += kick.leanX ?? 0;
		this.#leanZ.velocity += kick.leanZ ?? 0;
		if (kick.oval) {
			// Un golpe de 1 lo ovala un 15 % hacia un lado cualquiera.
			const angle = Math.random() * Math.PI * 2;
			this.#ovalCos.velocity += kick.oval * 2.1 * Math.cos(angle);
			this.#ovalSin.velocity += kick.oval * 2.1 * Math.sin(angle);
		}
		this.#ripple.amount = Math.min(0.06, this.#ripple.amount + (kick.ripple ?? 0));
	}

	/**
	 * Los muelles de la gelatina. `where` es por dónde va en el mundo: sus
	 * frenazos la inclinan y la chafan.
	 */
	#updateJelly(pose: Pose, dt: number, where: Vector3): void {
		const velocity = where.clone().sub(this.#where).divideScalar(dt);
		const acceleration = velocity.clone().sub(this.#speed).divideScalar(dt);
		const tracking = this.#tracking;
		this.#where.copy(where);
		this.#tracking = true;
		const falling = this.#speed.y;
		this.#speed.copy(velocity);
		if (!tracking) return;

		// Aterrizar: el frenazo al caer la chafa, la hace temblar y, si viene de
		// alto, le saltan gotitas.
		const impact = falling < -1 && velocity.y > falling ? Math.min(9, velocity.y - falling) : 0;
		if (impact > 0.5) {
			this.#kick({
				squash: impact * 1.5,
				oval: impact * 0.06,
				ripple: impact * 0.005,
				leanX: (Math.random() - 0.5) * impact * 0.3,
				leanZ: (Math.random() - 0.5) * impact * 0.2,
			});
			if (impact > 4.5 && !this.#calm) {
				const { root } = this.rig;
				this.rig.splash.burst(
					new Vector3(root.position.x, 0, root.position.z),
					clamp((impact - 4.5) / 4, 0, 1),
				);
			}
		}

		// Los frenazos de lado, en su espacio: si lo mueven, se queda atrás.
		const yaw = this.rig.root.rotation.y;
		const ax = clamp(acceleration.x, -25, 25);
		const az = clamp(acceleration.z, -25, 25);
		const sideways = Math.cos(yaw) * ax - Math.sin(yaw) * az;
		const forward = Math.sin(yaw) * ax + Math.cos(yaw) * az;

		const firm = 1 - 0.6 * pose.loose;
		follow(this.#squashLow, pose.squash, 300, 13 * firm, dt);
		limit(this.#squashLow, -0.45, 0.62);
		// La cima sigue a la base con retraso: por eso el golpe le sube como una onda.
		follow(this.#squashHigh, this.#squashLow.value, 170, 5 * firm, dt);
		limit(this.#squashHigh, -0.5, 0.68);
		const taper = pose.taper + clamp(velocity.y * 0.045, -0.2, 0.22);
		follow(this.#taper, taper, 220, 14, dt);

		const leanX = follow(this.#leanX, pose.leanX, 240, 9 * firm, dt) - sideways * 1.2;
		const leanZ = follow(this.#leanZ, pose.leanZ, 240, 9 * firm, dt) - forward * 1.2;
		this.#leanX.velocity -= sideways * 1.2 * dt;
		this.#leanZ.velocity -= forward * 1.2 * dt;
		// El latigazo: la cima nota cómo acelera el cuerpo, y va detrás.
		follow(this.#whipX, 0, 160, 4 * firm, dt);
		follow(this.#whipZ, 0, 160, 4 * firm, dt);
		this.#whipX.velocity -= (leanX * 0.5 + sideways * 0.6) * dt;
		this.#whipZ.velocity -= (leanZ * 0.5 + forward * 0.6) * dt;
		for (const lean of [this.#leanX, this.#leanZ, this.#whipX, this.#whipZ]) {
			limit(lean, -0.45, 0.45);
		}

		// El óvalo: casi sin freno, tarda en calmarse.
		follow(this.#ovalCos, 0, 200, 2.2 * (1 - 0.3 * pose.loose), dt);
		follow(this.#ovalSin, 0, 200, 2.2 * (1 - 0.3 * pose.loose), dt);
		limit(this.#ovalCos, -0.3, 0.3);
		limit(this.#ovalSin, -0.3, 0.3);

		// La cima sigue al cuerpo cuando gira. Una vuelta entera es volver a estar
		// igual: si la pose salta una vuelta, la cima no tiene que deshacerla.
		const goal = this.facing + pose.spin + pose.turn;
		const lap = Math.round((goal - this.#topGoal) / (Math.PI * 2));
		this.#top.value += lap * Math.PI * 2;
		this.#topGoal = goal;
		follow(this.#top, goal, 170, 9 * (1 - 0.4 * pose.loose), dt);

		follow(this.#arm, pose.arm, 240, 13, dt);
		limit(this.#arm, 0, 1.3);

		this.#ripple.amount *= Math.exp(-3.5 * dt);
		this.#ripple.phase += 18 * dt;
		this.#breath += 2.4 * dt * this.#tempo;
	}

	#apply(pose: Pose, dt: number): void {
		const rig = this.rig;
		const { root } = rig;
		const turn = this.facing + pose.spin;
		root.position.set(pose.x, pose.y, pose.z);
		root.rotation.y = turn;
		root.scale.setScalar(pose.scale);
		if (dt > 0) {
			root.updateWorldMatrix(true, false);
			this.#updateJelly(pose, dt, new Vector3().setFromMatrixPosition(root.matrixWorld));
		}

		// Tiritar va sin muelle, directo: un muelle se lo comería.
		const shiver = pose.shiver;
		const t = this.#time;
		rig.pose({
			squashBottom: this.#squashLow.value,
			squashTop: this.#squashHigh.value,
			taper: this.#taper.value,
			leanX: this.#leanX.value + shiver * 0.025 * Math.sin(t * 83),
			leanZ: this.#leanZ.value + shiver * 0.02 * Math.sin(t * 67 + 1),
			whipX: this.#whipX.value,
			whipZ: this.#whipZ.value,
			twist: clamp(this.#top.value - turn, -1.2, 1.2),
			ovalCos: this.#ovalCos.value + shiver * 0.035 * Math.sin(t * 71),
			ovalSin: this.#ovalSin.value,
			ripple: this.#ripple.amount,
			ripplePhase: this.#ripple.phase,
			breath: 0.014 * (this.#calm ? 0.35 : 1),
			breathPhase: this.#breath,
			inflate: pose.inflate,
			melt: pose.melt,
			arm: this.#arm.value,
			armAngle: pose.armAngle,
			armSide: this.#armSide,
		});
		rig.express(expression(pose, this.#closed));
		this.#gaze.update(dt, this.#time, pose, rig.eyes, (i, x, y, size) => rig.gaze(i, x, y, size));
	}

	#pick(): SlimeGesture {
		if (Math.random() < 0.4) return this.#favorite;
		return SLIME_GESTURES[Math.floor(Math.random() * SLIME_GESTURES.length)] as SlimeGesture;
	}

	#nextWait(): number {
		const [min, max] = this.#every;
		return min + Math.random() * (max - min);
	}
}

const POSE_KEYS = Object.keys(restPose()) as (keyof Pose)[];

function blend(pose: Pose, target: Pose, w: number): void {
	for (const key of POSE_KEYS) pose[key] += (target[key] - pose[key]) * w;
}
