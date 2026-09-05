import type { GameManifest } from "@mgames/game-kit";

export const manifest: GameManifest = {
	slug: "codigo-secreto",
	name: "Código Secreto",
	tagline: "Una palabra, un número, y a rezar.",
	description:
		"Dos equipos compiten por descubrir a sus agentes en un tablero de 25 palabras. " +
		"Sólo los jefes de espías saben quién es quién, y sólo pueden comunicarse con una " +
		"palabra y un número. Cuidado con el asesino: quien lo destapa, pierde en el acto.",
	players: { min: 4 },
	minutes: { min: 15, max: 30 },
	theme: {
		background: "#9da2a8",
		foreground: "#1a1a1a",
		accent: "#439fe8",
	},
	status: "ready",
};
