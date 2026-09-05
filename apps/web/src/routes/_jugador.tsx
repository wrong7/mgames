import { useProfile } from "@mgames/game-kit/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProfileScreen } from "../components/ProfileScreen.tsx";
import { ProfileProvider } from "../profile.tsx";

/**
 * Puerta de entrada a los juegos: nadie juega sin nombre y cara.
 *
 * Es una ruta sin segmento en la URL (`/codigo-secreto` sigue siendo
 * `/codigo-secreto`), que envuelve todas las de juego. La primera vez pide el
 * perfil y lo guarda en el móvil; después es transparente.
 */
export const Route = createFileRoute("/_jugador")({ component: Gate });

function Gate() {
	const { profile, save } = useProfile();

	// Aún no se ha podido leer el móvil (primer render, desde el servidor): un
	// hueco en blanco dura menos que un parpadeo del formulario.
	if (profile === undefined) return <div className="h-dvh bg-neutral-950" />;

	if (profile === null) return <ProfileScreen initial={null} onSave={save} />;

	return (
		<ProfileProvider value={profile}>
			<Outlet />
		</ProfileProvider>
	);
}
