import type { GameManifest } from "@mgames/game-kit";
import { MAX_PLAYERS, MIN_PLAYERS } from "./engine/rules.ts";

export const manifest: GameManifest = {
	slug: "espia",
	name: "El Espía",
	tagline: "Todos saben dónde están. Menos uno.",
	description:
		"Todos reciben la misma localización y un papel dentro de ella; uno recibe " +
		"sólo que es el espía. Se hacen preguntas por turnos: los demás intentan " +
		"pillarlo sin decir dónde están, y el espía intenta averiguarlo sin que se " +
		"le note.",
	players: { min: MIN_PLAYERS, max: MAX_PLAYERS },
	minutes: { min: 8, max: 15 },
	theme: {
		background: "#1c2b3a",
		foreground: "#f2ede3",
		accent: "#d8a24a",
	},
	status: "ready",
};
