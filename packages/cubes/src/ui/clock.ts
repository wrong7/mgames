/**
 * El reloj de la sala viene del kit (lo usa también El Espía); aquí queda lo
 * que es sólo de este juego.
 */
export { useClock, useNudge } from "@mgames/game-kit/react";

/**
 * Un toque de vibración, donde lo haya (Android sí, iPhone no). Es un extra:
 * ningún aviso del juego depende sólo de esto.
 */
export function buzz(pattern: number | number[]): void {
	try {
		navigator.vibrate?.(pattern);
	} catch {
		// Algunos navegadores lo prohíben dentro de marcos o sin gesto del usuario.
	}
}
