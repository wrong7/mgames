import { CanvasTexture, Color, SRGBColorSpace, Vector4 } from "three";
import type { AvatarLook } from "./look.ts";

/**
 * La cara: todo dibujado, con trazo gordo de rotulador, en un lienzo que la
 * cabeza lleva de textura.
 *
 * Es el estilo de los juegos de fiesta: ojos, cejas, nariz, boca, coloretes,
 * bigote o pecas son dibujo plano, sin relieve, y cambian de golpe con el
 * gesto (ojos cerrados al parpadear, ^^ al celebrar, una O enorme al
 * asustarse). Cada cambio vuelve a pintar el lienzo, que es pequeño: sólo se
 * pinta cuando algo cambia.
 *
 * Las pupilas no van en el lienzo: las pinta el sombreador de la cabeza
 * encima del blanco del ojo, en el sitio que diga la animación en cada
 * fotograma. Así miran de un lado a otro y las de los ojos saltones se
 * bambolean sueltas, sin volver a pintar nada y sin dejar de ser dibujo.
 */

/** Tinta de rotulador: casi negro, un poco cálido. */
const INK = "#2a1a22";
const MOUTH = "#5b1a2c";
const TONGUE = "#ff7088";
const WHITE = "#fbfaf6";

/** Un ojo con blanco: dónde va, cómo es de grande y qué parte de él es pupila. */
export interface EyeSpot {
	x: number;
	y: number;
	/** Radio del blanco, en píxeles del lienzo. */
	r: number;
	/** Radio de la pupila respecto al del blanco. */
	pupil: number;
}

/**
 * Dónde va cada cosa, en píxeles del lienzo con la y hacia arriba (como en la
 * cara: el lienzo se pinta volteado para que la cabeza lo lea derecho).
 */
export interface FacePlan {
	/** Píxeles del lienzo por unidad de muñeco. */
	scale: number;
	/** Los ojos: primero el derecho del muñeco (a la izquierda del lienzo). */
	eyes: EyeSpot[];
	/** Dónde van las cejas: el centro de cada una y su largo. */
	brows: { x: number; y: number; w: number }[];
	browWidth: number;
	mouth: { x: number; y: number; w: number };
	nose: { x: number; y: number; r: number };
	cheeks: { x: number; y: number; r: number }[];
	/** El ojo que tapa el parche, si lo hay. */
	patch: { x: number; y: number; r: number } | null;
}

export interface Expression {
	eyes: "abiertos" | "cerrados" | "felices" | "mareo" | "platos";
	mouth: "normal" | "abierta" | "grito" | "mueca" | "ondulada";
	/** Cejas: arriba del susto (1), normales (0) o fruncidas (-1). */
	brows: -1 | 0 | 1;
}

export const CALM: Expression = { eyes: "abiertos", mouth: "normal", brows: 0 };

/** Estilos de ojo con blanco, donde se mueve la pupila. */
const WITH_WHITES = new Set<AvatarLook["eyes"]>(["saltones", "redondos", "vagos", "brillantes"]);

/** Los platos del susto: el blanco crece y la pupila se queda en un punto. */
const WIDE = 1.2;

/** Lo que el sombreador de la cabeza necesita para pintar las pupilas. */
export interface PupilUniforms {
	/** Blanco de cada ojo en la textura: centro (u, v) y radios. La v crece hacia abajo. */
	uEyeWhite: { value: Vector4[] };
	/** Pupila de cada ojo: centro (u, v), radio y si se ve (1) o no (0). */
	uPupil: { value: Vector4[] };
	/** Por encima de esta v, el párpado tapa la pupila. */
	uLid: { value: number[] };
	uInk: { value: Color };
}

export class Face {
	readonly texture: CanvasTexture;
	readonly uniforms: PupilUniforms;
	/** Si las pupilas son sueltas (ojos saltones): se bambolean y cuelgan. */
	readonly loose: boolean;
	#canvas: HTMLCanvasElement;
	#context: CanvasRenderingContext2D | null;
	#look: AvatarLook;
	#plan: FacePlan;
	#key = "";
	#wide = 1;
	#visible: boolean[] = [];

	constructor(look: AvatarLook, plan: FacePlan, size: number) {
		this.#look = look;
		this.#plan = plan;
		this.loose = look.eyes === "saltones";
		this.#canvas = document.createElement("canvas");
		this.#canvas.width = size;
		this.#canvas.height = size;
		this.#context = this.#canvas.getContext("2d");
		this.texture = new CanvasTexture(this.#canvas);
		this.texture.colorSpace = SRGBColorSpace;
		// Las UV del kit (glTF) cuentan la v desde arriba, como el lienzo: sin voltear.
		this.texture.flipY = false;
		this.texture.anisotropy = 4;
		this.uniforms = {
			uEyeWhite: { value: [new Vector4(), new Vector4()] },
			uPupil: { value: [new Vector4(), new Vector4()] },
			uLid: { value: [-1, -1] },
			uInk: { value: new Color(INK) },
		};
		this.show(CALM);
	}

	/** Cuántas pupilas mueve la animación: las de los ojos con blanco. */
	get pupils(): number {
		return WITH_WHITES.has(this.#look.eyes) ? this.#plan.eyes.length : 0;
	}

	/** Pone ese gesto, si no es el que ya tiene. */
	show(expression: Expression): void {
		const key = `${expression.eyes}|${expression.mouth}|${expression.brows}`;
		if (key === this.#key) return;
		this.#key = key;
		const whites = WITH_WHITES.has(this.#look.eyes);
		// Con los ojos cerrados o en ^^ no hay pupila; mareado, da vueltas en el blanco.
		const open =
			expression.eyes === "abiertos" || expression.eyes === "platos" || expression.eyes === "mareo";
		this.#wide = expression.eyes === "platos" ? WIDE : 1;
		this.#visible = this.#plan.eyes.map((eye) => whites && open && !this.#patched(eye));
		this.#placeWhites();
		const ctx = this.#context;
		if (!ctx) return;
		this.#paint(ctx, expression);
		this.texture.needsUpdate = true;
	}

	/**
	 * Adónde mira la pupila `i`: `x` e `y` de -1 a 1 dentro del blanco (arriba
	 * es positivo) y `size` para encogerla del susto.
	 */
	gaze(i: number, x: number, y: number, size: number): void {
		const eye = this.#plan.eyes[i];
		const pupil = this.uniforms.uPupil.value[i];
		const white = this.uniforms.uEyeWhite.value[i];
		if (!eye || !pupil || !white) return;
		const canvas = this.#canvas.width;
		const radius = (eye.r * this.#wide * eye.pupil * size) / canvas;
		// Hasta el borde del blanco, sin salirse.
		const reach = Math.max(0, Math.min(white.z, white.w) - radius * 1.05);
		pupil.set(white.x + x * reach, white.y - y * reach, radius, this.#visible[i] ? 1 : 0);
	}

	dispose(): void {
		this.texture.dispose();
		this.#canvas.width = 0;
		this.#canvas.height = 0;
	}

	#patched(eye: EyeSpot): boolean {
		return this.#plan.patch !== null && Math.abs(this.#plan.patch.x - eye.x) < 1;
	}

	/** El blanco de cada ojo en coordenadas de textura, para recortar la pupila. */
	#placeWhites(): void {
		const canvas = this.#canvas.width;
		const lidded = this.#look.eyes === "vagos" || this.#look.sleepy;
		this.#plan.eyes.forEach((eye, i) => {
			const white = this.uniforms.uEyeWhite.value[i];
			if (!white) return;
			const r = (eye.r * this.#wide) / canvas;
			white.set(eye.x / canvas, 1 - eye.y / canvas, r, r * 1.1);
			// El párpado a media asta tapa la parte de arriba (v más pequeña).
			this.uniforms.uLid.value[i] =
				lidded && this.#wide === 1 ? 1 - (eye.y + eye.r * 0.05) / canvas : -1;
			this.gaze(i, 0, 0, 1);
		});
	}

	#paint(ctx: CanvasRenderingContext2D, expression: Expression): void {
		const look = this.#look;
		const plan = this.#plan;
		const size = this.#canvas.width;
		// El plan va con la y hacia arriba; en el lienzo crece hacia abajo.
		ctx.setTransform(1, 0, 0, -1, 0, size);
		ctx.fillStyle = look.skin;
		ctx.fillRect(0, 0, size, size);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		const unit = plan.scale;

		if (look.blush) {
			for (const cheek of plan.cheeks) {
				const gradient = ctx.createRadialGradient(cheek.x, cheek.y, 0, cheek.x, cheek.y, cheek.r);
				gradient.addColorStop(0, "rgba(255, 96, 128, 0.42)");
				gradient.addColorStop(1, "rgba(255, 96, 128, 0)");
				ctx.fillStyle = gradient;
				ctx.beginPath();
				ctx.ellipse(cheek.x, cheek.y, cheek.r, cheek.r * 0.72, 0, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		if (look.face === "pecas") this.#freckles(ctx, unit);

		for (const [i, eye] of plan.eyes.entries()) {
			if (this.#patched(eye)) continue;
			paintEye(ctx, look, expression.eyes, eye, i === 0 ? -1 : 1);
		}
		this.#brows(ctx, expression);
		this.#nose(ctx, unit);
		this.#mouth(ctx, expression, unit);
		if (look.face === "bigote") this.#mustache(ctx, unit);
		if (look.face === "tirita") this.#bandAid(ctx, unit);
		if (plan.patch) this.#patch(ctx, unit);
	}

	#brows(ctx: CanvasRenderingContext2D, expression: Expression): void {
		const { brows: style } = this.#look;
		if (style === "ninguna") return;
		const plan = this.#plan;
		const mood = expression.brows;
		ctx.strokeStyle = INK;
		ctx.lineWidth = plan.browWidth;
		// Cuánto sube y cuánto se inclina: fruncido baja por dentro, susto sube.
		const lift = mood * plan.browWidth * 1.4 + (style === "levantadas" ? plan.browWidth * 1.2 : 0);
		const baseTilt = style === "enfadadas" ? -0.35 : style === "preocupadas" ? 0.32 : 0;
		const tilt = baseTilt + (mood < 0 ? -0.3 : mood > 0 ? 0.18 : 0);
		if (style === "uniceja") {
			const [a, b] = plan.brows;
			if (!a || !b) return;
			const y = (a.y + b.y) / 2 + lift;
			const middle = (a.x + b.x) / 2;
			ctx.beginPath();
			ctx.moveTo(a.x - a.w / 2, y - a.w * 0.08);
			ctx.bezierCurveTo(a.x, y + a.w * 0.22, middle, y - a.w * 0.1, middle, y);
			ctx.bezierCurveTo(middle, y - a.w * 0.1, b.x, y + a.w * 0.22, b.x + b.w / 2, y - a.w * 0.08);
			ctx.stroke();
			return;
		}
		for (const [i, brow] of plan.brows.entries()) {
			// La punta de dentro es la que mira a la nariz.
			const inward = i === 0 ? 1 : -1;
			const half = brow.w / 2;
			const dy = Math.sin(tilt) * half;
			const arch = style === "normales" || style === "levantadas" ? brow.w * 0.16 : brow.w * 0.06;
			ctx.beginPath();
			ctx.moveTo(brow.x - inward * half, brow.y + lift - dy);
			ctx.quadraticCurveTo(
				brow.x,
				brow.y + lift + arch,
				brow.x + inward * half,
				brow.y + lift + dy,
			);
			ctx.stroke();
		}
	}

	#nose(ctx: CanvasRenderingContext2D, unit: number): void {
		const kind = this.#look.nose;
		if (kind === "ninguna") return;
		const { x, y, r } = this.#plan.nose;
		if (kind === "payaso") {
			ctx.fillStyle = "#ff2d3d";
			ctx.beginPath();
			ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = INK;
			ctx.lineWidth = unit * 0.012;
			ctx.stroke();
			shine(ctx, x - r * 0.45, y + r * 0.45, r * 0.32);
			return;
		}
		// Una bolita o una narizota de patata: un poco más oscura que la piel,
		// con su raya por debajo y un brillo, como en los dibujos animados.
		const big = kind === "narizota";
		const rx = r * (big ? 1.45 : 1);
		const ry = r * (big ? 1.25 : 0.85);
		const shade = new Color(this.#look.skin).lerp(new Color("#c2574e"), 0.28);
		ctx.fillStyle = `#${shade.getHexString()}`;
		ctx.beginPath();
		ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = INK;
		ctx.lineWidth = unit * 0.014;
		ctx.beginPath();
		ctx.ellipse(x, y, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
		ctx.stroke();
		shine(ctx, x - rx * 0.4, y + ry * 0.35, r * 0.26);
	}

	#mouth(ctx: CanvasRenderingContext2D, expression: Expression, unit: number): void {
		const { x, y, w } = this.#plan.mouth;
		const line = unit * 0.026;
		ctx.lineWidth = line;
		ctx.strokeStyle = INK;
		const kind =
			expression.mouth === "normal"
				? this.#look.mouth
				: expression.mouth === "abierta"
					? "risa"
					: expression.mouth === "grito"
						? "grito"
						: expression.mouth === "mueca"
							? "dientes"
							: "ondulada";

		switch (kind) {
			case "sonrisa": {
				ctx.beginPath();
				ctx.moveTo(x - w / 2, y + w * 0.1);
				ctx.quadraticCurveTo(x, y - w * 0.32, x + w / 2, y + w * 0.1);
				ctx.stroke();
				break;
			}
			case "risa": {
				// Una D tumbada: arriba casi recta, abajo la curva, con lengua.
				const top = y + w * 0.12;
				open(
					ctx,
					() => {
						ctx.moveTo(x - w / 2, top);
						ctx.quadraticCurveTo(x, top + w * 0.06, x + w / 2, top);
						ctx.bezierCurveTo(
							x + w * 0.42,
							y - w * 0.42,
							x - w * 0.42,
							y - w * 0.42,
							x - w / 2,
							top,
						);
					},
					{ x, y: y - w * 0.32, rx: w * 0.24, ry: w * 0.13 },
				);
				break;
			}
			case "o": {
				open(ctx, () => ctx.ellipse(x, y, w * 0.16, w * 0.2, 0, 0, Math.PI * 2), null);
				break;
			}
			case "boquiabierta": {
				open(ctx, () => ctx.ellipse(x, y - w * 0.05, w * 0.28, w * 0.34, 0, 0, Math.PI * 2), {
					x,
					y: y - w * 0.3,
					rx: w * 0.2,
					ry: w * 0.1,
				});
				break;
			}
			case "grito": {
				open(ctx, () => ctx.ellipse(x, y - w * 0.12, w * 0.3, w * 0.46, 0, 0, Math.PI * 2), {
					x,
					y: y - w * 0.46,
					rx: w * 0.2,
					ry: w * 0.11,
				});
				break;
			}
			case "gato": {
				ctx.beginPath();
				ctx.moveTo(x - w * 0.36, y + w * 0.04);
				ctx.quadraticCurveTo(x - w * 0.18, y - w * 0.24, x, y);
				ctx.quadraticCurveTo(x + w * 0.18, y - w * 0.24, x + w * 0.36, y + w * 0.04);
				ctx.stroke();
				break;
			}
			case "lengua": {
				ctx.fillStyle = TONGUE;
				ctx.beginPath();
				ctx.moveTo(x - w * 0.02, y - w * 0.05);
				ctx.lineTo(x + w * 0.26, y - w * 0.05);
				ctx.bezierCurveTo(
					x + w * 0.28,
					y - w * 0.38,
					x - w * 0.04,
					y - w * 0.38,
					x - w * 0.02,
					y - w * 0.05,
				);
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(x + w * 0.12, y - w * 0.08);
				ctx.lineTo(x + w * 0.12, y - w * 0.2);
				ctx.lineWidth = line * 0.6;
				ctx.stroke();
				ctx.lineWidth = line;
				ctx.beginPath();
				ctx.moveTo(x - w / 2, y + w * 0.06);
				ctx.quadraticCurveTo(x, y - w * 0.14, x + w / 2, y + w * 0.06);
				ctx.stroke();
				break;
			}
			case "dientes": {
				const top = y + w * 0.1;
				const bottom = y - w * 0.18;
				ctx.fillStyle = WHITE;
				ctx.beginPath();
				ctx.moveTo(x - w * 0.5, top);
				ctx.quadraticCurveTo(x, top - w * 0.06, x + w * 0.5, top);
				ctx.quadraticCurveTo(x + w * 0.5, bottom, x + w * 0.3, bottom);
				ctx.lineTo(x - w * 0.3, bottom);
				ctx.quadraticCurveTo(x - w * 0.5, bottom, x - w * 0.5, top);
				ctx.fill();
				ctx.stroke();
				ctx.lineWidth = line * 0.55;
				ctx.beginPath();
				ctx.moveTo(x - w * 0.46, (top + bottom) / 2);
				ctx.lineTo(x + w * 0.46, (top + bottom) / 2);
				for (const k of [-0.25, 0, 0.25]) {
					ctx.moveTo(x + w * k, top - w * 0.02);
					ctx.lineTo(x + w * k, bottom + w * 0.02);
				}
				ctx.stroke();
				ctx.lineWidth = line;
				break;
			}
			case "recta": {
				ctx.beginPath();
				ctx.moveTo(x - w * 0.36, y);
				ctx.lineTo(x + w * 0.36, y);
				ctx.stroke();
				break;
			}
			case "torcida": {
				ctx.beginPath();
				ctx.moveTo(x - w * 0.4, y - w * 0.02);
				ctx.quadraticCurveTo(x + w * 0.05, y - w * 0.12, x + w * 0.42, y + w * 0.14);
				ctx.stroke();
				break;
			}
			case "ondulada": {
				ctx.beginPath();
				for (let i = 0; i <= 16; i++) {
					const k = i / 16;
					const px = x - w * 0.42 + k * w * 0.84;
					const py = y + Math.sin(k * Math.PI * 3) * w * 0.07;
					if (i === 0) ctx.moveTo(px, py);
					else ctx.lineTo(px, py);
				}
				ctx.stroke();
				break;
			}
		}
	}

	/** Bigote de manillar, del color del pelo, entre la nariz y la boca. */
	#mustache(ctx: CanvasRenderingContext2D, unit: number): void {
		const { mouth, nose } = this.#plan;
		const x = mouth.x;
		const y = (mouth.y + (nose.y - nose.r)) / 2 + unit * 0.01;
		const w = mouth.w * 0.62;
		ctx.fillStyle = this.#look.hairColor;
		ctx.strokeStyle = INK;
		ctx.lineWidth = unit * 0.01;
		for (const side of [-1, 1]) {
			ctx.beginPath();
			ctx.moveTo(x, y + w * 0.12);
			ctx.bezierCurveTo(
				x + side * w * 0.5,
				y + w * 0.3,
				x + side * w * 0.9,
				y + w * 0.05,
				x + side * w * 1.02,
				y + w * 0.32,
			);
			ctx.bezierCurveTo(
				x + side * w * 1.1,
				y + w * 0.5,
				x + side * w * 1.3,
				y + w * 0.35,
				x + side * w * 1.18,
				y + w * 0.18,
			);
			ctx.bezierCurveTo(
				x + side * w * 1.05,
				y - w * 0.12,
				x + side * w * 0.5,
				y - w * 0.22,
				x,
				y - w * 0.04,
			);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		}
	}

	#freckles(ctx: CanvasRenderingContext2D, unit: number): void {
		const { cheeks } = this.#plan;
		ctx.fillStyle = "rgba(150, 82, 48, 0.55)";
		const dots = [
			[-0.35, 0.2],
			[0.1, 0.35],
			[0.4, 0.05],
			[-0.05, -0.2],
			[0.35, -0.3],
		] as const;
		for (const cheek of cheeks) {
			for (const [dx, dy] of dots) {
				ctx.beginPath();
				ctx.arc(cheek.x + dx * cheek.r, cheek.y + dy * cheek.r, unit * 0.011, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	#bandAid(ctx: CanvasRenderingContext2D, unit: number): void {
		const cheek = this.#plan.cheeks[1];
		if (!cheek) return;
		ctx.save();
		ctx.translate(cheek.x, cheek.y + cheek.r * 0.35);
		ctx.rotate(0.5);
		const w = unit * 0.16;
		const h = unit * 0.055;
		ctx.fillStyle = "#f3c58f";
		ctx.strokeStyle = "rgba(120, 72, 40, 0.6)";
		ctx.lineWidth = unit * 0.006;
		ctx.beginPath();
		ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = "#e6a86e";
		ctx.fillRect(-h * 0.55, -h / 2, h * 1.1, h);
		ctx.restore();
	}

	#patch(ctx: CanvasRenderingContext2D, unit: number): void {
		const patch = this.#plan.patch;
		if (!patch) return;
		ctx.strokeStyle = INK;
		ctx.lineWidth = unit * 0.02;
		const size = this.#canvas.width;
		ctx.beginPath();
		ctx.moveTo(0, patch.y + patch.r * 1.5);
		ctx.lineTo(size, patch.y + patch.r * 0.2);
		ctx.stroke();
		ctx.fillStyle = "#1c1418";
		ctx.beginPath();
		ctx.ellipse(patch.x, patch.y, patch.r * 1.15, patch.r * 1.05, 0.15, 0, Math.PI * 2);
		ctx.fill();
	}
}

/** Un brillo blanco, de los que hacen que algo parezca redondo sin relieve. */
function shine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
	ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
	ctx.beginPath();
	ctx.ellipse(x, y, r, r * 0.75, -0.5, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * Pinta la boca abierta: el contorno relleno de oscuro y, si hay lengua, la
 * lengua recortada dentro.
 */
function open(
	ctx: CanvasRenderingContext2D,
	shape: () => void,
	tongue: { x: number; y: number; rx: number; ry: number } | null,
): void {
	ctx.fillStyle = MOUTH;
	ctx.beginPath();
	shape();
	ctx.closePath();
	ctx.fill();
	if (tongue) {
		ctx.save();
		ctx.clip();
		ctx.fillStyle = TONGUE;
		ctx.beginPath();
		ctx.ellipse(tongue.x, tongue.y, tongue.rx, tongue.ry, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		ctx.beginPath();
		shape();
		ctx.closePath();
	}
	ctx.stroke();
}

/**
 * Un ojo, del estilo del muñeco o del gesto que toque. Los que tienen blanco
 * se pintan sin pupila: la pone el sombreador, que la mueve.
 */
function paintEye(
	ctx: CanvasRenderingContext2D,
	look: AvatarLook,
	state: Expression["eyes"],
	eye: EyeSpot,
	side: -1 | 1,
): void {
	const { x, y, r } = eye;
	const whites = WITH_WHITES.has(look.eyes);
	ctx.strokeStyle = INK;
	ctx.fillStyle = INK;
	if (state === "cerrados") {
		ctx.lineWidth = r * (whites ? 0.22 : 0.3);
		ctx.beginPath();
		ctx.moveTo(x - r * 0.8, y + r * 0.05);
		ctx.quadraticCurveTo(x, y - r * 0.45, x + r * 0.8, y + r * 0.05);
		ctx.stroke();
		return;
	}
	if (state === "felices" || look.eyes === "felices") {
		ctx.lineWidth = r * (whites ? 0.24 : 0.32);
		ctx.beginPath();
		ctx.moveTo(x - r * 0.75, y - r * 0.2);
		ctx.quadraticCurveTo(x, y + r * 0.8, x + r * 0.75, y - r * 0.2);
		ctx.stroke();
		return;
	}
	if (!whites) {
		if (state === "mareo") {
			ctx.lineWidth = r * 0.16;
			ctx.beginPath();
			for (let i = 0; i <= 40; i++) {
				const a = (i / 40) * Math.PI * 5 * side;
				const k = (i / 40) * r * 0.9;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
			}
			ctx.stroke();
			return;
		}
		// Puntos: dos lentejas negras, con su brillo.
		const size = state === "platos" ? 0.5 : 0.38;
		ctx.beginPath();
		ctx.ellipse(x, y, r * size, r * size * 1.2, 0, 0, Math.PI * 2);
		ctx.fill();
		shine(ctx, x - r * 0.1, y + r * 0.18, r * 0.1);
		return;
	}
	// El blanco, con su contorno. Los saltones lo llevan más fino, como el
	// borde de un ojo de plástico.
	const scale = state === "platos" ? WIDE : 1;
	ctx.fillStyle = WHITE;
	ctx.lineWidth = r * (look.eyes === "saltones" ? 0.1 : 0.14);
	ctx.beginPath();
	ctx.ellipse(x, y, r * scale, r * 1.1 * scale, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	if ((look.eyes === "vagos" || look.sleepy) && state !== "platos") {
		// El párpado a media asta: piel por encima y la raya del párpado.
		ctx.save();
		ctx.beginPath();
		ctx.ellipse(x, y, r * 1.08, r * 1.18, 0, 0, Math.PI * 2);
		ctx.clip();
		ctx.fillStyle = look.skin;
		ctx.fillRect(x - r * 1.3, y + r * 0.05, r * 2.6, r * 1.4);
		ctx.restore();
		ctx.lineWidth = r * 0.18;
		ctx.beginPath();
		ctx.moveTo(x - r * 1.02, y + r * 0.05);
		ctx.lineTo(x + r * 1.02, y + r * 0.05);
		ctx.stroke();
	}
}
