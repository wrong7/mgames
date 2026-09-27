import {
	Color,
	MeshDepthMaterial,
	MeshPhysicalMaterial,
	type MeshPhysicalMaterialParameters,
	type MeshStandardMaterial,
	RGBADepthPacking,
	type WebGLProgramParametersWithUniforms,
} from "three";
import type { Face } from "./face.ts";
import type { Jelly } from "./jelly.ts";

/**
 * De qué están hechos los slimes y lo que llevan: de terciopelo, como los
 * muñecos flocados.
 *
 * Todo es mate y casi no refleja: ni las manchas de los focos del estudio ni el
 * entorno. Lo que tiene es el brillo del terciopelo, que no está donde da la
 * luz sino en los bordes, suave y del color de la tela aclarado. Los colores
 * que salen de la semilla (la gelatina, el pelo, el gorro) se ponen aquí; los
 * que no cambian (el rojo de la seta, el oro) vienen del kit tal cual.
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

/** El material de un color fijo del kit, compartido por todos los slimes. */
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
 * El slime: terciopelo con la cara pintada en su textura, de gelatina, que se
 * deforma entera. Las pupilas las pinta el sombreador encima, donde diga la
 * cara en cada fotograma.
 */
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
