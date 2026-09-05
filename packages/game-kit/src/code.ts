/**
 * Códigos de partida: la cadena corta que los jugadores se dicen en voz alta para
 * que sus móviles generen exactamente el mismo tablero.
 *
 * El alfabeto excluye los caracteres que se confunden al dictar o al leer
 * (I, L, O y los dígitos 0 y 1) para que "es K7QM" no acabe en dos tableros
 * distintos.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 4;

/** Genera un código nuevo. Es el único punto del sistema con azar real. */
export function randomCode(length: number = CODE_LENGTH): string {
	const bytes = new Uint32Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (let i = 0; i < length; i++) {
		out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
	}
	return out;
}

/**
 * Normaliza lo que teclea el jugador: mayúsculas y sólo caracteres del alfabeto.
 * Los que no pertenecen se descartan en lugar de adivinar a qué se parecen: si
 * alguien teclea una "O" no sabemos si quería una Q o un 0, y elegir mal daría
 * un tablero distinto al del resto del grupo.
 */
export function normalizeCode(input: string, length: number = CODE_LENGTH): string {
	return [...input.toUpperCase()]
		.filter((c) => ALPHABET.includes(c))
		.join("")
		.slice(0, length);
}

export function isCompleteCode(code: string, length: number = CODE_LENGTH): boolean {
	return code.length === length;
}
