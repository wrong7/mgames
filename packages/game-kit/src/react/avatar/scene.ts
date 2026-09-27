import {
	BackSide,
	BufferAttribute,
	CanvasTexture,
	Color,
	DirectionalLight,
	DoubleSide,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	NeutralToneMapping,
	PCFShadowMap,
	PlaneGeometry,
	PMREMGenerator,
	Scene,
	SphereGeometry,
	SRGBColorSpace,
	type Texture,
	Vector3,
	WebGLRenderer,
	type WebGLRendererParameters,
} from "three";

/**
 * Lo que comparten el escenario y los retratos: el renderizador, la luz y el
 * entorno que se refleja en las cosas.
 *
 * Es un estudio de fotos de juguetes: una luz principal cálida desde delante
 * que proyecta sombras suaves, un contraluz azulado que recorta la silueta
 * contra el fondo morado y un relleno rosa por el otro lado. Los retratos usan
 * lo mismo para que la cara pequeña de una ficha sea la del escenario.
 */

/** De dónde viene la luz principal, respecto a lo que ilumina. */
const KEY_DIRECTION = new Vector3(3, 6, 5).normalize();

export interface Studio {
	/** La luz principal: la única que da sombra, y hay que apuntarla. */
	key: DirectionalLight;
}

export function studioLights(scene: Scene): Studio {
	const sky = new HemisphereLight("#f1edff", "#6a58b8", 1.1);
	const key = new DirectionalLight("#fff1e2", 2.5);
	key.castShadow = true;
	key.shadow.mapSize.set(1024, 1024);
	// Sombra blanda: el radio difumina el borde, y los dos sesgos evitan el
	// moteado que dejan las esferas al hacerse sombra a sí mismas.
	key.shadow.radius = 5;
	key.shadow.bias = -0.0004;
	key.shadow.normalBias = 0.03;
	const rim = new DirectionalLight("#8fd8ff", 2.4);
	rim.position.set(-4, 4, -5);
	const fill = new DirectionalLight("#ffb3e6", 0.6);
	fill.position.set(-5, 1.5, 3);
	scene.add(sky, key, key.target, rim, fill);
	aimKey({ key }, new Vector3(0, 1, 0), 2);
	return { key };
}

/** Apunta la luz principal a un grupo: su sombra tiene que abarcarlos a todos. */
export function aimKey({ key }: Studio, center: Vector3, radius: number): void {
	key.target.position.copy(center);
	key.position.copy(center).addScaledVector(KEY_DIRECTION, 14);
	const camera = key.shadow.camera;
	camera.left = -radius;
	camera.right = radius;
	camera.top = radius;
	camera.bottom = -radius;
	camera.near = 4;
	camera.far = 26;
	camera.updateProjectionMatrix();
}

/**
 * Un renderizador con fondo transparente y sombras, o `null` si el móvil no
 * tiene WebGL (o lo tiene desactivado): quien llama se queda con su versión en
 * plano.
 */
export function createRenderer(parameters: WebGLRendererParameters): WebGLRenderer | null {
	try {
		const renderer = new WebGLRenderer({ alpha: true, antialias: true, ...parameters });
		renderer.setClearColor(0x000000, 0);
		renderer.outputColorSpace = SRGBColorSpace;
		// El mapeo neutro respeta los colores vivos de los slimes; el ACES los apaga.
		renderer.toneMapping = NeutralToneMapping;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = PCFShadowMap;
		return renderer;
	} catch {
		return null;
	}
}

const environments = new WeakMap<WebGLRenderer, Texture>();

/**
 * La luz que llega de todas partes: una cúpula morada como el fondo y tres
 * focos de estudio. Los slimes son de terciopelo y casi no la reflejan; lo
 * que les da es la luz de ambiente del color del estudio y el brillo de los
 * bordes.
 *
 * Se hace una vez por renderizador (tarda unos milisegundos) y se guarda.
 */
export function studioEnvironment(renderer: WebGLRenderer): Texture {
	const cached = environments.get(renderer);
	if (cached) return cached;

	const room = new Scene();
	const dome = new SphereGeometry(20, 32, 16);
	const colors = new Float32Array(dome.getAttribute("position").count * 3);
	const zenith = new Color("#c2b8ff");
	const horizon = new Color("#6352c4");
	const floor = new Color("#2c2160");
	const position = dome.getAttribute("position");
	for (let i = 0; i < position.count; i++) {
		const h = position.getY(i) / 20;
		const color =
			h > 0 ? horizon.clone().lerp(zenith, h) : horizon.clone().lerp(floor, Math.min(1, -h * 2));
		colors.set([color.r, color.g, color.b], i * 3);
	}
	dome.setAttribute("color", new BufferAttribute(colors, 3));
	room.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

	const softbox = (
		color: string,
		power: number,
		at: readonly [number, number, number],
		size: readonly [number, number],
	) => {
		const panel = new Mesh(
			new PlaneGeometry(size[0], size[1]),
			new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power), side: DoubleSide }),
		);
		panel.position.set(...at);
		panel.lookAt(0, 1, 0);
		room.add(panel);
	};
	softbox("#fff1e2", 7, [7, 9, 10], [7, 5]);
	softbox("#8fd8ff", 5, [-8, 6, -9], [5, 7]);
	softbox("#ff9ad8", 1.6, [-10, 2, 5], [5, 5]);

	const pmrem = new PMREMGenerator(renderer);
	const texture = pmrem.fromScene(room, 0.035).texture;
	pmrem.dispose();
	room.traverse((object) => {
		if (object instanceof Mesh) {
			object.geometry.dispose();
			object.material.dispose();
		}
	});
	environments.set(renderer, texture);
	return texture;
}

/** Un degradado radial en una textura pequeña: brillos, sombras de contacto. */
export function radialTexture(inner: string, outer: string, size = 128): CanvasTexture {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d");
	if (context) {
		const gradient = context.createRadialGradient(
			size / 2,
			size / 2,
			0,
			size / 2,
			size / 2,
			size / 2,
		);
		gradient.addColorStop(0, inner);
		gradient.addColorStop(1, outer);
		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);
	}
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return texture;
}
