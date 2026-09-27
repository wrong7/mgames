import type { ReactNode } from "react";
import { BOARD_SIZE, CELL_COUNT } from "../engine/index.ts";
import { COLORS } from "../theme.ts";

/** Una casilla del tablero, de lado a lado, en unidades del dibujo. */
const TILE_W = 100;
/** Y de arriba a abajo: la perspectiva isométrica de siempre, dos de ancho por uno de alto. */
const TILE_H = 50;
/** Lo que se levanta en pantalla un cubo de lado uno con esa perspectiva. */
const RISE = 61.2;
/**
 * El lado del cubo respecto a la casilla. Entre dos vecinos queda sólo una
 * rendija: se distinguen uno a uno, pero pegados se leen como un bloque y
 * cuesta más contarlos.
 */
const CUBE = 0.86;
/** El grosor del tablero. */
const SLAB = 16;

/** Lo que se tarda en poner cada cubo del recuento: el número de arriba va a la par. */
export const RECOUNT_STEP_MS = 140;

/** Lo que dura la nube de un cubo que se esfuma. */
export const PUFF_MS = 450;

export interface IsoBoardProps {
	/** Casillas con cubo (fila * 5 + columna). */
	cubes: readonly number[];
	/** Color de los cubos. */
	color: string;
	/**
	 * Cómo llegan: `de-golpe`, todos a la vez y en un momento, que es como caen
	 * en la ronda (se ven poco más de un segundo y una caída larga se comería la
	 * mitad); `caer`, con su rebote, donde sólo están de adorno; o `recuento`,
	 * uno a uno y numerados, que es como se enseña el resultado para que se vea
	 * que la cuenta es buena.
	 */
	entrance?: "de-golpe" | "caer" | "recuento";
	/** Casillas de las que acaba de esfumarse un cubo: ahí se pinta la nube. */
	puffs?: readonly number[];
	/** Lo que va encima del tablero, centrado: la cuenta de preparados. */
	children?: ReactNode;
	className?: string;
}

/**
 * El tablero de 5x5 en perspectiva isométrica, con sus cubos.
 *
 * Es SVG y no 3D: son como mucho veinticinco cubos, se pintan de atrás hacia
 * delante y cada uno son tres caras planas. Así se ve nítido en cualquier
 * pantalla y no hay nada que cargar antes de la primera ronda.
 */
export function IsoBoard({
	cubes,
	color,
	entrance = "caer",
	puffs = [],
	children,
	className = "",
}: IsoBoardProps) {
	const ordered = inPaintOrder(cubes);
	const tones = cubeTones(color);
	const quick = entrance === "de-golpe";
	// De uno en uno en el recuento; los demás, casi a la vez: se ven juntos, pero no como un bloque.
	const step =
		entrance === "recuento"
			? RECOUNT_STEP_MS
			: Math.min(quick ? 4 : 22, (quick ? 40 : 140) / Math.max(ordered.length, 1));
	const delayOf = (order: number) => order * step;

	return (
		<div className={`relative ${className}`}>
			<svg
				viewBox={`${-BOARD_HALF_W - 14} ${-68} ${BOARD_HALF_W * 2 + 28} ${BOARD_H + SLAB + 90}`}
				className="absolute inset-0 h-full w-full overflow-visible"
				role="img"
				aria-label={cubes.length > 0 ? `Tablero con ${cubes.length} cubos` : "Tablero vacío"}
			>
				<Board />
				{ordered.map((cell, order) => (
					<CubeShadow key={`sombra-${cell}`} cell={cell} delay={delayOf(order)} quick={quick} />
				))}
				{ordered.map((cell, order) => (
					<Cube
						key={cell}
						cell={cell}
						tones={tones}
						delay={delayOf(order)}
						quick={quick}
						label={entrance === "recuento" ? order + 1 : null}
					/>
				))}
				{inPaintOrder(puffs).map((cell) => (
					<Puff key={`nube-${cell}`} cell={cell} tones={tones} />
				))}
			</svg>
			{children && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					{children}
				</div>
			)}
		</div>
	);
}

const BOARD_HALF_W = (BOARD_SIZE * TILE_W) / 2;
const BOARD_H = BOARD_SIZE * TILE_H;

/** El centro de una casilla, sobre la superficie del tablero. */
function centerOf(cell: number): { x: number; y: number } {
	const row = Math.floor(cell / BOARD_SIZE);
	const col = cell % BOARD_SIZE;
	return { x: ((col - row) * TILE_W) / 2, y: ((col + row + 1) * TILE_H) / 2 };
}

/**
 * De atrás hacia delante y, a la misma distancia, de izquierda a derecha: el
 * orden en que hay que pintarlos para que el de delante tape al de detrás, y
 * también el orden en que se leen en la pantalla, que es el del recuento.
 */
function inPaintOrder(cells: readonly number[]): number[] {
	const depth = (cell: number) => Math.floor(cell / BOARD_SIZE) + (cell % BOARD_SIZE);
	const across = (cell: number) => (cell % BOARD_SIZE) - Math.floor(cell / BOARD_SIZE);
	return [...cells].sort((a, b) => depth(a) - depth(b) || across(a) - across(b));
}

/** Un rombo de medio ancho `w` y medio alto `h` centrado en (x, y). */
function diamond(x: number, y: number, w: number, h: number): string {
	return `M${x} ${y - h}L${x + w} ${y}L${x} ${y + h}L${x - w} ${y}Z`;
}

function Board() {
	const top = diamond(0, BOARD_H / 2, BOARD_HALF_W, BOARD_H / 2);
	const left = `M${-BOARD_HALF_W} ${BOARD_H / 2}L0 ${BOARD_H}L0 ${BOARD_H + SLAB}L${-BOARD_HALF_W} ${BOARD_H / 2 + SLAB}Z`;
	const right = `M0 ${BOARD_H}L${BOARD_HALF_W} ${BOARD_H / 2}L${BOARD_HALF_W} ${BOARD_H / 2 + SLAB}L0 ${BOARD_H + SLAB}Z`;
	return (
		<g>
			{/* La sombra del tablero sobre el tapete. */}
			<path
				d={diamond(10, BOARD_H / 2 + SLAB + 10, BOARD_HALF_W + 6, BOARD_H / 2 + 4)}
				fill="#000"
				opacity={0.22}
			/>
			<path d={left} fill={COLORS.boardLeft} />
			<path d={right} fill={COLORS.boardRight} />
			<path d={top} fill={COLORS.board} />
			{Array.from({ length: CELL_COUNT }, (_, cell) => {
				const { x, y } = centerOf(cell);
				const row = Math.floor(cell / BOARD_SIZE);
				const col = cell % BOARD_SIZE;
				return (
					<path
						// biome-ignore lint/suspicious/noArrayIndexKey: las casillas son fijas.
						key={cell}
						d={diamond(x, y, (TILE_W / 2) * 0.9, (TILE_H / 2) * 0.9)}
						fill={(row + col) % 2 === 0 ? COLORS.boardTile : COLORS.board}
						stroke={COLORS.boardLeft}
						strokeWidth={1}
						strokeOpacity={0.5}
					/>
				);
			})}
		</g>
	);
}

interface Tones {
	top: string;
	left: string;
	right: string;
	edge: string;
	/** La nube que dejan al esfumarse: su color, muy claro. */
	puff: string;
}

/** Las tres caras del cubo: la de arriba a la luz, la izquierda en su color, la derecha en sombra. */
function cubeTones(color: string): Tones {
	return {
		top: mix(color, "#ffffff", 0.28),
		left: color,
		right: mix(color, "#000000", 0.22),
		edge: mix(color, "#000000", 0.45),
		puff: mix(color, "#ffffff", 0.6),
	};
}

function Cube({
	cell,
	tones,
	delay,
	quick,
	label,
}: {
	cell: number;
	tones: Tones;
	delay: number;
	quick: boolean;
	label: number | null;
}) {
	const { x, y } = centerOf(cell);
	const w = (TILE_W / 2) * CUBE;
	const h = (TILE_H / 2) * CUBE;
	const lift = RISE * CUBE;
	const top = diamond(x, y - lift, w, h);
	const left = `M${x - w} ${y - lift}L${x} ${y + h - lift}L${x} ${y + h}L${x - w} ${y}Z`;
	const right = `M${x} ${y + h - lift}L${x + w} ${y - lift}L${x + w} ${y}L${x} ${y + h}Z`;
	return (
		<g className={quick ? "vynv-cube-quick" : "vynv-cube"} style={{ animationDelay: `${delay}ms` }}>
			<g stroke={tones.edge} strokeWidth={1.6} strokeLinejoin="round">
				<path d={left} fill={tones.left} />
				<path d={right} fill={tones.right} />
				<path d={top} fill={tones.top} />
			</g>
			{/* Un brillo en el canto de delante: es lo que hace que parezca de plástico y no de cartón. */}
			<path
				d={`M${x - w + 6} ${y - lift + 3}L${x} ${y + h - lift - 0.5}L${x + w - 6} ${y - lift + 3}`}
				fill="none"
				stroke="#fff"
				strokeOpacity={0.45}
				strokeWidth={2}
				strokeLinecap="round"
			/>
			{label !== null && (
				<text
					x={x}
					y={y - lift}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={24}
					fontWeight={900}
					fill="#fff"
					stroke={COLORS.ink}
					strokeWidth={5}
					paintOrder="stroke"
					strokeLinejoin="round"
				>
					{label}
				</text>
			)}
		</g>
	);
}

/** La sombra en el suelo, hacia abajo a la derecha: la luz viene de arriba a la izquierda. */
function CubeShadow({ cell, delay, quick }: { cell: number; delay: number; quick: boolean }) {
	const { x, y } = centerOf(cell);
	return (
		<path
			className={quick ? "vynv-shadow-quick" : "vynv-shadow"}
			style={{ animationDelay: `${delay}ms` }}
			d={diamond(x + 7, y + 3, (TILE_W / 2) * CUBE + 3, (TILE_H / 2) * CUBE + 2)}
			fill="#3b2a12"
			opacity={0.2}
		/>
	);
}

/** "¡Chas!": una nube de humo donde había un cubo, como en los trucos de magia. */
function Puff({ cell, tones }: { cell: number; tones: Tones }) {
	const { x, y } = centerOf(cell);
	const cy = y - (RISE * CUBE) / 2;
	return (
		<g>
			{PUFF_BLOBS.map(([dx, dy, r, delay]) => (
				<circle
					key={`${dx}:${dy}`}
					className="vynv-puff"
					cx={x + dx}
					cy={cy + dy}
					r={r}
					fill={tones.puff}
					// Con contorno, como las nubes de los dibujos: sin él, la de un cubo amarillo no se ve sobre la madera.
					stroke={tones.edge}
					strokeOpacity={0.35}
					strokeWidth={2}
					style={{ animationDelay: `${delay}ms` }}
				/>
			))}
		</g>
	);
}

/** Las bolas de la nube: desplazamiento, radio y retraso. */
const PUFF_BLOBS: readonly (readonly [number, number, number, number])[] = [
	[0, 0, 26, 0],
	[-20, 8, 16, 30],
	[20, 6, 17, 50],
	[-8, -18, 14, 70],
	[14, -14, 12, 90],
];

/** Mezcla dos colores `#rrggbb`: `amount` 0 es el primero y 1 el segundo. */
function mix(from: string, to: string, amount: number): string {
	const a = parseHex(from);
	const b = parseHex(to);
	const channel = (i: number) =>
		Math.round((a[i] as number) + ((b[i] as number) - (a[i] as number)) * amount)
			.toString(16)
			.padStart(2, "0");
	return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(hex: string): number[] {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
