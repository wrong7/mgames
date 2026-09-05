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
			<span className="text-5xl" aria-hidden="true">
				🗂
			</span>
			<span className="text-xs uppercase tracking-[0.3em] opacity-70">
				Mantén pulsado para leer
			</span>
		</>
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
			<span className="text-3xl font-black uppercase leading-none tracking-tight text-balance">
				{card.location}
			</span>
			<span className="mt-3 text-[0.6rem] uppercase tracking-[0.3em] opacity-60">Y eres</span>
			<span className="text-xl font-semibold text-balance">{card.role}</span>
		</>
	);
}
