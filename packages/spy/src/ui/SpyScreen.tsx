import type { GameScreenProps, PlayerProfile } from "@mgames/game-kit";
import { Avatar, useClock, useNudge, useWakeLock } from "@mgames/game-kit/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	allReady,
	dealStep,
	MAX_PLAYERS,
	MIN_PLAYERS,
	type SpyAction,
	type SpyPlayer,
	type SpyView,
} from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";
import { PlayerList } from "./PlayerList.tsx";
import { RoleCard } from "./RoleCard.tsx";
import { Stamp } from "./Stamp.tsx";

export type SpyScreenProps = GameScreenProps<SpyView, SpyAction>;

/**
 * El juego entero, en una pantalla que cambia según la fase.
 *
 * No hay asientos ni papeles que elegir: cuando todos los de la sala dicen
 * "listo", cuenta atrás y se reparte, y lo que ve cada uno depende de lo que
 * le haya tocado.
 *
 * La cuenta atrás se lleva con la hora de la sala, la misma en todos los
 * móviles; al acabar, cada uno avisa al motor, que reparte con la suya.
 */
export function SpyScreen({
	code,
	profile,
	players,
	live,
	view,
	play,
	now,
	onExit,
}: SpyScreenProps) {
	useWakeLock();
	const present = useMemo(() => players.map((player) => player.id), [players]);
	// Se repinta en cada segundo de la cuenta atrás, y al acabar.
	const dealAt = view.phase === "sala" ? view.dealAt : null;
	const time = useClock(now, dealAt === null ? [] : [dealAt - 2000, dealAt - 1000, dealAt]);
	const nudge = useCallback(() => play({ type: "avanzar" }), [play]);
	useNudge(dealStep(view, present, time) !== null, nudge);

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
			<Body view={view} players={players} profile={profile} play={play} time={time} />
		</div>
	);
}

/** Qué se enseña ahora mismo, que es lo único que cambia entre fases. */
function Body({
	view,
	players,
	profile,
	play,
	time,
}: {
	view: SpyView;
	players: readonly PlayerProfile[];
	profile: PlayerProfile;
	play: (action: SpyAction) => void;
	/** La hora de la sala en este render. */
	time: number;
}) {
	if (view.phase === "sala") {
		return (
			<Waiting
				players={players}
				meId={profile.id}
				ready={view.ready}
				dealAt={view.dealAt}
				time={time}
				onReady={(ready) => play({ type: "listo", ready })}
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

/**
 * La mesa antes de repartir: las instrucciones, quién hay y quién está listo.
 *
 * Nadie reparte a mano. Cuando todos los de la sala han dicho "listo", corre
 * una cuenta atrás de tres segundos, bien grande para que todos miren su móvil
 * a la vez, y se reparte sola. Quien se echa atrás a tiempo la para.
 */
function Waiting({
	players,
	meId,
	ready,
	dealAt,
	time,
	onReady,
}: {
	players: readonly PlayerProfile[];
	meId: string;
	ready: readonly string[];
	dealAt: number | null;
	time: number;
	onReady: (ready: boolean) => void;
}) {
	const missing = MIN_PLAYERS - players.length;
	const extra = players.length - MAX_PLAYERS;
	const mine = ready.includes(meId);
	const counting =
		dealAt !== null &&
		allReady(
			ready,
			players.map((player) => player.id),
		);
	const seconds = counting ? Math.max(1, Math.ceil((dealAt - time) / 1000)) : null;
	const waitingFor = players.filter((player) => !ready.includes(player.id));

	const status =
		missing > 0
			? `Falta${missing > 1 ? "n" : ""} ${missing} para empezar`
			: extra > 0
				? `Sobra${extra > 1 ? "n" : ""} ${extra}: máximo ${MAX_PLAYERS}`
				: counting
					? "¡Todos listos! Toca otra vez para esperar"
					: mine
						? `Esperando a ${names(waitingFor)}`
						: "Se reparte cuando estéis todos listos";

	return (
		<div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
			<div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto">
				<h1 className="text-center text-3xl font-black uppercase leading-none tracking-tight">
					{manifest.name}
				</h1>
				<Briefing />
				<PlayerList players={players} meId={meId} ready={ready} />
			</div>

			<div className="flex shrink-0 flex-col gap-2">
				<p className="min-h-4 text-center text-xs leading-tight opacity-80">{status}</p>
				<button
					type="button"
					onClick={() => onReady(!mine)}
					aria-pressed={mine}
					className="rounded-2xl border-2 py-4 text-lg font-black uppercase tracking-widest active:scale-[0.98]"
					style={
						mine
							? { borderColor: COLORS.gold, backgroundColor: "transparent", color: COLORS.gold }
							: { borderColor: COLORS.gold, backgroundColor: COLORS.gold, color: COLORS.night }
					}
				>
					{mine ? "✓ Listo" : "Estoy listo"}
				</button>
			</div>

			{seconds !== null && <Countdown seconds={seconds} />}
		</div>
	);
}

/** El número de la cuenta atrás, encima de todo: que se vea desde el otro lado de la mesa. */
function Countdown({ seconds }: { seconds: number }) {
	return (
		<div
			className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-2"
			style={{
				background: `radial-gradient(circle, ${COLORS.night}f2 0%, ${COLORS.night}b3 45%, transparent 75%)`,
			}}
			role="timer"
			aria-live="assertive"
		>
			<p className="text-xs font-bold uppercase tracking-[0.35em]" style={{ color: COLORS.ink }}>
				Repartiendo
			</p>
			<p className="font-mono text-[9rem] font-black leading-none" style={{ color: COLORS.gold }}>
				{seconds}
			</p>
		</div>
	);
}

/** "Ana", "Ana y Bea", "Ana, Bea y Carla". */
function names(people: readonly PlayerProfile[]): string {
	const list = people.map((person) => person.name);
	if (list.length <= 1) return list.join("");
	return `${list.slice(0, -1).join(", ")} y ${list.at(-1)}`;
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
