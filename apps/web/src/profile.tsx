import type { PlayerProfile } from "@mgames/game-kit";
import { createContext, useContext } from "react";

/**
 * El perfil del jugador, disponible en cualquier pantalla de juego.
 *
 * Lo rellena la ruta `_jugador`, que no deja pasar a ningún juego sin él. Así
 * las pantallas de juego pueden dar por hecho que existe en lugar de comprobar
 * `null` cada vez.
 */
const ProfileContext = createContext<PlayerProfile | null>(null);

export const ProfileProvider = ProfileContext.Provider;

export function useCurrentProfile(): PlayerProfile {
	const profile = useContext(ProfileContext);
	if (!profile) {
		throw new Error("useCurrentProfile() sólo funciona dentro de una ruta bajo _jugador");
	}
	return profile;
}
