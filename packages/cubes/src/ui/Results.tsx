import { Avatar } from "@mgames/game-kit/react";
import { useEffect, useReducer, useState } from "react";
import type { CubesView, RoundResult, RoundView } from "../engine/index.ts";
import { COLORS, cubeColor } from "../theme.ts";
import { useClock } from "./clock.ts";
import { IsoBoard, RECOUNT_STEP_MS } from "./IsoBoard.tsx";
import { type Person, Stopwatch, seconds } from "./parts.tsx";
import { ReadyBar } from "./ReadyBar.tsx";
import { RoundTitle } from "./RoundStage.tsx";

export interface ResultsProps {
	view: CubesView;
	round: RoundView;
	/** Los de la sala, que son a quienes se espera para seguir. */
	people: readonly Person[];
	/** Nombre y cara de cualquiera que haya jugado, aunque ya no esté en la sala. */
	personOf: (id: string) => Person | undefined;
	meId: string;
	now: () => number;
	onReady: (ready: boolean) => void;
}

/** Lo que tarda un cubo del recuento en verse desde que empieza a caer. */
const LANDING_MS = 110;

/**
 * La ronda cerrada: los cubos vuelven, uno a uno y numerados, y después se ve
 * quién acertó.
 *
 * El recuento es la gracia: la mesa cuenta en voz alta a la vez que la
 * pantalla, y hasta que no acaba no se sabe quién tenía razón. Los números de
 * cada uno se ven desde el principio; lo que espera al recuento es el veredicto.
 */
export function Results({ view, round, people, personOf, meId, now, onReady }: ResultsProps) {
	const total = round.cubes.length;
	const recountMs = LANDING_MS + (total - 1) * RECOUNT_STEP_MS + 250;
	const elapsed = useElapsed(recountMs, 50);
	const counted = Math.min(
		total,
		Math.max(0, Math.floor((elapsed - LANDING_MS) / RECOUNT_STEP_MS) + 1),
	);
	const revealed = elapsed >= recountMs;
	const last = round.number >= view.totalRounds;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<RoundTitle round={round} total={view.totalRounds} />

			<IsoBoard
				className="min-h-36 flex-1"
				cubes={round.cubes}
				color={cubeColor(round.number)}
				entrance="recuento"
			/>

			<p className="flex shrink-0 items-baseline justify-center gap-2">
				<span
					key={counted}
					className="vynv-bump text-5xl leading-none font-black tabular-nums"
					style={{ color: revealed ? COLORS.gold : COLORS.chalk }}
				>
					{counted}
				</span>
				<span className="text-sm font-bold uppercase tracking-widest opacity-80">
					{counted === 1 ? "cubo" : "cubos"}
				</span>
			</p>

			<ul className="flex max-h-[34dvh] shrink-0 flex-col gap-1.5 overflow-y-auto">
				{(round.results ?? []).map((result) => (
					<ResultRow
						key={result.playerId}
						result={result}
						person={personOf(result.playerId)}
						total={view.contestants.find((c) => c.id === result.playerId)?.points ?? 0}
						me={result.playerId === meId}
						revealed={revealed}
					/>
				))}
			</ul>

			<ReadyBar
				meId={meId}
				people={people}
				ready={view.ready}
				label={last ? "Ver clasificación" : "Siguiente ronda"}
				onReady={onReady}
				showFaces={false}
				footnote={view.nextAt !== null && <NextIn at={view.nextAt} now={now} last={last} />}
			/>
		</div>
	);
}

function ResultRow({
	result,
	person,
	total,
	me,
	revealed,
}: {
	result: RoundResult;
	person: Person | undefined;
	/** Los puntos con los de esta ronda ya sumados. */
	total: number;
	me: boolean;
	revealed: boolean;
}) {
	const verdict = !revealed ? null : result.correct ? COLORS.right : COLORS.wrong;
	// Hasta el veredicto se enseñan los de antes: si no, el marcador chivaría quién ha acertado.
	const points = revealed ? total : total - result.points;
	return (
		<li
			className="flex items-center gap-2.5 rounded-2xl py-1.5 pr-2 pl-1.5 transition-colors duration-300"
			style={{
				backgroundColor: verdict ? `${verdict}33` : "rgba(0,0,0,0.18)",
				boxShadow: me ? `inset 0 0 0 2px ${COLORS.chalk}88` : undefined,
			}}
		>
			{person ? (
				<Avatar seed={person.avatar} size={30} name={person.name} className="block shrink-0" />
			) : (
				<span className="size-[30px] shrink-0 rounded-full bg-black/20" />
			)}
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-1.5">
					<span className="truncate text-sm font-bold">{me ? "Tú" : person?.name}</span>
					{revealed && result.first && (
						<span
							className="vynv-pop shrink-0 rounded-full px-1.5 py-px text-[0.55rem] font-black uppercase tracking-wider"
							style={{ backgroundColor: COLORS.gold, color: COLORS.ink }}
						>
							¡El primero!
						</span>
					)}
				</span>
				{/* Si no cabe, se recorta por los puntos: lo que tardó es lo que se viene a mirar. */}
				<span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
					{/* En la lista van por orden de llegada: los tiempos se leen de menos a más. */}
					{result.ms !== null && (
						<span className="flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums">
							<Stopwatch className="size-3.5 shrink-0" />
							{seconds(result.ms)}
						</span>
					)}
					<span className="text-[0.6rem] uppercase tracking-widest opacity-70">
						{result.ms !== null && "· "}
						{points} {points === 1 ? "punto" : "puntos"}
					</span>
				</span>
			</span>
			<span
				className="grid h-9 min-w-11 place-items-center rounded-xl px-2 text-2xl font-black tabular-nums"
				style={{ backgroundColor: COLORS.chalk, color: COLORS.ink }}
			>
				{result.value ?? "—"}
			</span>
			<span className="w-9 text-center text-sm font-black tabular-nums">
				{revealed ? (
					<span className="vynv-pop inline-block" style={{ color: verdict ?? undefined }}>
						{result.points > 0 ? `+${result.points}` : result.value === null ? "tarde" : "✗"}
					</span>
				) : null}
			</span>
		</li>
	);
}

/** "Sigue sola en 12 s": si alguien se distrae, la mesa no se queda parada. */
function NextIn({ at, now, last }: { at: number; now: () => number; last: boolean }) {
	const time = useClock(now, [], 250);
	const left = Math.max(0, Math.ceil((at - time) / 1000));
	return (
		<span className="tabular-nums">
			{last ? "La clasificación sale sola" : "Sigue sola"} en {left} s
		</span>
	);
}

/** Milisegundos desde que se montó, repintando cada `step` hasta llegar a `until`. */
function useElapsed(until: number, step: number): number {
	const [start] = useState(() => performance.now());
	const [, repaint] = useReducer((n: number) => n + 1, 0);
	const elapsed = performance.now() - start;
	const done = elapsed >= until;

	useEffect(() => {
		if (done) return;
		const timer = setInterval(repaint, step);
		return () => clearInterval(timer);
	}, [done, step]);

	return elapsed;
}
