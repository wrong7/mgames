import { EMOTES, type Emote, type PlayerProfile, type RoomView } from "@mgames/game-kit";
import {
	AvatarStage,
	type EmoteListener,
	type StageActor,
	useWakeLock,
} from "@mgames/game-kit/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gameFacts, headcountIssue } from "../gameFacts.ts";
import { GAMES, type GameEntry } from "../games.ts";
import { StageBackdrop } from "./StageBackdrop.tsx";

export interface RoomLobbyProps {
	code: string;
	room: RoomView;
	profile: PlayerProfile;
	live: boolean;
	onSelectGame: (slug: string) => void;
	onLeave: () => void;
	/** Un gesto del slime propio, para que lo vean todos (`useRoom().emote`). */
	emote: (emote: Emote) => void;
	/** Los gestos de todos, según llegan (`useRoom().onEmote`). */
	onEmote: (listener: EmoteListener) => () => void;
}

/** Los gestos del botón, con su dibujo y su nombre. Primero los que más se usan. */
const EMOTE_CHOICES: readonly { emote: Emote; icon: string; label: string }[] = [
	{ emote: "saluda", icon: "👋", label: "Hola" },
	{ emote: "baila", icon: "💃", label: "Baile" },
	{ emote: "salto", icon: "🦘", label: "Salto" },
	{ emote: "vuelta", icon: "🌀", label: "Vuelta" },
	{ emote: "infla", icon: "🎈", label: "Globo" },
	{ emote: "rebota", icon: "🏀", label: "Bote" },
	{ emote: "estira", icon: "👀", label: "Mirar" },
	{ emote: "aplasta", icon: "🥞", label: "Chof" },
	{ emote: "flan", icon: "🍮", label: "Flan" },
	{ emote: "tiembla", icon: "😱", label: "Miedo" },
];

/** Qué hay abierto encima del escenario: el desplegable de juegos o los gestos. */
type Menu = "juegos" | "gestos" | null;

/**
 * La sala sin juego: quién está y a qué se va a jugar.
 *
 * Toda la pantalla es el escenario: cada uno es su slime en una peana y el que
 * llega cae del cielo, como en la sala de espera de los juegos de consola. Los
 * botones van encima, arriba y abajo, y la cámara encuadra a todos en el hueco
 * que dejan.
 *
 * Arriba, el código: va grande porque es lo que se dicta al que llega tarde.
 * Abajo, el juego, en un desplegable que sólo toca el anfitrión —el primero
 * que entró—: es la forma más simple de que no haya cinco dedos cambiando de
 * juego a la vez. Y los gestos: el que haces, o tocar tu slime, lo ven todos
 * en su pantalla. Por su cuenta los slimes de la sala no hacen ninguno, para
 * que cada gesto quiera decir algo.
 *
 * Como en los juegos, la pantalla no se apaga sola: aquí se espera con el
 * móvil en la mano, y un móvil que se bloquea acaba perdiendo la conexión y,
 * al minuto, saliendo de la sala.
 */
export function RoomLobby({
	code,
	room,
	profile,
	live,
	onSelectGame,
	onLeave,
	emote,
	onEmote,
}: RoomLobbyProps) {
	useWakeLock();
	const isHost = room.host === profile.id;
	const hostName = room.players.find((p) => p.id === room.host)?.name;
	const count = room.players.length;
	const actors = useMemo<StageActor[]>(
		() =>
			room.players.map((player) => ({
				id: player.id,
				seed: player.avatar,
				highlight: player.id === profile.id,
			})),
		[room.players, profile.id],
	);
	const names = new Map(room.players.map((player) => [player.id, player.name]));

	const [header, headerHeight] = useHeight();
	const [footer, footerHeight] = useHeight();
	const [menu, setMenu] = useState<Menu>(null);
	const toggle = (which: Exclude<Menu, null>) => setMenu((open) => (open === which ? null : which));

	useEffect(() => {
		if (!menu) return;
		const close = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenu(null);
		};
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [menu]);

	// Mientras el anfitrión no elige, el primero al que le cuadra la gente que hay.
	const [chosen, setChosen] = useState<string | null>(null);
	const game =
		GAMES.find((entry) => entry.manifest.slug === chosen) ??
		GAMES.find((entry) => !headcountIssue(entry.manifest, count)) ??
		GAMES[0];

	return (
		<main className="relative h-dvh overflow-hidden bg-neutral-950 text-white">
			<StageBackdrop />
			<AvatarStage
				className="absolute inset-0"
				actors={actors}
				emotes={onEmote}
				inset={{ top: headerHeight, bottom: footerHeight }}
				// Tocar tu slime es hacer un gesto, que ven todos; el de otro sólo se menea.
				onTap={(id) => {
					if (id === profile.id)
						emote(EMOTES[Math.floor(Math.random() * EMOTES.length)] ?? "saluda");
				}}
				renderLabel={(actor) => (
					<NameTag
						name={names.get(actor.id) ?? ""}
						me={actor.id === profile.id}
						host={actor.id === room.host}
					/>
				)}
			/>

			<header
				ref={header}
				className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3"
				style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
			>
				<button
					type="button"
					onClick={onLeave}
					className={`${ROUND} text-xl`}
					aria-label="Salir de la sala"
				>
					←
				</button>
				<div className={`${GLASS} pointer-events-auto flex flex-col items-center px-4 pt-1.5 pb-2`}>
					<span className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-white/60">
						Sala
					</span>
					<span className="font-mono text-3xl font-black leading-none tracking-[0.2em] drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
						{code}
					</span>
					<span className="mt-1.5 flex items-center gap-1.5 text-[0.55rem] font-bold uppercase tracking-widest text-white/70">
						<span
							className="inline-block size-1.5 rounded-full"
							style={{ backgroundColor: live ? "#4ade80" : "#fbbf24" }}
						/>
						{!live
							? "Sin conexión"
							: count === 1
								? "Solo tú: pásales el código"
								: `${count} en la sala`}
					</span>
				</div>
				<CopyLink code={code} />
			</header>

			<footer
				ref={footer}
				className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-3 pt-8"
				style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
			>
				{menu && (
					// Tocar fuera cierra lo que haya abierto.
					<button
						type="button"
						tabIndex={-1}
						aria-label="Cerrar"
						onClick={() => setMenu(null)}
						className="pointer-events-auto fixed inset-0 cursor-default"
					/>
				)}
				<div className="pointer-events-auto relative mx-auto flex max-w-md flex-col gap-2">
					{menu === "juegos" && game && (
						<GameMenu
							count={count}
							selected={game.manifest.slug}
							onPick={(slug) => {
								setChosen(slug);
								setMenu(null);
							}}
						/>
					)}
					{menu === "gestos" && (
						<EmoteTray
							onPick={(gesture) => {
								emote(gesture);
								setMenu(null);
							}}
						/>
					)}

					{isHost && game && (
						<GameSelect
							game={game}
							issue={headcountIssue(game.manifest, count)}
							open={menu === "juegos"}
							onToggle={() => toggle("juegos")}
						/>
					)}
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => toggle("gestos")}
							aria-expanded={menu === "gestos"}
							aria-label="Gestos"
							className={`${GLASS} size-14 shrink-0 text-2xl active:scale-95 ${menu === "gestos" ? "ring-2 ring-white" : ""}`}
						>
							😄
						</button>
						{isHost && game ? (
							<button
								type="button"
								onClick={() => onSelectGame(game.manifest.slug)}
								className="flex-1 rounded-2xl border-[3px] border-black bg-white text-xl font-black uppercase tracking-wider text-black shadow-[0_5px_0_#000] transition-transform active:translate-y-1 active:shadow-[0_1px_0_#000]"
							>
								¡A jugar!
							</button>
						) : (
							<p
								className={`${GLASS} flex flex-1 items-center gap-2 px-4 text-xs font-bold uppercase tracking-widest text-white/80`}
							>
								<Crown />
								<span className="truncate">{hostName ?? "El anfitrión"} elige el juego…</span>
							</p>
						)}
					</div>
				</div>
			</footer>
		</main>
	);
}

/** El cristal oscuro de todo lo que va encima del escenario. */
const GLASS = "rounded-2xl border-2 border-white/15 bg-black/50 backdrop-blur-md";
/** Los botones redondos de las esquinas. */
const ROUND =
	"pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full border-2 border-white/15 bg-black/50 backdrop-blur-md active:scale-95";

/** Un elemento y su alto, al día: es lo que se le dice al escenario que tapa. */
function useHeight(): [(element: HTMLElement | null) => void, number] {
	const [height, setHeight] = useState(0);
	const observer = useRef<ResizeObserver | null>(null);
	const ref = useCallback((element: HTMLElement | null) => {
		observer.current?.disconnect();
		if (!element) return;
		observer.current = new ResizeObserver(() =>
			setHeight(Math.round(element.getBoundingClientRect().height)),
		);
		observer.current.observe(element);
	}, []);
	return [ref, height];
}

/** El juego elegido: al tocarlo se despliegan los demás. Sólo lo ve el anfitrión. */
function GameSelect({
	game: { manifest },
	issue,
	open,
	onToggle,
}: {
	game: GameEntry;
	issue: string | null;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			aria-controls="juegos"
			className={`${GLASS} flex w-full items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99]`}
		>
			<GameBadge game={manifest} size="size-10" />
			<span className="min-w-0 flex-1">
				<span className="block text-[0.55rem] font-bold uppercase tracking-[0.25em] text-white/55">
					¿A qué jugamos?
				</span>
				<span className="block truncate text-lg font-black uppercase leading-tight">
					{manifest.name}
				</span>
			</span>
			{issue && <Issue text={issue} />}
			<span
				aria-hidden="true"
				className={`shrink-0 text-white/70 transition-transform ${open ? "rotate-180" : ""}`}
			>
				▾
			</span>
		</button>
	);
}

/** Los juegos, desplegados hacia arriba, encima del escenario. */
function GameMenu({
	count,
	selected,
	onPick,
}: {
	count: number;
	selected: string;
	onPick: (slug: string) => void;
}) {
	return (
		<ul
			id="juegos"
			className="absolute inset-x-0 bottom-full mb-2 flex max-h-[60dvh] flex-col gap-1 overflow-y-auto rounded-3xl border-2 border-white/15 bg-neutral-950/85 p-2 shadow-2xl backdrop-blur-md"
		>
			{GAMES.map(({ manifest }) => {
				const issue = headcountIssue(manifest, count);
				const current = manifest.slug === selected;
				return (
					<li key={manifest.slug}>
						<button
							type="button"
							onClick={() => onPick(manifest.slug)}
							aria-current={current || undefined}
							className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left active:scale-[0.99] ${current ? "bg-white/15 ring-2 ring-white/80" : ""}`}
						>
							<GameBadge game={manifest} size="size-12" />
							<span className="min-w-0 flex-1">
								<span className="block truncate text-base font-black uppercase leading-tight">
									{manifest.name}
								</span>
								<span className="block truncate text-xs text-white/70">{manifest.tagline}</span>
								<span className="mt-1 flex flex-wrap items-center gap-2 text-[0.6rem] uppercase tracking-widest text-white/50">
									{gameFacts(manifest)}
									{issue && <Issue text={issue} />}
								</span>
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

/** La ficha de color de cada juego, con su inicial: cada uno se anuncia con sus colores. */
function GameBadge({ game, size }: { game: GameEntry["manifest"]; size: string }) {
	return (
		<span
			aria-hidden="true"
			className={`${size} grid shrink-0 place-items-center rounded-xl border-2 text-lg font-black`}
			style={{
				backgroundColor: game.theme.background,
				borderColor: game.theme.accent,
				color: game.theme.foreground,
			}}
		>
			{game.name.charAt(0)}
		</span>
	);
}

/** "Faltan 2": un aviso, no un cerrojo (ver `headcountIssue`). */
function Issue({ text }: { text: string }) {
	return (
		<span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wide text-black">
			{text}
		</span>
	);
}

/** Los gestos, encima de los botones. Tocar uno lo hace tu slime en todas las pantallas. */
function EmoteTray({ onPick }: { onPick: (emote: Emote) => void }) {
	return (
		<div className="absolute bottom-full left-0 mb-2 grid grid-cols-5 gap-1.5 rounded-3xl border-2 border-white/15 bg-neutral-950/85 p-2 shadow-2xl backdrop-blur-md">
			{EMOTE_CHOICES.map(({ emote, icon, label }) => (
				<button
					key={emote}
					type="button"
					onClick={() => onPick(emote)}
					className="flex size-14 flex-col items-center justify-center rounded-2xl bg-white/5 active:scale-90"
				>
					<span className="text-2xl leading-none" aria-hidden="true">
						{icon}
					</span>
					<span className="mt-1 text-[0.55rem] font-bold uppercase tracking-wide text-white/70">
						{label}
					</span>
				</button>
			))}
		</div>
	);
}

/** El nombre bajo la peana. El tuyo en blanco, para encontrarte sin buscar. */
function NameTag({ name, me, host }: { name: string; me: boolean; host: boolean }) {
	return (
		<span
			className={[
				"flex max-w-32 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-bold shadow-lg",
				me ? "bg-white text-black" : "bg-black/55 text-white",
			].join(" ")}
		>
			{host && <Crown />}
			<span className="truncate">{name}</span>
		</span>
	);
}

function Crown() {
	return (
		<svg viewBox="0 0 16 12" className="h-2.5 w-3.5 shrink-0" role="img" aria-label="anfitrión">
			<title>Anfitrión</title>
			<path d="M1 11 0 2l4.5 3.5L8 0l3.5 5.5L16 2l-1 9z" fill="#f2c14e" />
		</svg>
	);
}

/**
 * El enlace de la sala, para mandarlo por el grupo en vez de dictar el código.
 *
 * Copiar al portapapeles necesita un gesto del usuario y una página segura
 * (https o localhost); si el navegador no lo permite, se recurre al diálogo de
 * compartir del sistema, que en móvil es incluso más útil.
 */
function CopyLink({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);

	const share = async () => {
		const url = `${window.location.origin}/sala/${code}`;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
		} catch {
			if (navigator.share) {
				await navigator.share({ title: `Sala ${code}`, url }).catch(() => {});
			} else {
				// Sin portapapeles ni diálogo: que al menos se vea para copiarlo a mano.
				window.prompt("Copia el enlace de la sala", url);
			}
		}
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={share}
				aria-label="Copiar el enlace de la sala"
				className={`${ROUND} ${copied ? "border-green-300 bg-green-400 text-black" : ""}`}
			>
				{copied ? (
					"✓"
				) : (
					<svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
						<path
							d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.4"
							strokeLinecap="round"
						/>
					</svg>
				)}
			</button>
			{copied && (
				<output className="absolute top-full right-0 mt-2 whitespace-nowrap rounded-full bg-green-400 px-3 py-1 text-[0.6rem] font-black uppercase tracking-widest text-black shadow-lg">
					Enlace copiado
				</output>
			)}
		</div>
	);
}
