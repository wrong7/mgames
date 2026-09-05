import { type PlayerProfile, randomCode } from "@mgames/game-kit";
import { useGameRoom, useWakeLock } from "@mgames/game-kit/react";
import { useState } from "react";
import { engine, type Team } from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";
import { Board } from "./Board.tsx";
import { Scoreboard } from "./Scoreboard.tsx";

/** Desde qué lado de la mesa se mira el tablero. */
export type Role = "master" | "agente";

export interface GameScreenProps {
	/** Código de la sala: lo que los jugadores se dictan en voz alta. */
	code: string;
	role: Role;
	/**
	 * Origen del servidor de salas. Sin él la pantalla sigue siendo jugable, pero
	 * cada móvil lleva sus propias marcas.
	 */
	realtimeUrl?: string;
	/** Quién mira: sus fichas llevan su cara. */
	profile: PlayerProfile;
	/** Volver al menú del juego. La app decide qué significa eso. */
	onExit?: () => void;
}

/**
 * La pantalla de juego, en las dos versiones que existen.
 *
 * El jefe de espías ve los colores de las 25 cartas; los agentes ven palabras en
 * blanco que se colorean al destaparse. Es la misma partida y el mismo estado:
 * lo único que cambia es cuánto se enseña.
 */
export function GameScreen({ code, role, realtimeUrl, profile, onExit }: GameScreenProps) {
	const {
		view: state,
		status,
		synced,
		dispatch,
	} = useGameRoom({
		engine,
		game: manifest.slug,
		code,
		realtimeUrl,
		profile,
	});
	const isMaster = role === "master";

	// Una partida son veinte minutos mirando el tablero a ratos y hablando el resto.
	useWakeLock();

	// El jefe destapa (y vuelve a tapar si se equivoca de dedo); los agentes sólo
	// señalan. Es la regla del juego de mesa: el jefe es quien toca las cartas.
	const pressCard = (index: number) => {
		if (isMaster) {
			dispatch(state.revealed[index] ? { type: "unreveal", index } : { type: "reveal", index });
		} else {
			dispatch({ type: "vote", index });
		}
	};

	return (
		<div
			className="relative flex h-dvh w-full flex-col gap-1.5 p-1.5"
			style={{
				backgroundColor: isMaster ? COLORS.masterBg : COLORS.teamBg,
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
				status={status}
			/>

			<Board
				board={state.board}
				revealed={state.revealed}
				showAllKinds={isMaster}
				votes={state.votes}
				meId={profile.id}
				onCardPress={pressCard}
			/>

			<Controls
				turn={state.turn}
				isMaster={isMaster}
				onEndTurn={() => dispatch({ type: "endTurn" })}
				onRestart={() => dispatch({ type: "restart", seed: randomCode(12) })}
				onExit={onExit}
			/>

			{!synced && <ConnectingOverlay code={code} />}

			{state.winner && (
				<WinnerOverlay
					winner={state.winner}
					endedBy={state.endedBy}
					onRestart={() => dispatch({ type: "restart", seed: randomCode(12) })}
				/>
			)}
		</div>
	);
}

/**
 * Velo mientras llega el primer estado de la sala.
 *
 * Tapa el tablero en lugar de sustituirlo para que la pantalla no dé un salto de
 * maquetación cuando el servidor conteste.
 */
function ConnectingOverlay({ code }: { code: string }) {
	return (
		<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/75 backdrop-blur-md">
			<p className="text-xs uppercase tracking-[0.3em] text-white/60">Entrando en la sala</p>
			<p className="font-mono text-4xl font-black tracking-[0.2em] text-white">{code}</p>
		</div>
	);
}

function Controls({
	turn,
	isMaster,
	onEndTurn,
	onRestart,
	onExit,
}: {
	turn: Team;
	isMaster: boolean;
	onEndTurn: () => void;
	onRestart: () => void;
	onExit?: () => void;
}) {
	// Repartir de nuevo tira la partida de todo el grupo, no sólo la de quien
	// pulsa, así que pedimos una segunda pulsación en lugar de un `confirm()`,
	// que en móvil es un ladrillo modal del sistema.
	const [confirmingRestart, setConfirmingRestart] = useState(false);

	return (
		<div className="flex shrink-0 items-stretch gap-1.5">
			{onExit && (
				<button
					type="button"
					onClick={onExit}
					className="rounded-xl bg-black/80 px-3 text-white active:scale-95"
					aria-label="Volver al menú"
				>
					←
				</button>
			)}

			<button
				type="button"
				onClick={onEndTurn}
				className="flex-1 rounded-xl py-2.5 text-sm font-bold uppercase tracking-widest text-white active:scale-[0.98]"
				style={{ backgroundColor: COLORS[turn] }}
			>
				Pasar turno
			</button>

			{isMaster && (
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
						"rounded-xl px-4 text-sm font-bold uppercase tracking-widest active:scale-95",
						confirmingRestart ? "bg-white text-black" : "bg-black/80 text-white",
					].join(" ")}
				>
					{confirmingRestart ? "¿Seguro?" : "Repartir"}
				</button>
			)}
		</div>
	);
}

function WinnerOverlay({
	winner,
	endedBy,
	onRestart,
}: {
	winner: Team;
	endedBy: "cartas" | "asesino" | null;
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
			<button
				type="button"
				onClick={onRestart}
				className="rounded-xl bg-white px-6 py-3 text-sm font-bold uppercase tracking-widest text-black active:scale-95"
			>
				Otra partida
			</button>
		</div>
	);
}
