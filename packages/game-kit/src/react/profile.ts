import { useCallback, useEffect, useState } from "react";
import { randomCode } from "../code.ts";
import { normalizeName, type PlayerProfile, parseProfile } from "../profile.ts";

const STORAGE_KEY = "mgames:perfil";

export function readProfile(): PlayerProfile | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? parseProfile(JSON.parse(raw)) : null;
	} catch {
		// Modo privado, cookies bloqueadas, JSON roto... Se pedirá el perfil de
		// nuevo; es lo único razonable cuando no se puede recordar.
		return null;
	}
}

export function saveProfile(profile: PlayerProfile): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
	} catch {
		// No poder recordarlo no debería impedir jugar esta vez.
	}
}

/** Un perfil nuevo, con identidad y cara al azar y el nombre por rellenar. */
export function draftProfile(): PlayerProfile {
	return { id: crypto.randomUUID(), name: "", avatar: randomCode(8) };
}

/** Otra cara, misma persona. */
export function rerollAvatar(profile: PlayerProfile): PlayerProfile {
	return { ...profile, avatar: randomCode(8) };
}

export interface ProfileStore {
	/** `undefined` mientras no se ha podido leer todavía (primer render en el servidor). */
	profile: PlayerProfile | null | undefined;
	save: (profile: PlayerProfile) => void;
}

/**
 * El perfil guardado en este móvil.
 *
 * Se lee en un efecto y no en el estado inicial porque la página se sirve
 * renderizada desde el servidor, donde no hay `localStorage`: leerlo durante el
 * render daría un HTML distinto al que el navegador pinta después.
 */
export function useProfile(): ProfileStore {
	const [profile, setProfile] = useState<PlayerProfile | null | undefined>(undefined);

	useEffect(() => {
		setProfile(readProfile());
	}, []);

	const save = useCallback((next: PlayerProfile) => {
		const clean = { ...next, name: normalizeName(next.name) };
		saveProfile(clean);
		setProfile(clean);
	}, []);

	return { profile, save };
}
