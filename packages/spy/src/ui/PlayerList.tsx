import type { SpyPlayer } from "../engine/index.ts";
import { COLORS } from "../theme.ts";

export interface PlayerListProps {
	players: readonly SpyPlayer[];
	/** Quién mira, para señalarse en la lista. */
	meId: string;
}

/** Quién está dentro. En la sala sirve para saber si falta alguien por entrar. */
export function PlayerList({ players, meId }: PlayerListProps) {
	if (players.length === 0) {
		return (
			<p className="text-center text-sm" style={{ color: `${COLORS.ink}88` }}>
				Todavía no ha entrado nadie.
			</p>
		);
	}

	return (
		<ul className="flex flex-wrap justify-center gap-1.5">
			{players.map((player) => (
				<li
					key={player.id}
					className="rounded-full px-3 py-1 text-sm"
					style={{
						backgroundColor: player.id === meId ? COLORS.gold : COLORS.slate,
						color: player.id === meId ? COLORS.night : COLORS.ink,
						fontWeight: player.id === meId ? 700 : 400,
					}}
				>
					{player.name}
				</li>
			))}
		</ul>
	);
}
