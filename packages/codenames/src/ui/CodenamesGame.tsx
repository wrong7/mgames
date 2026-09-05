import type { GameScreenProps } from "@mgames/game-kit";
import type { GameAction, GameState } from "../engine/index.ts";
import { GameScreen } from "./GameScreen.tsx";
import { TeamPicker } from "./TeamPicker.tsx";

/**
 * Código Secreto dentro de una sala.
 *
 * Primero se forma la mesa —equipo, papel, listo— y nadie ve el tablero hasta
 * que alguien pulsa empezar con la mesa completa. Con la partida en marcha,
 * quien tiene asiento ve el tablero desde su lado; quien no (llegó tarde, o se
 * levantó) vuelve a elegir sitio.
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

	if (view.phase === "asientos" || !seat) {
		return (
			<TeamPicker
				code={code}
				state={view}
				players={players}
				profile={profile}
				onSit={(team, role) => play({ type: "sit", team, role })}
				onReady={() => play({ type: "ready" })}
				onStart={() => play({ type: "start" })}
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
