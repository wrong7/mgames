import { useEffect, useMemo, useState } from "react";
import { type AvatarLook, avatarLook } from "./avatar/look.ts";

export interface AvatarProps {
	/** Semilla del avatar: `profile.avatar`. La misma semilla, la misma cara. */
	seed: string;
	/** Lado en píxeles. */
	size: number;
	/** Nombre para lectores de pantalla. */
	name?: string;
	className?: string;
}

/**
 * La cara de un jugador: un retrato fijo de su slime 3D.
 *
 * El slime sale de la semilla, así que no hay imágenes que subir ni guardar:
 * la semilla viaja con el perfil y cada móvil hace la misma foto. Se pinta
 * como `<img>` estático, que es lo que permite poner veinticinco en un tablero
 * sin que pese.
 *
 * El 3D se carga aparte y después: mientras llega (o si el móvil no tiene
 * WebGL) se ve un boceto plano con los mismos colores, que es también lo que
 * sale del servidor.
 */
export function Avatar({ seed, size, name, className }: AvatarProps) {
	const look = useMemo(() => avatarLook(seed), [seed]);
	const [photo, setPhoto] = useState(() => {
		const url = loaded?.cachedPortrait(seed);
		return url ? { seed, url } : null;
	});

	useEffect(() => {
		let cancelled = false;
		requestPortrait(seed).then((url) => {
			if (!cancelled && url) setPhoto({ seed, url });
		});
		return () => {
			cancelled = true;
		};
	}, [seed]);

	const src = photo?.seed === seed ? photo.url : sketch(look);
	return (
		<img
			src={src}
			width={size}
			height={size}
			alt={name ?? ""}
			title={name}
			className={className}
			draggable={false}
			style={{ borderRadius: "50%", backgroundColor: look.backdrop }}
		/>
	);
}

type PortraitModule = typeof import("./avatar/portrait.ts");

let loading: Promise<PortraitModule> | undefined;
/** El módulo ya cargado: con él, un retrato hecho se pinta sin esperar a un efecto. */
let loaded: PortraitModule | undefined;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Pide un retrato. Se hacen de uno en uno y cediendo el hilo entre medias: la
 * primera vez que se abre un tablero llegan diez de golpe, y hacerlos seguidos
 * se notaría en la mano.
 */
function requestPortrait(seed: string): Promise<string | null> {
	const cached = loaded?.cachedPortrait(seed);
	if (cached) return Promise.resolve(cached);
	loading ??= import("./avatar/portrait.ts").then((module) => {
		loaded = module;
		return module;
	});
	const job = queue.then(async () => {
		const module = await loading;
		await new Promise((resolve) => setTimeout(resolve, 0));
		return module?.portrait(seed) ?? null;
	});
	queue = job.catch(() => null);
	return job.catch(() => null);
}

const sketches = new Map<string, string>();

const INK = "#2a1a22";

/** Los ojos del boceto, dibujados como en la cara del slime. */
function sketchEyes(look: AvatarLook, cy: number): string {
	if (look.eyes === "felices") {
		return [27, 37]
			.map(
				(x) =>
					`<path d="M${x - 2.4} ${cy + 0.6}q2.4-3.4 4.8 0" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
			)
			.join("");
	}
	if (look.eyes === "puntos") {
		return `<circle cx="27" cy="${cy}" r="1.7" fill="${INK}"/><circle cx="37" cy="${cy}" r="1.7" fill="${INK}"/>`;
	}
	// Con blanco y pupila; la de los saltones, grande y caída, como si colgara.
	const big = look.eyes === "saltones";
	const r = big ? 4.6 : 3.4;
	const pupil = big ? r * look.pupil : r * 0.6;
	const drop = big ? r - pupil - 0.4 : 0.3;
	return [27, 37]
		.map(
			(x) =>
				`<ellipse cx="${x}" cy="${cy}" rx="${r}" ry="${r * 1.1}" fill="#fbfaf6" stroke="${INK}" stroke-width="0.6"/><circle cx="${x}" cy="${cy + drop}" r="${pupil}" fill="${INK}"/>`,
		)
		.join("");
}

/**
 * Boceto plano del slime: la gota de su color, con sus ojos y un brillo.
 * Basta para reconocerlo mientras llega el 3D.
 */
function sketch(look: AvatarLook): string {
	const key = [look.skin, look.eyes, look.pupil.toFixed(2)].join();
	const cached = sketches.get(key);
	if (cached) return cached;
	const cy = 36;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M5 66C5 42 13 19 32 19s27 23 27 47z" fill="${look.skin}"/><ellipse cx="20" cy="30" rx="3" ry="5.5" fill="#fff" opacity="0.45" transform="rotate(28 20 30)"/>${sketchEyes(look, cy)}<path d="M28.5 ${cy + 8}q3.5 3 7 0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
	const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
	sketches.set(key, url);
	return url;
}
