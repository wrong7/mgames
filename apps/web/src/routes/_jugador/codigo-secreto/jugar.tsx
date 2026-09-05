import { GameScreen, type Role } from "@mgames/codenames";
import { normalizeCode } from "@mgames/game-kit";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { REALTIME_URL } from "../../../config.ts";
import { useCurrentProfile } from "../../../profile.tsx";

export const Route = createFileRoute("/_jugador/codigo-secreto/jugar")({
	validateSearch: (search: Record<string, unknown>) => ({
		sala: normalizeCode(String(search.sala ?? "")),
		rol: (search.rol === "master" ? "master" : "agente") as Role,
	}),
	// Sin código no hay sala que abrir: de vuelta a elegir una.
	beforeLoad: ({ search }) => {
		if (!search.sala) throw redirect({ to: "/codigo-secreto" });
	},
	component: CodigoSecretoJugar,
});

function CodigoSecretoJugar() {
	const { sala, rol } = Route.useSearch();
	const navigate = useNavigate();
	const profile = useCurrentProfile();

	return (
		<GameScreen
			code={sala}
			role={rol}
			realtimeUrl={REALTIME_URL}
			profile={profile}
			onExit={() => navigate({ to: "/codigo-secreto", search: { sala } })}
		/>
	);
}
