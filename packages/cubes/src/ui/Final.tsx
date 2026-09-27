import { Avatar, AvatarStage, type StageActor } from "@mgames/game-kit/react";
import { useMemo } from "react";
import { type Contestant, type CubesView, type Standing, standings } from "../engine/index.ts";
import { COLORS } from "../theme.ts";
import type { Person } from "./parts.tsx";
import { listNames, ReadyBar } from "./ReadyBar.tsx";

export interface FinalProps {
	view: CubesView;
	/** Los de la sala: a quienes se espera para la revancha. */
	people: readonly Person[];
	meId: string;
	onReady: (ready: boolean) => void;
}

/** Suben al podio los tres primeros puestos: con empates, pueden ser más de tres personas. */
const PODIUM_PLACES = 3;

/**
 * El final: el podio con los slimes y, debajo, la clasificación entera.
 *
 * Los empatados a puntos comparten puesto y, si empatan arriba, comparten
 * también escalón: no hay desempate que valga en un juego de un segundo.
 */
export function Final({ view, people, meId, onReady }: FinalProps) {
	const table = useMemo(() => standings(view.contestants), [view.contestants]);
	const podium = useMemo(() => table.filter((s) => s.position <= PODIUM_PLACES), [table]);
	// La misma lista entre renders: al escenario, pasarle otra igual no le cambia nada,
	// pero así ni lo mira.
	const actors = useMemo<StageActor[]>(
		() =>
			podium.map(({ contestant, position }) => ({
				id: contestant.id,
				seed: contestant.avatar,
				place: position,
				highlight: contestant.id === meId,
			})),
		[podium, meId],
	);
	const onPodium = new Map(podium.map((standing) => [standing.contestant.id, standing]));
	const winners = table.filter((s) => s.position === 1).map((s) => s.contestant);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<Title winners={winners} meId={meId} />

			<AvatarStage
				variant="podio"
				actors={actors}
				className="min-h-52 flex-[1.4]"
				renderLabel={(actor) => {
					const standing = onPodium.get(actor.id);
					return standing ? <PodiumTag standing={standing} me={actor.id === meId} /> : null;
				}}
			/>

			<ol className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
				{table.map((standing) => (
					<Row
						key={standing.contestant.id}
						standing={standing}
						me={standing.contestant.id === meId}
					/>
				))}
			</ol>

			<ReadyBar
				meId={meId}
				people={people}
				ready={view.ready}
				label="Otra partida"
				onReady={onReady}
				footnote={view.ready.includes(meId) ? null : "Empieza cuando estéis todos listos."}
			/>
		</div>
	);
}

function Title({ winners, meId }: { winners: readonly Contestant[]; meId: string }) {
	const [only] = winners;
	if (!only) return null;
	const title =
		winners.length > 1
			? `¡Empate entre ${listNames(winners, meId)}!`
			: only.id === meId
				? "¡Has ganado!"
				: `¡Gana ${only.name}!`;
	return (
		<h1
			className="shrink-0 pt-1 text-center text-3xl leading-none font-black uppercase tracking-tight text-balance"
			style={{ textShadow: "0 4px 0 rgba(0,0,0,0.25)" }}
		>
			{title}
		</h1>
	);
}

/** El nombre y los puntos en el suelo, delante de su columna, como la placa de un trofeo. */
function PodiumTag({ standing, me }: { standing: Standing; me: boolean }) {
	const { contestant } = standing;
	return (
		<span className="flex flex-col items-center gap-0.5">
			<span
				className="max-w-28 truncate rounded-full px-2 py-0.5 text-xs font-black shadow-lg"
				style={{
					backgroundColor: me ? COLORS.chalk : "rgba(0,0,0,0.5)",
					color: me ? COLORS.ink : COLORS.chalk,
				}}
			>
				{me ? "Tú" : contestant.name}
			</span>
			<span
				className="text-[0.65rem] font-black uppercase tracking-widest tabular-nums"
				style={{ color: COLORS.gold, textShadow: "0 1px 0 rgba(0,0,0,0.45)" }}
			>
				{contestant.points} {contestant.points === 1 ? "punto" : "puntos"}
			</span>
		</span>
	);
}

function Row({ standing, me }: { standing: Standing; me: boolean }) {
	const { position, contestant } = standing;
	const first = position === 1;
	return (
		<li
			className="flex items-center gap-3 rounded-2xl py-1.5 pr-3 pl-2"
			style={{
				backgroundColor: first ? `${COLORS.gold}33` : "rgba(0,0,0,0.18)",
				boxShadow: me ? `inset 0 0 0 2px ${COLORS.chalk}88` : undefined,
			}}
		>
			<span className="w-7 text-center text-lg font-black tabular-nums">{position}º</span>
			<Avatar
				seed={contestant.avatar}
				size={30}
				name={contestant.name}
				className="block shrink-0"
			/>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-bold">{me ? "Tú" : contestant.name}</span>
				<span className="block text-[0.6rem] uppercase tracking-widest opacity-70">
					{contestant.hits} {contestant.hits === 1 ? "acierto" : "aciertos"}
					{contestant.firsts > 0 &&
						` · ${contestant.firsts} ${contestant.firsts === 1 ? "vez" : "veces"} el primero`}
				</span>
			</span>
			<span className="text-2xl font-black tabular-nums">{contestant.points}</span>
		</li>
	);
}
