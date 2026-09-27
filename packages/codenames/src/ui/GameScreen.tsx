import type { PlayerProfile } from "@mgames/game-kit";
import { randomCode } from "@mgames/game-kit";
import { Avatar, useWakeLock } from "@mgames/game-kit/react";
import { useState } from "react";
import type { GameAction, GameState, Seat, Team } from "../engine/index.ts";
import { COLORS } from "../theme.ts";
import { Board } from "./Board.tsx";
import { Scoreboard } from "./Scoreboard.tsx";

export interface GameScreenProps {
	code: string;
	state: GameState;
	/** Dónde está sentado quien mira. */
	seat: Seat;
	profile: PlayerProfile;
	players: readonly PlayerProfile[];
	live: boolean;
	play: (action: GameAction) => void;
	/** Levantarse para cambiar de equipo o de papel. */
	onStand: () => void;
	/** Recoger el juego. Sólo lo tiene el anfitrión. */
	onExit?: () => void;
}

/**
 * El tablero, en las dos versiones que existen.
 *
 * El jefe de espías ve los colores de las 25 cartas; los agentes ven palabras en
 * blanco que se colorean al destaparse. Es la misma partida y el mismo estado:
 * lo único que cambia es cuánto se enseña y qué hace tocar una carta.
 */
export function GameScreen({
	code,
	state,
	seat,
	profile,
	players,
	live,
	play,
	onStand,
	onExit,
}: GameScreenProps) {
	const isChief = seat.role === "jefe";
	const myTurn = seat.team === state.turn;

	// Una partida son veinte minutos mirando el tablero a ratos y hablando el resto.
	useWakeLock();

	// El jefe destapa (y vuelve a tapar si se equivoca de dedo); los agentes
	// señalan. El motor hace cumplir el turno, así que aquí sólo se decide el gesto.
	const pressCard = (index: number) => {
		if (isChief) {
			play(state.revealed[index] ? { type: "unreveal", index } : { type: "reveal", index });
		} else {
			play({ type: "vote", index });
		}
	};

	return (
		<div
			className="relative flex h-dvh w-full flex-col gap-1.5 p-1.5"
			style={{
				backgroundColor: isChief ? COLORS.masterBg : COLORS.teamBg,
				// El tablero llega hasta el borde de la pantalla, así que los controles
				// tienen que esquivar la muesca y la barra de gestos.
				paddingTop: "max(0.375rem, env(safe-area-inset-top))",
				paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))",
			}}
		>
			<Scoreboard
				board={state.board}
				revealed={state.revealed}
				turn={state.turn}
				code={code}
				live={live}
			/>

			<Board
				board={state.board}
				revealed={state.revealed}
				showAllKinds={isChief}
				votes={state.votes}
				players={players}
				meId={profile.id}
				onCardPress={pressCard}
			/>

			<Controls
				seat={seat}
				myTurn={myTurn}
				onEndTurn={() => play({ type: "endTurn" })}
				onRestart={() => play({ type: "restart", seed: randomCode(12) })}
				onStand={onStand}
				onExit={onExit}
			/>

			{state.winner && (
				<WinnerOverlay
					winner={state.winner}
					endedBy={state.endedBy}
					team={players.filter((p) => state.seats[p.id]?.team === state.winner)}
					isChief={isChief}
					onRestart={() => play({ type: "restart", seed: randomCode(12) })}
				/>
			)}
		</div>
	);
}

function Controls({
	seat,
	myTurn,
	onEndTurn,
	onRestart,
	onStand,
	onExit,
}: {
	seat: Seat;
	myTurn: boolean;
	onEndTurn: () => void;
	onRestart: () => void;
	onStand: () => void;
	onExit?: () => void;
}) {
	// Repartir de nuevo tira la partida de todo el grupo, no sólo la de quien
	// pulsa, así que pedimos una segunda pulsación en lugar de un `confirm()`,
	// que en móvil es un ladrillo modal del sistema.
	const [confirmingRestart, setConfirmingRestart] = useState(false);
	const isChief = seat.role === "jefe";

	return (
		<div className="flex shrink-0 items-stretch gap-1.5">
			<button
				type="button"
				onClick={onExit ?? onStand}
				className="rounded-xl bg-black/80 px-3 text-white active:scale-95"
				aria-label={onExit ? "Recoger el juego" : "Cambiar de equipo"}
			>
				←
			</button>

			<SeatBadge seat={seat} onClick={onStand} />

			{isChief ? (
				<button
					type="button"
					onClick={onEndTurn}
					disabled={!myTurn}
					className="flex-1 rounded-xl py-2.5 text-sm font-bold uppercase tracking-widest text-white active:scale-[0.98] disabled:opacity-40"
					style={{ backgroundColor: COLORS[seat.team] }}
				>
					{myTurn ? "Pasar turno" : "Turno del otro equipo"}
				</button>
			) : (
				<div
					className="flex flex-1 items-center justify-center rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest text-white"
					style={{ backgroundColor: COLORS[seat.team], opacity: myTurn ? 1 : 0.5 }}
				>
					{myTurn ? "Señala tu carta" : "Turno del otro equipo"}
				</div>
			)}

			{isChief && (
				<button
					type="button"
					onClick={() => {
						if (confirmingRestart) {
							onRestart();
							setConfirmingRestart(false);
						} else {
							setConfirmingRestart(true);
							setTimeout(() => setConfirmingRestart(false), 3000);
						}
					}}
					className={[
						"rounded-xl px-3 text-sm font-bold uppercase tracking-widest active:scale-95",
						confirmingRestart ? "bg-white text-black" : "bg-black/80 text-white",
					].join(" ")}
				>
					{confirmingRestart ? "¿Seguro?" : "↻"}
				</button>
			)}
		</div>
	);
}

/** Tu asiento, tocable para levantarte. */
function SeatBadge({ seat, onClick }: { seat: Seat; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="rounded-xl border-2 px-2 text-[0.6rem] font-bold uppercase leading-tight tracking-wider text-white active:scale-95"
			style={{ backgroundColor: COLORS[seat.team], borderColor: "#0008" }}
			aria-label="Cambiar de equipo o de papel"
		>
			{seat.role}
		</button>
	);
}

function WinnerOverlay({
	winner,
	endedBy,
	team,
	isChief,
	onRestart,
}: {
	winner: Team;
	endedBy: "cartas" | "asesino" | null;
	/** Quiénes han ganado, para ponerles cara. */
	team: readonly PlayerProfile[];
	isChief: boolean;
	onRestart: () => void;
}) {
	return (
		<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/70 p-8 backdrop-blur-sm">
			<p className="text-center text-sm uppercase tracking-[0.3em] text-white/70">
				{endedBy === "asesino" ? "Han destapado al asesino" : "Todos los agentes encontrados"}
			</p>
			<p
				className="text-center text-5xl font-black uppercase tracking-tight"
				style={{ color: COLORS[winner] }}
			>
				Gana {winner}
			</p>
			{team.length > 0 && (
				<ul className="mb-2 flex max-w-xs flex-wrap justify-center gap-3">
					{team.map((player) => (
						<li key={player.id} className="flex w-16 flex-col items-center gap-1">
							<span className="rounded-full p-0.5" style={{ backgroundColor: COLORS[winner] }}>
								<Avatar seed={player.avatar} name={player.name} size={52} className="block" />
							</span>
							<span className="max-w-full truncate text-xs font-bold text-white">
								{player.name}
							</span>
						</li>
					))}
				</ul>
			)}
			{isChief ? (
				<button
					type="button"
					onClick={onRestart}
					className="rounded-xl bg-white px-6 py-3 text-sm font-bold uppercase tracking-widest text-black active:scale-95"
				>
					Otra partida
				</button>
			) : (
				<p className="text-xs uppercase tracking-widest text-white/60">
					El jefe reparte la siguiente
				</p>
			)}
		</div>
	);
}
