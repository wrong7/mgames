import type { GameManifest } from "@mgames/game-kit";
import { ANSWER_WINDOW_MS, ROUND_COUNT } from "./engine/rules.ts";
import { COLORS } from "./theme.ts";

export const manifest: GameManifest = {
	slug: "visto-y-no-visto",
	name: "Visto y no visto",
	tagline: "Cuéntalos antes de que se esfumen.",
	description:
		"Caen unos cubos sobre el tablero y en un abrir y cerrar de ojos, ¡chas!, desaparecen. " +
		"Cada uno marca en su móvil cuántos había, y en cuanto alguien confirma, los demás " +
		`tienen ${ANSWER_WINDOW_MS / 1000} segundos. Un punto por acertar y otro para el primero ` +
		`que acierta. Son ${ROUND_COUNT} rondas, cada una con más cubos, más desordenados y ` +
		"menos tiempo para verlos.",
	// Se puede jugar solo, para practicar; la gracia está en ganar a alguien.
	players: { min: 2 },
	minutes: { min: 4, max: 6 },
	theme: {
		background: COLORS.felt,
		foreground: COLORS.chalk,
		accent: COLORS.gold,
	},
	status: "ready",
};
