import type { PlayerProfile, RoomView } from "@mgames/game-kit";
import { AvatarStage, type StageActor } from "@mgames/game-kit/react";
import { useEffect, useMemo, useState } from "react";
import { gameFacts, headcountIssue } from "../gameFacts.ts";
import { GAMES } from "../games.ts";
import { StageBackdrop } from "./StageBackdrop.tsx";

export interface RoomLobbyProps {
	code: string;
	room: RoomView;
	profile: PlayerProfile;
	live: boolean;
	onSelectGame: (slug: string) => void;
	onLeave: () => void;
}

/**
 * La sala sin juego: quién está y a qué se va a jugar.
 *
 * Arriba, el escenario: cada uno es su slime en una peana y el que llega cae
 * del cielo, como en la sala de espera de los juegos de consola. Sirve para
 * saber de un vistazo si falta alguien y para hacer tiempo mientras llega.
 *
 * El código va grande porque es lo que se dicta al que llega tarde. El juego lo
 * elige el anfitrión —el primero que entró— y los demás lo ven como una lista
 * sin botones: es la forma más simple de que no haya cinco dedos cambiando de
 * juego a la vez.
 */
export function RoomLobby({ code, room, profile, live, onSelectGame, onLeave }: RoomLobbyProps) {
	const isHost = room.host === profile.id;
	const hostName = room.players.find((p) => p.id === room.host)?.name;
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

	return (
		<main className="flex h-dvh flex-col bg-neutral-950 text-white">
			{/* El escenario se queda con todo el alto que no ocupen los juegos. */}
			<section className="relative flex min-h-72 flex-1 flex-col">
				<StageBackdrop />
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-b from-transparent to-neutral-950" />
				<header
					className="relative flex items-start justify-between gap-3 px-5"
					style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
				>
					<button
						type="button"
						onClick={onLeave}
						className="rounded-xl bg-white/10 px-3 py-2 active:scale-95"
						aria-label="Salir de la sala"
					>
						←
					</button>
					<div className="text-center">
						<p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/60">Sala</p>
						<p className="font-mono text-4xl font-black tracking-[0.25em] drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
							{code}
						</p>
						<p className="mt-1 flex items-center justify-center gap-1 text-[0.55rem] uppercase tracking-widest text-white/60">
							<span
								className="inline-block size-1.5 rounded-full"
								style={{ backgroundColor: live ? "#4ade80" : "#fbbf24" }}
							/>
							{live ? "en vivo" : "sin conexión"}
						</p>
					</div>
					<div className="w-11" aria-hidden="true" />
				</header>

				<CopyLink code={code} />

				<AvatarStage
					className="relative min-h-0 flex-1"
					actors={actors}
					renderLabel={(actor) => (
						<NameTag
							name={names.get(actor.id) ?? ""}
							me={actor.id === profile.id}
							host={actor.id === room.host}
						/>
					)}
				/>

				<p className="relative pb-3 text-center text-[0.6rem] uppercase tracking-[0.3em] text-white/60">
					{room.players.length === 1
						? "Solo tú, de momento: pásales el código"
						: `${room.players.length} en la sala`}
				</p>
			</section>

			<section
				className="flex max-h-[55dvh] shrink-0 flex-col overflow-y-auto px-5 pt-3"
				style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
			>
				<h2 className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
					{isHost ? "¿A qué jugamos?" : `${hostName ?? "El anfitrión"} elige el juego`}
				</h2>
				<ul className="flex flex-col gap-3">
					{GAMES.map(({ manifest }) => {
						const issue = headcountIssue(manifest, room.players.length);
						const content = (
							<>
								<span className="flex items-start justify-between gap-3">
									<span className="text-2xl font-black uppercase leading-none tracking-tight">
										{manifest.name}
									</span>
									{/* Que se vea que la ficha se toca: para el anfitrión es un botón. */}
									{isHost && (
										<span
											className="shrink-0 rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-widest"
											style={{
												backgroundColor: manifest.theme.foreground,
												color: manifest.theme.background,
											}}
										>
											Jugar
										</span>
									)}
								</span>
								<span className="mt-1 block text-sm opacity-80">{manifest.tagline}</span>
								<span className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-widest">
									<span className="opacity-70">{gameFacts(manifest)}</span>
									{issue && (
										<span className="rounded-full bg-amber-300 px-2 py-0.5 font-bold text-black">
											{issue}
										</span>
									)}
								</span>
							</>
						);
						const style = {
							backgroundColor: manifest.theme.background,
							color: manifest.theme.foreground,
						};
						return (
							<li key={manifest.slug}>
								{isHost ? (
									<button
										type="button"
										onClick={() => onSelectGame(manifest.slug)}
										className="block w-full rounded-2xl border-2 border-black/20 p-4 text-left active:scale-[0.98]"
										style={style}
									>
										{content}
									</button>
								) : (
									<div
										className="rounded-2xl border-2 border-black/20 p-4 opacity-70"
										style={style}
									>
										{content}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			</section>
		</main>
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
			{host && (
				<svg viewBox="0 0 16 12" className="h-2.5 w-3.5 shrink-0" role="img" aria-label="anfitrión">
					<title>Anfitrión</title>
					<path d="M1 11 0 2l4.5 3.5L8 0l3.5 5.5L16 2l-1 9z" fill="#f2c14e" />
				</svg>
			)}
			<span className="truncate">{name}</span>
		</span>
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
		<button
			type="button"
			onClick={share}
			className={[
				"relative mx-auto mt-3 flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-widest active:scale-95",
				copied ? "bg-green-400 text-black" : "bg-white/10 text-white/80",
			].join(" ")}
		>
			{copied ? "✓ Enlace copiado" : "Copiar enlace de la sala"}
		</button>
	);
}
