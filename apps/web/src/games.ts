import { manifest as codenames } from "@mgames/codenames";
import type { GameManifest } from "@mgames/game-kit";
import { manifest as spy } from "@mgames/spy";

/**
 * Una entrada del catálogo: lo que el juego cuenta de sí mismo, más la ruta en
 * la que esta app lo ha montado.
 *
 * La ruta va aquí y no en el manifest a propósito: el paquete del juego no tiene
 * por qué saber en qué URL lo cuelga quien lo aloje, y así el enlace lo sigue
 * comprobando el router.
 */
export interface GameEntry {
	manifest: GameManifest;
	to: "/codigo-secreto" | "/espia";
}

/**
 * El catálogo. Es la única lista que hay que tocar para añadir un juego: se
 * importa su manifest, se monta su ruta y se registra aquí.
 */
export const GAMES: readonly GameEntry[] = [
	{ manifest: codenames, to: "/codigo-secreto" },
	{ manifest: spy, to: "/espia" },
];
