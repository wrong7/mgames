/**
 * Quién es el que juega, en todos los juegos a la vez.
 *
 * No hay cuentas: el perfil se rellena una vez, se guarda en el móvil y desde
 * ahí viaja a cada sala. Es lo que hace que entrar en un juego sea teclear el
 * código y nada más, como en los de sobremesa de consola donde cada uno pone
 * su nombre en el móvil al empezar la noche y no vuelve a tocarlo.
 */
export interface PlayerProfile {
	/** Identificador del dispositivo. Estable entre partidas y recargas. */
	id: string;
	name: string;
	/**
	 * Semilla del avatar. Es independiente del nombre para que dos "Ana" en la
	 * misma mesa tengan caras distintas, y para poder cambiar de cara sin
	 * cambiar de nombre.
	 */
	avatar: string;
}

/** Longitud máxima de un nombre, para que quepa en una ficha sin partirse. */
export const MAX_NAME_LENGTH = 16;

export function normalizeName(raw: string): string {
	return raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

/** Comprueba que lo que llega por la red tiene la forma de un perfil. */
export function parseProfile(value: unknown): PlayerProfile | null {
	if (typeof value !== "object" || value === null) return null;
	const { id, name, avatar } = value as Record<string, unknown>;
	if (typeof id !== "string" || !id || typeof avatar !== "string" || !avatar) return null;
	const cleanName = typeof name === "string" ? normalizeName(name) : "";
	if (!cleanName) return null;
	return { id, name: cleanName, avatar };
}
