import { Avatar } from "@mgames/game-kit/react";
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
			{players.map((player) => {
				const me = player.id === meId;
				return (
					<li
						key={player.id}
						className="flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm"
						style={{
							backgroundColor: me ? COLORS.gold : COLORS.slate,
							color: me ? COLORS.night : COLORS.ink,
							fontWeight: me ? 700 : 400,
						}}
					>
						<Avatar seed={player.avatar} size={22} className="block" />
						{player.name}
					</li>
				);
			})}
		</ul>
	);
}
