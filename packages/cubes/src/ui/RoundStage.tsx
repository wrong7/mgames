import { useState } from "react";
import { type CubesView, INTRO_MS, type RoundView } from "../engine/index.ts";
import { COLORS, cubeColor } from "../theme.ts";
import { Counter } from "./Counter.tsx";
import { useClock } from "./clock.ts";
import { IsoBoard, PUFF_MS } from "./IsoBoard.tsx";
import { PATTERN_LABEL, People, type Person } from "./parts.tsx";

export interface RoundStageProps {
	view: CubesView;
	round: RoundView;
	/** Las caras de los que juegan la ronda. */
	people: readonly Person[];
	meId: string;
	/** La hora de la sala en este render. */
	time: number;
	now: () => number;
	onAnswer: (value: number) => void;
}

/**
 * Una ronda en marcha: preparados, cubos, ¡chas!, y a contar.
 *
 * Los tres momentos no cambian el estado, sólo la hora: se sabe en cuál se
 * está mirando el reloj de la sala, que es el mismo en todos los móviles, y la
 * pantalla se repinta justo al pasar de uno a otro.
 */
export function RoundStage({ view, round, people, meId, time, now, onAnswer }: RoundStageProps) {
	const stage = time < round.showAt ? "preparados" : time < round.hideAt ? "mirando" : "contando";
	const playing = round.participants.includes(meId);
	const color = cubeColor(round.number);
	const vanishing = time >= round.hideAt && time < round.hideAt + PUFF_MS;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<RoundTitle round={round} total={view.totalRounds} />

			<IsoBoard
				className="min-h-0 flex-1"
				cubes={stage === "mirando" ? round.cubes : []}
				color={color}
				entrance="de-golpe"
				puffs={vanishing ? round.cubes : []}
			>
				{stage === "preparados" && <GetReady showAt={round.showAt} now={now} />}
			</IsoBoard>

			<div className="h-2 shrink-0">
				{stage === "mirando" && (
					<Drain from={round.showAt} until={round.hideAt} now={now} color={color} />
				)}
			</div>

			{/* Mismo alto en los tres momentos: el tablero no se mueve cuando aparecen los botones. */}
			<div className="flex h-72 shrink-0 flex-col justify-between gap-2 pt-2">
				{stage !== "contando" ? (
					<p className="flex flex-1 items-center justify-center text-center text-3xl font-black uppercase tracking-tight">
						{stage === "preparados" ? "Atentos al tablero" : "¡Cuenta!"}
					</p>
				) : playing ? (
					<Counter
						key={`${view.match}-${round.number}`}
						round={round}
						now={now}
						onConfirm={onAnswer}
					/>
				) : (
					<p className="flex flex-1 items-center justify-center px-6 text-center text-sm opacity-85">
						Has llegado con la ronda empezada: esta la miras, y juegas la siguiente.
					</p>
				)}
				{stage === "contando" && (
					<People people={people} marked={round.answered} meId={meId} size={28} />
				)}
			</div>
		</div>
	);
}

/** "Ronda 3 de 10 · En fila". */
export function RoundTitle({ round, total }: { round: RoundView; total: number }) {
	return (
		<div className="flex shrink-0 items-center justify-center gap-2 pb-1">
			<span className="text-sm font-black uppercase tracking-[0.2em]">
				Ronda {round.number}
				<span className="opacity-60"> de {total}</span>
			</span>
			<span
				className="rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-widest"
				style={{ backgroundColor: cubeColor(round.number), color: COLORS.ink }}
			>
				{PATTERN_LABEL[round.pattern]}
			</span>
		</div>
	);
}

/** El "tres, dos, uno" encima del tablero vacío. */
function GetReady({ showAt, now }: { showAt: number; now: () => number }) {
	const beat = INTRO_MS / 3;
	const time = useClock(now, [showAt - 2 * beat, showAt - beat]);
	const left = Math.min(3, Math.max(1, Math.ceil((showAt - time) / beat)));
	return (
		<span
			key={left}
			className="vynv-beat text-[7rem] leading-none font-black tabular-nums"
			style={{ color: COLORS.chalk, textShadow: "0 6px 0 rgba(0,0,0,0.3)" }}
		>
			{left}
		</span>
	);
}

/** Lo que queda de ver los cubos, gastándose. */
function Drain({
	from,
	until,
	now,
	color,
}: {
	from: number;
	until: number;
	now: () => number;
	color: string;
}) {
	// Al aparecer y no en cada render: cambiarle el retraso a una animación en marcha la hace saltar.
	const [delay] = useState(() => from - now());
	return (
		<div className="mx-auto h-full w-2/3 overflow-hidden rounded-full bg-black/25">
			<div
				className="vynv-drain h-full rounded-full"
				style={{
					backgroundColor: color,
					animationDuration: `${until - from}ms`,
					animationDelay: `${Math.min(delay, 0)}ms`,
				}}
			/>
		</div>
	);
}
