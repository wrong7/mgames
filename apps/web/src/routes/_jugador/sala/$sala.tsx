import { isCompleteCode, normalizeCode } from "@mgames/game-kit";
import { type RoomStatus, useRoom } from "@mgames/game-kit/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoomLobby } from "../../../components/RoomLobby.tsx";
import { StageBackdrop } from "../../../components/StageBackdrop.tsx";
import { REALTIME_URL } from "../../../config.ts";
import { ENGINES, findGame } from "../../../games.ts";
import { useCurrentProfile } from "../../../profile.tsx";

export const Route = createFileRoute("/_jugador/sala/$sala")({
	// Un código mal escrito en la URL no abre una sala rara: vuelve a la portada.
	beforeLoad: ({ params }) => {
		if (!isCompleteCode(normalizeCode(params.sala))) throw redirect({ to: "/" });
	},
	component: Sala,
});

/**
 * La sala: donde está la gente, y encima, el juego que toque.
 *
 * Esta ruta es la única que habla con el servidor. Lo que hay dentro —lobby o
 * juego— recibe la sala ya resuelta y no sabe nada de conexiones.
 */
function Sala() {
	const { sala } = Route.useParams();
	const code = normalizeCode(sala);
	const profile = useCurrentProfile();
	const navigate = useNavigate();
	const { room, status, dispatch, play, now } = useRoom({
		code,
		profile,
		realtimeUrl: REALTIME_URL,
		engines: ENGINES,
	});

	const leave = () => {
		dispatch({ type: "leave" });
		navigate({ to: "/" });
	};

	if (!room) return <Connecting code={code} status={status} onLeave={leave} />;

	const game = room.game ? findGame(room.game) : undefined;
	const isHost = room.host === profile.id;
	const live = status === "conectado";

	return (
		<>
			{game && room.view !== null ? (
				<game.Screen
					code={code}
					profile={profile}
					players={room.players}
					host={room.host}
					live={live}
					view={room.view}
					play={play}
					now={now}
					onExit={isHost ? () => dispatch({ type: "exitGame" }) : undefined}
				/>
			) : (
				<RoomLobby
					code={code}
					room={room}
					profile={profile}
					live={live}
					onSelectGame={(slug) => dispatch({ type: "selectGame", game: slug })}
					onLeave={leave}
				/>
			)}
			<OfflineNotice live={live} />
		</>
	);
}

function Connecting({
	code,
	status,
	onLeave,
}: {
	code: string;
	status: RoomStatus;
	onLeave: () => void;
}) {
	return (
		<div className="relative flex h-dvh flex-col items-center justify-center gap-3 overflow-hidden bg-neutral-950 p-8 text-center text-white">
			<StageBackdrop stars={false} />
			<p className="relative text-[0.6rem] uppercase tracking-[0.3em] text-white/60">Sala</p>
			<p className="relative font-mono text-4xl font-black tracking-[0.25em] drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
				{code}
			</p>
			<p className="relative flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/70">
				<Dots />
				{status === "desconectado" ? "Sin conexión. Reintentando" : "Entrando en la sala"}
			</p>
			<button
				type="button"
				onClick={onLeave}
				className="relative mt-6 text-xs uppercase tracking-widest text-white/50 underline underline-offset-4"
			>
				Volver a la portada
			</button>
		</div>
	);
}

/** Tres puntos que laten por turnos: está pasando algo, aunque no se vea. */
function Dots() {
	return (
		<span className="flex gap-1" aria-hidden="true">
			{[0, 0.2, 0.4].map((delay) => (
				<span
					key={delay}
					className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
					style={{ animationDelay: `${delay}s` }}
				/>
			))}
		</span>
	);
}

/**
 * Aviso de que la sala no está escuchando.
 *
 * Sin conexión, lo que se toque no llega a nadie: el servidor no lo recibe y,
 * en los juegos que pintan la jugada al momento, al volver la conexión la
 * pantalla se deshace sola. Cada juego lo dice en su cabecera, en pequeño;
 * esto lo dice encima de todo. Espera un poco antes de salir, porque al volver
 * de la pantalla bloqueada el móvil tarda un segundo en reconectar y ese
 * parpadeo no le importa a nadie.
 */
function OfflineNotice({ live }: { live: boolean }) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (live) {
			setVisible(false);
			return;
		}
		const timer = setTimeout(() => setVisible(true), 1500);
		return () => clearTimeout(timer);
	}, [live]);

	// `<output>` es una región de estado: los lectores de pantalla lo anuncian al aparecer.
	return (
		<output
			className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4"
			style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
		>
			{visible && (
				<span className="flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-black shadow-lg">
					<Dots />
					Sin conexión · reconectando
				</span>
			)}
		</output>
	);
}
