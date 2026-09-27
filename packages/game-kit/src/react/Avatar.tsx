import { useEffect, useMemo, useState } from "react";
import { type AvatarLook, avatarLook, hidesHair, slimeColor } from "./avatar/look.ts";
import { type AvatarStyle, useAvatarStyle } from "./avatarStyle.ts";

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
 * La cara de un jugador: un retrato fijo de su muñeco 3D.
 *
 * El muñeco sale de la semilla, así que no hay imágenes que subir ni guardar:
 * la semilla viaja con el perfil y cada móvil hace la misma foto. Se pinta
 * como `<img>` estático, que es lo que permite poner veinticinco en un tablero
 * sin que pese.
 *
 * El 3D se carga aparte y después: mientras llega (o si el móvil no tiene
 * WebGL) se ve un boceto plano con los mismos colores, que es también lo que
 * sale del servidor.
 */
export function Avatar({ seed, size, name, className }: AvatarProps) {
	const style = useAvatarStyle();
	const look = useMemo(() => avatarLook(seed), [seed]);
	const key = `${style}:${seed}`;
	const [photo, setPhoto] = useState(() => {
		const url = loaded?.cachedPortrait(seed, style);
		return url ? { key, url } : null;
	});

	useEffect(() => {
		let cancelled = false;
		requestPortrait(seed, style).then((url) => {
			if (!cancelled && url) setPhoto({ key: `${style}:${seed}`, url });
		});
		return () => {
			cancelled = true;
		};
	}, [seed, style]);

	const src = photo?.key === key ? photo.url : style === "slime" ? slimeSketch(look) : sketch(look);
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
function requestPortrait(seed: string, style: AvatarStyle): Promise<string | null> {
	const cached = loaded?.cachedPortrait(seed, style);
	if (cached) return Promise.resolve(cached);
	loading ??= import("./avatar/portrait.ts").then((module) => {
		loaded = module;
		return module;
	});
	const job = queue.then(async () => {
		const module = await loading;
		await new Promise((resolve) => setTimeout(resolve, 0));
		return module?.portrait(seed, style) ?? null;
	});
	queue = job.catch(() => null);
	return job.catch(() => null);
}

const sketches = new Map<string, string>();

const INK = "#2a1a22";

/** Los ojos del boceto, dibujados como en la cara del muñeco. */
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
 * Boceto plano del muñeco: la cabeza, el pelo o el gorro, los hombros y los
 * ojos. Basta para reconocerlo mientras llega el 3D.
 */
function sketch(look: AvatarLook): string {
	const key = [
		look.skin,
		look.hair,
		look.hairColor,
		look.hat,
		look.hatColor,
		look.topColor,
		look.eyes,
		look.pupil.toFixed(2),
	].join();
	const cached = sketches.get(key);
	if (cached) return cached;
	const rx = 14.5;
	const ry = 14.2;
	const cy = 29;
	const top = cy - ry;
	const crown =
		look.hat && hidesHair(look.hat)
			? `<path d="M${32 - rx - 1} ${cy - 2}C${32 - rx - 1} ${top + 3} ${32 - rx / 2} ${top - 3} 32 ${top - 3}s${rx + 1} 6 ${rx + 1} ${ry - 1}z" fill="${look.hatColor}"/>`
			: look.hair === "calvo" || look.hair === "tres-pelos"
				? ""
				: `<path d="M${32 - rx + 0.5} ${cy}C${32 - rx} ${top + 4} ${32 - rx / 2} ${top} 32 ${top}s${rx - 0.5} 4 ${rx - 0.5} ${ry}c-3-6-9-8.5-${rx - 0.5}-8.5S${32 - rx + 3.5} ${cy - 6} ${32 - rx + 0.5} ${cy}z" fill="${look.hairColor}"/>`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M7 66c1-14 11-21 25-21s24 7 25 21z" fill="${look.topColor}"/><ellipse cx="32" cy="${cy}" rx="${rx}" ry="${ry}" fill="${look.skin}"/>${crown}${sketchEyes(look, cy - 0.5)}<path d="M28.5 ${cy + 7.5}q3.5 3 7 0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
	const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
	sketches.set(key, url);
	return url;
}

/** Boceto plano del slime: la gota de su color, con sus ojos y un brillo. */
function slimeSketch(look: AvatarLook): string {
	const color = slimeColor(look);
	const key = ["slime", color, look.eyes, look.pupil.toFixed(2)].join();
	const cached = sketches.get(key);
	if (cached) return cached;
	const cy = 36;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M5 66C5 42 13 19 32 19s27 23 27 47z" fill="${color}"/><ellipse cx="20" cy="30" rx="3" ry="5.5" fill="#fff" opacity="0.45" transform="rotate(28 20 30)"/>${sketchEyes(look, cy)}<path d="M28.5 ${cy + 8}q3.5 3 7 0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
	const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
	sketches.set(key, url);
	return url;
}
