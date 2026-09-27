import { type Object3D, Quaternion, Vector3 } from "three";
import type { Expression } from "./face.ts";
import type { SlimeGesture } from "./look.ts";

/**
 * Piezas del movimiento de los slimes que no son gelatina (esa está en
 * `slime-motion.ts`): sus opciones, la cara que va con cada pose, las pupilas
 * y un par de curvas.
 *
 * Nada de esto tiene que coincidir entre móviles: la cara sale de la semilla,
 * pero cuándo hace el tonto cada uno es cosa de cada pantalla.
 */

export interface PuppetOptions {
	/** `prefers-reduced-motion`: se queda casi quieto y no hace gestos solo. */
	calm?: boolean;
	/**
	 * Cada cuánto hace algo por su cuenta, en segundos (mínimo y máximo). Con
	 * `null`, nunca: sólo cuando se le pide. En la sala es así, porque allí cada
	 * gesto lo manda su jugador y tiene que querer decir algo.
	 */
	every?: readonly [number, number] | null;
	/**
	 * Los gestos que hace por su cuenta y al tocarlo. Sin decir nada, cualquiera,
	 * con querencia por su favorito; en un podio, el que gana sólo celebra.
	 */
	gestures?: readonly SlimeGesture[];
}

/** Cómo entra en escena: cayendo del cielo (al llegar a la sala) o brotando en su sitio (al cambiar de cara). */
export type Entrance = "cae" | "aparece";

/** Un muelle de hasta tres ejes: el de cada pupila. */
interface Spring {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
}

const spring = (x = 0, y = 0, z = 0): Spring => ({ x, y, z, vx: 0, vy: 0, vz: 0 });

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
