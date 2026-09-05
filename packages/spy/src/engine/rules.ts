/**
 * Los números del juego.
 *
 * El máximo de 8 no es arbitrario: cada localización tiene siete papeles, y con
 * ocho jugadores hay como mucho seis agentes, así que nunca hay que repetir un
 * papel dentro de la misma ronda.
 */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** A partir de esta mesa, un solo espía se queda corto y la ronda se hace larga. */
const TWO_SPIES_FROM = 7;

export function spyCountFor(playerCount: number): number {
	return playerCount >= TWO_SPIES_FROM ? 2 : 1;
}

/** Longitud máxima de un nombre, para que quepa en la lista sin partirse. */
export const MAX_NAME_LENGTH = 16;

export function normalizeName(raw: string): string {
	return raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}
