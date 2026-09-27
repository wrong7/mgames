import { PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from "three";
import { loadKit } from "./kit.ts";
import { avatarLook } from "./look.ts";
import { aimKey, createRenderer, studioEnvironment, studioLights } from "./scene.ts";
import { buildSlime, SLIME_REST, type SlimePose } from "./slime.ts";

/**
 * Retratos: el slime en una imagen fija, para las fichas.
 *
 * En un tablero puede haber veinticinco caras de veinte píxeles; animarlas en
 * 3D no aporta nada y costaría un contexto WebGL cada una. Se fotografía el
 * slime una vez por semilla con un renderizador compartido fuera de pantalla
 * y se sirve como `<img>`.
 */

const SIZE = 192;

/** Un poco ladeado y mirando de reojo: de frente del todo parece una foto de carné. */
const POSE: SlimePose = { ...SLIME_REST, leanX: -0.04, leanZ: 0.03, twist: -0.15 };

const cache = new Map<string, string>();
let renderer: WebGLRenderer | null | undefined;
let scene: Scene | undefined;
const camera = new PerspectiveCamera(21, 1, 0.1, 20);

/** El retrato ya hecho, si lo hay: permite pintarlo en el primer render. */
export function cachedPortrait(seed: string): string | undefined {
	return cache.get(seed);
}

/** El retrato de una semilla como URL de datos, o `null` si no hay WebGL. */
export async function portrait(seed: string): Promise<string | null> {
	const hit = cache.get(seed);
	if (hit) return hit;
	const kit = await loadKit();

	const gl = ensureRenderer();
	if (!gl || !scene) return null;

	const slime = buildSlime(avatarLook(seed), kit, { faceSize: 256 });
	slime.pose(POSE);
	slime.root.rotation.y = 0.3;
	scene.add(slime.root);

	// Encuadre según el tamaño de la cara, con el slime casi entero. Los gorros
	// altos se cortan, como en cualquier foto de perfil.
	const { center, size } = slime.face;
	camera.position.set(center.x + 0.15, center.y + 0.2, center.z + size * 6.4);
	camera.lookAt(center.x + 0.02, center.y - size * 0.12, center.z);
	gl.render(scene, camera);
	const url = gl.domElement.toDataURL("image/png");

	slime.dispose();
	cache.set(seed, url);
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
