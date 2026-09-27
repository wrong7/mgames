import { ANSWER_WINDOW_MS, type CubesView, ROUND_COUNT } from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS, cubeColor } from "../theme.ts";
import { IsoBoard } from "./IsoBoard.tsx";
import type { Person } from "./parts.tsx";
import { ReadyBar } from "./ReadyBar.tsx";

export interface LobbyProps {
	view: CubesView;
	/** Los de la sala. */
	people: readonly Person[];
	meId: string;
	onReady: (ready: boolean) => void;
}

/** Unos cubos de adorno para el tablero de la portada: una cruz y dos sueltos. */
const SAMPLE = [3, 7, 11, 12, 13, 17, 21];

/**
 * El juego sobre la mesa, antes de empezar: cómo se juega y quién está listo.
 *
 * No hay botón de empezar: empieza solo cuando lo están todos los de la sala.
 * En este juego los cubos se ven poco más de un segundo, y quien no está
 * mirando cuando caen se queda sin ronda.
 */
export function Lobby({ view, people, meId, onReady }: LobbyProps) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<h1
				className="shrink-0 text-center text-4xl leading-[0.9] font-black uppercase tracking-tight"
				style={{ textShadow: "0 4px 0 rgba(0,0,0,0.25)" }}
			>
				{manifest.name}
			</h1>

			<IsoBoard className="min-h-32 flex-1" cubes={SAMPLE} color={cubeColor(1)} />

			<Rules />

			<ReadyBar
				meId={meId}
				people={people}
				ready={view.ready}
				label="Estoy listo"
				onReady={onReady}
				footnote={
					people.length === 1
						? "Tú solo: vale para practicar. Pásales el código a los demás."
						: view.ready.includes(meId)
							? null
							: "Empieza en cuanto estéis todos listos."
				}
			/>
		</div>
	);
}

/**
 * Las reglas, en tres líneas. Se leen mientras llega la gente, así que tienen
 * que bastar para jugar sin que nadie las explique.
 */
function Rules() {
	const steps = [
		"Caen unos cubos en el tablero y en un abrir y cerrar de ojos, ¡chas!, se esfuman.",
		`Marca cuántos había con − y +, y confirma. En cuanto alguien confirma, los demás tienen ${ANSWER_WINDOW_MS / 1000} segundos.`,
		`Un punto por acertar y otro para el primero que acierta. ${ROUND_COUNT} rondas, cada una más difícil.`,
	];
	return (
		<ol
			className="flex shrink-0 flex-col gap-2 rounded-2xl p-3.5 text-sm leading-snug"
			style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
		>
			{steps.map((step, index) => (
				<li key={step} className="flex gap-3">
					<span
						className="grid size-6 shrink-0 place-items-center rounded-lg text-xs font-black"
						style={{ backgroundColor: cubeColor(index + 1), color: COLORS.ink }}
					>
						{index + 1}
					</span>
					<span>{step}</span>
				</li>
			))}
		</ol>
	);
}
