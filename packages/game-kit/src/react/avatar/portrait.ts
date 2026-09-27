import { PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import type { AvatarStyle } from "../avatarStyle.ts";
import { loadKit } from "./kit.ts";
import { avatarLook } from "./look.ts";
import { buildAvatar, type DollPose } from "./model.ts";
import { aimKey, createRenderer, studioEnvironment, studioLights } from "./scene.ts";
import { buildSlime, SLIME_REST, SlimeDoll, type SlimePose } from "./slime.ts";

/**
 * Retratos: la cara del muñeco en una imagen fija, para las fichas.
 *
 * En un tablero puede haber veinticinco caras de veinte píxeles; animarlas en
 * 3D no aporta nada y costaría un contexto WebGL cada una. Se fotografía el
 * muñeco una vez por semilla con un renderizador compartido fuera de pantalla
 * y se sirve como `<img>`.
 */

const SIZE = 192;

/** Tres cuartos y la cabeza un poco ladeada: de frente del todo parece una foto de carné. */
const POSE: DollPose = {
	spineX: 0,
	spineZ: 0,
	shrug: 0,
	breath: 0,
	headX: 0.05,
	headY: -0.12,
	headZ: 0.06,
	jelly: 0,
	armL: { x: 0, z: 0.4, elbow: 0.25, twist: 0 },
	armR: { x: 0, z: -0.4, elbow: 0.25, twist: 0 },
	muscle: 0,
	legL: { x: 0, knee: 0 },
	legR: { x: 0, knee: 0 },
};

/** El slime, un poco ladeado y mirando de reojo. */
const SLIME_POSE: SlimePose = { ...SLIME_REST, leanX: -0.04, leanZ: 0.03, twist: -0.15 };

const cache = new Map<string, string>();
let renderer: WebGLRenderer | null | undefined;
let scene: Scene | undefined;
const camera = new PerspectiveCamera(21, 1, 0.1, 20);

/** El retrato ya hecho, si lo hay: permite pintarlo en el primer render. */
export function cachedPortrait(seed: string, style: AvatarStyle = "muñeco"): string | undefined {
	return cache.get(`${style}:${seed}`);
}

/** El retrato de una semilla como URL de datos, o `null` si no hay WebGL. */
export async function portrait(
	seed: string,
	style: AvatarStyle = "muñeco",
): Promise<string | null> {
	const key = `${style}:${seed}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const kit = await loadKit();

	const gl = ensureRenderer();
	if (!gl || !scene) return null;

	const look = avatarLook(seed);
	const doll =
		style === "slime"
			? buildSlime(look, kit, { faceSize: 256 })
			: buildAvatar(look, kit, { faceSize: 256 });
	if (doll instanceof SlimeDoll) doll.pose(SLIME_POSE);
	else doll.pose(POSE);
	doll.root.rotation.y = 0.3;
	scene.add(doll.root);

	// Encuadre según el tamaño de la cara: una patata y una pastilla ocupan lo
	// mismo en la ficha. Los gorros altos se cortan, como en cualquier foto de
	// perfil. El muñeco sale de pecho para arriba; el slime, casi entero.
	const framing =
		doll instanceof SlimeDoll
			? { distance: 6.4, lift: 0.2, aim: 0.12 }
			: { distance: 7.4, lift: 0.22, aim: 0.15 };
	const { center, size } = doll.face;
	camera.position.set(center.x + 0.15, center.y + framing.lift, center.z + size * framing.distance);
	camera.lookAt(center.x + 0.02, center.y - size * framing.aim, center.z);
	gl.render(scene, camera);
	const url = gl.domElement.toDataURL("image/png");

	doll.dispose();
	cache.set(key, url);
	return url;
}

function ensureRenderer(): WebGLRenderer | null {
	if (renderer !== undefined) return renderer;
	const canvas = document.createElement("canvas");
	renderer = createRenderer({ canvas, preserveDrawingBuffer: true });
	if (!renderer) return null;
	renderer.setPixelRatio(1);
	renderer.setSize(SIZE, SIZE, false);
	scene = new Scene();
	const studio = studioLights(scene);
	aimKey(studio, new Vector3(0, 1.4, 0), 1.2);
	scene.environment = studioEnvironment(renderer);
	scene.environmentIntensity = 1;
	// Si el sistema le quita el contexto (pasa en móvil con la app en segundo
	// plano), se hará otro la próxima vez; los retratos ya hechos siguen valiendo.
	canvas.addEventListener("webglcontextlost", () => {
		renderer?.dispose();
		renderer = undefined;
	});
	return renderer;
}
