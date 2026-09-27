import { useState } from "react";
import type { Card } from "../engine/index.ts";
import { COLORS } from "../theme.ts";

export interface RoleCardProps {
	card: Card | null;
}

/**
 * Tu carta, tapada mientras no la mires.
 *
 * Hay que mantener el dedo encima para leerla. Es el gesto que ya se hace con
 * las cartas de cartón —levantar una esquina— y resuelve el problema de verdad
 * de este juego en móvil: siete personas alrededor de una mesa y una pantalla
 * encendida boca arriba.
 */
export function RoleCard({ card }: RoleCardProps) {
	const [visible, setVisible] = useState(false);

	if (!card) {
		return (
			<div
				className="flex flex-1 items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center"
				style={{ borderColor: `${COLORS.gold}55`, color: `${COLORS.ink}99` }}
			>
				Estás mirando la partida, pero no juegas esta ronda.
			</div>
		);
	}

	return (
		<button
			type="button"
			// `onPointerLeave` y `onPointerCancel` además de `up`: si el dedo se desliza
			// fuera del botón o entra una llamada, la carta tiene que volver a taparse.
			onPointerDown={() => setVisible(true)}
			onPointerUp={() => setVisible(false)}
			onPointerLeave={() => setVisible(false)}
			onPointerCancel={() => setVisible(false)}
			// Sin esto, mantener el dedo abre el menú contextual del navegador.
			onContextMenu={(event) => event.preventDefault()}
			className="relative flex flex-1 select-none flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 p-6 text-center touch-none"
			style={{
				borderColor: COLORS.gold,
				backgroundColor: visible ? COLORS.paper : COLORS.slate,
				color: visible ? COLORS.night : COLORS.ink,
			}}
		>
			{visible ? <Revealed card={card} /> : <Hidden />}
		</button>
	);
}

function Hidden() {
	return (
		<>
			<Folder />
			<span className="text-xs uppercase tracking-[0.3em] opacity-70">
				Mantén pulsado para leer
			</span>
		</>
	);
}

/**
 * La carpeta del expediente, cerrada y sellada.
 *
 * Dibujada y no un emoji: cada móvil pinta los emojis a su manera (en algunos
 * ni se reconoce la carpeta), y aquí la carpeta es lo único que hay en la carta.
 */
function Folder() {
	const back = "M8 14a6 6 0 0 1 6-6h28l8 8h56a6 6 0 0 1 6 6v58H8z";
	return (
		<svg viewBox="0 0 120 92" className="w-32" aria-hidden="true">
			<path d={back} fill={COLORS.gold} />
			<path d={back} fill="#000" opacity={0.3} />
			<rect
				x="16"
				y="19"
				width="88"
				height="46"
				rx="2"
				fill={COLORS.paper}
				transform="rotate(-3 60 42)"
			/>
			<path
				d="M4 34a6 6 0 0 1 6-6h100a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z"
				fill={COLORS.gold}
			/>
			<g transform="rotate(-7 60 58)" fill={COLORS.stamp}>
				<rect
					x="26"
					y="48"
					width="68"
					height="21"
					rx="3"
					fill="none"
					stroke={COLORS.stamp}
					strokeWidth="2.5"
				/>
				<text x="60" y="63" textAnchor="middle" fontSize="11.5" fontWeight="900" letterSpacing="2">
					SECRETO
				</text>
			</g>
		</svg>
	);
}

function Revealed({ card }: { card: Card }) {
	if (card.kind === "espia") {
		return (
			<>
				<span
					className="rounded-lg border-4 px-6 py-2 text-4xl font-black uppercase tracking-tight"
					// Rotado como un tampón mal puesto: es lo que hace que se lea como
					// un sello y no como un botón más.
					style={{ color: COLORS.stamp, borderColor: COLORS.stamp, rotate: "-6deg" }}
				>
					Espía
				</span>
				<p className="mt-2 max-w-[22ch] text-sm opacity-70">
					No sabes dónde estás. Averígualo sin que se te note.
				</p>
			</>
		);
	}

	return (
		<>
			<span className="text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Estás en</span>
			<span className="text-4xl font-black uppercase leading-none tracking-tight text-balance">
				{card.location}
			</span>
			<span className="mt-4 text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Y eres</span>
			<span className="text-2xl font-semibold text-balance">{card.role}</span>
		</>
	);
}
