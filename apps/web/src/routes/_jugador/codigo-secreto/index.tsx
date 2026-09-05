import { Lobby } from "@mgames/codenames";
import { normalizeCode, randomCode } from "@mgames/game-kit";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

export const Route = createFileRoute("/_jugador/codigo-secreto/")({
	// El código vive en la URL para que se pueda compartir el enlace de la sala
	// además de dictar el código en voz alta. Es opcional para poder enlazar el
	// juego desde el catálogo sin inventarse uno: al entrar sin él se propone.
	validateSearch: (search: Record<string, unknown>): { sala?: string } => {
		const sala = normalizeCode(String(search.sala ?? ""));
		return sala ? { sala } : {};
	},
	component: CodigoSecretoLobby,
});

function CodigoSecretoLobby() {
	const { sala } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const setSala = useCallback(
		(code: string, replace = false) => {
			navigate({ search: { sala: code }, replace });
		},
		[navigate],
	);

	// Entrar sin código no debería obligar a inventarse uno: se propone uno nuevo
	// y se deja en la URL, listo para compartir. Va con `replace` para que el
	// botón de atrás salga al catálogo y no vuelva aquí.
	useEffect(() => {
		if (!sala) setSala(randomCode(), true);
	}, [sala, setSala]);

	return (
		<Lobby
			code={sala ?? ""}
			onCodeChange={setSala}
			onNewCode={() => setSala(randomCode())}
			onStart={(rol) => {
				if (sala) navigate({ to: "/codigo-secreto/jugar", search: { sala, rol } });
			}}
			onExit={() => navigate({ to: "/" })}
		/>
	);
}
