/**
 * Identidad de un móvil dentro de una sala.
 *
 * No hay cuentas ni sesiones: cada dispositivo se inventa un identificador la
 * primera vez y lo guarda. Sirve para que el servidor sepa qué carta mandarle a
 * quién y para que, al recargar o volver de bloquear la pantalla, el jugador
 * recupere su papel en lugar de aparecer como uno nuevo.
 */
const STORAGE_KEY = "mgames:player-id";

export function readPlayerId(): string {
	const stored = safeRead();
	if (stored) return stored;

	const created = crypto.randomUUID();
	safeWrite(created);
	return created;
}

function safeRead(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		// Modo privado, cookies bloqueadas... El jugador seguirá teniendo identidad
		// durante esta carga de la página; sólo la perderá al recargar.
		return null;
	}
}

function safeWrite(value: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, value);
	} catch {
		// Ver arriba: no poder recordarlo no debería impedir jugar.
	}
}
