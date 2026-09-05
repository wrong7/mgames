import type { PlayerProfile } from "@mgames/game-kit";
import { Avatar } from "@mgames/game-kit/react";
import type { Role, Seat, Team } from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";

export interface TeamPickerProps {
	code: string;
	seats: Readonly<Record<string, Seat>>;
	players: readonly PlayerProfile[];
	profile: PlayerProfile;
	onSit: (team: Team, role: Role) => void;
	onExit?: () => void;
}

/**
 * Elegir equipo y papel.
 *
 * Se ve quién se ha sentado dónde, con sus caras, para que la mesa se reparta
 * hablando: "tú de jefe rojo, que la última vez fui yo". Cada equipo necesita
 * al menos un jefe; el resto es cosa suya.
 */
export function TeamPicker({ code, seats, players, profile, onSit, onExit }: TeamPickerProps) {
	return (
		<div
			className="flex h-dvh w-full flex-col gap-4 p-4"
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
						Sala {code} · elige equipo
					</p>
				</div>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-3">
				{(["azul", "rojo"] as const).map((team) => (
					<TeamCard
						key={team}
						team={team}
						seats={seats}
						players={players}
						me={profile.id}
						onSit={(role) => onSit(team, role)}
					/>
				))}
			</div>
		</div>
	);
}

function TeamCard({
	team,
	seats,
	players,
	me,
	onSit,
}: {
	team: Team;
	seats: Readonly<Record<string, Seat>>;
	players: readonly PlayerProfile[];
	me: string;
	onSit: (role: Role) => void;
}) {
	const seated = (role: Role) =>
		players.filter((p) => seats[p.id]?.team === team && seats[p.id]?.role === role);
	const mySeat = seats[me];

	return (
		<div
			className="flex flex-1 flex-col gap-3 rounded-3xl border-2 border-black/80 p-4 text-white"
			style={{ backgroundColor: COLORS[team] }}
		>
			<h2 className="text-3xl font-black uppercase leading-none tracking-tight">Equipo {team}</h2>

			{(["jefe", "agente"] as const).map((role) => {
				const here = seated(role);
				const mine = mySeat?.team === team && mySeat.role === role;
				return (
					<button
						key={role}
						type="button"
						onClick={() => onSit(role)}
						className={[
							"flex min-h-14 flex-1 items-center gap-3 rounded-2xl px-4 py-2 text-left active:scale-[0.98]",
							mine ? "bg-white text-black ring-3 ring-black/80" : "bg-black/25",
						].join(" ")}
					>
						<span className="w-16 shrink-0 text-xs font-bold uppercase tracking-widest">
							{role === "jefe" ? "Jefe" : "Agentes"}
						</span>
						<span className="flex flex-1 flex-wrap items-center gap-1">
							{here.length === 0 && (
								<span className="text-sm opacity-60">
									{role === "jefe" ? "Hace falta uno" : "Nadie todavía"}
								</span>
							)}
							{here.map((p) => (
								<span
									key={p.id}
									className="flex items-center gap-1 rounded-full bg-black/30 py-0.5 pr-2 pl-0.5 text-xs"
								>
									<Avatar seed={p.avatar} size={20} className="block" />
									{p.name}
								</span>
							))}
						</span>
					</button>
				);
			})}
		</div>
	);
}
