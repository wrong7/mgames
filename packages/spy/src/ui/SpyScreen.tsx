import type { GameScreenProps, PlayerProfile } from "@mgames/game-kit";
import { randomCode } from "@mgames/game-kit";
import { useWakeLock } from "@mgames/game-kit/react";
import { MAX_PLAYERS, MIN_PLAYERS, type SpyAction, type SpyView } from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";
import { LocationList } from "./LocationList.tsx";
import { PlayerList } from "./PlayerList.tsx";
import { RoleCard } from "./RoleCard.tsx";

export type SpyScreenProps = GameScreenProps<SpyView, SpyAction>;

/**
 * El juego entero, en una pantalla que cambia según la fase.
 *
 * No hay asientos ni papeles que elegir: se reparte a quien esté en la sala y
 * lo que ve cada uno depende de lo que le haya tocado.
 */
export function SpyScreen({ code, profile, players, live, view, play, onExit }: SpyScreenProps) {
	useWakeLock();

	return (
		<div
			className="flex h-dvh w-full flex-col gap-3 p-4"
			style={{
				backgroundColor: COLORS.night,
				color: COLORS.ink,
				paddingTop: "max(1rem, env(safe-area-inset-top))",
				paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
			}}
		>
			<Header code={code} live={live} onExit={onExit} />
			<Body view={view} players={players} profile={profile} play={play} />
		</div>
	);
}

/** Qué se enseña ahora mismo, que es lo único que cambia entre fases. */
function Body({
	view,
	players,
	profile,
	play,
}: {
	view: SpyView;
	players: readonly PlayerProfile[];
	profile: PlayerProfile;
	play: (action: SpyAction) => void;
}) {
	if (view.phase === "sala") {
		return (
			<Waiting
				players={players}
				meId={profile.id}
				onDeal={() => play({ type: "repartir", seed: randomCode(12) })}
			/>
		);
	}

	if (view.phase === "revelado" && view.reveal) {
		return <Revealed reveal={view.reveal} onBack={() => play({ type: "volver" })} />;
	}

	return <Playing view={view} meId={profile.id} onReveal={() => play({ type: "revelar" })} />;
}

function Header({ code, live, onExit }: { code: string; live: boolean; onExit?: () => void }) {
	return (
		<header className="flex shrink-0 items-center gap-2">
			{onExit && (
				<button
					type="button"
					onClick={onExit}
					className="rounded-xl px-3 py-2 active:scale-95"
					style={{ backgroundColor: COLORS.slate }}
					aria-label="Recoger el juego"
				>
					←
				</button>
			)}
			<div className="flex-1 text-center">
				<p className="font-mono text-xl font-black tracking-[0.25em]">{code}</p>
				<p className="text-[0.55rem] uppercase tracking-[0.25em] opacity-60">
					{live ? "en vivo" : "sin conexión"}
				</p>
			</div>
			{/* Hueco simétrico al botón de volver, para que el código quede centrado. */}
			{onExit && <div className="w-11" aria-hidden="true" />}
		</header>
	);
}

function Waiting({
	players,
	meId,
	onDeal,
}: {
	players: readonly PlayerProfile[];
	meId: string;
	onDeal: () => void;
}) {
	const missing = MIN_PLAYERS - players.length;
	const extra = players.length - MAX_PLAYERS;

	return (
		<div className="flex flex-1 flex-col justify-between gap-4">
			<div className="flex flex-1 flex-col justify-center gap-4">
				<h1 className="text-center text-3xl font-black uppercase leading-none tracking-tight">
					{manifest.name}
				</h1>
				<PlayerList players={players} meId={meId} />
			</div>

			<button
				type="button"
				onClick={onDeal}
				disabled={missing > 0 || extra > 0}
				className="shrink-0 rounded-2xl py-4 text-lg font-black uppercase tracking-widest active:scale-[0.98] disabled:opacity-40"
				style={{ backgroundColor: COLORS.gold, color: COLORS.night }}
			>
				{missing > 0
					? `Falta${missing > 1 ? "n" : ""} ${missing} para empezar`
					: extra > 0
						? `Sobra${extra > 1 ? "n" : ""} ${extra}: máximo ${MAX_PLAYERS}`
						: "Repartir"}
			</button>
		</div>
	);
}

function Playing({ view, meId, onReveal }: { view: SpyView; meId: string; onReveal: () => void }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<RoleCard card={view.card} />
			<PlayerList players={view.participants} meId={meId} />
			<LocationList locations={view.locations} />
			<button
				type="button"
				onClick={onReveal}
				className="shrink-0 rounded-2xl py-3 text-sm font-black uppercase tracking-widest active:scale-[0.98]"
				style={{ backgroundColor: COLORS.stamp, color: COLORS.paper }}
			>
				Destapar
			</button>
		</div>
	);
}

function Revealed({
	reveal,
	onBack,
}: {
	reveal: NonNullable<SpyView["reveal"]>;
	onBack: () => void;
}) {
	return (
		<div className="flex flex-1 flex-col justify-between gap-4">
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p className="text-xs uppercase tracking-[0.3em] opacity-60">Estabais en</p>
				<p className="text-4xl font-black uppercase leading-none tracking-tight text-balance">
					{reveal.location}
				</p>
				<p className="mt-6 text-xs uppercase tracking-[0.3em] opacity-60">
					{reveal.spyNames.length > 1 ? "Los espías eran" : "El espía era"}
				</p>
				<p className="text-3xl font-black" style={{ color: COLORS.stamp }}>
					{reveal.spyNames.join(" y ")}
				</p>
			</div>
			<button
				type="button"
				onClick={onBack}
				className="shrink-0 rounded-2xl py-4 text-lg font-black uppercase tracking-widest active:scale-[0.98]"
				style={{ backgroundColor: COLORS.gold, color: COLORS.night }}
			>
				Otra ronda
			</button>
		</div>
	);
}
