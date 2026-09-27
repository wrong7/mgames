import type { GameScreenProps, PlayerProfile } from "@mgames/game-kit";
import { randomCode } from "@mgames/game-kit";
import { Avatar, useWakeLock } from "@mgames/game-kit/react";
import { useEffect, useState } from "react";
import {
	MAX_PLAYERS,
	MIN_PLAYERS,
	type SpyAction,
	type SpyPlayer,
	type SpyView,
} from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";
import { LocationList } from "./LocationList.tsx";
import { PlayerList } from "./PlayerList.tsx";
import { RoleCard } from "./RoleCard.tsx";
import { Stamp } from "./Stamp.tsx";

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
		<div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
			<div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto">
				<h1 className="text-center text-3xl font-black uppercase leading-none tracking-tight">
					{manifest.name}
				</h1>
				<Briefing />
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

/**
 * Las reglas, en tres frases.
 *
 * Se leen mientras llega la gente, así que tienen que bastar para que quien no
 * ha jugado nunca empiece sin que se lo expliquen. Lo que no está aquí (acusar,
 * votar) se hace hablando: la pantalla sólo reparte y destapa.
 */
const BRIEFING = [
	"Mira tu carta sin que nadie la vea: dice dónde estáis y quién eres. Al espía sólo le dice que es el espía.",
	"Por turnos, pregunta a quien quieras sobre el sitio. Contesta para que los tuyos te crean, sin regalarle el sitio al espía.",
	"Cuando sospechéis de alguien, acusadlo en voz alta y destapad. Si el espía adivina dónde estáis, gana él.",
];

/** La hoja de instrucciones de la misión, con su sello. */
function Briefing() {
	return (
		<section
			className="relative mx-1 rotate-[-0.6deg] rounded-md px-5 pt-6 pb-5 text-sm leading-snug shadow-xl"
			style={{ backgroundColor: COLORS.paper, color: COLORS.night }}
		>
			<Stamp className="absolute -top-3 right-4 rotate-[5deg] text-[0.65rem]">Alto secreto</Stamp>
			<h2 className="mb-3 text-[0.6rem] font-bold uppercase tracking-[0.3em] opacity-60">
				Instrucciones
			</h2>
			<ol className="flex flex-col gap-2.5">
				{BRIEFING.map((step, index) => (
					<li key={step} className="flex gap-3">
						<span className="font-mono font-black" style={{ color: COLORS.stamp }}>
							{index + 1}
						</span>
						<span>{step}</span>
					</li>
				))}
			</ol>
		</section>
	);
}

function Playing({ view, meId, onReveal }: { view: SpyView; meId: string; onReveal: () => void }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<RoleCard card={view.card} />
			<PlayerList players={view.participants} meId={meId} />
			{/* Durante la ronda la marca de tiempo es la del reparto: sirve de nombre de la ronda. */}
			<LocationList locations={view.locations} round={view.updatedAt} />
			<RevealButton onReveal={onReveal} />
		</div>
	);
}

/**
 * Destapar acaba la ronda para todos, y el botón está justo debajo de la carta
 * que se aguanta con el pulgar. Por eso pide una segunda pulsación: un roce no
 * debería destripar la partida a toda la mesa.
 */
function RevealButton({ onReveal }: { onReveal: () => void }) {
	const [confirming, setConfirming] = useState(false);

	useEffect(() => {
		if (!confirming) return;
		const timer = setTimeout(() => setConfirming(false), 3000);
		return () => clearTimeout(timer);
	}, [confirming]);

	return (
		<button
			type="button"
			onClick={() => (confirming ? onReveal() : setConfirming(true))}
			className="shrink-0 rounded-2xl border-2 py-3 text-sm font-black uppercase tracking-widest active:scale-[0.98]"
			style={{
				borderColor: COLORS.stamp,
				backgroundColor: confirming ? COLORS.paper : COLORS.stamp,
				color: confirming ? COLORS.stamp : COLORS.paper,
			}}
		>
			{confirming ? "¿Destapar para todos?" : "Destapar"}
		</button>
	);
}

function Revealed({
	reveal,
	onBack,
}: {
	reveal: NonNullable<SpyView["reveal"]>;
	onBack: () => void;
}) {
	const many = reveal.spies.length > 1;

	return (
		<div className="flex flex-1 flex-col justify-between gap-4">
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<p className="text-xs uppercase tracking-[0.3em] opacity-60">Estabais en</p>
				<p className="text-4xl font-black uppercase leading-none tracking-tight text-balance">
					{reveal.location}
				</p>
				<p className="mt-8 text-xs uppercase tracking-[0.3em] opacity-60">
					{many ? "Los espías eran" : "El espía era"}
				</p>
				<ul className="mt-3 flex justify-center gap-5">
					{reveal.spies.map((spy, index) => (
						<Mugshot key={spy.id} spy={spy} size={many ? 88 : 120} tilt={index % 2 ? 3 : -3} />
					))}
				</ul>
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

/** La foto de la ficha: su cara sobre papel, con el sello encima. */
function Mugshot({ spy, size, tilt }: { spy: SpyPlayer; size: number; tilt: number }) {
	return (
		<li
			className="relative flex flex-col items-center gap-2 rounded-md p-2.5 pb-3 shadow-xl"
			style={{ backgroundColor: COLORS.paper, color: COLORS.night, rotate: `${tilt}deg` }}
		>
			<Avatar seed={spy.avatar} name={spy.name} size={size} className="block" />
			<span className="truncate text-lg font-black" style={{ maxWidth: size }}>
				{spy.name}
			</span>
			<Stamp className="absolute -right-4 bottom-12 rotate-[-14deg] text-base shadow-md">
				Espía
			</Stamp>
		</li>
	);
}
