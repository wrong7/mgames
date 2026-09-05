import type { CardKind } from "../engine/index.ts";
import { COLORS } from "../theme.ts";

/** Fondo y color de texto de cada tipo de carta, ya emparejados para que contrasten. */
const FACE: Record<CardKind, { background: string; color: string }> = {
	azul: { background: COLORS.azul, color: "#ffffff" },
	rojo: { background: COLORS.rojo, color: "#ffffff" },
	neutral: { background: COLORS.neutral, color: "#3b3524" },
	asesino: { background: COLORS.asesino, color: "#e8e4d8" },
};

export interface CardProps {
	word: string;
	/** El tipo de la carta, o `null` para dejarla boca abajo (vista de agentes). */
	kind: CardKind | null;
	revealed: boolean;
	onClick?: () => void;
	disabled?: boolean;
}

/**
 * Una casilla del tablero.
 *
 * El texto se dimensiona con `cqi` (ancho del propio tablero) en vez de con una
 * escala fija: así "DINOSAURIO" y "SAL" caben las dos en la misma rejilla de
 * cinco columnas tanto en un móvil estrecho como en horizontal.
 */
export function Card({ word, kind, revealed, onClick, disabled }: CardProps) {
	const face = kind ? FACE[kind] : { background: "#ffffff", color: "#1c1c1c" };

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={revealed}
			className={[
				"relative flex items-center justify-center rounded-xl px-1 text-center",
				"font-semibold uppercase tracking-tight break-words hyphens-auto",
				"leading-[1.05] transition-[opacity,transform] duration-150",
				"select-none active:scale-[0.97]",
				revealed ? "opacity-45" : "opacity-100",
				disabled ? "cursor-default" : "cursor-pointer",
			].join(" ")}
			style={{
				backgroundColor: face.background,
				color: face.color,
				fontSize: "max(9px, 3.4cqi)",
			}}
		>
			{word}
			{revealed && <RevealedMark color={face.color} />}
		</button>
	);
}

/**
 * Aspa sobre la carta destapada.
 *
 * La opacidad sola no basta: en la vista de agentes una carta destapada gana
 * color en lugar de perderlo, y sin una marca explícita cuesta distinguir "ya
 * salió" de "es de mi equipo".
 */
function RevealedMark({ color }: { color: string }) {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full p-[18%]"
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth={2.5}
			strokeLinecap="round"
			aria-hidden="true"
		>
			<title>Destapada</title>
			<path d="M5 5 L19 19 M19 5 L5 19" />
		</svg>
	);
}
