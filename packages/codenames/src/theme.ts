/**
 * Paleta de Código Secreto, tomada del juego de mesa.
 *
 * Vive en constantes en vez de en clases de Tailwind porque los mismos colores
 * se usan en sitios que no son CSS: el `<meta name="theme-color">` de la barra
 * del móvil y la tarjeta del catálogo.
 */
export const COLORS = {
	azul: "#439fe8",
	rojo: "#db4e47",
	neutral: "#eee6c1",
	asesino: "#303c3c",
	/** Fondo de la pantalla del jefe de espías. */
	masterBg: "#9da2a8",
	/** Cartulina sobre la que se apoya la clave. */
	masterCard: "#8f8785",
	/** Fondo de la pantalla de los agentes. */
	teamBg: "#f9e2c3",
} as const;
