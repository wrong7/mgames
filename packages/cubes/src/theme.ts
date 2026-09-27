/**
 * Paleta de Visto y no visto: bloques de juguete sobre un tapete verde.
 *
 * Lejos del gris de Código Secreto y del azul de despacho de El Espía: es un
 * juego de reflejos y tiene que parecer un juguete. El tapete es oscuro para
 * que los cubos, de colores de caramelo, salten a la vista en el segundo que
 * duran.
 */
export const COLORS = {
	/** El tapete: el fondo de todo. */
	felt: "#12806f",
	/** El tapete en sombra, para tarjetas y botones sobre él. */
	feltDark: "#0b5e52",
	/** Luz sobre el tapete, detrás del tablero. */
	feltLight: "#1fa18c",
	/** El tablero, de madera clara. */
	board: "#fbf0d9",
	/** Las casillas alternas del tablero. */
	boardTile: "#f3e2bf",
	/** Los cantos del tablero: izquierdo, a la luz, y derecho, en sombra. */
	boardLeft: "#e0bf86",
	boardRight: "#c49a5c",
	/** Texto claro sobre el tapete. */
	chalk: "#fff8ea",
	/** Texto oscuro sobre madera y papel. */
	ink: "#1d2a28",
	/** Acierto. */
	right: "#7ee08a",
	/** Fallo. */
	wrong: "#ff8d7a",
	/** El primero en acertar, y los botones importantes. */
	gold: "#ffc93d",
} as const;

/**
 * Los colores de los cubos: uno por ronda, en este orden. Ninguno se parece al
 * tapete ni a la madera, que es lo único que tienen que cumplir.
 */
export const CUBE_COLORS = [
	"#ff5d5d",
	"#4d8dff",
	"#ffc53d",
	"#a65cff",
	"#ff8a3d",
	"#ff5fa8",
] as const;

/** El color de los cubos de la ronda `number`. */
export function cubeColor(number: number): string {
	return CUBE_COLORS[(Math.max(number, 1) - 1) % CUBE_COLORS.length] as string;
}
