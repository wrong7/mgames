import type { PlayerProfile } from "@mgames/game-kit";
import { Avatar } from "@mgames/game-kit/react";
import { canStart, type GameState, type Role, type Seat, type Team } from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";

export interface TeamPickerProps {
	code: string;
	state: GameState;
	players: readonly PlayerProfile[];
	profile: PlayerProfile;
	onSit: (team: Team, role: Role) => void;
	onReady: () => void;
	onStart: () => void;
	onExit?: () => void;
}

/**
 * Formar la mesa: equipo, papel y "listo".
 *
 * Se ve quién se ha sentado dónde, con sus caras, para que la mesa se reparta
 * hablando: "tú de jefe rojo, que la última vez fui yo". Nadie entra al
 * tablero hasta que todos han dicho listo y cada equipo tiene jefe y agente;
 * el botón de empezar cuenta lo que falta mientras tanto.
 *
 * Con la partida ya en marcha sirve también para quien llega tarde: elige
 * sitio y entra directamente, sin listo ni arranque.
 */
export function TeamPicker({
	code,
	state,
	players,
	profile,
	onSit,
	onReady,
	onStart,
	onExit,
}: TeamPickerProps) {
	const setup = state.phase === "asientos";
	const mySeat = state.seats[profile.id];
	const ready = state.ready[profile.id] === true;

	return (
		<div
			className="flex h-dvh w-full flex-col gap-3 p-4"
			style={{
				backgroundColor: COLORS.masterBg,
				paddingTop: "max(1rem, env(safe-area-inset-top))",
				paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
			}}
		>
			<header className="flex items-center gap-3">
				{onExit && (
					<button
						type="button"
						onClick={onExit}
						className="rounded-xl bg-black/80 px-3 py-2 text-white active:scale-95"
						aria-label="Recoger el juego"
					>
						←
					</button>
				)}
				<div className="flex-1">
					<h1 className="text-2xl font-black uppercase leading-none tracking-tight text-black">
						{manifest.name}
					</h1>
					<p className="text-xs uppercase tracking-widest text-black/60">
						Sala {code} · {setup ? "formad los equipos" : "partida en marcha: elige sitio"}
					</p>
				</div>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-3">
				{(["azul", "rojo"] as const).map((team) => (
					<TeamCard
						key={team}
						team={team}
						state={state}
						players={players}
						me={profile.id}
						onSit={(role) => onSit(team, role)}
					/>
				))}
			</div>

			{setup && (
				<StartBar
					state={state}
					players={players}
					seated={mySeat !== undefined}
					ready={ready}
					onReady={onReady}
					onStart={onStart}
				/>
			)}
		</div>
	);
}

function TeamCard({
	team,
	state,
	players,
	me,
	onSit,
}: {
	team: Team;
	state: GameState;
	players: readonly PlayerProfile[];
	me: string;
	onSit: (role: Role) => void;
}) {
	const seated = (role: Role) =>
		players.filter((p) => state.seats[p.id]?.team === team && state.seats[p.id]?.role === role);
	const mySeat: Seat | undefined = state.seats[me];

	return (
		<div
			className="flex flex-1 flex-col gap-2 rounded-3xl border-2 border-black/80 p-3 text-white"
			style={{ backgroundColor: COLORS[team] }}
		>
			<h2 className="text-2xl font-black uppercase leading-none tracking-tight">Equipo {team}</h2>

			{(["jefe", "agente"] as const).map((role) => {
				const here = seated(role);
				const mine = mySeat?.team === team && mySeat.role === role;
				return (
					<button
						key={role}
						type="button"
						onClick={() => onSit(role)}
						className={[
							"flex min-h-12 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left active:scale-[0.98]",
							mine ? "bg-white text-black ring-3 ring-black/80" : "bg-black/25",
						].join(" ")}
					>
						<span className="w-16 shrink-0 text-xs font-bold uppercase tracking-widest">
							{role === "jefe" ? "Jefe" : "Agentes"}
						</span>
						<span className="flex flex-1 flex-wrap items-center gap-1">
							{here.length === 0 && (
								<span className="text-sm opacity-60">
									{role === "jefe" ? "Hace falta uno" : "Hace falta alguno"}
								</span>
							)}
							{here.map((p) => (
								<PlayerChip key={p.id} player={p} ready={state.ready[p.id] === true} />
							))}
						</span>
					</button>
				);
			})}
		</div>
	);
}

/** Cara y nombre; con un tic cuando ya ha dicho listo. */
function PlayerChip({ player, ready }: { player: PlayerProfile; ready: boolean }) {
	return (
		<span className="flex items-center gap-1 rounded-full bg-black/30 py-0.5 pr-2 pl-0.5 text-xs">
			<Avatar seed={player.avatar} size={20} className="block" />
			{player.name}
			{ready && (
				<span className="font-black text-green-300" aria-label="listo">
					✓
				</span>
			)}
		</span>
	);
}

function StartBar({
	state,
	players,
	seated,
	ready,
	onReady,
	onStart,
}: {
	state: GameState;
	players: readonly PlayerProfile[];
	seated: boolean;
	ready: boolean;
	onReady: () => void;
	onStart: () => void;
}) {
	const startable = canStart(state, players);
	const missing = whatIsMissing(state, players);

	return (
		<div className="flex shrink-0 flex-col gap-2">
			<p className="text-center text-xs text-black/70">{startable ? "Todo en orden." : missing}</p>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onReady}
					disabled={!seated}
					className={[
						"flex-1 rounded-2xl border-2 border-black/80 py-3 text-sm font-black uppercase tracking-widest active:scale-[0.98] disabled:opacity-40",
						ready ? "bg-white text-black" : "bg-black/80 text-white",
					].join(" ")}
				>
					{ready ? "✓ Listo" : seated ? "Listo" : "Elige sitio"}
				</button>
				<button
					type="button"
					onClick={onStart}
					disabled={!startable}
					className="flex-1 rounded-2xl bg-white py-3 text-sm font-black uppercase tracking-widest text-black active:scale-[0.98] disabled:opacity-40"
				>
					Empezar
				</button>
			</div>
		</div>
	);
}

/**
 * Qué falta para empezar, dicho de una vez y con nombres.
 *
 * Es la misma condición que `canStart`, pero contada al revés: no "¿se puede?"
 * sino "¿qué lo impide?". Las dos tienen que coincidir; ésta sólo pinta.
 */
function whatIsMissing(state: GameState, players: readonly PlayerProfile[]): string {
	const unseated = players.filter((p) => !state.seats[p.id]).map((p) => p.name);
	if (unseated.length > 0) return `Sin sitio: ${unseated.join(", ")}.`;

	const gaps: string[] = [];
	for (const team of ["azul", "rojo"] as const) {
		for (const role of ["jefe", "agente"] as const) {
			const has = players.some(
				(p) => state.seats[p.id]?.team === team && state.seats[p.id]?.role === role,
			);
			if (!has) gaps.push(`${role} ${team}`);
		}
	}
	if (gaps.length > 0) return `Falta ${gaps.join(" y ")}.`;

	const notReady = players.filter((p) => !state.ready[p.id]).map((p) => p.name);
	if (notReady.length > 0) return `Por decir listo: ${notReady.join(", ")}.`;

	return "";
}
