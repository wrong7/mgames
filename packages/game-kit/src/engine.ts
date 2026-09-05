import type { PlayerProfile } from "./profile.ts";

/**
 * El contrato que cumple el motor de cada juego.
 *
 * Existe para que el servidor de salas no sepa a qué se está jugando: recibe
 * acciones, se las pasa al motor correspondiente y difunde el resultado. Añadir
 * un juego al servidor es registrar su motor, no tocar el servidor.
 *
 * La misma implementación corre en el navegador y en el Durable Object, así que
 * `apply` tiene que ser pura: mismas entradas, mismo resultado, sin leer el
 * reloj ni el azar por su cuenta.
 */
export interface GameEngine<State, Action, View = State> {
	/** Estado de una sala recién creada. */
	create(ctx: EngineContext): State;

	/**
	 * Aplica una acción.
	 *
	 * Devuelve **el mismo objeto** cuando la acción no procede (fuera de turno,
	 * carta ya destapada, jugador desconocido). El servidor usa esa identidad para
	 * saber que no hay nada que difundir. Lanzar sería peor: los mensajes llegan
	 * por red y de varios móviles a la vez, así que las jugadas imposibles son
	 * parte del funcionamiento normal, no un fallo.
	 */
	apply(state: State, action: Action, ctx: ActorContext): State;

	/**
	 * Valida una acción recibida por la red.
	 *
	 * Todo lo que llega de fuera pasa por aquí antes de tocar el estado; devolver
	 * `null` descarta el mensaje.
	 */
	parseAction(value: unknown): Action | null;

	/**
	 * Qué parte del estado puede ver este jugador.
	 *
	 * Sólo hace falta en los juegos donde el estado guarda algo que no todos
	 * pueden saber: quién es el espía, qué carta le ha tocado a cada uno. El
	 * servidor manda a cada móvil su propia vista, así que el secreto nunca sale
	 * del servidor — mirar las herramientas de desarrollo no destripa la partida.
	 *
	 * Omitirlo significa que el estado entero es público, y entonces el cliente
	 * puede además aplicar las jugadas sin esperar al servidor. En Código Secreto
	 * no hay nada que esconder: quien abre la pantalla del jefe ya ha decidido
	 * mirar.
	 */
	project?(state: State, actorId: string): View;
}

export interface EngineContext {
	/** Semilla para todo lo aleatorio de la partida. La pone el servidor. */
	seed: string;
	/** Epoch en milisegundos. Se pasa en vez de leerlo para que `apply` sea pura. */
	now: number;
}

export interface ActorContext extends EngineContext {
	/** Quién hace la jugada: el identificador del móvil que la envió. */
	actorId: string;
	/**
	 * El perfil de quien la hace. Va con cada acción para que un motor que
	 * necesite el nombre o la cara —para una ficha, una lista de jugadores— no
	 * tenga que pedirlos con una acción aparte ni guardarlos por su cuenta.
	 */
	actor: PlayerProfile;
}
