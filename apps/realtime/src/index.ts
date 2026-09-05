import { isCompleteCode, normalizeCode } from "@mgames/game-kit";
import { GameRoom } from "./room.ts";

export interface Env {
	GAME_ROOM: DurableObjectNamespace;
	/** Orígenes autorizados, separados por comas. Vacío = cualquiera (desarrollo). */
	ALLOWED_ORIGINS: string;
}

/**
 * Servidor de salas.
 *
 * Todo lo que hace es enrutar: cada código de sala se traduce a su Durable
 * Object, que es quien guarda la partida y habla con los móviles. No hay estado
 * en este fichero a propósito — un Worker se ejecuta en muchos sitios a la vez y
 * cualquier cosa que guardase aquí sería distinta para cada jugador.
 */
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({ ok: true });
		}

		const match = url.pathname.match(/^\/room\/([^/]+)$/);
		if (!match) {
			return new Response("No encontrado", { status: 404 });
		}

		if (!isOriginAllowed(request, env)) {
			return new Response("Origen no autorizado", { status: 403 });
		}

		const code = normalizeCode(decodeURIComponent(match[1] as string));
		if (!isCompleteCode(code)) {
			return new Response("Código de sala inválido", { status: 400 });
		}

		// El nombre del objeto es el código de la sala: quien teclee el mismo código
		// acaba en el mismo Durable Object, esté donde esté.
		const id = env.GAME_ROOM.idFromName(code);
		return env.GAME_ROOM.get(id).fetch(request);
	},
} satisfies ExportedHandler<Env>;

/**
 * Los WebSockets no pasan por CORS, así que el navegador no impide que otra web
 * abra salas contra este servidor. La comprobación de origen es lo que lo evita.
 */
function isOriginAllowed(request: Request, env: Env): boolean {
	const allowed = env.ALLOWED_ORIGINS.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	if (allowed.length === 0) return true;

	const origin = request.headers.get("Origin");
	// Sin cabecera `Origin` no es una petición de navegador: la dejamos pasar para
	// no romper `wscat` y compañía al depurar.
	return origin === null || allowed.includes(origin);
}

export { GameRoom };
