import { useSyncExternalStore } from "react";

/**
 * Qué pinta tienen los personajes: muñecos o slimes.
 *
 * Es una prueba: cada móvil elige y se acuerda, y todo lo que dibuja
 * personajes (el escenario, los retratos) se entera al momento. No viaja a
 * los demás: en una sala cada uno ve a todos con el estilo que tenga puesto.
 */
export type AvatarStyle = "muñeco" | "slime";

const KEY = "mgames.estilo";
const EVENT = "mgames:estilo";

export function avatarStyle(): AvatarStyle {
	try {
		return localStorage.getItem(KEY) === "slime" ? "slime" : "muñeco";
	} catch {
		return "muñeco";
	}
}

export function setAvatarStyle(style: AvatarStyle): void {
	try {
		localStorage.setItem(KEY, style);
	} catch {
		// Sin almacenamiento (modo privado): vale para esta visita.
	}
	window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
	window.addEventListener(EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

/** El estilo de personajes de este móvil; en el servidor, siempre muñecos. */
export function useAvatarStyle(): AvatarStyle {
	return useSyncExternalStore(subscribe, avatarStyle, () => "muñeco");
}
