import { engine as codigoSecreto } from "@mgames/codenames/engine";
import type { AnyEngine } from "@mgames/game-kit";
import { engine as espia } from "@mgames/spy/engine";

/**
 * Los juegos que este servidor sabe alojar.
 *
 * La clave es el slug del juego, el mismo que aparece en su manifest. Añadir un
 * juego es añadir una línea aquí: el resto del servidor no distingue unos de
 * otros.
 */
const ENGINES: Record<string, AnyEngine> = {
	"codigo-secreto": codigoSecreto as AnyEngine,
	espia: espia as AnyEngine,
};

export function findEngine(game: string): AnyEngine | undefined {
	return ENGINES[game];
}
