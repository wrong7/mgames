/**
 * Los gestos que un jugador manda a la sala para que su slime los haga en
 * todas las pantallas: saludar, bailar, inflarse como un globo... Son los
 * gestos del slime, los mismos que hace por su cuenta en el perfil o en el
 * podio.
 *
 * El orden importa: el gesto favorito de cada slime se tira de esta lista, y
 * cambiarla cambiaría el de todo el mundo.
 */
export const EMOTES = [
	"saluda",
	"salto",
	"aplasta",
	"flan",
	"estira",
	"rebota",
	"vuelta",
	"infla",
	"tiembla",
	"baila",
] as const;

export type Emote = (typeof EMOTES)[number];

/** Comprueba que lo que llega por la red es un gesto que existe. */
export function parseEmote(value: unknown): Emote | null {
	return typeof value === "string" && (EMOTES as readonly string[]).includes(value)
		? (value as Emote)
		: null;
}
