import { randomCode } from "@mgames/game-kit";
import { type RoomStatus, useGameRoom, useWakeLock } from "@mgames/game-kit/react";
import { useState } from "react";
import {
	engine,
	MAX_NAME_LENGTH,
	MIN_PLAYERS,
	type SpyAction,
	type SpyView,
} from "../engine/index.ts";
import { manifest } from "../manifest.ts";
import { COLORS } from "../theme.ts";
import { LocationList } from "./LocationList.tsx";
import { PlayerList } from "./PlayerList.tsx";
import { RoleCard } from "./RoleCard.tsx";

export interface SpyScreenProps {
	/** Código de la sala: lo que los jugadores se dictan en voz alta. */
	code: string;
	/** Origen del servidor de salas. Sin él este juego no se puede jugar. */
	realtimeUrl?: string;
	onExit?: () => void;
}

/**
 * El juego entero, en una pantalla que cambia según la fase.
 *
 * A diferencia de Código Secreto, aquí no hay dos vistas que elegir: cada móvil
 * es un jugador y lo que ve depende de lo que le haya tocado.
 */
export function SpyScreen({ code, realtimeUrl, onExit }: SpyScreenProps) {
	const { view, status, playerId, dispatch } = useGameRoom({
		engine,
		game: manifest.slug,
		code,
		realtimeUrl,
	});
	useWakeLock();

	const me = view.players.find((player) => player.id === playerId);

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
			<Header code={code} status={status} onExit={onExit} />
			<Body
				view={view}
				status={status}
				playerId={playerId}
				joined={me !== undefined}
				dispatch={dispatch}
			/>
		</div>
	);
}

/** Qué se enseña ahora mismo, que es lo único que cambia entre fases. */
function Body({
	view,
	status,
	playerId,
	joined,
	dispatch,
}: {
	view: SpyView;
	status: RoomStatus;
	playerId: string;
	joined: boolean;
	dispatch: (action: SpyAction) => void;
}) {
	// Sin sala compartida no hay reparto que valga: este juego consiste justamente
	// en que cada móvil reciba algo distinto.
	if (status === "local") return <Disconnected />;

	if (!joined) return <JoinForm onJoin={(name) => dispatch({ type: "unirse", name })} />;

	if (view.phase === "sala") {
		return (
			<Waiting
				view={view}
				meId={playerId}
				onDeal={() => dispatch({ type: "repartir", seed: randomCode(12) })}
			/>
		);
	}

	if (view.phase === "revelado" && view.reveal) {
		return <Revealed reveal={view.reveal} onBack={() => dispatch({ type: "volver" })} />;
	}

	return <Playing view={view} meId={playerId} onReveal={() => dispatch({ type: "revelar" })} />;
}

function Header({
	code,
	status,
	onExit,
}: {
	code: string;
	status: RoomStatus;
	onExit?: () => void;
}) {
	const hint =
		status === "conectado" ? "en vivo" : status === "conectando" ? "conectando…" : "sin conexión";

	return (
		<header className="flex shrink-0 items-center gap-2">
			{onExit && (
				<button
					type="button"
					onClick={onExit}
					className="rounded-xl px-3 py-2 active:scale-95"
					style={{ backgroundColor: COLORS.slate }}
					aria-label="Volver al catálogo"
				>
					←
				</button>
			)}
			<div className="flex-1 text-center">
				<p className="font-mono text-xl font-black tracking-[0.25em]">{code}</p>
				<p className="text-[0.55rem] uppercase tracking-[0.25em] opacity-60">{hint}</p>
			</div>
			{/* Hueco simétrico al botón de volver, para que el código quede centrado. */}
			{onExit && <div className="w-11" aria-hidden="true" />}
		</header>
	);
}

function Disconnected() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
			<p className="text-2xl font-black uppercase tracking-tight">Sin conexión</p>
			<p className="max-w-[26ch] text-sm opacity-70">
				El Espía necesita que los móviles hablen entre ellos: es el servidor quien reparte las
				cartas para que nadie vea la de los demás.
			</p>
		</div>
	);
}

function JoinForm({ onJoin }: { onJoin: (name: string) => void }) {
	const [name, setName] = useState("");
	const ready = name.trim().length > 0;

	return (
		<form
			className="flex flex-1 flex-col items-center justify-center gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (ready) onJoin(name);
			}}
		>
			<label htmlFor="nombre" className="text-xs uppercase tracking-[0.3em] opacity-60">
				¿Cómo te llamas?
			</label>
			<input
				id="nombre"
				value={name}
				onChange={(event) => setName(event.target.value)}
				maxLength={MAX_NAME_LENGTH}
				autoCapitalize="words"
				autoComplete="off"
				className="w-full rounded-2xl px-4 py-4 text-center text-2xl font-bold outline-none"
				style={{ backgroundColor: COLORS.paper, color: COLORS.night }}
			/>
			<button
				type="submit"
				disabled={!ready}
				className="w-full rounded-2xl py-4 text-lg font-black uppercase tracking-widest active:scale-[0.98] disabled:opacity-40"
				style={{ backgroundColor: COLORS.gold, color: COLORS.night }}
			>
				Entrar
			</button>
		</form>
	);
}

function Waiting({ view, meId, onDeal }: { view: SpyView; meId: string; onDeal: () => void }) {
	const missing = MIN_PLAYERS - view.players.length;

	return (
		<div className="flex flex-1 flex-col justify-between gap-4">
			<div className="flex flex-1 flex-col justify-center gap-4">
				<h1 className="text-center text-3xl font-black uppercase leading-none tracking-tight">
					{manifest.name}
				</h1>
				<PlayerList players={view.players} meId={meId} />
			</div>

			<button
				type="button"
				onClick={onDeal}
				disabled={missing > 0}
				className="shrink-0 rounded-2xl py-4 text-lg font-black uppercase tracking-widest active:scale-[0.98] disabled:opacity-40"
				style={{ backgroundColor: COLORS.gold, color: COLORS.night }}
			>
				{missing > 0 ? `Falta${missing > 1 ? "n" : ""} ${missing} para empezar` : "Repartir"}
			</button>
		</div>
	);
}

function Playing({ view, meId, onReveal }: { view: SpyView; meId: string; onReveal: () => void }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<RoleCard card={view.card} />
			<PlayerList players={view.players} meId={meId} />
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
