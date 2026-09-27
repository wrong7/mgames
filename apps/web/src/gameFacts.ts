import type { GameManifest } from "@mgames/game-kit";

/** "4+ jugadores · 15–30 min": lo que hace falta saber para decidirse por un juego. */
export function gameFacts({ players, minutes }: GameManifest): string {
	const people = players.max ? `${players.min}–${players.max}` : `${players.min}+`;
	return `${people} jugadores · ${minutes.min}–${minutes.max} min`;
}

/**
 * Lo que falta o sobra para jugar con la gente que hay, o `null` si cuadra.
 *
 * Es un aviso, no un cerrojo: el anfitrión puede poner el juego igual, porque
 * lo normal es elegirlo mientras aún llega gente. Cada juego ya dice en su
 * pantalla qué le falta para empezar.
 */
export function headcountIssue({ players }: GameManifest, count: number): string | null {
	if (count < players.min) {
		const missing = players.min - count;
		return missing === 1 ? "Falta 1" : `Faltan ${missing}`;
	}
	if (players.max !== undefined && count > players.max) {
		const extra = count - players.max;
		return extra === 1 ? "Sobra 1" : `Sobran ${extra}`;
	}
	return null;
}
