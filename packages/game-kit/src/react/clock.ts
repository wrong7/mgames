import { useEffect, useReducer, useRef } from "react";

/**
 * El reloj de la sala en las pantallas de los juegos con tiempo.
 *
 * Los motores no tienen reloj: guardan horas (cuándo se esfuman los cubos,
 * cuándo se reparte) y sólo se ejecutan cuando les llega una jugada. Las
 * pantallas llevan la cuenta con la hora de la sala (`GameScreenProps.now`),
 * que es la misma en todos los móviles, y cuando les parece que ya toca se lo
 * dicen al motor, que lo comprueba con la hora del servidor.
 */

/** Un pelo de margen al despertar: que al repintar ya se haya pasado la hora, no casi. */
const MARGIN_MS = 5;

/**
 * La hora de la sala en este render, repintando cuando cambia lo que hay que
 * enseñar.
 *
 * `moments` son horas de la sala: cuándo aparecen los cubos, cuándo acaba una
 * cuenta atrás... Se repinta justo al llegar cada una, y no con un intervalo
 * que llegaría tarde, para que todos los móviles cambien a la vez. `every`, si
 * se da, repinta además cada tantos milisegundos, para los números de las
 * cuentas atrás.
 */
export function useClock(
	now: () => number,
	moments: readonly (number | null)[] = [],
	every: number | null = null,
): number {
	const [, repaint] = useReducer((n: number) => n + 1, 0);
	const time = now();
	// Sólo se programa la siguiente: al llegar, se repinta y este render ya ve la otra.
	const next = moments.reduce<number | null>(
		(soonest, moment) =>
			moment !== null && moment > time && (soonest === null || moment < soonest) ? moment : soonest,
		null,
	);

	useEffect(() => {
		if (next === null) return;
		const timer = setTimeout(repaint, Math.max(next - now(), 0) + MARGIN_MS);
		return () => clearTimeout(timer);
	}, [next, now]);

	useEffect(() => {
		if (every === null) return;
		const timer = setInterval(repaint, every);
		return () => clearInterval(timer);
	}, [every]);

	return time;
}

/** Cada cuánto se insiste si el servidor todavía no ve lo mismo que este móvil. */
const RETRY_MS = 700;

/**
 * Avisa al motor mientras a este móvil le parezca que toca avanzar.
 *
 * El motor no tiene reloj: sólo se ejecuta cuando le llega algo. Así que cuando
 * aquí se ve que se ha acabado el tiempo (o que ya no falta nadie), se le manda
 * un aviso. Si el reloj del servidor va unos milisegundos por detrás, el aviso
 * no hace nada y se repite un poco después; en cuanto llega el estado nuevo,
 * `due` deja de ser cierto y se para solo. Mandarlo desde todos los móviles a
 * la vez tampoco importa: el primero que llega avanza y los demás no cambian
 * nada.
 */
export function useNudge(due: boolean, nudge: () => void): void {
	const [, retry] = useReducer((n: number) => n + 1, 0);
	const last = useRef(Number.NEGATIVE_INFINITY);

	// Sin lista de dependencias a propósito: se mira después de cada render, y
	// la espera entre avisos la pone `last`, no cuántas veces se pinte.
	useEffect(() => {
		if (!due) return;
		let wait = last.current + RETRY_MS - Date.now();
		if (wait <= 0) {
			last.current = Date.now();
			nudge();
			wait = RETRY_MS;
		}
		const timer = setTimeout(retry, wait);
		return () => clearTimeout(timer);
	});
}
