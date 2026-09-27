import {
	Color,
	MeshDepthMaterial,
	MeshPhysicalMaterial,
	type MeshPhysicalMaterialParameters,
	type MeshStandardMaterial,
	RGBADepthPacking,
	Vector4,
	type WebGLProgramParametersWithUniforms,
} from "three";
import type { Face } from "./face.ts";
import type { Jelly } from "./jelly.ts";
import type { BodyMeasures } from "./kit.ts";
import type { AvatarLook } from "./look.ts";

/**
 * De qué están hechos los muñecos: de terciopelo, como los muñecos flocados.
 *
 * Todo es mate y casi no refleja: ni las manchas de los focos del estudio ni el
 * entorno. Lo que tiene es el brillo del terciopelo, que no está donde da la
 * luz sino en los bordes, suave y del color de la tela aclarado. Los colores
 * que salen de la semilla (piel, pelo, ropa, gorro) se ponen aquí; los que no
 * cambian (el rojo de la seta, el oro) vienen del kit tal cual.
 */

const WHITE = new Color(1, 1, 1);

/** Cuánto se aclara el color de la tela en el brillo de los bordes. */
const SHEEN_LIGHTEN = 0.35;

/** Terciopelo de un color. */
export function velvet(
	color: Color | string,
	extra: MeshPhysicalMaterialParameters = {},
): MeshPhysicalMaterial {
	const base = new Color(color);
	return new MeshPhysicalMaterial({
		color: base,
		roughness: 0.9,
		metalness: 0,
		// Apenas refleja: lo justo para que la luz no lo deje plano.
		specularIntensity: 0.2,
		sheen: 1,
		sheenRoughness: 0.5,
		sheenColor: base.clone().lerp(WHITE, SHEEN_LIGHTEN),
		...extra,
	});
}

/**
 * El brillo de los bordes del color de cada punto, para los materiales que se
 * pintan con textura o por zonas: el color de la tela sólo se sabe ahí.
 */
const SHEEN_TINT = /* glsl */ `
#ifdef USE_SHEEN
	material.sheenColor *= mix(diffuseColor.rgb, vec3(1.0), ${SHEEN_LIGHTEN.toFixed(2)});
#endif
`;

/**
 * Los colores fijos del kit que no son terciopelo sin más. Blender sólo guarda
 * el color; el metal, el cristal o la luz de la aureola se ponen aquí, y
 * también sin espejos: el metal es satinado y los cristales apenas brillan.
 */
const FIXED: Record<string, MeshPhysicalMaterialParameters> = {
	"fijo.oro": { metalness: 0.45, roughness: 0.55, specularIntensity: 1, sheen: 0.3 },
	"fijo.metal": { metalness: 0.4, roughness: 0.55, specularIntensity: 1, sheen: 0.3 },
	"fijo.gris": { metalness: 0.3, roughness: 0.6, specularIntensity: 1, sheen: 0.3 },
	"fijo.cristal": { roughness: 0.35, specularIntensity: 0.6, sheen: 0 },
	"fijo.vidrio": {
		roughness: 0.35,
		specularIntensity: 0.6,
		sheen: 0,
		transparent: true,
		opacity: 0.25,
		depthWrite: false,
	},
};

const fixed = new Map<string, MeshPhysicalMaterial>();

/** El material de un color fijo del kit, compartido por todos los muñecos. */
export function fixedMaterial(source: MeshStandardMaterial): MeshPhysicalMaterial {
	const cached = fixed.get(source.name);
	if (cached) return cached;
	const material =
		source.name === "fijo.luz"
			? velvet(source.color, { emissive: source.color, emissiveIntensity: 1.1 })
			: velvet(source.color, FIXED[source.name]);
	material.name = source.name;
	fixed.set(source.name, material);
	return material;
}

// ---------------------------------------------------------------------------
// El cuerpo: piel y ropa en un solo material
// ---------------------------------------------------------------------------

interface BodyShape {
	/** Manga: hasta dónde del brazo (0 sin manga, 1 hasta la muñeca). */
	sleeve: number;
	/** Cuánto baja el escote por delante. */
	neckline: number;
	stripes: boolean;
	/** Abierta por delante (chaqueta, traje): asoma el acento debajo. */
	open: boolean;
	/** Bolsillo de canguro y puños: sudadera. */
	hoodie: boolean;
	/** Pernera: hasta dónde de la pierna (0 falda, 0.45 corto, 0.93 largo). */
	leg: number;
	/** Desde dónde de la pierna empieza el zapato. */
	shoe: number;
	socks: boolean;
}

function bodyShape(look: AvatarLook): BodyShape {
	const sleeves: Record<AvatarLook["top"], number> = {
		camiseta: 0.42,
		sudadera: 0.96,
		chaqueta: 0.95,
		rayas: 0.42,
		tirantes: 0,
		vestido: 0.22,
		traje: 0.95,
	};
	const dress = look.top === "vestido";
	const leg = dress || look.bottom === "falda" ? 0 : look.bottom === "corto" ? 0.44 : 0.93;
	const shoe = look.shoes === "botas" ? 0.64 : 0.9;
	return {
		sleeve: sleeves[look.top],
		neckline: look.top === "tirantes" || dress ? 0.11 : 0.06,
		stripes: look.top === "rayas",
		open: look.top === "chaqueta" || look.top === "traje",
		hoodie: look.top === "sudadera",
		leg,
		shoe,
		socks: look.shoes === "zapatillas" && leg < 0.6,
	};
}

const VERTEX_HEAD = /* glsl */ `
attribute vec2 zone;
varying vec2 vZone;
varying vec3 vRest;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uSkin;
uniform vec3 uTop;
uniform vec3 uAccent;
uniform vec3 uBottom;
uniform vec3 uShoe;
uniform vec3 uSole;
uniform vec4 uTopShape;
uniform vec4 uBottomShape;
// Cintura, escote, largo del brazo y largo de la pierna: las medidas del kit.
uniform vec4 uMeasures;
varying vec2 vZone;
varying vec3 vRest;

// Cuánto cubre algo que llega hasta distancia 0: con el borde suavizado un píxel.
float cover(float d) {
	float w = max(fwidth(d), 1e-4) * 0.8;
	return smoothstep(-w, w, d);
}

// El dobladillo: un filo más oscuro por dentro del borde de cada prenda.
float hem(float d) {
	return 1.0 - 0.22 * (1.0 - smoothstep(0.004, 0.02, d));
}
`;

const FRAGMENT_COLOR = /* glsl */ `
{
	float arm = vZone.x;
	// glTF guarda la v de las UV al revés: la pierna viene como 1 - v.
	float leg = 1.0 - vZone.y;
	float h = vRest.y;
	float side = abs(vRest.x);
	float front = vRest.z;
	float waist = uMeasures.x;
	float onArm = step(0.0, arm);
	float onLeg = step(0.0, leg);

	// Arriba: el tronco de la cintura al escote, y el brazo hasta la manga.
	float neck = uMeasures.y - uTopShape.y * exp(-pow(side / 0.11, 2.0)) * smoothstep(-0.02, 0.12, front);
	float torsoEdge = min(h - waist, neck - h);
	float sleeveEdge = (uTopShape.x - arm) * uMeasures.z;
	float top = mix(cover(torsoEdge), cover(sleeveEdge), onArm) * (1.0 - onLeg);
	float topEdge = mix(torsoEdge, sleeveEdge, onArm);
	vec3 topColor = uTop;
	if (uTopShape.z > 0.5) {
		topColor = mix(topColor, uAccent, cover(sin(h * 52.0) * 0.019));
	}
	if (uTopShape.w > 0.5) {
		// Abierta por delante en uve: asoma lo de debajo y las solapas marcan el filo.
		float halfWidth = mix(0.025, 0.1, smoothstep(waist + 0.04, uMeasures.y - 0.05, h));
		float facing = cover(front - 0.03);
		topColor = mix(topColor, uAccent, cover(halfWidth - side) * facing);
		topEdge = min(topEdge, mix(1.0, abs(halfWidth - side), facing));
	}
	if (uBottomShape.w > 0.5) {
		// Sudadera: bolsillo de canguro, cintura y puños de canalé.
		float pocketTop = waist + 0.17;
		float pocket = min(min(h - waist - 0.03, pocketTop - h), 0.16 - (h - waist) * 0.35 - side);
		pocket = min(pocket, front - 0.05);
		topColor *= 1.0 - 0.1 * cover(pocket);
		topEdge = min(topEdge, abs(pocket) + (1.0 - cover(front - 0.05)) * 0.1);
		float band = mix(h - waist - 0.045, (arm - uTopShape.x + 0.07) * -1.0, onArm);
		topColor *= 1.0 - 0.12 * (1.0 - cover(band));
	}
	topColor *= hem(topEdge);

	// Abajo: de la cintura para abajo y la pierna hasta la pernera.
	float pelvisEdge = waist - h;
	float legEdge = (uBottomShape.x - leg) * uMeasures.w;
	float bottom = mix(cover(pelvisEdge), cover(legEdge), onLeg) * (1.0 - onArm);
	vec3 bottomColor = uBottom * hem(mix(pelvisEdge + 1.0, legEdge, onLeg));

	// Calcetines blancos y zapatos, con su suela.
	float shoeEdge = (leg - uBottomShape.z) * uMeasures.w;
	float shoe = cover(shoeEdge) * onLeg;
	float sock = step(0.5, uBottomShape.y) * cover(shoeEdge + 0.05) * onLeg;
	float sole = cover(0.045 - h);
	vec3 shoeColor = mix(uShoe * hem(shoeEdge + 0.004), uSole, sole);

	vec3 color = uSkin;
	color = mix(color, bottomColor, bottom);
	color = mix(color, topColor, top);
	color = mix(color, vec3(0.95, 0.94, 0.9), sock * (1.0 - shoe));
	color = mix(color, shoeColor, shoe);
	diffuseColor.rgb = color;
}
`;

export interface BodyMaterial extends MeshPhysicalMaterial {
	setLook(look: AvatarLook): void;
}

/**
 * El material del cuerpo: la piel y la ropa pintadas por zonas. El kit trae
 * en las UV por dónde va cada punto del brazo y de la pierna, y con la altura
 * de reposo basta para decidir qué lo cubre: la manga corta, el pantalón o la
 * bota son umbrales, y el borde sale limpio a cualquier distancia.
 */
export function bodyMaterial(look: AvatarLook, measures: BodyMeasures): BodyMaterial {
	const uniforms = {
		uMeasures: {
			value: new Vector4(measures.waist, measures.neckline, measures.arm, measures.leg),
		},
		uSkin: { value: new Color() },
		uTop: { value: new Color() },
		uAccent: { value: new Color() },
		uBottom: { value: new Color() },
		uShoe: { value: new Color() },
		uSole: { value: new Color() },
		uTopShape: { value: new Vector4() },
		uBottomShape: { value: new Vector4() },
	};
	const material = velvet("#ffffff") as BodyMaterial;
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
			.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\n\tvZone = zone;\n\tvRest = position;",
			);
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
			.replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_COLOR}`)
			.replace(
				"#include <lights_physical_fragment>",
				`#include <lights_physical_fragment>\n${SHEEN_TINT}`,
			);
	};
	// Todos los cuerpos comparten programa: sólo cambian los colores.
	material.customProgramCacheKey = () => "muñeco-cuerpo";
	material.setLook = (next) => {
		const shape = bodyShape(next);
		// Con falda, la camiseta va metida: la cintura se pinta por encima del
		// remate de la falda, que así queda sobre tela de su color y no se nota.
		const skirt = next.bottom === "falda" && next.top !== "vestido";
		uniforms.uMeasures.value.x = measures.waist + (skirt ? 0.08 : 0);
		uniforms.uSkin.value.set(next.skin);
		uniforms.uTop.value.set(next.topColor);
		uniforms.uAccent.value.set(next.top === "traje" ? "#f4f1ea" : next.topAccent);
		uniforms.uBottom.value.set(next.top === "vestido" ? next.topColor : next.bottomColor);
		uniforms.uShoe.value.set(next.shoeColor);
		uniforms.uSole.value.set(next.shoes === "botas" ? "#3b2a22" : "#f4f1ea");
		uniforms.uTopShape.value.set(
			shape.sleeve,
			shape.neckline,
			shape.stripes ? 1 : 0,
			shape.open ? 1 : 0,
		);
		uniforms.uBottomShape.value.set(
			shape.leg,
			shape.socks ? 1 : 0,
			shape.shoe,
			shape.hoodie ? 1 : 0,
		);
	};
	material.setLook(look);
	return material;
}

const PUPIL_UNIFORMS = /* glsl */ `
uniform vec4 uEyeWhite[2];
uniform vec4 uPupil[2];
uniform float uLid[2];
uniform vec3 uInk;
`;

const PUPILS = /* glsl */ `
#ifdef USE_MAP
for (int i = 0; i < 2; i++) {
	vec4 pupil = uPupil[i];
	if (pupil.w < 0.5) continue;
	// Sólo dentro del blanco del ojo y por debajo del párpado, si lo hay.
	vec4 white = uEyeWhite[i];
	float edge = length((vMapUv - white.xy) / white.zw);
	float inside = 1.0 - smoothstep(1.0 - fwidth(edge) * 1.5, 1.0, edge);
	if (uLid[i] > 0.0) inside *= smoothstep(uLid[i], uLid[i] + fwidth(vMapUv.y) * 1.5, vMapUv.y);
	float d = length(vMapUv - pupil.xy) - pupil.z;
	float aa = fwidth(d);
	float disc = (1.0 - smoothstep(-aa, aa, d)) * inside;
	// Y su brillo, arriba a un lado, que es lo que le da vida.
	float g = length(vMapUv - pupil.xy - vec2(-0.32, -0.36) * pupil.z) - pupil.z * 0.3;
	float glint = (1.0 - smoothstep(-aa, aa, g)) * disc;
	diffuseColor.rgb = mix(diffuseColor.rgb, uInk, disc);
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), glint * 0.9);
}
#endif
`;

/**
 * La cabeza: el mismo terciopelo, con la cara pintada en su textura. Las
 * pupilas las pinta el sombreador encima, donde diga la cara en cada
 * fotograma.
 */
export function headMaterial(face: Face): MeshPhysicalMaterial {
	const material = velvet("#ffffff", { map: face.texture });
	material.onBeforeCompile = (shader) => paintFace(shader, face);
	material.customProgramCacheKey = () => "muñeco-cara";
	return material;
}

/** El slime: la cabeza de terciopelo, pero de gelatina, que se deforma entera. */
export function slimeMaterial(face: Face, jelly: Jelly): MeshPhysicalMaterial {
	const material = velvet("#ffffff", { map: face.texture });
	material.onBeforeCompile = (shader) => {
		paintFace(shader, face);
		jelly.patch(shader);
	};
	material.customProgramCacheKey = () => "slime-cara";
	return material;
}

/** La sombra del slime, deformada igual que él: si no, la gelatina daría la sombra de reposo. */
export function slimeShadowMaterial(jelly: Jelly): MeshDepthMaterial {
	const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
	material.onBeforeCompile = (shader) => jelly.patch(shader);
	material.customProgramCacheKey = () => "slime-sombra";
	return material;
}

function paintFace(shader: WebGLProgramParametersWithUniforms, face: Face): void {
	Object.assign(shader.uniforms, face.uniforms);
	shader.fragmentShader = shader.fragmentShader
		.replace("#include <common>", `#include <common>\n${PUPIL_UNIFORMS}`)
		.replace("#include <map_fragment>", `#include <map_fragment>\n${PUPILS}`)
		.replace(
			"#include <lights_physical_fragment>",
			`#include <lights_physical_fragment>\n${SHEEN_TINT}`,
		);
}
