import type { PlayerProfile, RoomView } from "@mgames/game-kit";
import { Avatar } from "@mgames/game-kit/react";
import { useEffect, useState } from "react";
import { GAMES } from "../games.ts";

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
 * El código va grande porque es lo que se dicta al que llega tarde. El juego lo
 * elige el anfitrión —el primero que entró— y los demás lo ven como una lista
 * sin botones: es la forma más simple de que no haya cinco dedos cambiando de
 * juego a la vez.
 */
export function RoomLobby({ code, room, profile, live, onSelectGame, onLeave }: RoomLobbyProps) {
	const isHost = room.host === profile.id;
	const hostName = room.players.find((p) => p.id === room.host)?.name;

	return (
		<main
			className="flex h-dvh flex-col gap-6 overflow-y-auto bg-neutral-950 px-5 text-white"
			style={{
				paddingTop: "max(1.5rem, env(safe-area-inset-top))",
				paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
			}}
		>
			<header className="flex items-start justify-between gap-3">
				<button
					type="button"
					onClick={onLeave}
					className="rounded-xl bg-white/10 px-3 py-2 active:scale-95"
					aria-label="Salir de la sala"
				>
					←
				</button>
				<div className="text-center">
					<p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/50">Sala</p>
					<p className="font-mono text-4xl font-black tracking-[0.25em]">{code}</p>
					<p className="mt-1 flex items-center justify-center gap-1 text-[0.55rem] uppercase tracking-widest text-white/50">
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

			<section>
				<h2 className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
					{room.players.length === 1 ? "Solo tú, de momento" : `${room.players.length} en la sala`}
				</h2>
				<ul className="flex flex-wrap gap-2">
					{room.players.map((player) => {
						const me = player.id === profile.id;
						const host = player.id === room.host;
						return (
							<li
								key={player.id}
								className={[
									"flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm",
									me ? "bg-white font-bold text-black" : "bg-white/10",
								].join(" ")}
							>
								<Avatar seed={player.avatar} name={player.name} size={28} className="block" />
								{player.name}
								{host && (
									<span className="text-[0.55rem] uppercase tracking-widest opacity-60">
										anfitrión
									</span>
								)}
							</li>
						);
					})}
				</ul>
			</section>

			<section className="flex flex-1 flex-col">
				<h2 className="mb-2 text-xs uppercase tracking-[0.3em] text-white/50">
					{isHost ? "¿A qué jugamos?" : `${hostName ?? "El anfitrión"} elige el juego`}
				</h2>
				<ul className="flex flex-col gap-3">
					{GAMES.map(({ manifest }) => {
						const content = (
							<>
								<span className="flex items-start justify-between gap-3">
									<span className="text-2xl font-black uppercase leading-none tracking-tight">
										{manifest.name}
									</span>
									<span className="shrink-0 text-[0.65rem] uppercase tracking-widest opacity-60">
										{manifest.players.min}
										{manifest.players.max ? `–${manifest.players.max}` : "+"} jug.
									</span>
								</span>
								<span className="mt-1 block text-sm opacity-80">{manifest.tagline}</span>
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
				"mx-auto -mt-2 flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-widest active:scale-95",
				copied ? "bg-green-400 text-black" : "bg-white/10 text-white/80",
			].join(" ")}
		>
			{copied ? "✓ Enlace copiado" : "Copiar enlace de la sala"}
		</button>
	);
}
