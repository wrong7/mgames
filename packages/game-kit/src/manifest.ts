/**
 * Contrato entre un juego y la app que lo aloja.
 *
 * Cada paquete de `packages/*` exporta un `GameManifest`. La app sólo conoce
 * este objeto: con él pinta la portada, la ficha y las rutas, sin saber nada de
 * cómo funciona el juego por dentro. Añadir un juego nuevo al catálogo es
 * escribir su manifest y registrarlo.
 */
export interface GameManifest {
	/** Identificador estable y segmento de URL: `/codigo-secreto`. */
	slug: string;
	/** Nombre que se muestra al jugador. */
	name: string;
	/** Una frase: de qué va el juego. */
	tagline: string;
	/** Párrafo corto para la ficha del juego. */
	description: string;
	players: { min: number; max?: number };
	/** Duración aproximada de una partida, en minutos. */
	minutes: { min: number; max: number };
	/**
	 * Colores de la tarjeta en el catálogo. Cada juego tiene su propia estética,
	 * así que la app no impone paleta: sólo la aplica donde el juego se anuncia.
	 */
	theme: {
		/** Fondo de la tarjeta. */
		background: string;
		/** Texto sobre ese fondo. */
		foreground: string;
		/** Color de realce (bordes, detalles). */
		accent: string;
	};
	/** Los juegos aún no jugables salen en el catálogo pero no se pueden abrir. */
	status: "ready" | "soon";
}
