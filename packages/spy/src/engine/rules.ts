/**
 * Los números del juego.
 *
 * El máximo de 8 no es arbitrario: cada localización tiene siete papeles, y con
 * ocho jugadores hay como mucho seis agentes, así que nunca hay que repetir un
 * papel dentro de la misma ronda.
 */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/**
 * La cuenta atrás entre que el último dice "listo" y el reparto: lo justo para
 * que todos miren su móvil a la vez, y para echarse atrás si hacía falta.
 */
export const DEAL_COUNTDOWN_MS = 3000;

/** A partir de esta mesa, un solo espía se queda corto y la ronda se hace larga. */
const TWO_SPIES_FROM = 7;

export function spyCountFor(playerCount: number): number {
	return playerCount >= TWO_SPIES_FROM ? 2 : 1;
}
