import { engine as codigoSecreto } from "@mgames/codenames/engine";
import type { GameEngine } from "@mgames/game-kit";
import { engine as espia } from "@mgames/spy/engine";

/** Un motor con los tipos borrados: es como lo maneja el servidor, que no los conoce. */
export type AnyEngine = GameEngine<unknown, unknown>;

/**
 * Los juegos que este servidor sabe alojar.
 *
 * La clave es el slug del juego, el mismo que aparece en la URL de la sala y en
 * el manifest del paquete. Añadir un juego es añadir una línea aquí: el resto
 * del servidor no distingue unos de otros.
 *
 * El ensanchamiento a `unknown` es deliberado. El servidor nunca inventa un
 * estado: sólo devuelve al motor lo que ese mismo motor produjo, así que los
 * tipos concretos no le aportan nada y sí le impedirían tratar a todos los
 * juegos por igual.
 */
const ENGINES: Record<string, AnyEngine> = {
	"codigo-secreto": codigoSecreto as AnyEngine,
	espia: espia as AnyEngine,
};

export function findEngine(game: string): AnyEngine | undefined {
	return ENGINES[game];
}
