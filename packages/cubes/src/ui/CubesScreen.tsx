import type { GameScreenProps } from "@mgames/game-kit";
import { useWakeLock } from "@mgames/game-kit/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { type CubesAction, type CubesView, dueStep } from "../engine/index.ts";
import { COLORS } from "../theme.ts";
import { useClock, useNudge } from "./clock.ts";
import { Final } from "./Final.tsx";
import { GameStyles } from "./GameStyles.tsx";
import { PUFF_MS } from "./IsoBoard.tsx";
import { Lobby } from "./Lobby.tsx";
import type { Person } from "./parts.tsx";
import { Results } from "./Results.tsx";
import { RoundStage } from "./RoundStage.tsx";

export type CubesScreenProps = GameScreenProps<CubesView, CubesAction>;

/**
 * Visto y no visto dentro de una sala: la mesa, las rondas y la clasificación.
 *
 * Aquí se lleva el reloj. La pantalla se repinta justo cuando toca (caen los
 * cubos, se esfuman, se acaba la cuenta atrás) con la hora de la sala, que es
 * la misma en todos los móviles, y cuando le parece que hay que pasar a lo
 * siguiente se lo dice al motor, que es quien decide con la hora del servidor.
 */
export function CubesScreen({
	code,
	profile,
	players,
	live,
	view,
	play,
	now,
	onExit,
}: CubesScreenProps) {
	// Mientras se mira el tablero nadie toca el móvil: la pantalla no puede apagarse justo ahí.
	useWakeLock();

	const round = view.round;
	const present = useMemo(() => players.map((player) => player.id), [players]);
	const time = useClock(
		now,
		view.phase === "ronda" && round
			? [round.showAt, round.hideAt, round.hideAt + PUFF_MS, round.closesAt]
			: [view.nextAt],
	);

	const nudge = useCallback(() => play({ type: "avanzar" }), [play]);
	useNudge(dueStep(view, present, time) !== null, nudge);

	const onReady = useCallback((ready: boolean) => play({ type: "listo", ready }), [play]);
	const onAnswer = useCallback((value: number) => play({ type: "responder", value }), [play]);

	// Quien jugó y se fue sigue en el marcador: su cara sale de ahí.
	const personOf = (id: string): Person | undefined =>
		players.find((player) => player.id === id) ??
		view.contestants.find((contestant) => contestant.id === id);

	let body: ReactNode;
	if (view.phase === "ronda" && round) {
		body = (
			<RoundStage
				view={view}
				round={round}
				people={round.participants.flatMap((id) => personOf(id) ?? [])}
				meId={profile.id}
				time={time}
				now={now}
				onAnswer={onAnswer}
			/>
		);
	} else if (view.phase === "resultado" && round) {
		body = (
			<Results
				// Cada ronda cerrada tiene su propio recuento.
				key={`${view.match}-${round.number}`}
				view={view}
				round={round}
				people={players}
				personOf={personOf}
				meId={profile.id}
				now={now}
				onReady={onReady}
			/>
		);
	} else if (view.phase === "final") {
		body = <Final view={view} people={players} meId={profile.id} onReady={onReady} />;
	} else {
		body = <Lobby view={view} people={players} meId={profile.id} onReady={onReady} />;
	}

	return (
		<div
			className="flex h-dvh w-full flex-col gap-2 overflow-hidden px-4"
			style={{
				background: `radial-gradient(130% 65% at 50% 38%, ${COLORS.feltLight} 0%, ${COLORS.felt} 55%, ${COLORS.feltDark} 100%)`,
				color: COLORS.chalk,
				paddingTop: "max(1rem, env(safe-area-inset-top))",
				paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
			}}
		>
			<GameStyles />
			<Header code={code} live={live} onExit={onExit} />
			{body}
		</div>
	);
}

function Header({ code, live, onExit }: { code: string; live: boolean; onExit?: () => void }) {
	return (
		<header className="flex shrink-0 items-center gap-2">
			{onExit && (
				<button
					type="button"
					onClick={onExit}
					className="rounded-xl bg-black/25 px-3 py-2 active:scale-95"
					aria-label="Recoger el juego"
				>
					←
				</button>
			)}
			<div className="flex-1 text-center">
				<p className="font-mono text-lg leading-none font-black tracking-[0.25em]">{code}</p>
				<p className="mt-1 flex items-center justify-center gap-1 text-[0.55rem] uppercase tracking-[0.25em] opacity-70">
					<span
						className="inline-block size-1.5 rounded-full"
						style={{ backgroundColor: live ? "#4ade80" : "#fbbf24" }}
					/>
					{live ? "en vivo" : "sin conexión"}
				</p>
			</div>
			{/* Hueco simétrico al botón de volver, para que el código quede centrado. */}
			{onExit && <div className="w-11" aria-hidden="true" />}
		</header>
	);
}
