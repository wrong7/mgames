import { Avatar } from "@mgames/game-kit/react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";
import type { Pattern } from "../engine/index.ts";
import { COLORS } from "../theme.ts";

/** Cómo se llama cada patrón en pantalla. */
export const PATTERN_LABEL: Record<Pattern, string> = {
	lineas: "En fila",
	formas: "Figuras",
	mezcla: "Mezcla",
	sueltos: "A voleo",
};

/** "2,46 s": con coma, como se escriben aquí los decimales, y con centésimas, como un cronómetro. */
export function seconds(ms: number): string {
	return `${(Math.max(ms, 0) / 1000).toFixed(2).replace(".", ",")} s`;
}

/** Un cronómetro, al lado de lo que tardó cada uno. Dibujado: los emojis cambian de un móvil a otro. */
export function Stopwatch({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="14" r="8" />
			<path d="M12 14V9.5M9.5 2.5h5M12 2.5V6M18.5 7l1.6-1.6" />
		</svg>
	);
}

/** Alguien con cara: de la sala o del marcador. */
export interface Person {
	id: string;
	name: string;
	avatar: string;
}

const BUTTON_TONES = {
	gold: { background: COLORS.gold, color: COLORS.ink, edge: "#b98500" },
	chalk: { background: COLORS.chalk, color: COLORS.ink, edge: "#b9ab8d" },
	felt: { background: COLORS.feltDark, color: COLORS.chalk, edge: "#063b33" },
} as const;

export interface ToyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	tone?: keyof typeof BUTTON_TONES;
}

/**
 * Un botón de juguete: gordo, con canto, y que se hunde al pulsarlo.
 *
 * El canto es una sombra y no un borde para que al hundirse no cambie de
 * alto: con un borde, lo que hay debajo daría un saltito en cada toque, y el
 * botón de sumar se toca muchas veces seguidas.
 */
export function ToyButton({ tone = "gold", className = "", style, ...props }: ToyButtonProps) {
	const { background, color, edge } = BUTTON_TONES[tone];
	return (
		<button
			type="button"
			{...props}
			className={`select-none rounded-2xl font-black uppercase tracking-widest shadow-[0_5px_0_var(--edge)] transition-transform duration-75 touch-manipulation active:translate-y-[3px] active:shadow-[0_2px_0_var(--edge)] disabled:opacity-40 disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_var(--edge)] ${className}`}
			style={
				{
					backgroundColor: background,
					color,
					["--edge" as string]: edge,
					...style,
				} as CSSProperties
			}
		/>
	);
}

/**
 * Una fila de caras, cada una con su marca si la tiene: ha dicho listo, ya ha
 * contestado. Los que no la tienen salen apagados, que es lo que se busca con
 * la vista: a quién se está esperando.
 */
export function People({
	people,
	marked,
	meId,
	size = 34,
}: {
	people: readonly Person[];
	marked: readonly string[];
	meId: string;
	size?: number;
}) {
	return (
		<ul className="flex flex-wrap justify-center gap-x-1.5 gap-y-2">
			{people.map((person) => {
				const on = marked.includes(person.id);
				return (
					<li
						key={person.id}
						className="flex flex-col items-center gap-0.5 transition-opacity"
						style={{ width: size + 22, opacity: on ? 1 : 0.5 }}
					>
						<span className="relative">
							<Avatar seed={person.avatar} size={size} name={person.name} className="block" />
							{on && (
								<span
									className="vynv-pop absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full text-[0.65rem] font-black shadow"
									style={{ backgroundColor: COLORS.right, color: COLORS.ink }}
									role="img"
									aria-label="listo"
								>
									✓
								</span>
							)}
						</span>
						<span className="w-full truncate text-center text-[0.65rem] font-bold">
							{person.id === meId ? "Tú" : person.name}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
