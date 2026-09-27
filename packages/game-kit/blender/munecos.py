"""
Kit de muñecos de "No mires".

Genera en Blender las piezas de los muñecos —el cuerpo con su esqueleto, la
cabeza, los pelos, los gorros y los accesorios— y las exporta a un único GLB.
La web no inventa formas: coge de aquí las piezas que le toquen a cada
semilla, las pinta y las anima. Todos tienen las mismas proporciones: lo que
cambia es lo que llevan puesto y la cara, que se pinta en la web.

Todo se construye con código para poder regenerar el kit entero y revisarlo en
un diff:

- El cuerpo sale del modificador Piel sobre un esqueleto de puntos, suavizado.
  Es una sola malla: la ropa no son piezas, se pinta en la web por zonas. Para
  eso cada vértice lleva en su UV por dónde va del brazo (u) y de la pierna (v),
  de 0 en el hombro o la ingle a 1 en la muñeca o el tobillo, y negativo en el
  tronco. Con eso y la altura, la manga corta, el pantalón o la bota son un
  umbral, y los bordes quedan limpios.
- El bíceps de sacar músculo es una clave de forma: la misma malla, engordada
  alrededor de su esqueleto de puntos.
- Pelos, gorros y capuchas son casquetes sobre la cabeza: rejillas de
  guiñada y cabeceo cuyo borde inferior es una curva (el nacimiento del pelo,
  un flequillo con mechones, la abertura de la capucha), así que el borde sale
  limpio y se redondea con un bisel.

Convenciones: Z arriba, el muñeco mira hacia -Y y los pies están en Z = 0. Las
piezas de la cabeza se modelan con el origen en el cuello, que es donde nace
el hueso "cabeza"; se diseñan a una escala cómoda y al final se encogen todas
juntas (`HEAD_SCALE`). Las gafas y el monóculo tienen el origen en su centro:
la web los pone donde caigan los ojos.

Uso (desde la raíz del repo):

    blender --background --factory-startup --python packages/game-kit/blender/munecos.py -- \\
        packages/game-kit/src/react/avatar/munecos.glb [--preview carpeta]
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

TAU = math.tau

# ---------------------------------------------------------------------------
# Medidas
# ---------------------------------------------------------------------------

#: Cuánto más alto es el cuerpo que el primer boceto: el tronco sube entero y
#: las piernas se alargan. Con la cabeza más pequeña (`HEAD_SCALE`) el muñeco
#: queda en unas dos cabezas y media de alto: gracioso, pero no cabezón.
RISE = 0.12

#: Articulación del cuello: origen de todas las piezas de la cabeza.
NECK = Vector((0, 0, 1.1 + RISE))

#: Altura de la cintura (donde acaba la camiseta y empieza el pantalón) y del
#: escote en la espalda. La web las lee del kit para pintar la ropa.
WAIST = 0.6 + RISE
NECKLINE = 1.03 + RISE


def joints():
    """Esqueleto de puntos del cuerpo: posición y radios (ancho, fondo) de la piel."""
    up = RISE
    result = {
        "pelvis": ((0.0, 0.0, 0.47 + up), (0.25, 0.215)),
        "barriga": ((0.0, 0.0, 0.67 + up), (0.275, 0.235)),
        "pecho": ((0.0, 0.0, 0.88 + up), (0.25, 0.205)),
        "cuello": ((0.0, 0.0, 1.1 + up), (0.115, 0.105)),
    }
    for side, sx in (("L", 1), ("R", -1)):
        result.update(
            {
                f"hombro.{side}": ((0.2 * sx, 0.0, 0.95 + up), (0.1, 0.1)),
                f"biceps.{side}": ((0.258 * sx, 0.0, 0.85 + up), (0.088, 0.088)),
                f"codo.{side}": ((0.31 * sx, 0.0, 0.75 + up), (0.079, 0.079)),
                f"antebrazo.{side}": ((0.345 * sx, -0.006, 0.66 + up), (0.077, 0.074)),
                f"muneca.{side}": ((0.372 * sx, -0.012, 0.575 + up), (0.068, 0.064)),
                f"mano.{side}": ((0.402 * sx, -0.02, 0.475 + up), (0.108, 0.082)),
                f"pulgar.{side}": ((0.352 * sx, -0.088, 0.545 + up), (0.04, 0.04)),
                # Las piernas se estiran: la cadera sube con el tronco y los pies se quedan.
                f"cadera.{side}": ((0.12 * sx, 0.0, 0.45 + up), (0.125, 0.125)),
                f"muslo.{side}": ((0.122 * sx, -0.004, 0.355 + up * 0.75), (0.118, 0.118)),
                f"rodilla.{side}": ((0.125 * sx, -0.008, 0.26 + up * 0.5), (0.107, 0.107)),
                f"gemelo.{side}": ((0.128 * sx, -0.004, 0.18 + up * 0.3), (0.104, 0.104)),
                f"tobillo.{side}": ((0.13 * sx, 0.0, 0.1), (0.098, 0.098)),
                f"punta.{side}": ((0.135 * sx, -0.15, 0.066), (0.12, 0.094)),
            }
        )
        spread_arm(result, side, sx)
    return result


#: Cuánto más abiertos que el boceto van los brazos al modelar (pose A): con el
#: brazo lejos del tronco, los pesos no confunden el costado con el brazo. La
#: web los baja a su sitio al animar.
ARM_SPREAD = 0.25

#: Y cuánto más largos: con el tronco estirado, las manos tienen que llegar
#: más abajo de la cadera.
ARM_STRETCH = 1.12

ARM_JOINTS = ("biceps", "codo", "antebrazo", "muneca", "mano", "pulgar")


def spread_arm(result, side, sx):
    """Alarga el brazo y lo gira entero alrededor del hombro, hacia fuera, `ARM_SPREAD` radianes."""
    shoulder = Vector(result[f"hombro.{side}"][0])
    angle = ARM_SPREAD * sx
    c, s = math.cos(angle), math.sin(angle)
    for name in ARM_JOINTS:
        key = f"{name}.{side}"
        position, radii = result[key]
        d = (Vector(position) - shoulder) * ARM_STRETCH
        # En el plano XZ: hacia fuera y hacia arriba.
        turned = Vector((d.x * c - d.z * s, d.y, d.z * c + d.x * s))
        result[key] = (tuple(shoulder + turned), radii)


JOINTS = joints()

SKIN_EDGES = [("pelvis", "barriga"), ("barriga", "pecho"), ("pecho", "cuello")]
for _side in ("L", "R"):
    for _chain in (
        ["pecho", "hombro", "biceps", "codo", "antebrazo", "muneca", "mano"],
        ["pelvis", "cadera", "muslo", "rodilla", "gemelo", "tobillo", "punta"],
    ):
        _names = [n if n in ("pecho", "pelvis") else f"{n}.{_side}" for n in _chain]
        SKIN_EDGES += list(zip(_names, _names[1:], strict=False))
    SKIN_EDGES.append((f"muneca.{_side}", f"pulgar.{_side}"))


def joint(name):
    return Vector(JOINTS[name][0])


def skeleton():
    """
    Huesos: nombre, cabeza, cola y padre. Los del tronco miran hacia arriba sin
    giro, así que en la web su espacio es el del mundo: lo que se cuelga del
    hueso "cabeza" va con coordenadas relativas al cuello, sin más.
    """
    bones = [
        ("cadera", Vector((0, 0, 0.4 + RISE)), Vector((0, 0, 0.6 + RISE)), None),
        ("columna", Vector((0, 0, 0.6 + RISE)), Vector((0, 0, 0.84 + RISE)), "cadera"),
        ("pecho", Vector((0, 0, 0.84 + RISE)), NECK.copy(), "columna"),
        ("cabeza", NECK.copy(), NECK + Vector((0, 0, 0.3)), "pecho"),
    ]
    for side in ("L", "R"):
        wrist = joint(f"muneca.{side}")
        hand = joint(f"mano.{side}")
        bones += [
            (f"brazo.{side}", joint(f"hombro.{side}"), joint(f"codo.{side}"), "pecho"),
            (f"antebrazo.{side}", joint(f"codo.{side}"), wrist, f"brazo.{side}"),
            (f"mano.{side}", wrist, hand + (hand - wrist) * 0.6, f"antebrazo.{side}"),
            (f"muslo.{side}", joint(f"cadera.{side}"), joint(f"rodilla.{side}"), "cadera"),
            (f"pierna.{side}", joint(f"rodilla.{side}"), joint(f"tobillo.{side}"), f"muslo.{side}"),
            (f"pie.{side}", joint(f"tobillo.{side}"), joint(f"punta.{side}"), f"pierna.{side}"),
        ]
    return bones


def chains(side):
    """
    Las cadenas del brazo y de la pierna para las zonas de ropa: van de 0 (el
    hombro, la ingle) a 1 (la muñeca, el tobillo), y más allá la mano o el pie.
    """
    wrist = joint(f"muneca.{side}")
    hand = joint(f"mano.{side}")
    arm = [joint(f"hombro.{side}"), joint(f"codo.{side}"), wrist, hand + (hand - wrist) * 0.7]
    leg = [
        joint(f"cadera.{side}"),
        joint(f"rodilla.{side}"),
        joint(f"tobillo.{side}"),
        joint(f"punta.{side}") + Vector((0, -0.1, 0)),
    ]
    return arm, leg


# ---------------------------------------------------------------------------
# Utilidades de Blender
# ---------------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces=(), edges=()):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], list(edges), list(faces))
    mesh.update()
    return link(bpy.data.objects.new(name, mesh))


def evaluated_mesh(obj):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(
        obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph
    )


def bake(obj):
    """Aplica todos los modificadores: el objeto se queda con la malla evaluada."""
    mesh = evaluated_mesh(obj)
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    if old.users == 0:
        bpy.data.meshes.remove(old)
    mesh.name = obj.name
    return obj


def modifier(obj, kind, **settings):
    mod = obj.modifiers.new(kind.lower(), kind)
    for key, value in settings.items():
        setattr(mod, key, value)
    return mod


def smooth(obj, factor=0.5, iterations=4):
    modifier(obj, "SMOOTH", factor=factor, iterations=iterations)
    return bake(obj)


def decimate(obj, triangles):
    """Deja la malla en unos `triangles` triángulos: el kit entero tiene que bajar rápido al móvil."""
    current = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if current > triangles:
        modifier(obj, "DECIMATE", ratio=triangles / current, use_collapse_triangulate=True)
        bake(obj)
    return obj


def bevel_rim(obj, width=0.014, angle=50, segments=2):
    """Redondea los cantos vivos (el borde de un pelo, el ala de un gorro)."""
    modifier(
        obj,
        "BEVEL",
        width=width,
        segments=segments,
        limit_method="ANGLE",
        angle_limit=math.radians(angle),
    )
    return bake(obj)


def shade_smooth(obj, sharp=None):
    obj.data.shade_smooth()
    if sharp:
        obj.data.set_sharp_from_angle(angle=math.radians(sharp))
    return obj


def transform(obj, matrix):
    obj.data.transform(matrix)
    obj.data.update()
    return obj


def turn(obj, angle, axis, pivot=(0, 0, 0)):
    """Gira la malla alrededor de un punto."""
    pivot = Vector(pivot)
    return transform(
        obj, Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-pivot)
    )


def join(objects, name):
    """Junta varios objetos en uno (sin fundirlos), conservando sus materiales."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = objects[0]
    joined.name = name
    joined.data.name = name
    return joined


def material(name, color=(0.8, 0.8, 0.8), roughness=0.7):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    if mat.node_tree is None and hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    if mat.node_tree:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*color, 1.0)
            bsdf.inputs["Roughness"].default_value = roughness
    return mat


def fixed(name, color, roughness=0.6):
    """Un color que no cambia con la semilla: el rojo de la seta, el oro de la corona."""
    return material(f"fijo.{name}", color, roughness)


def paint(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0
    return obj


def paint_by(obj, mats, pick):
    """Varios materiales en una pieza: `pick(centro de la cara)` dice cuál."""
    obj.data.materials.clear()
    for mat in mats:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = pick(Vector(poly.center))
    return obj


def sphere(name, radius=1.0, segments=32, rings=16, location=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(location), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return shade_smooth(link(bpy.data.objects.new(name, mesh)))


def rounded_box(name, center, half, radius, segments=3):
    """Una caja con las esquinas redondeadas (una bolsa, un botón gordo)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.scale(bm, vec=Vector(half), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    modifier(obj, "BEVEL", width=radius, segments=segments, limit_method="NONE")
    return shade_smooth(bake(obj))


def cylinder(name, radius, depth, segments=32, location=(0, 0, 0), radius2=None, cap=True):
    """Cilindro (o cono, con `radius2`) de eje Z, centrado en `location`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=cap,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius if radius2 is None else radius2,
        depth=depth,
    )
    bmesh.ops.translate(bm, vec=Vector(location), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return link(bpy.data.objects.new(name, mesh))


def torus(name, major, minor, location=(0, 0, 0), rotation=(0, 0, 0), segments=48, sides=12, scale=(1, 1, 1)):
    """Toro en el plano XY, escalado, girado (X, Y, Z) y colocado."""
    verts = []
    faces = []
    for i in range(segments):
        a = i / segments * TAU
        for j in range(sides):
            b = j / sides * TAU
            r = major + minor * math.cos(b)
            verts.append((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    for i in range(segments):
        for j in range(sides):
            faces.append(
                (
                    i * sides + j,
                    ((i + 1) % segments) * sides + j,
                    ((i + 1) % segments) * sides + (j + 1) % sides,
                    i * sides + (j + 1) % sides,
                )
            )
    obj = mesh_object(name, verts, faces)
    matrix = (
        Matrix.Translation(Vector(location))
        @ Matrix.Rotation(rotation[2], 4, "Z")
        @ Matrix.Rotation(rotation[1], 4, "Y")
        @ Matrix.Rotation(rotation[0], 4, "X")
        @ Matrix.Diagonal((*scale, 1))
    )
    return shade_smooth(transform(obj, matrix))


def lathe(name, profile, segments=48, wobble=None):
    """
    Torno alrededor de Z desde puntos (radio, altura), de abajo arriba.
    `wobble(ángulo, índice del punto)` multiplica el radio: pliegues, ondas.
    """
    n = len(profile)
    verts = []
    faces = []
    for i in range(segments):
        a = i / segments * TAU
        for j, (r, z) in enumerate(profile):
            k = wobble(a, j) if wobble else 1.0
            verts.append((r * k * math.cos(a), r * k * math.sin(a), z))
    for i in range(segments):
        for j in range(n - 1):
            a = i * n + j
            b = ((i + 1) % segments) * n + j
            faces.append((a, b, b + 1, a + 1))
    obj = mesh_object(name, verts, faces)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return shade_smooth(obj)


def keep(obj, test):
    """Borra los vértices que no pasan `test(posición)`."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not test(v.co)], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def displace(obj, fn):
    """Mueve cada vértice con `fn(posición) -> posición`."""
    for v in obj.data.vertices:
        v.co = fn(Vector(v.co))
    obj.data.update()
    return obj


def skin_mesh(name, points, edges, radii, root=0, levels=2, smoothing=0):
    """
    Una malla orgánica con el modificador Piel: `points` unidos por `edges`,
    con un radio (o dos, ancho y fondo) en cada punto. Sirve igual para el
    cuerpo que para una coleta o un cuerno.
    """
    obj = mesh_object(name, points, edges=edges)
    modifier(obj, "SKIN", branch_smoothing=0.7, use_smooth_shade=True)
    for i, r in enumerate(radii):
        data = obj.data.skin_vertices[0].data[i]
        data.radius = (r, r) if isinstance(r, (int, float)) else r
        data.use_root = i == root
    if levels:
        modifier(obj, "SUBSURF", levels=levels, render_levels=levels)
    bake(obj)
    # La Piel deja a veces algún vértice suelto por dentro: fuera.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    if smoothing:
        smooth(obj, 0.5, smoothing)
    return shade_smooth(obj)


def tube(name, points, radii, levels=2):
    """Un tubo que sigue `points` (coleta, cuerno, pincho): la Piel de una cadena."""
    edges = [(i, i + 1) for i in range(len(points) - 1)]
    return skin_mesh(name, points, edges, radii, levels=levels)


def bezier(a, b, c, steps):
    """Puntos de la curva cuadrática que sale de `a`, tira hacia `b` y llega a `c`."""
    return [a * (1 - t) ** 2 + b * 2 * t * (1 - t) + c * t * t for t in (i / steps for i in range(steps + 1))]


def finish(obj, triangles=3000, sharp=None):
    decimate(obj, triangles)
    return shade_smooth(obj, sharp)


# ---------------------------------------------------------------------------
# Cuerpo
# ---------------------------------------------------------------------------


def skin_shrink(name):
    """
    Lo que encoge la Piel al subdividirla y suavizarla: los radios de `JOINTS`
    son los que se ven, y a la Piel se le dan así de gordos. El tronco, que es
    una caja, encoge más que los brazos y las piernas, que son tubos.
    """
    base = name.split(".")[0]
    if base in ("pelvis", "barriga", "pecho"):
        return 1.45
    if base == "cuello":
        return 1.3
    return 1.12


def body_mesh(name):
    """El cuerpo: la Piel sobre el esqueleto de puntos, subdividida y suavizada."""
    names = list(JOINTS)
    points = [JOINTS[n][0] for n in names]
    edges = [(names.index(a), names.index(b)) for a, b in SKIN_EDGES]
    radii = [tuple(r * skin_shrink(n) for r in JOINTS[n][1]) for n in names]
    return skin_mesh(name, points, edges, radii, root=names.index("pelvis"), levels=2, smoothing=5)


def muscle_scale(name):
    """El bíceps de sacar músculo, como clave de forma: cuánto engorda cada punto."""
    base = name.split(".")[0]
    return {"biceps": 1.9, "antebrazo": 1.55, "hombro": 1.2, "codo": 1.1}.get(base, 1.0)


def build_armature():
    data = bpy.data.armatures.new("esqueleto")
    arm = link(bpy.data.objects.new("esqueleto", data))
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for name, head, tail, parent in skeleton():
        eb = data.edit_bones.new(name)
        eb.head = head
        eb.tail = tail
        eb.roll = 0.0
        if parent:
            eb.parent = made[parent]
            eb.use_connect = False
        made[name] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def segment(p, a, b):
    """Distancia de `p` al segmento ab y dónde cae (0 en a, 1 en b)."""
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


def polyline(p, points):
    """Dónde cae `p` a lo largo de una cadena de puntos: 0 en el primero, 1 en el tercero."""
    pairs = list(zip(points, points[1:], strict=False))
    lengths = [(b - a).length for a, b in pairs]
    unit = lengths[0] + lengths[1]
    best = (math.inf, 0.0)
    walked = 0.0
    for (a, b), length in zip(pairs, lengths, strict=True):
        d, t = segment(p, a, b)
        if d < best[0]:
            best = (d, (walked + t * length) / unit)
        walked += length
    return best[1]


def torso_bones(z):
    """El tronco por alturas: cadera, columna, pecho y, en lo alto del cuello, la cabeza."""
    bones = {name: (head, tail) for name, head, tail, _ in skeleton()}
    spine = bones["columna"][0].z
    chest = bones["pecho"][0].z
    a = smoothstep(spine - 0.07, spine + 0.07, z)
    b = smoothstep(chest - 0.07, chest + 0.06, z)
    c = smoothstep(NECK.z - 0.07, NECK.z + 0.02, z)
    return {"cadera": 1 - a, "columna": a * (1 - b), "pecho": a * b * (1 - c), "cabeza": a * b * c}


def chain_bones(p, points, names, cut):
    """
    Un brazo o una pierna: los huesos de la cadena según por dónde cae el
    punto a lo largo de ella, con el codo (o la rodilla) y la muñeca (o el
    tobillo) repartidos en curva.
    """
    t = polyline(p, points)
    upper, lower, end = names
    bend = smoothstep(cut - 0.06, cut + 0.06, t)
    wrist = smoothstep(0.94, 1.04, t)
    return {upper: 1 - bend, lower: bend * (1 - wrist), end: bend * wrist}


def weigh(obj, arm):
    """
    Los pesos de la piel, a partir del esqueleto de puntos del que sale.

    Cada punto es del tramo más cercano *en proporción a lo gordo que es ese
    tramo*: el costado de la barriga está lejos del eje del tronco, pero el
    tronco es muy gordo, así que es tronco y no brazo ni muslo aunque el brazo
    le pase más cerca. En los cruces (hombros, ingles) los tramos se mezclan
    suave, y el resultado se suaviza por la malla para que codos y rodillas
    doblen en curva. Por dentro del hombro no manda nunca el brazo: al
    levantarlo, el hombro se estira pero el cuello no se estrecha.

    Devuelve los pesos de cada vértice, que hacen falta para las zonas de ropa.
    """
    names = [name for name, *_ in skeleton()]
    shoulder_x = joint("hombro.L").x
    chains_by_side = {side: chains(side) for side in ("L", "R")}
    cuts = {}
    for side, (arm_chain, leg_chain) in chains_by_side.items():
        for key, chain in (("brazo", arm_chain), ("pierna", leg_chain)):
            first = (chain[1] - chain[0]).length
            cuts[(key, side)] = first / (first + (chain[2] - chain[1]).length)

    def edge_bones(a, b, t, p):
        """Qué huesos mueven un punto de ese tramo de la piel."""
        side = (a + b).split(".")[-1][-1] if "." in a + b else ""
        side = "L" if a.endswith(".L") or b.endswith(".L") else "R" if a.endswith(".R") or b.endswith(".R") else ""
        torso = torso_bones(p.z)
        if not side:
            return torso
        arm_chain, leg_chain = chains_by_side[side]
        limb_arm = chain_bones(p, arm_chain, (f"brazo.{side}", f"antebrazo.{side}", f"mano.{side}"), cuts[("brazo", side)])
        limb_leg = chain_bones(p, leg_chain, (f"muslo.{side}", f"pierna.{side}", f"pie.{side}"), cuts[("pierna", side)])
        if a == "pecho":
            # El hombro: del pecho al brazo según se acerca a la articulación.
            k = smoothstep(0.45, 0.95, t)
            return mix(torso, limb_arm, k)
        if a == "pelvis":
            # La ingle: de la cadera al muslo.
            k = smoothstep(0.35, 0.9, t)
            return mix(torso, limb_leg, k)
        if a.startswith(("hombro", "biceps", "codo", "antebrazo", "muneca")):
            return limb_arm
        return limb_leg

    count = len(obj.data.vertices)
    weights = []
    for v in obj.data.vertices:
        p = Vector(v.co)
        scores = []
        for a, b in SKIN_EDGES:
            pa, pb = joint(a), joint(b)
            ab = pb - pa
            t = max(0.0, min(1.0, (p - pa).dot(ab) / ab.length_squared))
            offset = p - (pa + ab * t)
            ra = Vector((*JOINTS[a][1], 0))
            rb = Vector((*JOINTS[b][1], 0))
            rx = ra.x + (rb.x - ra.x) * t
            ry = ra.y + (rb.y - ra.y) * t
            if abs(ab.normalized().z) > 0.9:
                # Tramos de pie (tronco, piernas): elipse de ancho y fondo.
                reach = math.sqrt((offset.x / rx) ** 2 + (offset.y / ry) ** 2 + (offset.z / max(rx, ry)) ** 2)
            else:
                reach = offset.length / max(rx, ry)
            scores.append((math.exp(-14 * reach), a, b, t))
        total = sum(score for score, *_ in scores) or 1.0
        acc = {}
        for score, a, b, t in scores:
            if score / total < 1e-3:
                continue
            for name, w in edge_bones(a, b, t, p).items():
                acc[name] = acc.get(name, 0.0) + w * score / total
        weights.append(acc)

    # Suavizado por la malla: dos vueltas, que los cruces no hagan pico.
    around_ = [[] for _ in range(count)]
    for edge in obj.data.edges:
        a, b = edge.vertices
        around_[a].append(b)
        around_[b].append(a)
    for _ in range(2):
        smoothed = []
        for i in range(count):
            acc = dict(weights[i])
            for j in around_[i]:
                for name, w in weights[j].items():
                    acc[name] = acc.get(name, 0.0) + w / len(around_[i])
            total = sum(acc.values()) or 1.0
            smoothed.append({name: w / total for name, w in acc.items()})
        weights = smoothed

    groups = {name: obj.vertex_groups.new(name=name) for name in names}
    final = []
    for v, raw in zip(obj.data.vertices, weights, strict=True):
        side = "L" if v.co.x > 0 else "R"
        keep_arm = smoothstep(shoulder_x - 0.08, shoulder_x + 0.01, abs(v.co.x))
        moved = 0.0
        for bone in list(raw):
            base, _, bone_side = bone.partition(".")
            if base in ("brazo", "antebrazo", "mano"):
                factor = keep_arm if bone_side == side else 0.0
                moved += raw[bone] * (1 - factor)
                raw[bone] *= factor
        if moved:
            raw["pecho"] = raw.get("pecho", 0.0) + moved
        top = sorted(((name, w) for name, w in raw.items() if w > 1e-4), key=lambda kv: -kv[1])[:4]
        total = sum(w for _, w in top) or 1.0
        kept = {name: w / total for name, w in top if w / total > 0.01}
        total = sum(kept.values())
        kept = {name: w / total for name, w in kept.items()}
        for name, w in kept.items():
            groups[name].add([v.index], w, "REPLACE")
        final.append(kept)
    modifier(obj, "ARMATURE", object=arm)
    obj.parent = arm
    return final


def mix(a, b, k):
    """Mezcla dos repartos de pesos: `k` = 0 es `a`, 1 es `b`."""
    result = {name: w * (1 - k) for name, w in a.items()}
    for name, w in b.items():
        result[name] = result.get(name, 0.0) + w * k
    return result


def zones(obj, weights):
    """
    Las UV del cuerpo: por dónde va cada vértice del brazo (u) y de la pierna
    (v). En el tronco valen -0.25, y en el hombro o la ingle se funden con el
    brazo o la pierna siguiendo los pesos, así que cualquier umbral traza una
    línea limpia.
    """
    params = []
    for v, ws in zip(obj.data.vertices, weights, strict=True):
        p = Vector(v.co)
        best = [-0.25, -0.25]
        for side in ("L", "R"):
            arm_chain, leg_chain = chains(side)
            w_arm = sum(ws.get(f"{b}.{side}", 0.0) for b in ("brazo", "antebrazo", "mano"))
            w_leg = sum(ws.get(f"{b}.{side}", 0.0) for b in ("muslo", "pierna", "pie"))
            if w_arm > 0.01:
                best[0] = max(best[0], w_arm * polyline(p, arm_chain) + (1 - w_arm) * -0.25)
            if w_leg > 0.01:
                best[1] = max(best[1], w_leg * polyline(p, leg_chain) + (1 - w_leg) * -0.25)
        params.append(best)
    uv = obj.data.uv_layers.new(name="zonas")
    for loop in obj.data.loops:
        uv.data[loop.index].uv = params[loop.vertex_index]


def fatten(obj, scale):
    """
    La malla engordada (o adelgazada) alrededor de su esqueleto de puntos: cada
    vértice se aleja de su tramo lo que diga `scale` en sus dos puntas. El
    desplazamiento se suaviza por la malla para que no se note dónde cambia de
    tramo, en hombros e ingles.
    """
    moves = []
    for v in obj.data.vertices:
        p = Vector(v.co)
        best = None
        for a, b in SKIN_EDGES:
            d, t = segment(p, joint(a), joint(b))
            if best is None or d < best[0]:
                best = (d, t, a, b)
        _, t, a, b = best
        center = joint(a).lerp(joint(b), t)
        moves.append((p - center) * (scale(a) * (1 - t) + scale(b) * t - 1))
    near = [[] for _ in moves]
    for edge in obj.data.edges:
        a, b = edge.vertices
        near[a].append(b)
        near[b].append(a)
    for _ in range(6):
        moves = [(m + sum((moves[j] for j in near[i]), Vector()) / len(near[i])) / 2 for i, m in enumerate(moves)]
    return [Vector(v.co) + m for v, m in zip(obj.data.vertices, moves, strict=True)]


def build_body():
    body = body_mesh("cuerpo")
    body.shape_key_add(name="base", from_mix=False)
    key = body.shape_key_add(name="musculo", from_mix=False)
    for i, co in enumerate(fatten(body, muscle_scale)):
        key.data[i].co = co
    arm = build_armature()
    weights = weigh(body, arm)
    zones(body, weights)
    paint(body, material("piel", (1.0, 0.78, 0.62), 0.6))
    # Lo que la web necesita para pintar la ropa, en sus medidas.
    arm_chain, leg_chain = chains("L")
    body["cintura"] = WAIST
    body["escote"] = NECKLINE
    body["brazo"] = round((arm_chain[1] - arm_chain[0]).length + (arm_chain[2] - arm_chain[1]).length, 4)
    body["pierna"] = round((leg_chain[1] - leg_chain[0]).length + (leg_chain[2] - leg_chain[1]).length, 4)
    return body, arm


def silhouette(body):
    """
    Hasta dónde llega el cuerpo, sin los brazos, a cada altura: de lado (x) y
    de frente o de espalda (y). Es lo que tiene que abrazar una falda.
    """
    uv = body.data.uv_layers["zonas"].data
    arm_param = {}
    for loop in body.data.loops:
        arm_param[loop.vertex_index] = uv[loop.index].uv.x
    step = 0.02
    bins = {}
    for v in body.data.vertices:
        if arm_param.get(v.index, 0.0) > -0.2:
            continue
        key = round(v.co.z / step)
        x, y = bins.get(key, (0.0, 0.0))
        bins[key] = (max(x, abs(v.co.x)), max(y, abs(v.co.y)))

    def extent(z):
        key = round(z / step)
        near = [bins[k] for k in (key - 1, key, key + 1) if k in bins]
        if not near:
            return (0.0, 0.0)
        return (max(x for x, _ in near), max(y for _, y in near))

    return extent


def rigid_to_bone(obj, bone, arm):
    """Una pieza cosida entera a un hueso: se mueve con él sin deformarse."""
    group = obj.vertex_groups.new(name=bone)
    group.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    modifier(obj, "ARMATURE", object=arm)
    obj.parent = arm
    return obj


def surface(body, x, z, lift=0.0, side=-1):
    """El punto de la piel del cuerpo (sin claves de forma) delante (-1) o detrás (1) de (x, z)."""
    origin = Vector((x, side * 1.0, z))
    hit, location, normal, _ = body.ray_cast(origin, Vector((0, -side, 0)))
    if not hit:
        raise RuntimeError(f"no hay cuerpo en {x}, {z}")
    return location + normal * lift, normal


def ribbon(name, path, width, thickness, up=None):
    """Una cinta plana que sigue `path`, con el canto hacia `up(punto)` (o hacia arriba)."""
    verts = []
    faces = []
    for i, p in enumerate(path):
        ahead = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        side = (up(p) if up else Vector((0, 0, 1))).cross(ahead).normalized()
        normal = ahead.cross(side).normalized()
        for s, n in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(p + side * s * width / 2 + normal * n * thickness / 2)
    for i in range(len(path) - 1):
        for k in range(4):
            a = i * 4 + k
            b = i * 4 + (k + 1) % 4
            faces.append((a, b, b + 4, a + 4))
    last = (len(path) - 1) * 4
    faces += [(3, 2, 1, 0), (last, last + 1, last + 2, last + 3)]
    obj = mesh_object(name, verts, faces)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return shade_smooth(obj)


def build_body_props(body, arm):
    """Lo que va sobre la ropa: faldas, la capucha de la sudadera, corbata, pañuelo y bandolera."""
    top = material("ropa", (0.85, 0.3, 0.35), 0.85)
    bottom = material("abajo", (0.25, 0.35, 0.55), 0.85)
    accent = material("acento", (0.95, 0.85, 0.3), 0.6)
    leather = fixed("cuero", (0.36, 0.22, 0.13), 0.6)

    # Faldas con tablas, que se abren con los muslos al sentarse. Nacen de la
    # cintura pegadas al cuerpo (el borde de arriba se mete dentro, así que la
    # tela sale de él sin escalón) y caen en campana: poco vuelo a la altura de
    # las manos, todo abajo.
    extent = silhouette(body)
    waist = WAIST + 0.03

    def skirt(name, hem, flare, mat):
        rows = 14
        # De la cintura al bajo: nunca más estrecha que lo que ya ha pasado por
        # arriba, que la tela cae y no se mete entre las piernas.
        fitted = []
        widest = (0.0, 0.0)
        for j in range(rows + 1):
            here = extent(waist + (hem - waist) * j / rows)
            widest = (max(widest[0], here[0]), max(widest[1], here[1]))
            fitted.append(widest)
        # El torno va de abajo arriba: del bajo a la cintura y, al final, el
        # remate que se mete en el cuerpo.
        profile = []
        depth = []
        pleats = []
        for j in range(rows, -1, -1):
            t = j / rows
            opening = flare * t**1.7
            profile.append((fitted[j][0] + 0.012 + opening, waist + (hem - waist) * t))
            depth.append(fitted[j][1] + 0.012 + opening * 0.85)
            pleats.append(0.05 * smoothstep(0.15, 1.0, t))
        profile.append((fitted[0][0] - 0.02, waist + 0.05))
        depth.append(fitted[0][1] - 0.02)
        pleats.append(0.0)

        def shape(a, j):
            rx = profile[j][0]
            ry = depth[j]
            ellipse = ry / math.sqrt((ry * math.cos(a)) ** 2 + (rx * math.sin(a)) ** 2)
            return ellipse * (1 + pleats[j] * math.cos(a * 14))

        obj = lathe(name, profile, 64, wobble=shape)
        modifier(obj, "SOLIDIFY", thickness=0.018, offset=-1.0, use_even_offset=True)
        bake(obj)
        bevel_rim(obj, 0.007, 60, 2)
        paint(shade_smooth(obj), mat)
        groups = {n: obj.vertex_groups.new(name=n) for n in ("cadera", "muslo.L", "muslo.R")}
        for v in obj.data.vertices:
            t = max(0.0, min(1.0, (waist - v.co.z) / (waist - hem)))
            front = max(0.0, -v.co.y / max(1e-4, Vector((v.co.x, v.co.y)).length))
            lateral = min(1.0, abs(v.co.x) / 0.12)
            thigh = 0.7 * t * t * (0.35 + 0.65 * front) * lateral
            groups["cadera"].add([v.index], 1 - thigh, "REPLACE")
            if thigh > 0.01:
                groups["muslo.L" if v.co.x > 0 else "muslo.R"].add([v.index], thigh, "REPLACE")
        modifier(obj, "ARMATURE", object=arm)
        obj.parent = arm
        return obj

    skirt("ropa.falda", 0.36, 0.13, bottom)
    skirt("ropa.vestido", 0.25, 0.17, top)

    # Capucha de la sudadera: un rollo de tela que abraza el cuello por detrás,
    # con los cordones colgando por delante.
    roll = torus(
        "capucha.rollo",
        0.2,
        0.07,
        location=(0, 0.035, 1.035 + RISE),
        rotation=(0.18, 0, 0),
        segments=36,
        sides=10,
        scale=(1.05, 1.0, 1.0),
    )
    keep(roll, lambda co: co.y > -0.1)
    pouch = sphere("capucha.bolsa", 1.0, 24, 12, location=(0, 0.215, 0.95 + RISE), scale=(0.2, 0.08, 0.16))
    hood = join([roll, pouch], "capucha.tela")
    paint(hood, top)
    cords = []
    for sx in (-1, 1):
        start, _ = surface(body, sx * 0.07, 1.0 + RISE, 0.02)
        end, _ = surface(body, sx * 0.075, 0.8 + RISE, 0.025)
        middle = (start + end) / 2 + Vector((0, -0.02, 0))
        cords.append(tube(f"capucha.cordon{sx}", bezier(start, middle, end, 4), [0.012] * 5, levels=1))
        cords.append(sphere(f"capucha.nudo{sx}", 0.02, 12, 8, location=end + Vector((0, 0, -0.01))))
    cords = join(cords, "capucha.cordones")
    paint(cords, fixed("cordon", (0.95, 0.95, 0.92), 0.7))
    rigid_to_bone(join([hood, cords], "ropa.capucha"), "pecho", arm)

    # Corbata: nudo y pala, pegados a la barriga que toque.
    knot_at, _ = surface(body, 0, 1.0 + RISE, 0.015)
    knot = sphere("corbata.nudo", 1.0, 16, 10, location=knot_at, scale=(0.04, 0.03, 0.035))
    path = [surface(body, 0, z + RISE, 0.018)[0] for z in (0.98, 0.9, 0.82, 0.74, 0.66, 0.6)]
    blade = ribbon("corbata.pala", path, 0.07, 0.014)
    for v in blade.data.vertices:
        t = (0.98 + RISE - v.co.z) / 0.38
        v.co.x *= 0.7 + 0.6 * min(1.0, t * 1.6)
        if t > 0.95:
            v.co.z += 0.02 * (1 - min(1.0, abs(v.co.x) / 0.05))
    tie = join([knot, blade], "extra.corbata")
    paint(shade_smooth(tie), accent)
    rigid_to_bone(tie, "pecho", arm)

    # Pañuelo de explorador: triángulo sobre el pecho, nudo y vuelta al cuello.
    ring = torus(
        "panuelo.vuelta",
        0.14,
        0.03,
        location=(0, 0.01, 1.02 + RISE),
        rotation=(0.25, 0, 0),
        segments=40,
        sides=10,
        scale=(1.05, 1.1, 1),
    )
    corners = [surface(body, x, z + RISE, 0.012)[0] for x, z in ((-0.14, 0.99), (0.14, 0.99), (0.0, 0.8))]
    cloth = mesh_object("panuelo.pico", corners, [(0, 1, 2)])
    modifier(cloth, "SUBSURF", levels=3, subdivision_type="SIMPLE")
    bake(cloth)
    for v in cloth.data.vertices:
        v.co = surface(body, v.co.x, v.co.z, 0.012)[0]
    modifier(cloth, "SOLIDIFY", thickness=0.01)
    bake(cloth)
    bevel_rim(cloth, 0.004, 60, 1)
    knot = sphere("panuelo.nudo", 0.035, 14, 8, location=surface(body, 0, 0.97 + RISE, 0.03)[0])
    scarf = join([ring, shade_smooth(cloth), knot], "extra.pañuelo")
    paint(scarf, accent)
    rigid_to_bone(scarf, "pecho", arm)

    # Bandolera: la correa cruza el pecho del hombro izquierdo a la cadera
    # derecha, donde cuelga la bolsa, pegada a la barriga por delante del
    # costado (en el costado mismo chocaría con el brazo).
    out = Vector((-0.75, -0.66, 0)).normalized()
    hit, side_at, side_normal, _ = body.ray_cast(Vector((0, 0, 0.56 + RISE)), out)
    if not hit:
        raise RuntimeError("no hay costado para la bolsa")
    bag_at = side_at + side_normal * 0.04
    # La bolsa se hace con la cara de fuera hacia -X y se gira hacia la normal.
    turn_to = Vector((-1, 0, 0)).rotation_difference(side_normal).to_matrix().to_4x4()
    place = Matrix.Translation(bag_at) @ turn_to
    bag = transform(rounded_box("bandolera.bolsa", (0, 0, 0), (0.03, 0.085, 0.07), 0.024), place)
    flap = transform(rounded_box("bandolera.tapa", (-0.012, 0, 0.03), (0.024, 0.09, 0.045), 0.02), place)
    button = transform(sphere("bandolera.boton", 0.014, 12, 8, location=(-0.04, 0, -0.004)), place)
    path = [surface(body, 0.16 - 0.34 * t, 1.0 + RISE - 0.33 * t, 0.02)[0] for t in (i / 10 for i in range(11))]
    path.append(place @ Vector((0.0, 0.0, 0.075)))
    strap = ribbon("bandolera.correa", path, 0.045, 0.012, up=lambda p: Vector((0, -1, 0)))
    paint(strap, leather)
    paint(bag, accent)
    paint(flap, leather)
    paint(button, fixed("oro", (1.0, 0.76, 0.25), 0.3))
    rigid_to_bone(join([strap, bag, flap, button], "extra.bandolera"), "columna", arm)


# ---------------------------------------------------------------------------
# La cabeza
# ---------------------------------------------------------------------------

#: La cabeza, a la escala a la que se diseñan ella, los pelos y los gorros:
#: centro (sobre el cuello) y radios (ancho, fondo, alto).
HEAD = {"center": (0, 0, 0.33), "radii": (0.47, 0.44, 0.45)}

#: Lo que se encoge todo lo de la cabeza al terminar. Una cabeza más pequeña
#: que el primer boceto, que era un cabezón: ahora es poco más ancha que los
#: hombros.
HEAD_SCALE = 0.72

#: Rejilla del mapa de radios: de -π a π en guiñada y de -π/2 a π/2 en cabeceo.
MAP_YAW = 36
MAP_PITCH = 19


def head_shape(d):
    """Radio de la cabeza en una dirección unitaria, desde su centro."""
    rx, ry, rz = HEAD["radii"]
    return 1.0 / math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2 + (d.z / rz) ** 2)


def direction(yaw, pitch):
    """Guiñada 0 es de frente (-Y) y positiva hacia la izquierda del muñeco (+X); el cabeceo sube."""
    return Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))


def radius_map():
    """El radio de la cabeza en una rejilla de direcciones: con eso la web sabe dónde pintar la cara."""
    return [
        round(head_shape(direction(-math.pi + i / MAP_YAW * TAU, -math.pi / 2 + j / (MAP_PITCH - 1) * math.pi)), 4)
        for j in range(MAP_PITCH)
        for i in range(MAP_YAW)
    ]


def build_head():
    """
    La cabeza con el mapa de la cara: la mitad de delante se proyecta de frente
    sobre toda la textura, que es donde se pinta la cara, y la de detrás cae en
    una esquina de piel. La costura queda en la silueta, donde las dos mitades
    son piel y no se nota.
    """
    center = Vector(HEAD["center"])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=28, radius=1.0)
    # La esfera de bmesh tiene los polos en Z; se tumba para que sus anillos
    # sean de Y constante y uno caiga justo en Y = 0, la silueta.
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    for v in bm.verts:
        d = v.co.normalized()
        v.co = d * head_shape(d) + center
    mesh = bpy.data.meshes.new("craneo")
    bm.to_mesh(mesh)
    bm.free()
    obj = shade_smooth(link(bpy.data.objects.new("craneo", mesh)))
    span = max(HEAD["radii"]) * 1.08
    uv = obj.data.uv_layers.new(name="cara")
    for poly in obj.data.polygons:
        front = poly.center.y < center.y
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co - center
            uv.data[li].uv = (0.5 + co.x / (2 * span), 0.5 + co.z / (2 * span)) if front else (0.01, 0.01)
    paint(obj, material("cara", (1.0, 0.8, 0.65), 0.6))
    obj["centro"] = list(center)
    obj["cara"] = span
    obj["mapa"] = radius_map()
    return obj


def shrink_head_pieces():
    """
    Encoge la cabeza y todo lo que va en ella (`HEAD_SCALE`), con sus medidas
    anotadas: el centro, la cara, el mapa de radios, el eje de la hélice...
    """
    k = HEAD_SCALE
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not (obj.name == "craneo" or obj.name.startswith(("pelo.", "gorro."))):
            continue
        transform(obj, Matrix.Scale(k, 4))
        for key in ("centro", "ancla", "eje"):
            if key in obj:
                obj[key] = [round(v * k, 5) for v in obj[key]]
        if "cara" in obj:
            obj["cara"] = round(obj["cara"] * k, 5)
        if "mapa" in obj:
            obj["mapa"] = [round(v * k, 4) for v in obj["mapa"]]


# ---------------------------------------------------------------------------
# Casquetes: pelos, gorros y capuchas
# ---------------------------------------------------------------------------

BALL_CENTER = Vector(HEAD["center"])


def ball_point(yaw, pitch, lift=0.0):
    """Un punto a `lift` de la piel de la cabeza."""
    d = direction(yaw, pitch)
    return BALL_CENTER + d * (head_shape(d) + lift)


def top_of_ball(lift=0.0):
    return ball_point(0, math.pi / 2, lift)


def around(front, side, back, yaw):
    """Un valor que va de `front` (de frente) a `side` (en las orejas) y a `back` (la nuca), suave."""
    a = abs(yaw)
    if a <= math.pi / 2:
        return front + (side - front) * (1 - math.cos(a * 2)) / 2
    return side + (back - side) * (1 - math.cos((a - math.pi / 2) * 2)) / 2


def locks(yaw, count, width, depth, sharp=0.5):
    """
    Mechones en el borde: `count` puntas redondeadas repartidas en ±`width` de
    guiñada, de `depth` de largo. `sharp` más bajo las hace más de pico.
    """
    if abs(yaw) >= width:
        return 0.0
    phase = (yaw / width + 1) / 2 * count
    wave = abs(math.sin(phase * math.pi)) ** sharp
    fade = math.cos(yaw / width * math.pi / 2) ** 0.5
    return depth * wave * fade


def yaw_at(s):
    """Reparte las columnas con más densidad por delante, que es donde están los mechones."""
    return math.pi * (0.55 * s + 0.45 * s**3)


def yaw_of(p):
    d = Vector(p) - BALL_CENTER
    return math.atan2(d.x, -d.y)


def pitch_of(p):
    d = (Vector(p) - BALL_CENTER).normalized()
    return math.asin(max(-1.0, min(1.0, d.z)))


def cap(name, bottom, lift, cols=80, rows=14, tuck=-0.015, mat=None, rim=0.012, triangles=2400):
    """
    Un casquete sobre la cabeza, de la curva `bottom(guiñada)` hasta la
    coronilla, a `lift(guiñada, cabeceo)` de la piel. Su borde se remete hacia
    `tuck` (dentro de la cabeza, para el pelo) y se redondea con un bisel, así
    que parece una pieza maciza sin serlo.
    """
    verts = []
    quads = []
    for j in range(-1, rows):
        for i in range(cols):
            yaw = yaw_at(-1 + 2 * i / cols)
            b = bottom(yaw)
            if j < 0:
                verts.append(ball_point(yaw, b, tuck))
                continue
            t = j / rows
            pitch = b + (math.pi / 2 - b) * (1 - (1 - t) ** 1.25)
            verts.append(ball_point(yaw, pitch, lift(yaw, pitch)))
    pole = len(verts)
    verts.append(ball_point(0, math.pi / 2, lift(0, math.pi / 2)))
    for j in range(rows):
        for i in range(cols):
            a = j * cols + i
            b = j * cols + (i + 1) % cols
            quads.append((a, b, b + cols, a + cols))
    last = rows * cols
    for i in range(cols):
        quads.append((last + i, last + (i + 1) % cols, pole))
    obj = mesh_object(name, verts, quads)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    if rim:
        bevel_rim(obj, rim, 55, 2)
    decimate(obj, triangles)
    shade_smooth(obj)
    if mat:
        paint(obj, mat)
    return obj


def hair_mat():
    return material("pelo", (0.35, 0.22, 0.14), 0.55)


def piece(obj, fit, front=None, **extras):
    """Anota cómo encaja la pieza en otras cabezas y hasta dónde baja por la frente."""
    obj["ajuste"] = fit
    if front is not None:
        obj["frente"] = round(front, 3)
    for key, value in extras.items():
        obj[key] = value
    return obj


def hair_cap(name, front, side, back, lift=0.035, volume=0.03, bangs=None, lift_fn=None, mat=None, **kw):
    """El casquete de pelo de casi todos los peinados; devuelve también su borde."""

    def bottom(yaw):
        return around(front, side, back, yaw) - (bangs(yaw) if bangs else 0.0)

    def height(yaw, pitch):
        return lift + volume * max(0.0, math.sin(pitch)) ** 2

    return cap(name, bottom, lift_fn or height, mat=mat or hair_mat(), **kw), bottom


def spread(count):
    """`count` direcciones repartidas por la esfera (espiral de Fibonacci), en guiñada y cabeceo."""
    golden = math.pi * (3 - math.sqrt(5))
    result = []
    for i in range(count):
        z = 1 - (i + 0.5) / count * 2
        yaw = (i * golden) % TAU - math.pi
        result.append((yaw, math.asin(z)))
    return result


def build_hair():
    mat = hair_mat()
    tie = fixed("goma", (0.95, 0.3, 0.45), 0.4)
    shaved = material("pelo.rapado", (0.35, 0.3, 0.28), 0.85)

    # Corto: tres mechones redondos en la frente y raya al lado.
    def parting(yaw, pitch):
        base = 0.035 + 0.035 * max(0.0, math.sin(pitch)) ** 2
        return base - 0.018 * math.exp(-(((yaw - 0.42) / 0.06) ** 2)) * (1 if pitch > 0.5 else 0.0)

    obj, bottom = hair_cap("pelo.corto", 0.44, 0.05, -0.42, bangs=lambda y: locks(y, 3, 0.8, 0.14), lift_fn=parting)
    piece(obj, "radial", bottom(0.3))

    # Flequillo recto hasta las cejas.
    obj, bottom = hair_cap(
        "pelo.flequillo", 0.24, -0.08, -0.5, lift=0.04, bangs=lambda y: locks(y, 5, 0.95, 0.06, 0.7)
    )
    piece(obj, "radial", bottom(0.3))

    # Pinchos: casquete corto y pinchos gordos que se curvan hacia atrás.
    base, bottom = hair_cap(
        "pelo.pinchos", 0.46, 0.08, -0.35, lift=0.03, volume=0.02, bangs=lambda y: locks(y, 4, 0.8, 0.09, 0.3)
    )
    spikes = []
    for i, (yaw, pitch, length) in enumerate(
        [
            (0.0, 0.7, 0.36),
            (0.62, 0.72, 0.33),
            (-0.62, 0.72, 0.33),
            (0.3, 1.15, 0.36),
            (-0.35, 1.1, 0.36),
            (1.3, 0.75, 0.32),
            (-1.3, 0.75, 0.32),
            (2.1, 0.7, 0.3),
            (-2.1, 0.7, 0.3),
            (math.pi, 0.8, 0.3),
        ]
    ):
        root = ball_point(yaw, pitch, -0.03)
        out = direction(yaw, pitch)
        tip = root + (out + Vector((0, 0.4, 0.6))).normalized() * length
        points = bezier(root, root + out * length * 0.5, tip, 3)
        spikes.append(tube(f"pincho{i}", points, [0.15, 0.115, 0.06, 0.012]))
    obj = join([base, *spikes], "pelo.pinchos")
    paint(obj, mat)
    piece(finish(obj, 3200), "radial", bottom(0.3))

    # Tupé: un tupé enorme que se levanta sobre la frente.
    def quiff(yaw, pitch):
        base = 0.035 + 0.03 * max(0.0, math.sin(pitch)) ** 2
        bump = math.exp(-((yaw / 0.75) ** 2)) * math.exp(-(((pitch - 0.82) / 0.42) ** 2))
        return base + 0.2 * bump

    obj, bottom = hair_cap("pelo.tupe", 0.46, 0.05, -0.4, lift_fn=quiff, bangs=lambda y: locks(y, 2, 0.5, 0.05))
    piece(obj, "radial", bottom(0.3))

    # Afro: una nube de bultos redondos.
    lobes = [direction(yaw, pitch) for yaw, pitch in spread(26)]

    def cloud(yaw, pitch):
        d = direction(yaw, pitch)
        bump = max(math.exp(-(((d - p).length / 0.42) ** 2)) for p in lobes)
        return 0.13 + 0.09 * bump

    obj, bottom = hair_cap("pelo.afro", 0.55, -0.25, -0.55, lift_fn=cloud, rows=20, tuck=0.0, triangles=3200)
    piece(obj, "radial", bottom(0.3))

    # Melena: media melena con flequillo, que se abre en campana.
    def bob_bottom(yaw):
        edge = 0.34 - locks(yaw, 5, 0.7, 0.04, 0.8)
        drop = (1 - math.cos(min(1.0, max(0.0, (abs(yaw) - 0.72) / 0.32)) * math.pi)) / 2
        return edge + (-0.98 - edge) * drop

    def bob_lift(yaw, pitch):
        return 0.04 + 0.03 * max(0.0, math.sin(pitch)) ** 2 + max(0.0, -pitch) * 0.12

    obj = cap("pelo.melena", bob_bottom, bob_lift, rows=18, mat=mat, triangles=2800)
    piece(obj, "radial", bob_bottom(0.3))

    # Coleta: casquete peinado hacia atrás y la coleta con su goma.
    base, bottom = hair_cap("pelo.coleta", 0.48, 0.02, -0.3, bangs=lambda y: locks(y, 2, 0.4, 0.04))
    root = ball_point(math.pi, 0.72, 0.02)
    tail = tube(
        "coleta.cola",
        bezier(root, root + Vector((0, 0.3, 0.02)), root + Vector((0, 0.34, -0.5)), 5),
        [0.085, 0.11, 0.115, 0.1, 0.07, 0.02],
    )
    band = torus(
        "coleta.goma", 0.075, 0.028, location=root + Vector((0, 0.07, 0.0)), rotation=(math.pi / 2 - 0.2, 0, 0), segments=24, sides=8
    )
    hair = join([base, tail], "pelo.coleta")
    paint(hair, mat)
    paint(band, tie)
    obj = join([hair, band], "pelo.coleta")
    piece(finish(obj, 3000), "radial", bottom(0.3))

    # Moño en lo alto.
    base, bottom = hair_cap("pelo.moño", 0.46, 0.02, -0.35, bangs=lambda y: locks(y, 2, 0.45, 0.04))
    bun_at = ball_point(math.pi, 1.2, 0.12)
    bun = sphere("moño.bola", 1.0, 32, 18, location=bun_at, scale=(0.17, 0.17, 0.15))
    band = torus("moño.goma", 0.14, 0.025, location=bun_at + Vector((0, 0.03, -0.1)), rotation=(0.25, 0, 0), segments=32, sides=8)
    hair = join([base, bun], "pelo.moño")
    paint(hair, mat)
    paint(band, tie)
    obj = join([hair, band], "pelo.moño")
    piece(finish(obj, 3000), "radial", bottom(0.3))

    # Coletas a los lados, con raya en medio.
    def center_part(yaw, pitch):
        base = 0.035 + 0.025 * max(0.0, math.sin(pitch)) ** 2
        return base - 0.02 * math.exp(-((yaw / 0.05) ** 2)) * (1 if pitch > 0.45 else 0.0)

    base, bottom = hair_cap("pelo.coletas", 0.42, 0.0, -0.4, lift_fn=center_part, bangs=lambda y: locks(y, 4, 0.8, 0.05))
    parts = [base]
    bands = []
    for sx in (-1, 1):
        root = ball_point(sx * 1.75, 0.3, 0.02)
        tip = root + Vector((sx * 0.26, 0.04, -0.4))
        points = bezier(root, root + Vector((sx * 0.25, 0.04, 0.02)), tip, 5)
        parts.append(tube(f"coletas.cola{sx}", points, [0.08, 0.1, 0.1, 0.085, 0.06, 0.02]))
        bands.append(
            torus(f"coletas.goma{sx}", 0.07, 0.025, location=root + Vector((sx * 0.06, 0, 0)), rotation=(0, math.pi / 2, 0), segments=24, sides=8)
        )
    hair = join(parts, "pelo.coletas")
    paint(hair, mat)
    ties = join(bands, "coletas.gomas")
    paint(ties, tie)
    obj = join([hair, ties], "pelo.coletas")
    piece(finish(obj, 3200), "radial", bottom(0.3))

    # Cresta: los lados rapados y una fila de pinchos de la frente a la nuca.
    base, bottom = hair_cap("pelo.cresta", 0.5, 0.1, -0.35, lift=0.01, volume=0.0, mat=shaved, rim=0.006)
    fins = []
    for i, p in enumerate([0.55, 0.85, 1.15, 1.45, 1.75, 2.05, 2.35, 2.62]):
        yaw, pitch = (0.0, p) if p <= math.pi / 2 else (math.pi, math.pi - p)
        root = ball_point(yaw, pitch, -0.01)
        out = direction(yaw, pitch)
        length = 0.26 + 0.1 * math.sin(i / 7 * math.pi)
        tip = root + (out + Vector((0, 0.3, 0.25))).normalized() * length
        fins.append(tube(f"cresta{i}", bezier(root, root + out * length * 0.5, tip, 3), [0.12, 0.09, 0.05, 0.01]))
    crest = join(fins, "cresta.pinchos")
    for v in crest.data.vertices:
        v.co.x *= 0.7
    paint(crest, mat)
    obj = join([base, crest], "pelo.cresta")
    piece(finish(obj, 3200), "radial", bottom(0.3))

    # Rizos: un casquete de bolitas.
    base, bottom = hair_cap("pelo.rizos", 0.46, 0.02, -0.38, lift=0.03, volume=0.02, rim=0.008)
    curls = []
    for k, (yaw, pitch) in enumerate(spread(70)):
        if pitch < around(0.5, 0.08, -0.32, yaw):
            continue
        curls.append(sphere(f"rizo{k}", 0.1, 10, 7, location=ball_point(yaw, pitch, 0.06)))
    hair = join([base, *curls], "pelo.rizos")
    paint(hair, mat)
    piece(finish(hair, 3600), "radial", bottom(0.3) - 0.08)

    # Rapado: una sombra de pelo.
    obj, bottom = hair_cap(
        "pelo.rapado", 0.52, 0.1, -0.35, lift=0.012, volume=0.0, mat=shaved, rim=0.005, tuck=-0.01
    )
    piece(obj, "radial", bottom(0.3))

    # Tres pelos, como quien tiene poco que peinar.
    strands = []
    for i, lean in enumerate((-0.35, 0.0, 0.35)):
        root = ball_point(lean * 0.4, math.pi / 2 - 0.22, -0.01)
        tip = root + Vector((lean * 0.3, 0.03, 0.26))
        mid = root + Vector((lean * 0.05 + (0.1 if i == 1 else 0), 0, 0.2))
        strands.append(tube(f"hebra{i}", bezier(root, mid, tip, 6), [0.016] * 6 + [0.006], levels=1))
    obj = join(strands, "pelo.tres-pelos")
    paint(obj, material("pelo.negro", (0.05, 0.04, 0.05), 0.5))
    piece(obj, "radial")


# ---------------------------------------------------------------------------
# Gorros
# ---------------------------------------------------------------------------


def dome(name, front, side, back, lift, mat, **kw):
    """La cúpula de gorras, gorros de lana y cascos: un casquete que no se remete en la cabeza."""

    def bottom(yaw):
        return around(front, side, back, yaw)

    lift_fn = lift if callable(lift) else (lambda yaw, pitch: lift)
    return cap(name, bottom, lift_fn, mat=mat, tuck=kw.pop("tuck", 0.0), **kw), bottom


def visor(name, bottom, lift, width=0.95, length=0.27, droop=0.06):
    """La visera de una gorra: una lengua curva que sale del borde de la cúpula."""
    cols, rows = 28, 6
    verts = []
    for i in range(cols + 1):
        yaw = -width + 2 * width * i / cols
        base = ball_point(yaw, bottom(yaw), lift - 0.01)
        out = Vector((math.sin(yaw), -math.cos(yaw), 0)).normalized()
        reach = length * math.sqrt(max(0.0, 1 - (yaw / width) ** 2)) ** 0.8
        for j in range(rows + 1):
            s = j / rows
            verts.append(base + out * reach * s + Vector((0, 0, -droop * s * s - 0.05 * (yaw / width) ** 2 * s)))
    quads = [
        (i * (rows + 1) + j, (i + 1) * (rows + 1) + j, (i + 1) * (rows + 1) + j + 1, i * (rows + 1) + j + 1)
        for i in range(cols)
        for j in range(rows)
    ]
    obj = mesh_object(name, verts, quads)
    modifier(obj, "SOLIDIFY", thickness=0.024, offset=0.0, use_even_offset=True)
    bake(obj)
    return shade_smooth(bevel_rim(obj, 0.009, 50, 2))


def rigid(obj, sink=0.0, **extras):
    """Una pieza que no se deforma: en otras cabezas se sube a la coronilla y se escala."""
    return piece(obj, "rigido", ancla=list(top_of_ball(-sink)), **extras)


def build_hats():
    main = material("gorro", (0.3, 0.55, 0.9), 0.75)
    second = material("gorro.2", (0.95, 0.85, 0.3), 0.75)
    white = fixed("blanco", (0.95, 0.95, 0.92), 0.8)
    black = fixed("negro", (0.08, 0.07, 0.1), 0.45)
    red = fixed("rojo", (0.85, 0.17, 0.15), 0.35)
    gold = fixed("oro", (1.0, 0.76, 0.25), 0.3)
    sapphire = fixed("zafiro", (0.15, 0.35, 0.9), 0.15)
    grey = fixed("gris", (0.6, 0.6, 0.62), 0.4)
    brown = fixed("marron", (0.3, 0.18, 0.1), 0.7)
    metal = fixed("metal", (0.62, 0.65, 0.7), 0.3)

    # Gorra: cúpula, visera y botón.
    crown, bottom = dome("gorra.cupula", 0.52, 0.3, 0.1, lambda y, p: 0.05 + 0.015 * max(0.0, math.sin(p)), main)
    brim = paint(visor("gorra.visera", bottom, 0.05, 0.95, 0.34, 0.09), second)
    button = paint(sphere("gorra.boton", 1.0, 16, 8, location=top_of_ball(0.055), scale=(0.045, 0.045, 0.025)), second)
    piece(finish(join([crown, brim, button], "gorro.gorra"), 3200), "radial", 0.52)

    # Gorro de lana: vuelta gruesa y pompón.
    def knit_bottom(yaw):
        return around(0.4, 0.15, -0.1, yaw)

    def knit(yaw, pitch):
        fold = knit_bottom(yaw) + 0.2
        cuff = 0.03 * (1 - 1 / (1 + math.exp(-(pitch - fold) * 40)))
        return 0.065 + cuff + 0.02 * max(0.0, math.sin(pitch)) ** 2

    body, _ = dome("gorro.cuerpo", 0.4, 0.15, -0.1, knit, main, rows=18)
    paint_by(body, [main, second], lambda c: 1 if pitch_of(c) < knit_bottom(yaw_of(c)) + 0.2 else 0)
    ball_at = top_of_ball(0.16) + Vector((0, 0.03, 0))
    pompom = sphere("gorro.pompon", 1.0, 18, 10, location=ball_at)
    for v in pompom.data.vertices:
        d = (Vector(v.co) - ball_at).normalized()
        v.co = ball_at + d * (0.12 + 0.015 * noise.noise(d * 6))
    paint(pompom, second)
    piece(join([body, pompom], "gorro.gorro"), "radial", 0.4)

    # Chistera, un pelín ladeada.
    base = top_of_ball(-0.05)
    brim = lathe("chistera.ala", [(0.22, -0.01), (0.46, -0.005), (0.52, 0.015), (0.545, 0.05)], 64)
    modifier(brim, "SOLIDIFY", thickness=0.022, offset=0)
    bake(brim)
    tower = lathe("chistera.tubo", [(0.29, 0.0), (0.285, 0.25), (0.31, 0.47), (0.3, 0.495), (0.0, 0.5)], 64)
    band = lathe("chistera.cinta", [(0.296, 0.012), (0.295, 0.11)], 64)
    modifier(band, "SOLIDIFY", thickness=0.012, offset=1)
    bake(band)
    hat = join([brim, tower], "chistera")
    bevel_rim(hat, 0.012, 50, 2)
    paint(shade_smooth(hat), black)
    paint(shade_smooth(band), main)
    obj = join([hat, band], "gorro.chistera")
    transform(obj, Matrix.Translation(base) @ Matrix.Rotation(-0.12, 4, "Y"))
    rigid(obj, 0.05)

    # Sombrero vaquero: ala que se levanta por los lados y copa hundida.
    base = top_of_ball(-0.1)
    brim = lathe("vaquero.ala", [(0.2, 0.0), (0.45, -0.005), (0.62, 0.03), (0.7, 0.1)], 72)
    displace(brim, lambda p: Vector((p.x, p.y * 0.84, p.z + 0.12 * (abs(p.x) / 0.7) ** 3 - 0.02 * (abs(p.y) / 0.6) ** 2)))
    crown = lathe("vaquero.copa", [(0.35, 0.0), (0.345, 0.18), (0.29, 0.3), (0.2, 0.34), (0.08, 0.31), (0.0, 0.3)], 56)
    displace(crown, lambda p: Vector((p.x, p.y * 0.9, p.z - (0.06 * math.exp(-((p.x / 0.08) ** 2)) if p.z > 0.2 else 0))))
    hat = join([brim, crown], "vaquero")
    modifier(hat, "SOLIDIFY", thickness=0.022, offset=0)
    bake(hat)
    bevel_rim(hat, 0.01, 55, 2)
    band = lathe("vaquero.cinta", [(0.352, 0.015), (0.35, 0.075)], 56)
    displace(band, lambda p: Vector((p.x * 1.03, p.y * 0.93, p.z)))
    modifier(band, "SOLIDIFY", thickness=0.012, offset=1)
    bake(band)
    paint(shade_smooth(hat), main)
    paint(shade_smooth(band), brown)
    obj = join([hat, band], "gorro.vaquero")
    transform(obj, Matrix.Translation(base))
    rigid(obj, 0.1)

    # Gorro de pescador.
    obj = lathe(
        "gorro.pescador",
        [(0.64, -0.12), (0.58, -0.07), (0.48, 0.02), (0.47, 0.1), (0.44, 0.24), (0.36, 0.33), (0.2, 0.37), (0.0, 0.38)],
        64,
    )
    displace(obj, lambda p: Vector((p.x, p.y * 0.95, p.z)) + BALL_CENTER + Vector((0, 0.01, 0.22)))
    modifier(obj, "SOLIDIFY", thickness=0.022, offset=0)
    bake(obj)
    bevel_rim(obj, 0.01, 55, 2)
    band_z = BALL_CENTER.z + 0.22
    paint_by(
        shade_smooth(obj),
        [main, second],
        lambda c: 1 if band_z + 0.03 < c.z < band_z + 0.11 and Vector((c.x, c.y)).length > 0.43 else 0,
    )
    rigid(obj, 0.2)

    # Sombrero de bruja: cono doblado hacia atrás.
    base = top_of_ball(-0.12)
    cone = lathe("bruja.cono", [(0.33, 0.0), (0.25, 0.25), (0.15, 0.5), (0.06, 0.72), (0.0, 0.85)], 48)
    displace(cone, lambda p: Vector((p.x, p.y + 0.38 * (p.z / 0.85) ** 2.2, p.z - 0.08 * (p.z / 0.85) ** 3)))
    brim = lathe("bruja.ala", [(0.25, 0.0), (0.55, -0.01), (0.74, -0.05)], 72)
    for part in (cone, brim):
        modifier(part, "SOLIDIFY", thickness=0.02, offset=0)
        bake(part)
    band = lathe("bruja.cinta", [(0.325, 0.01), (0.3, 0.09)], 48)
    modifier(band, "SOLIDIFY", thickness=0.012, offset=1)
    bake(band)
    hat = join([cone, brim], "bruja")
    bevel_rim(hat, 0.01, 55, 2)
    paint(shade_smooth(hat), fixed("morado", (0.24, 0.14, 0.34), 0.8))
    buckle = torus("bruja.hebilla", 0.045, 0.012, location=(0, -0.33, 0.05), rotation=(math.pi / 2, 0, 0), segments=4, sides=6)
    paint(shade_smooth(band), main)
    paint(buckle, gold)
    obj = join([hat, band, buckle], "gorro.bruja")
    transform(obj, Matrix.Translation(base))
    rigid(obj, 0.12)

    # Seta: sombrero rojo con lunares.
    top = sphere("seta.sombrero", 1.0, 48, 20, scale=(0.84, 0.84, 0.56))
    keep(top, lambda co: co.z >= -0.06)
    modifier(top, "SOLIDIFY", thickness=0.05, offset=-1)
    bake(top)
    bevel_rim(top, 0.02, 50, 3)
    paint(shade_smooth(top), red)
    spots = []
    for k, (yaw, pitch, size) in enumerate(
        [
            (0, 0.75, 0.14),
            (1.2, 0.42, 0.12),
            (-1.1, 0.5, 0.13),
            (2.4, 0.6, 0.14),
            (-2.3, 0.4, 0.12),
            (0.6, 1.25, 0.1),
            (-0.55, 0.28, 0.1),
            (math.pi, 1.05, 0.12),
        ]
    ):
        d = direction(yaw, pitch)
        at = Vector((d.x * 0.84, d.y * 0.84, d.z * 0.56))
        normal = Vector((d.x / 0.84, d.y / 0.84, d.z / 0.56)).normalized()
        spot = sphere(f"seta.lunar{k}", 1.0, 14, 6, scale=(size, size, 0.03))
        rotation = Vector((0, 0, 1)).rotation_difference(normal).to_matrix().to_4x4()
        transform(spot, Matrix.Translation(at) @ rotation)
        spots.append(paint(spot, fixed("crema", (0.97, 0.94, 0.86), 0.5)))
    obj = join([top, *spots], "gorro.seta")
    displace(obj, lambda p: p + BALL_CENTER + Vector((0, 0.02, 0.2)))
    rigid(obj, 0.25)

    # Capuchas de disfraz, abiertas por la cara: cangrejo y rana.
    def hood_bottom(yaw):
        t = min(1.0, max(0.0, (abs(yaw) - 0.92) / 0.4))
        return 0.56 + (-1.05 - 0.56) * (1 - math.cos(t * math.pi)) / 2

    def hood_lift(yaw, pitch):
        return 0.075 + 0.02 * max(0.0, math.sin(pitch))

    for kind, color in (("cangrejo", (0.9, 0.25, 0.18)), ("rana", (0.45, 0.8, 0.3))):
        skin = fixed(kind, color, 0.85)
        hood = cap(f"{kind}.capucha", hood_bottom, hood_lift, rows=18, tuck=0.0, rim=0.018, mat=skin, triangles=2600)
        parts = []
        eyes_at = []
        if kind == "cangrejo":
            for sx in (-1, 1):
                root = ball_point(sx * 1.05, 0.85, 0.05)
                elbow = root + Vector((sx * 0.18, 0.0, 0.14))
                hand = elbow + Vector((sx * 0.02, -0.02, 0.16))
                parts.append(tube(f"{kind}.brazo{sx}", [root, elbow, hand], [0.055, 0.045, 0.05]))
                for jaw in (-1, 1):
                    claw = sphere(f"{kind}.pinza{sx}{jaw}", 1.0, 14, 8, scale=(0.05, 0.05, 0.13))
                    transform(
                        claw,
                        Matrix.Translation(hand + Vector((sx * 0.035 * jaw, 0, 0.11))) @ Matrix.Rotation(-sx * jaw * 0.35, 4, "Y"),
                    )
                    parts.append(claw)
                stalk = ball_point(sx * 0.3, 1.0, 0.05)
                parts.append(tube(f"{kind}.tallo{sx}", [stalk, stalk + Vector((sx * 0.03, -0.02, 0.14))], [0.032, 0.028]))
                eyes_at.append((stalk + Vector((sx * 0.035, -0.03, 0.19)), 0.065))
        else:
            for sx in (-1, 1):
                at = ball_point(sx * 0.42, 0.92, 0.12)
                parts.append(sphere(f"{kind}.bulto{sx}", 0.13, 18, 10, location=at))
                eyes_at.append((at + Vector((0, -0.06, 0.03)), 0.1))
        for part in parts:
            paint(part, skin)
        eyes = []
        for k, (at, r) in enumerate(eyes_at):
            eyes.append(paint(sphere(f"{kind}.ojo{k}", r, 18, 12, location=at), fixed("ojo", (0.97, 0.97, 0.95), 0.15)))
            pupil = sphere(f"{kind}.pupila{k}", r * 0.55, 12, 8, location=at + Vector((0, -r * 0.72, 0.01)), scale=(1, 0.45, 1))
            eyes.append(paint(pupil, black))
        piece(finish(join([hood, *parts, *eyes], f"gorro.{kind}"), 4200), "radial", 0.56)

    # Cono de obra, torcido, como si alguien lo hubiera dejado ahí.
    base = top_of_ball(-0.08)
    foot = cylinder("cono.pie", 0.37, 0.045, 4, location=(0, 0, 0.0225))
    turn(foot, math.pi / 4, "Z")
    bevel_rim(foot, 0.02, 40, 2)
    body = lathe("cono.cuerpo", [(0.26, 0.04), (0.035, 0.64), (0.0, 0.65)], 40)
    orange = fixed("naranja", (1.0, 0.42, 0.06), 0.4)
    paint(shade_smooth(foot, 40), orange)
    paint_by(body, [orange, white], lambda c: 1 if 0.2 < c.z < 0.3 or 0.4 < c.z < 0.48 else 0)
    obj = join([foot, body], "gorro.cono")
    transform(obj, Matrix.Translation(base) @ Matrix.Rotation(0.16, 4, "Y"))
    rigid(obj, 0.08)

    # Corona.
    base = top_of_ball(-0.06)
    ring = lathe("corona.aro", [(0.27, 0.0), (0.26, 0.13)], 48)
    modifier(ring, "SOLIDIFY", thickness=0.02)
    bake(ring)
    spikes = []
    for i in range(6):
        a = i / 6 * TAU
        root = Vector((math.cos(a) * 0.262, math.sin(a) * 0.262, 0.08))
        tip = Vector((math.cos(a) * 0.275, math.sin(a) * 0.275, 0.24))
        spikes.append(tube(f"corona.punta{i}", [root, tip], [0.06, 0.012], levels=1))
        spikes.append(sphere(f"corona.bola{i}", 0.026, 12, 8, location=tip + Vector((0, 0, 0.015))))
    crown = join([shade_smooth(ring), *spikes], "corona")
    paint(crown, gold)
    gems = []
    for i in range(6):
        a = i / 6 * TAU + math.pi / 6
        gem = sphere(f"corona.gema{i}", 0.032, 14, 8, location=(math.cos(a) * 0.282, math.sin(a) * 0.282, 0.06))
        gems.append(paint(gem, fixed("rubi", (0.85, 0.1, 0.2), 0.15) if i % 2 else sapphire))
    obj = join([crown, *gems], "gorro.corona")
    transform(obj, Matrix.Translation(base) @ Matrix.Rotation(0.08, 4, "Y"))
    rigid(obj, 0.06)

    # Gorro de fiesta, ladeado, con rayas y pompón.
    base = top_of_ball(-0.02)
    cone = lathe("fiesta.cono", [(0.2, 0.0), (0.1, 0.24), (0.0, 0.48)], 40)
    paint_by(cone, [main, second], lambda c: 1 if int((c.z + 0.02) / 0.08) % 2 else 0)
    tip = Vector((0, 0, 0.5))
    pompom = sphere("fiesta.pompon", 0.065, 16, 10, location=tip)
    for v in pompom.data.vertices:
        d = (Vector(v.co) - tip).normalized()
        v.co = tip + d * (0.065 + 0.01 * noise.noise(d * 5))
    paint(pompom, white)
    obj = join([cone, pompom], "gorro.fiesta")
    transform(obj, Matrix.Translation(base + Vector((0.08, 0, 0))) @ Matrix.Rotation(-0.3, 4, "Y"))
    rigid(obj, 0.02)

    # Gorra de hélice: cuatro gajos de colores. La hélice va aparte, para que gire.
    crown, bottom = dome("helice.cupula", 0.52, 0.3, 0.1, 0.05, main)
    paint_by(crown, [main, second], lambda c: int((yaw_of(c) + math.pi) / (math.pi / 2) + 0.5) % 2)
    brim = paint(visor("helice.visera", bottom, 0.05, 0.8, 0.2, 0.04), main)
    stem = paint(cylinder("helice.eje", 0.018, 0.13, 10, location=top_of_ball(0.1)), grey)
    piece(finish(join([crown, brim, stem], "gorro.helice"), 3200), "radial", 0.52)
    hub = top_of_ball(0.16)
    blades = []
    for sx in (-1, 1):
        blade = sphere(f"helice.aspa{sx}", 1.0, 20, 8, location=(sx * 0.15, 0, 0), scale=(0.15, 0.05, 0.012))
        turn(blade, 0.25 * sx, "X")
        blades.append(paint(blade, red if sx > 0 else sapphire))
    hub_cap = paint(sphere("helice.buje", 0.028, 12, 8), grey)
    propeller = join([*blades, hub_cap], "gorro.helice.aspas")
    transform(propeller, Matrix.Translation(hub))
    piece(propeller, "radial", eje=list(hub))

    # Casco vikingo con cuernos.
    helmet, band_bottom = dome("vikingo.casco", 0.5, 0.22, 0.12, lambda y, p: 0.06 + 0.02 * max(0.0, math.sin(p)), metal)
    paint_by(
        helmet,
        [metal, brown],
        lambda c: 1 if pitch_of(c) < band_bottom(yaw_of(c)) + 0.12 or abs(yaw_of(c)) < 0.05 else 0,
    )
    horns = []
    for sx in (-1, 1):
        root = ball_point(sx * 1.45, 0.62, 0.02)
        points = bezier(root, root + Vector((sx * 0.3, 0.0, 0.02)), root + Vector((sx * 0.38, -0.05, 0.36)), 6)
        horns.append(tube(f"vikingo.cuerno{sx}", points, [0.085, 0.08, 0.07, 0.055, 0.04, 0.025, 0.008]))
    horn = join(horns, "vikingo.cuernos")
    paint(horn, fixed("hueso", (0.95, 0.9, 0.78), 0.4))
    piece(finish(join([helmet, horn], "gorro.vikingo"), 3400), "radial", 0.5)

    # Gorro de cocinero: cinta y un buen soufflé plisado.
    band = lathe("cocinero.cinta", [(0.44, 0.0), (0.45, 0.2)], 56)
    modifier(band, "SOLIDIFY", thickness=0.02, offset=1)
    bake(band)
    puff = lathe(
        "cocinero.soufle",
        [(0.42, 0.18), (0.5, 0.3), (0.56, 0.46), (0.54, 0.58), (0.44, 0.66), (0.26, 0.7), (0.0, 0.71)],
        72,
        wobble=lambda a, j: 1 + (0.05 if 0 < j < 6 else 0) * math.cos(a * 9),
    )
    obj = join([band, puff], "gorro.cocinero")
    bevel_rim(obj, 0.012, 55, 2)
    transform(obj, Matrix.Translation(BALL_CENTER + Vector((0, 0.02, 0.26))))
    paint(shade_smooth(obj), white)
    rigid(obj, 0.3)

    # Gorro de trampero: cúpula con orejeras y el borreguito por delante.
    def flaps(yaw):
        flap = math.exp(-(((abs(yaw) - 1.6) / 0.38) ** 2))
        return around(0.52, 0.25, -0.05, yaw) - 0.95 * flap

    fur = fixed("borrego", (0.95, 0.9, 0.8), 0.95)
    shell = cap(
        "trampero.cupula", flaps, lambda y, p: 0.07 + 0.02 * max(0.0, math.sin(p)), rows=18, tuck=0.0, rim=0.02, mat=main
    )
    roll = [ball_point(yaw, flaps(yaw) + 0.1, 0.1) for yaw in (-1.15 + i / 14 * 2.3 for i in range(15))]
    roll = paint(tube("trampero.borrego", roll, [0.1] * len(roll)), fur)
    piece(finish(join([shell, roll], "gorro.trampero"), 3400), "radial", 0.52)

    # Orejas de gato con diadema.
    band = torus(
        "orejas.aro",
        0.475,
        0.022,
        location=BALL_CENTER + Vector((0, 0.04, 0.0)),
        rotation=(math.pi / 2, 0, 0),
        segments=64,
        sides=10,
        scale=(1.02, 1.0, 1.0),
    )
    keep(band, lambda co: co.z >= BALL_CENTER.z - 0.12)
    paint(band, black)
    ears = []
    for sx in (-1, 1):
        at = ball_point(sx * 1.2, 0.95, 0.0)
        outer = cylinder(f"orejas.oreja{sx}", 0.18, 0.3, 3, radius2=0.015, location=(0, 0, 0.15))
        inner = cylinder(f"orejas.dentro{sx}", 0.11, 0.2, 3, radius2=0.012, location=(0, -0.06, 0.11))
        for ear in (outer, inner):
            transform(ear, Matrix.Diagonal((1, 0.5, 1, 1)))
            bevel_rim(ear, 0.02 if ear is outer else 0.012, 30, 3)
            transform(
                ear,
                Matrix.Translation(at)
                @ Matrix.Rotation(-sx * 0.28, 4, "Y")
                @ Matrix.Rotation(-0.1, 4, "X")
                @ Matrix.Rotation(math.pi / 2, 4, "Z"),
            )
        ears += [paint(shade_smooth(outer), main), paint(shade_smooth(inner), fixed("rosa", (1.0, 0.62, 0.72), 0.7))]
    piece(join([band, *ears], "gorro.orejas"), "radial")

    # Auriculares.
    band = torus(
        "auriculares.arco",
        0.51,
        0.035,
        location=BALL_CENTER + Vector((0, 0.02, 0.0)),
        rotation=(math.pi / 2, 0, 0),
        segments=64,
        sides=10,
        scale=(1.02, 1.0, 1.02),
    )
    keep(band, lambda co: co.z >= BALL_CENTER.z - 0.05)
    paint(band, black)
    cups = []
    for sx in (-1, 1):
        cup = lathe(
            f"auriculares.copa{sx}",
            [(0.0, -0.06), (0.13, -0.06), (0.15, -0.03), (0.15, 0.03), (0.12, 0.06), (0.0, 0.065)],
            40,
        )
        transform(cup, Matrix.Translation(BALL_CENTER + Vector((sx * 0.5, 0.02, -0.03))) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        cups.append(paint(cup, main))
    piece(join([band, *cups], "gorro.auriculares"), "radial")

    # Aureola: flota sobre la cabeza.
    halo = torus("gorro.aureola", 0.25, 0.035, location=top_of_ball(0.24), rotation=(-0.18, 0, 0), segments=48, sides=12)
    paint(halo, fixed("luz", (1.0, 0.9, 0.45), 0.3))
    rigid(halo, 0.0, flota=True)

    # Cuernos de diablo.
    horns = []
    for sx in (-1, 1):
        root = ball_point(sx * 0.62, 1.0, -0.01)
        points = bezier(root, root + Vector((sx * 0.02, -0.02, 0.14)), root + Vector((sx * 0.12, 0.02, 0.2)), 4)
        horns.append(tube(f"cuernos.cuerno{sx}", points, [0.07, 0.06, 0.045, 0.025, 0.006]))
    obj = join(horns, "gorro.cuernos")
    paint(obj, red)
    piece(obj, "radial")

    # Flor en el pelo.
    petals = []
    for i in range(5):
        a = i / 5 * TAU
        center = Vector((math.cos(a) * 0.1, 0, math.sin(a) * 0.1))
        petal = sphere(f"flor.petalo{i}", 1.0, 16, 8, location=center, scale=(0.1, 0.03, 0.065))
        turn(petal, -a, "Y", center)
        petals.append(paint(petal, second))
    middle = paint(sphere("flor.centro", 0.06, 14, 10, location=(0, -0.025, 0)), fixed("amarillo", (1.0, 0.82, 0.25), 0.6))
    obj = join([*petals, middle], "gorro.flor")
    rotation = Vector((0, -1, 0)).rotation_difference(direction(0.95, 0.6)).to_matrix().to_4x4()
    transform(obj, Matrix.Translation(ball_point(0.95, 0.6, 0.05)) @ rotation)
    piece(obj, "radial")


# ---------------------------------------------------------------------------
# Cara: gafas y monóculo
# ---------------------------------------------------------------------------


def build_face_props():
    """
    Gafas y monóculo, con el origen entre los ojos (o en el ojo) y mirando a
    -Y. Los cristales están a ±0.15 en X: la web los escala a la separación de
    ojos que toque. Lo demás de la cara (ojos, cejas, nariz, bigote) se pinta.
    """
    black = fixed("negro", (0.08, 0.07, 0.1), 0.45)
    gold = fixed("oro", (1.0, 0.76, 0.25), 0.3)
    clear = fixed("vidrio", (0.85, 0.95, 1.0), 0.05)
    pink = fixed("corazon", (1.0, 0.25, 0.5), 0.2)

    def temples(name, mat, spread=0.26, back=0.42, z=0.02):
        parts = []
        for sx in (-1, 1):
            points = [
                Vector((sx * spread, 0.0, z)),
                Vector((sx * (spread + 0.08), back * 0.5, z)),
                Vector((sx * (spread + 0.1), back, z - 0.03)),
            ]
            parts.append(tube(f"{name}.patilla{sx}", points, [0.013] * 3, levels=1))
        return paint(join(parts, f"{name}.patillas"), mat)

    def bridge(name, width, rise, radius):
        points = [Vector((-width, 0, 0.02)), Vector((0, -0.01, 0.02 + rise)), Vector((width, 0, 0.02))]
        return tube(name, points, [radius] * 3, levels=1)

    # Gafas de sol: dos cristales anchos y oscuros con montura gruesa.
    lenses = [sphere(f"sol.cristal{sx}", 1.0, 24, 8, location=(sx * 0.15, 0, 0), scale=(0.125, 0.025, 0.09)) for sx in (-1, 1)]
    rims = [
        torus(f"sol.montura{sx}", 1.0, 0.1, location=(sx * 0.15, 0.005, 0), rotation=(math.pi / 2, 0, 0), segments=32, sides=6, scale=(0.13, 0.1, 0.13))
        for sx in (-1, 1)
    ]
    for rim in rims:
        for v in rim.data.vertices:
            v.co.z *= 0.72
    glass = paint(join(lenses, "sol.cristales"), fixed("cristal", (0.04, 0.04, 0.07), 0.05))
    frame = paint(join([*rims, bridge("sol.puente", 0.03, 0.01, 0.014)], "sol.montura"), black)
    join([glass, frame, temples("sol", black, 0.28)], "cara.gafas-sol")

    # Gafas redondas de empollón, doradas.
    rims = [torus(f"redondas.aro{sx}", 0.09, 0.012, location=(sx * 0.15, 0, 0), rotation=(math.pi / 2, 0, 0), segments=32, sides=6) for sx in (-1, 1)]
    lenses = [sphere(f"redondas.cristal{sx}", 1.0, 20, 6, location=(sx * 0.15, 0.004, 0), scale=(0.088, 0.006, 0.088)) for sx in (-1, 1)]
    frame = paint(join([*rims, bridge("redondas.puente", 0.06, 0.02, 0.01)], "redondas.montura"), gold)
    glass = paint(join(lenses, "redondas.cristales"), clear)
    join([frame, glass, temples("redondas", gold, 0.24)], "cara.gafas-redondas")

    # Gafas de corazones.
    hearts = []
    for sx in (-1, 1):
        outline = []
        for i in range(48):
            t = i / 48 * TAU
            x = 16 * math.sin(t) ** 3
            z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            outline.append(Vector((sx * 0.15 + x * 0.0068, 0, z * 0.0068 + 0.01)))
        verts = [Vector((sx * 0.15, 0, 0.0)), *outline]
        heart = mesh_object(f"corazon.cristal{sx}", verts, [(0, 1 + i, 1 + (i + 1) % 48) for i in range(48)])
        modifier(heart, "SOLIDIFY", thickness=0.03, offset=0)
        bake(heart)
        hearts.append(shade_smooth(bevel_rim(heart, 0.012, 40, 2)))
    heart = paint(join(hearts, "corazon.cristales"), pink)
    join([heart, paint(bridge("corazon.puente", 0.05, 0.015, 0.013), pink), temples("corazon", fixed("blanco", (0.95, 0.95, 0.92), 0.8), 0.27)], "cara.gafas-corazon")

    # Monóculo: aro dorado con su cristal y una cadenita que cuelga.
    rim = torus("monoculo.aro", 0.1, 0.014, rotation=(math.pi / 2, 0, 0), segments=40, sides=8)
    lens = sphere("monoculo.cristal", 1.0, 24, 8, location=(0, 0.004, 0), scale=(0.098, 0.006, 0.098))
    links = []
    for i in range(9):
        t = i / 8
        at = Vector((-0.08 * t - 0.07, 0.02 + 0.12 * t, -0.08 - 0.28 * t + 0.14 * t * t))
        links.append(torus(f"monoculo.eslabon{i}", 0.014, 0.004, location=at, rotation=(0, (i % 2) * math.pi / 2, 0), segments=10, sides=5))
    frame = paint(join([rim, *links], "monoculo.montura"), gold)
    join([frame, paint(lens, clear)], "cara.monoculo")


# ---------------------------------------------------------------------------
# El slime
# ---------------------------------------------------------------------------

#: El slime es una gominola cuya parte de arriba es la cabeza a esta escala:
#: así le valen los mismos gorros, los mismos pelos y la misma cara.
SLIME_SCALE = 1.35

#: Altura del centro de esa "cabeza" sobre el suelo.
SLIME_CENTER = Vector((0, 0, 0.63))


#: El perfil de la barriga, de abajo arriba: (altura, radio de lado). Por
#: encima del centro manda la cabeza; por debajo, esto: se ensancha hasta
#: apoyarse, y el canto del suelo va redondeado.
SLIME_BELLY = (
    (0.0, 0.0),
    (0.0, 0.34),
    (0.012, 0.47),
    (0.045, 0.55),
    (0.1, 0.6),
    (0.18, 0.615),
    (0.3, 0.588),
    (0.4, 0.545),
    (0.48, 0.5),
    (0.55, 0.472),
    (0.6, 0.46),
)


def build_slime():
    """
    El slime: una gota de gelatina, sin huesos. Se deforma entera en la web,
    en el sombreador (`jelly.ts`): se aplasta, se estira, tiembla y se
    retuerce. La parte de arriba es la cabeza de los muñecos a escala, con la
    cara de frente y el mismo mapa: le valen los mismos gorros, pelos y gafas.
    """
    center = SLIME_CENTER
    rx, ry, rz = (r * HEAD_SCALE * SLIME_SCALE for r in HEAD["radii"])
    depth = ry / rx
    # Anillos de abajo arriba: la barriga y, encima del centro, media cabeza.
    rings = list(SLIME_BELLY)
    steps = 14
    for i in range(steps + 1):
        a = i / steps * math.pi / 2
        rings.append((center.z + rz * math.sin(a), rx * math.cos(a)))
    segments = 64
    verts = []
    faces = []
    for z, r in rings:
        for k in range(segments):
            a = k / segments * TAU
            verts.append((r * math.cos(a), r * depth * math.sin(a), z))
    for j in range(len(rings) - 1):
        for k in range(segments):
            a = j * segments + k
            b = j * segments + (k + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    obj = mesh_object("baba", verts, faces)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    modifier(obj, "SUBSURF", levels=1)
    bake(obj)
    shade_smooth(obj)

    span = rx * 1.08
    uv = obj.data.uv_layers.new(name="cara")
    for poly in obj.data.polygons:
        front = poly.center.y < center.y
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co - center
            uv.data[li].uv = (0.5 + co.x / (2 * span), 0.5 + co.z / (2 * span)) if front else (0.01, 0.01)
    paint(obj, material("baba", (0.45, 0.85, 0.35), 0.3))

    # El mapa de radios se mide sobre la malla, desde el centro de la cabeza.
    bpy.context.view_layer.update()
    radii = []
    for j in range(MAP_PITCH):
        for i in range(MAP_YAW):
            d = direction(-math.pi + i / MAP_YAW * TAU, -math.pi / 2 + j / (MAP_PITCH - 1) * math.pi)
            hit, location, _, _ = obj.ray_cast(center, d)
            radii.append(round((location - center).length, 4) if hit else round(rx, 4))
    obj["centro"] = list(center)
    obj["cara"] = span
    obj["mapa"] = radii
    # A qué escala le quedan los gorros y los pelos de los muñecos.
    obj["escala"] = SLIME_SCALE

    return obj


# ---------------------------------------------------------------------------
# Vista previa y exportación
# ---------------------------------------------------------------------------


def preview(folder):
    """
    Fotos de comprobación con Workbench: muñecos montados y rejillas de pelos,
    gorros y piezas de la cara. Para revisar formas sin abrir la web.
    """
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_shadows = True
    shading.shadow_intensity = 0.35
    shading.show_cavity = True
    shading.cavity_type = "WORLD"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("mundo")
    scene.world = world
    world.color = (0.25, 0.2, 0.45)
    cam_data = bpy.data.cameras.new("camara")
    cam = link(bpy.data.objects.new("camara", cam_data))
    scene.camera = cam
    pieces = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
    for name, color in {"piel": (1.0, 0.8, 0.62), "cara": (1.0, 0.8, 0.62), "pelo": (0.33, 0.2, 0.12)}.items():
        mat = bpy.data.materials.get(name)
        if mat:
            mat.diffuse_color = (*color, 1)

    def shoot(name, show, location, target, lens=50):
        for obj in bpy.data.objects:
            obj.hide_render = obj.type == "MESH" and obj not in show
        cam.location = location
        cam.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        cam_data.lens = lens
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)

    def copy(name, at):
        src = pieces[name]
        obj = src.copy()
        obj.data = src.data.copy()
        obj.modifiers.clear()
        obj.parent = None
        link(obj)
        if obj.data.shape_keys:
            obj.shape_key_clear()
        obj.location = at
        return obj

    def dressed(at, top, sleeve, legs=0.95, shoes=0.9):
        """La ropa pintada por zonas, como en la web pero por caras (con dientes)."""
        obj = copy("cuerpo", at)
        mats = [
            material("prev.piel", (1.0, 0.8, 0.62), 0.6),
            material("prev.arriba", top, 0.8),
            material("prev.abajo", (0.25, 0.35, 0.6), 0.8),
            material("prev.zapato", (0.95, 0.95, 0.95), 0.5),
        ]
        uv = obj.data.uv_layers["zonas"].data

        def pick(poly):
            u = sum(uv[i].uv.x for i in poly.loop_indices) / poly.loop_total
            v = sum(uv[i].uv.y for i in poly.loop_indices) / poly.loop_total
            if v > shoes:
                return 3
            if v > 0:
                return 2 if v < legs else 0
            if u > 1.0:
                return 0
            if u > 0:
                return 1 if u < sleeve else 0
            if poly.center.z < WAIST:
                return 2
            return 1 if poly.center.z < NECKLINE else 0

        obj.data.materials.clear()
        for mat in mats:
            obj.data.materials.append(mat)
        for poly in obj.data.polygons:
            poly.material_index = pick(poly)
        return obj

    shown = []
    looks = [
        ("pelo.corto", (0.9, 0.3, 0.35), 0.45),
        ("pelo.coletas", (0.3, 0.7, 0.4), 0.95),
        ("gorro.gorra", (0.95, 0.8, 0.2), 0.0),
        ("pelo.afro", (0.5, 0.4, 0.9), 0.45),
        ("pelo.melena", (0.2, 0.7, 0.8), 0.95),
    ]
    for i, (extra, top, sleeve) in enumerate(looks):
        at = Vector(((i - 2) * 1.05, 0, 0))
        shown.append(dressed(at, top, sleeve))
        shown.append(copy("craneo", at + NECK))
        shown.append(copy(extra, at + NECK))
    shoot("munecos", shown, (0.6, -7.5, 2.1), (0, 0, 1.05), 45)
    for obj in shown:
        bpy.data.objects.remove(obj)

    def grid(name, names, columns=6):
        shown = []
        for i, piece_name in enumerate(names):
            at = Vector(((i % columns) * 1.3, 0, -(i // columns) * 1.45))
            shown.append(copy("craneo", at))
            shown.append(copy(piece_name, at))
        rows = (len(names) + columns - 1) // columns
        width = (min(columns, len(names)) - 1) * 1.3
        target = Vector((width / 2, 0, 0.45 - (rows - 1) * 0.72))
        distance = max(width * 1.35, rows * 2.2) + 2.2
        shoot(name, shown, target + Vector((distance * 0.28, -distance, distance * 0.28)), target, 50)
        for obj in shown:
            bpy.data.objects.remove(obj)

    grid("pelos", sorted(n for n in pieces if n.startswith("pelo.")), 5)
    grid("gorros", sorted(n for n in pieces if n.startswith("gorro.")), 6)


def export(path):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=False,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        use_selection=False,
        # Draco deja el kit en una quinta parte: la web lo descomprime con el
        # descompresor que trae three.js.
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=10,
        export_draco_position_quantization=12,
        export_draco_normal_quantization=8,
        export_draco_texcoord_quantization=11,
        export_draco_generic_quantization=10,
    )


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = argv[0] if argv else "munecos.glb"
    folder = argv[argv.index("--preview") + 1] if "--preview" in argv else None
    reset()
    body, arm = build_body()
    build_body_props(body, arm)
    build_head()
    build_hair()
    build_hats()
    shrink_head_pieces()
    build_face_props()
    build_slime()
    export(out)
    print("KIT", out, len(bpy.data.objects), "objetos")
    if folder:
        preview(folder)


if __name__ == "__main__":
    main()
