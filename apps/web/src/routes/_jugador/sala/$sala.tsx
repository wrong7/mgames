import { isCompleteCode, normalizeCode } from "@mgames/game-kit";
import { useRoom } from "@mgames/game-kit/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { RoomLobby } from "../../../components/RoomLobby.tsx";
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
	const { room, status, dispatch, play } = useRoom({
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

	if (game && room.view !== null) {
		return (
			<game.Screen
				code={code}
				profile={profile}
				players={room.players}
				host={room.host}
				live={status === "conectado"}
				view={room.view}
				play={play}
				onExit={isHost ? () => dispatch({ type: "exitGame" }) : undefined}
			/>
		);
	}

	return (
		<RoomLobby
			code={code}
			room={room}
			profile={profile}
			live={status === "conectado"}
			onSelectGame={(slug) => dispatch({ type: "selectGame", game: slug })}
			onLeave={leave}
		/>
	);
}

function Connecting({
	code,
	status,
	onLeave,
}: {
	code: string;
	status: "conectando" | "conectado" | "desconectado";
	onLeave: () => void;
}) {
	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-3 bg-neutral-950 p-8 text-center text-white">
			<p className="font-mono text-4xl font-black tracking-[0.25em]">{code}</p>
			<p className="text-xs uppercase tracking-[0.3em] text-white/60">
				{status === "desconectado"
					? "Sin conexión con la sala. Reintentando…"
					: "Entrando en la sala"}
			</p>
			<button
				type="button"
				onClick={onLeave}
				className="mt-6 text-xs uppercase tracking-widest text-white/50 underline underline-offset-4"
			>
				Volver a la portada
			</button>
		</div>
	);
}
