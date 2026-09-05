import { useProfile } from "@mgames/game-kit/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProfileScreen } from "../components/ProfileScreen.tsx";

export const Route = createFileRoute("/perfil")({ component: Perfil });

/** Cambiar de nombre o de cara. Se llega desde la ficha del catálogo. */
function Perfil() {
	const { profile, save } = useProfile();
	const navigate = useNavigate();

	if (profile === undefined) return <div className="h-dvh bg-neutral-950" />;

	return (
		<ProfileScreen
			initial={profile}
			onSave={(next) => {
				save(next);
				navigate({ to: "/" });
			}}
			onCancel={profile ? () => navigate({ to: "/" }) : undefined}
		/>
	);
}
