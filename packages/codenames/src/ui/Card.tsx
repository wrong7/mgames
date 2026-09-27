import type { PlayerProfile } from "@mgames/game-kit";
import { Avatar } from "@mgames/game-kit/react";
import type { CardKind } from "../engine/index.ts";
import { COLORS } from "../theme.ts";

/** Fondo y color de texto de cada tipo de carta, ya emparejados para que contrasten. */
const FACE: Record<CardKind, { background: string; color: string }> = {
	azul: { background: COLORS.azul, color: "#ffffff" },
	rojo: { background: COLORS.rojo, color: "#ffffff" },
	neutral: { background: COLORS.neutral, color: "#3b3524" },
	asesino: { background: COLORS.asesino, color: "#e8e4d8" },
};

/** Cuántas caras caben en una carta antes de resumir el resto en un número. */
const MAX_VISIBLE_VOTES = 3;

/**
 * Ancho útil de una carta: la quinta parte del tablero menos su parte de los
 * cuatro huecos de la rejilla (`gap-1.5`, 6px) y su propio margen (`px-1`, 4px
 * por lado). Si cambia alguno de los dos, hay que cambiarlo aquí.
 */
const CARD_WIDTH = "(20cqi - 12.8px)";

/** Tope para las palabras cortas, que si no saldrían enormes al lado de las largas. */
const MAX_WORD_CQI = 4.6;

/** El tamaño de siempre, para cuando no se puede medir. Las largas se parten. */
const FALLBACK_CQI = 3.4;

export interface CardProps {
	word: string;
	/** El tipo de la carta, o `null` para dejarla boca abajo (vista de agentes). */
	kind: CardKind | null;
	revealed: boolean;
	/** Quiénes están señalando esta carta. */
	votes?: readonly PlayerProfile[];
	/** Si la ficha de quien mira está aquí, para que sepa que puede retirarla. */
	mine?: boolean;
	onClick?: () => void;
	disabled?: boolean;
}

/**
 * Una casilla del tablero.
 *
 * El texto se dimensiona con `cqi` (ancho del propio tablero) en vez de con una
 * escala fija, y cada palabra con el suyo: tan grande como quepa en una línea,
 * hasta un tope. Así "SAL" se lee desde el otro lado de la mesa y "DINOSAURIO"
 * cabe entera sin partirse, tanto en un móvil estrecho como en horizontal.
 */
export function Card({ word, kind, revealed, votes = [], mine, onClick, disabled }: CardProps) {
	const face = kind ? FACE[kind] : { background: "#ffffff", color: "#1c1c1c" };

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={revealed}
			className={[
				"relative flex flex-col items-center justify-center rounded-xl px-1 text-center",
				"font-semibold uppercase tracking-tight break-words hyphens-auto",
				"leading-[1.05] transition-[opacity,transform] duration-150",
				"select-none active:scale-[0.97]",
				revealed ? "opacity-55" : "opacity-100",
				disabled ? "cursor-default" : "cursor-pointer",
				// Tu propia ficha se marca con un aro: en un tablero con varias caras
				// pequeñas cuesta encontrar la tuya de un vistazo.
				mine ? "ring-3 ring-black/80" : "",
			].join(" ")}
			style={{
				backgroundColor: face.background,
				color: face.color,
				fontSize: wordSize(word, revealed ? 0.7 : 1),
			}}
		>
			{revealed && kind && <AgentTile kind={kind} />}
			{word}
			{votes.length > 0 && <VoteChips votes={votes} />}
		</button>
	);
}

/** Tamaño de una palabra: el que la deja justa en una línea, sin pasar del tope. */
function wordSize(word: string, scale: number): string {
	const width = measure(word);
	if (!width) return `max(9px, ${(FALLBACK_CQI * scale).toFixed(2)}cqi)`;
	const max = (MAX_WORD_CQI * scale).toFixed(2);
	return `max(9px, min(${max}cqi, calc(${CARD_WIDTH} * ${(scale / width).toFixed(4)})))`;
}

const widths = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;

/**
 * Lo que mide una palabra con la letra de las cartas, en `em`.
 *
 * Se mide en un lienzo con la letra que tenga el móvil, y no contando letras,
 * porque cada sistema trae la suya y "MUNDO" no mide lo que "SILLA" aunque las
 * dos tengan cinco. Sin el espaciado negativo de la carta: ese poco de más es
 * el margen para que ninguna roce el borde.
 */
function measure(word: string): number | null {
	const known = widths.get(word);
	if (known) return known;
	if (context === undefined) {
		try {
			context = document.createElement("canvas").getContext("2d");
			if (context) context.font = `600 100px ${getComputedStyle(document.body).fontFamily}`;
		} catch {
			// En el servidor no hay lienzo; el tablero sólo se pinta en el navegador.
			context = null;
		}
	}
	if (!context) return null;
	const width = context.measureText(word).width / 100;
	widths.set(word, width);
	return width;
}

/**
 * Las caras de quienes señalan la carta, apiladas en la esquina.
 *
 * Es lo que ve el jefe para saber por dónde va su equipo sin que nadie diga
 * la palabra en voz alta, y lo que ve el resto de la mesa para discutir.
 */
function VoteChips({ votes }: { votes: readonly PlayerProfile[] }) {
	const visible = votes.slice(0, MAX_VISIBLE_VOTES);
	const rest = votes.length - visible.length;

	return (
		<span className="pointer-events-none absolute -top-1 -right-1 flex items-center">
			{visible.map((vote, i) => (
				<span
					key={vote.id}
					className="rounded-full bg-white ring-2 ring-white"
					// Solapadas como fichas de póquer: cada una tapa un poco la anterior.
					style={{ marginLeft: i === 0 ? 0 : "-0.45rem", zIndex: visible.length - i }}
				>
					<Avatar seed={vote.avatar} name={vote.name} size={24} className="block" />
				</span>
			))}
			{rest > 0 && (
				<span className="-ml-1 rounded-full bg-black px-1.5 text-[0.55rem] font-bold text-white ring-2 ring-white">
					+{rest}
				</span>
			)}
		</span>
	);
}

/**
 * La figura que tapa la carta destapada, como la loseta que se pone encima en
 * el juego de mesa: un agente con sombrero, un transeúnte o el asesino.
 *
 * La opacidad sola no basta: en la vista de agentes una carta destapada gana
 * color en lugar de perderlo, y sin una marca explícita cuesta distinguir "ya
 * salió" de "es de mi equipo". La figura lo dice sin tapar la palabra, que
 * baja de tamaño y se sigue leyendo debajo.
 */
function AgentTile({ kind }: { kind: CardKind }) {
	return (
		<svg
			className="pointer-events-none mb-[6%] h-[42%] max-h-16 w-auto shrink-0"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<title>Destapada</title>
			{kind === "asesino" ? (
				// Encapuchado, con la cara en sombra y dos ojos que brillan.
				<>
					<path d="M3.5 24c.3-4.2 2.8-6.9 6-7.8L12 20l2.5-3.8c3.2.9 5.7 3.6 6 7.8z" />
					<path d="M12 2.5c-4.2 0-7 3.4-7 7.8 0 2.6 1 4.8 2.6 6.2h8.8c1.6-1.4 2.6-3.6 2.6-6.2 0-4.4-2.8-7.8-7-7.8z" />
					<ellipse cx="12" cy="11.6" rx="3.5" ry="3.9" fill={COLORS.asesino} />
					<path
						d="M9.9 11.2l1.4.6M14.1 11.2l-1.4.6"
						stroke="currentColor"
						strokeWidth="1.1"
						strokeLinecap="round"
					/>
				</>
			) : (
				<>
					<path d="M3.5 24c.4-4.6 3.9-7.6 8.5-7.6s8.1 3 8.5 7.6z" />
					<circle cx="12" cy="11" r="4.3" />
					{kind !== "neutral" && (
						// El agente: sombrero y gafas de sol.
						<>
							<path d="M8.4 7.4 9.2 3.5c.1-.5.5-.9 1.1-.9h3.4c.6 0 1 .4 1.1.9l.8 3.9z" />
							<path
								d="M5.6 7.6h12.8"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
							/>
							<path
								d="M8.2 10.2h3.3v1.1a1.6 1.6 0 0 1-3.3 0zM12.5 10.2h3.3v1.1a1.6 1.6 0 0 1-3.3 0z"
								fill={COLORS[kind]}
							/>
						</>
					)}
				</>
			)}
		</svg>
	);
}
