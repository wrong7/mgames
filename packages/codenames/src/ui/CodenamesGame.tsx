import type { GameScreenProps } from "@mgames/game-kit";
import type { GameAction, GameState } from "../engine/index.ts";
import { GameScreen } from "./GameScreen.tsx";
import { TeamPicker } from "./TeamPicker.tsx";

/**
 * Código Secreto dentro de una sala.
 *
 * Primero eliges asiento; con asiento, ves el tablero desde tu lado. Levantarte
 * te devuelve a elegir. No hay más pantallas: el lobby es la sala.
 */
export function CodenamesGame({
	code,
	profile,
	players,
	live,
	view,
	play,
	onExit,
}: GameScreenProps<GameState, GameAction>) {
	const seat = view.seats[profile.id];

	if (!seat) {
		return (
			<TeamPicker
				code={code}
				seats={view.seats}
				players={players}
				profile={profile}
				onSit={(team, role) => play({ type: "sit", team, role })}
				onExit={onExit}
			/>
		);
	}

	return (
		<GameScreen
			code={code}
			state={view}
			seat={seat}
			profile={profile}
			players={players}
			live={live}
			play={play}
			onStand={() => play({ type: "stand" })}
			onExit={onExit}
		/>
	);
}
