import { normalizeCode, randomCode } from "@mgames/game-kit";
import { SpyScreen } from "@mgames/spy";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { REALTIME_URL } from "../../config.ts";

export const Route = createFileRoute("/espia/")({
	// El código vive en la URL para poder compartir el enlace de la sala además
	// de dictarlo en voz alta.
	validateSearch: (search: Record<string, unknown>): { sala?: string } => {
		const sala = normalizeCode(String(search.sala ?? ""));
		return sala ? { sala } : {};
	},
	component: Espia,
});

function Espia() {
	const { sala } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	// Entrar sin código propone uno nuevo. Va con `replace` para que el botón de
	// atrás salga al catálogo y no vuelva aquí.
	useEffect(() => {
		if (!sala) navigate({ search: { sala: randomCode() }, replace: true });
	}, [sala, navigate]);

	// El juego no tiene lobby propio en la app: la sala de espera es una fase del
	// propio juego, porque hay que ver quién va entrando.
	if (!sala) return null;

	return <SpyScreen code={sala} realtimeUrl={REALTIME_URL} onExit={() => navigate({ to: "/" })} />;
}
