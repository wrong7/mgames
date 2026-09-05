import { type Board, remainingFor, type Team } from "../engine/index.ts";
import { COLORS } from "../theme.ts";
import type { RoomStatus } from "./useGameRoom.ts";

export interface ScoreboardProps {
	board: Board;
	revealed: readonly boolean[];
	turn: Team;
	code: string;
	status: RoomStatus;
}

/**
 * Barra superior: cuántas cartas le quedan a cada equipo, de quién es el turno,
 * el código de la sala y si la pantalla está sincronizada con las demás.
 *
 * Todo eso cabe en dos líneas para no robarle alto a la rejilla, que es lo que
 * de verdad hay que mirar.
 */
export function Scoreboard({ board, revealed, turn, code, status }: ScoreboardProps) {
	return (
		<div className="flex shrink-0 items-stretch gap-1.5 text-white">
			<TeamCount
				team="azul"
				count={remainingFor(board, revealed, "azul")}
				active={turn === "azul"}
			/>
			<div className="flex flex-col items-center justify-center rounded-xl bg-black/80 px-3 py-1.5">
				<span className="font-mono text-lg leading-none font-bold tracking-[0.2em]">{code}</span>
				<ConnectionHint status={status} />
			</div>
			<TeamCount
				team="rojo"
				count={remainingFor(board, revealed, "rojo")}
				active={turn === "rojo"}
			/>
		</div>
	);
}

function TeamCount({ team, count, active }: { team: Team; count: number; active: boolean }) {
	return (
		<div
			className={[
				"flex flex-1 flex-col items-center justify-center rounded-xl py-1.5",
				// El turno se marca con un aro, no sólo con color: los dos equipos ya
				// son colores y hacía falta algo que se leyera de un vistazo desde
				// el otro lado de la mesa.
				active ? "ring-3 ring-black/80" : "opacity-70",
			].join(" ")}
			style={{ backgroundColor: COLORS[team] }}
		>
			<span className="text-2xl leading-none font-black tabular-nums">{count}</span>
			<span className="text-[0.6rem] uppercase tracking-widest opacity-90">{team}</span>
		</div>
	);
}

function ConnectionHint({ status }: { status: RoomStatus }) {
	const label =
		status === "conectado" ? "en vivo" : status === "conectando" ? "conectando…" : "sin conexión";
	return (
		<span className="mt-0.5 flex items-center gap-1 text-[0.55rem] uppercase tracking-widest opacity-70">
			<span
				className="inline-block size-1.5 rounded-full"
				style={{ backgroundColor: status === "conectado" ? "#4ade80" : "#fbbf24" }}
			/>
			{label}
		</span>
	);
}
