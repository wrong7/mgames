import { CodenamesGame, manifest as codenames, engine as codenamesEngine } from "@mgames/codenames";
import { CubesScreen, manifest as cubes, engine as cubesEngine } from "@mgames/cubes";
import type { AnyEngine, GameManifest, GameScreenProps } from "@mgames/game-kit";
import { SpyScreen, manifest as spy, engine as spyEngine } from "@mgames/spy";
import type { ComponentType } from "react";

/**
 * Una entrada del catálogo: lo que el juego cuenta de sí mismo, su motor y la
 * pantalla que lo pinta dentro de una sala.
 *
 * El ensanchamiento a `unknown` es deliberado: la sala no sabe a qué se juega y
 * trata a todos igual. Cada paquete sí conoce sus tipos; aquí sólo se enchufan.
 */
export interface GameEntry {
	manifest: GameManifest;
	engine: AnyEngine;
	Screen: ComponentType<GameScreenProps<unknown, unknown>>;
}

/**
 * El catálogo. Es la única lista que hay que tocar para añadir un juego: se
 * importa su manifest, su motor y su pantalla, y se registra aquí.
 */
export const GAMES: readonly GameEntry[] = [
	{
		manifest: codenames,
		engine: codenamesEngine as AnyEngine,
		Screen: CodenamesGame as ComponentType<GameScreenProps<unknown, unknown>>,
	},
	{
		manifest: spy,
		engine: spyEngine as AnyEngine,
		Screen: SpyScreen as ComponentType<GameScreenProps<unknown, unknown>>,
	},
	{
		manifest: cubes,
		engine: cubesEngine as AnyEngine,
		Screen: CubesScreen as ComponentType<GameScreenProps<unknown, unknown>>,
	},
];

/** Los motores por slug, tal y como los quiere `useRoom`. */
export const ENGINES: Readonly<Record<string, AnyEngine>> = Object.fromEntries(
	GAMES.map((game) => [game.manifest.slug, game.engine]),
);

export function findGame(slug: string): GameEntry | undefined {
	return GAMES.find((game) => game.manifest.slug === slug);
}
