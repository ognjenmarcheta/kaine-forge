"""Kaine Forge mark: olive tree growing through the Byteforge anvil.

Run with Blender 5.2 in background mode. See media/brand/README.md.

Render a master (rebuilds the tree, camera and lights, keeps the anvil):
    blender -b media/brand/kaine-forge-mark.blend --python media/brand/render-mark.py -- \
        --variant on-dark --out media/brand/mark-on-dark.png

Derive icons and favicons from the two masters (no .blend needed):
    blender -b --factory-startup --python media/brand/render-mark.py -- --derive
"""

import argparse
import base64
import math
import os
import struct
import sys
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

ANVIL = "Byteforge_Anvil"
ANVIL_MAT = "Byteforge · Dark logo steel"
TEX = {"on-dark": "anvil-basecolor-light.jpg", "on-light": "anvil-basecolor-dark.jpg"}

INK = (0x12, 0x14, 0x19)
TREE_Y = -0.2  # tree plane, inside the anvil's U-notch (notch spans x -0.45..0.45)


# --------------------------------------------------------------------------- materials


def srgb(hex_color):
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def material(name, color, roughness=0.5, specular=0.4, coat=0.0, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = specular
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = 0.25
    bsdf.inputs["Emission Color"].default_value = srgb(color)
    bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def palette():
    return {
        "leaf_hi": material("KF Leaf Light", "#7cb342", roughness=0.62, specular=0.25),
        "leaf_lo": material("KF Leaf Dark", "#3f7a2a", roughness=0.62, specular=0.25),
        "stem": material("KF Stem", "#4f8f30", roughness=0.55, specular=0.3),
        "olive": material("KF Olive", "#5f9e2f", roughness=0.34, specular=0.45, coat=0.3),
        "spark": material("KF Spark", "#f15a24", roughness=0.45, specular=0.3, emission=0.7),
    }


# --------------------------------------------------------------------------- geometry


def link(obj):
    coll = bpy.data.collections.get("KF Tree")
    if coll is None:
        coll = bpy.data.collections.new("KF Tree")
        bpy.context.scene.collection.children.link(coll)
    coll.objects.link(obj)
    return obj


def stem(name, pts, radius, mat, taper=(1.0, 0.45)):
    """Bezier tube through (x, z) points in the tree plane."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.resolution_u = 24
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, (x, z) in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = (x, TREE_Y, z)
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        t = i / (len(pts) - 1)
        bp.radius = taper[0] + (taper[1] - taper[0]) * t
    obj = bpy.data.objects.new(name, cu)
    cu.materials.append(mat)
    return link(obj)


def leaf(name, base, angle, length, width, mats, bend=0.12, fold=0.22, n=20):
    """Pointed leaf, folded along its midrib toward the camera (two-tone halves)."""
    a = math.radians(angle)
    d = Vector((math.cos(a), math.sin(a)))
    p = Vector((-math.sin(a), math.cos(a)))
    if p.y < 0:  # bend toward the sky
        p = -p
    verts, faces, mids = [], [], []
    for i in range(n + 1):
        t = i / n
        w = 0.5 * width * math.sin(math.pi * t**0.8) ** 0.9
        m2 = Vector(base) + d * length * t + p * bend * length * t * t
        y = TREE_Y + 0.04 - fold * width * math.sin(math.pi * t)
        mids.append((m2, w, y))
    for side in (1, -1):
        start = len(verts)
        for m2, w, y in mids:
            verts.append((m2.x, y, m2.y))
            e = m2 + p * side * w
            verts.append((e.x, TREE_Y + 0.04, e.y))
        for i in range(n):
            a0 = start + 2 * i
            faces.append((a0, a0 + 2, a0 + 3, a0 + 1) if side > 0 else (a0, a0 + 1, a0 + 3, a0 + 2))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mats[0])
    me.materials.append(mats[1])
    for i, poly in enumerate(me.polygons):
        poly.material_index = 0 if i < n else 1
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    mod = obj.modifiers.new("thickness", "SOLIDIFY")
    mod.thickness = 0.03
    return link(obj)


def olive(name, center, tilt, mat, rx=0.34, rz=0.44):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    obj.location = (center[0], TREE_Y - 0.08, center[1])
    obj.scale = (rx, 0.26, rz)
    obj.rotation_euler = (0.0, math.radians(tilt), 0.0)
    me.materials.append(mat)
    return link(obj)


def spark(name, origin, angle, r0, r1, w0, w1, mat, depth=0.14):
    """Wedge ray radiating from origin: narrow at r0, wide at r1."""
    a = math.radians(angle)
    d = Vector((math.cos(a), math.sin(a)))
    p = Vector((-math.sin(a), math.cos(a)))
    o = Vector(origin)
    ring = [o + d * r0 - p * w0 / 2, o + d * r1 - p * w1 / 2, o + d * r1 + p * w1 / 2, o + d * r0 + p * w0 / 2]
    verts = [(v.x, TREE_Y - depth / 2, v.y) for v in ring] + [(v.x, TREE_Y + depth / 2, v.y) for v in ring]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = 0.025
    bev.segments = 3
    return link(obj)


def build_tree():
    m = palette()
    mats = (m["leaf_hi"], m["leaf_lo"])
    for sx, tag in ((-1, "L"), (1, "R")):

        def X(x):
            return sx * x

        def A(angle):
            return angle if sx < 0 else 180.0 - angle

        # Main stem: starts below the notch floor (z 2.10) so it grows out of the anvil.
        stem(
            f"KF Stem {tag}",
            [(X(0.1), 1.75), (X(0.11), 2.7), (X(0.22), 3.45), (X(0.7), 4.3), (X(1.3), 5.0), (X(1.85), 5.65)],
            0.17,
            m["stem"],
            taper=(1.0, 0.5),
        )
        leaf(f"KF Leaf {tag}1", (X(1.8), 5.6), A(125), 1.65, 0.72, mats)
        leaf(f"KF Leaf {tag}2", (X(1.5), 5.25), A(170), 1.5, 0.64, mats)
        leaf(f"KF Leaf {tag}3", (X(1.25), 4.95), A(93), 1.25, 0.54, mats)
        leaf(f"KF Leaf {tag}4", (X(0.85), 4.5), A(200), 1.45, 0.6, mats, bend=-0.1)

        # Olives on short twigs: one high near the centre, one low over the anvil.
        stem(f"KF Twig {tag}1", [(X(0.3), 3.65), (X(0.42), 4.3), (X(0.5), 4.95)], 0.065, m["stem"], (1.0, 0.8))
        olive(f"KF Olive {tag}1", (X(0.52), 5.3), sx * 6, m["olive"])
        stem(f"KF Twig {tag}2", [(X(0.48), 3.95), (X(0.85), 3.85), (X(1.12), 3.72)], 0.065, m["stem"], (1.0, 0.8))
        olive(f"KF Olive {tag}2", (X(1.2), 3.42), sx * -18, m["olive"], rx=0.33, rz=0.42)

    # Forge sparks above the crown.
    origin = (0.0, 5.55)
    spark("KF Spark C", origin, 90, 0.72, 1.45, 0.08, 0.56, m["spark"])
    spark("KF Spark L", origin, 132, 0.78, 1.38, 0.07, 0.42, m["spark"])
    spark("KF Spark R", origin, 48, 0.78, 1.38, 0.07, 0.42, m["spark"])


# --------------------------------------------------------------------------- scene


def reset_scene():
    for obj in list(bpy.data.objects):
        if obj.name != ANVIL:
            bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        if coll.name == "KF Tree":
            bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def area(name, loc, target, energy, size, color=(1, 1, 1), shape="DISK"):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size
    ld.shape = shape
    ld.color = color
    obj = bpy.data.objects.new(name, ld)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)


def setup_scene(size, samples):
    sc = bpy.context.scene
    center = Vector((0.0, 0.0, 3.47))

    cam_data = bpy.data.cameras.new("KF Camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 7.7
    cam = bpy.data.objects.new("KF Camera", cam_data)
    elev = math.radians(4.0)
    cam.location = center + Vector((0.0, -30 * math.cos(elev), 30 * math.sin(elev)))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(cam)
    sc.camera = cam

    area("KF Key", (-3.5, -6.0, 9.5), (0, 0, 3.8), 2600, 6.0, (1.0, 0.97, 0.93))
    area("KF Front", (-1.0, -6.0, 1.5), (0, 0, 1.5), 450, 4.0, shape="RECTANGLE")
    area("KF Fill", (5.0, -5.0, 4.5), (0, 0, 3.5), 1100, 5.0, (0.85, 0.92, 1.0))
    area("KF Rim", (1.0, 3.0, 9.0), (0, 0, 3.5), 2200, 5.0, (0.7, 0.82, 1.0))

    world = sc.world or bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.06, 0.065, 0.075, 1.0)
    bg.inputs["Strength"].default_value = 1.0

    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.render.image_settings.compression = 100
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -1.1

    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
        except (TypeError, ValueError):
            gpus = []
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            sc.cycles.device = "GPU"
            break


def set_anvil_variant(variant):
    mat = bpy.data.materials[ANVIL_MAT]
    node = mat.node_tree.nodes["Image Texture"]
    node.image = bpy.data.images[TEX[variant]]


# --------------------------------------------------------------------------- image helpers


def load_rgba(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return np.flipud(px.reshape(h, w, 4)).astype(np.float64)


def write_png(path, rgba, opaque=False):
    """Write straight-alpha float RGBA (top row first) as an 8-bit PNG."""
    arr = np.clip(np.round(rgba * 255.0), 0, 255).astype(np.uint8)
    if opaque:
        arr = arr[:, :, :3]
    h, w, ch = arr.shape
    # Up filter (type 2) per row, then zlib level 9.
    prev = np.vstack([np.zeros((1, w * ch), np.uint8), arr.reshape(h, w * ch)[:-1]])
    up = (arr.reshape(h, w * ch).astype(np.int16) - prev).astype(np.uint8)
    raw = np.hstack([np.full((h, 1), 2, np.uint8), up]).tobytes()

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    color_type = 2 if opaque else 6
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, color_type, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(png)


def _weights(n_in, n_out):
    """Area-average resampling matrix (n_out x n_in)."""
    scale = n_in / n_out
    wts = np.zeros((n_out, n_in))
    for o in range(n_out):
        a, b = o * scale, (o + 1) * scale
        for i in range(int(math.floor(a)), min(int(math.ceil(b)), n_in)):
            wts[o, i] = min(b, i + 1) - max(a, i)
    return wts / wts.sum(axis=1, keepdims=True)


def resize(rgba, w, h):
    """Premultiplied area resize; returns straight alpha."""
    pm = rgba.copy()
    pm[:, :, :3] *= pm[:, :, 3:4]
    wy, wx = _weights(rgba.shape[0], h), _weights(rgba.shape[1], w)
    out = np.einsum("oi,ijc->ojc", wy, pm)
    out = np.einsum("pj,ojc->opc", wx, out)
    a = out[:, :, 3:4]
    out[:, :, :3] = np.where(a > 1e-6, out[:, :, :3] / np.maximum(a, 1e-6), 0)
    return out


def over(dst, src, x, y):
    """Alpha-composite src onto dst at (x, y); both straight alpha."""
    h, w = src.shape[:2]
    d = dst[y : y + h, x : x + w]
    sa, da = src[:, :, 3:4], d[:, :, 3:4]
    oa = sa + da * (1 - sa)
    rgb = (src[:, :, :3] * sa + d[:, :, :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    dst[y : y + h, x : x + w, :3] = np.where(oa > 1e-6, rgb, 0)
    dst[y : y + h, x : x + w, 3:4] = oa


def canvas(w, h, rgb=None, alpha=0.0):
    c = np.zeros((h, w, 4))
    if rgb is not None:
        c[:, :, :3] = np.array(rgb) / 255.0
    c[:, :, 3] = alpha
    return c


def rounded_tile(size, radius, rgb, ss=4):
    """Anti-aliased rounded square via supersampled coverage."""
    n = size * ss
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    r = radius * ss
    cx = np.clip(xx, r, n - r)
    cy = np.clip(yy, r, n - r)
    inside = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
    cov = inside.reshape(size, ss, size, ss).mean(axis=(1, 3))
    tile = canvas(size, size, rgb)
    tile[:, :, 3] = cov
    return tile


def place(mark, size, fraction, bg):
    """Centre the mark, scaled to `fraction` of the canvas, on bg (a canvas)."""
    m = int(round(size * fraction))
    scaled = resize(mark, m, m)
    off = (size - m) // 2
    over(bg, scaled, off, off)
    return bg


def derive():
    brand = HERE
    dark = load_rgba(os.path.join(brand, "mark-on-dark.png"))
    light = load_rgba(os.path.join(brand, "mark-on-light.png"))

    # App-icon masters.
    tile = place(dark, 1024, 0.70, rounded_tile(1024, 225, INK))
    write_png(os.path.join(brand, "icon-1024.png"), tile)
    opaque = place(dark, 1024, 0.70, canvas(1024, 1024, INK, 1.0))
    write_png(os.path.join(brand, "icon-1024-opaque.png"), opaque, opaque=True)

    # README logo: the rounded tile on a transparent 1280x880 canvas.
    logo = canvas(1280, 880)
    over(logo, resize(tile, 760, 760), (1280 - 760) // 2, (880 - 760) // 2)
    write_png(os.path.join(REPO, "media", "logo.png"), logo)

    # Expo mobile assets.
    assets = os.path.join(REPO, "apps", "mobile", "assets")
    write_png(os.path.join(assets, "icon.png"), opaque, opaque=True)
    write_png(os.path.join(assets, "adaptive-icon.png"), place(dark, 1024, 0.50, canvas(1024, 1024)))
    write_png(os.path.join(assets, "splash-icon.png"), place(light, 1024, 0.55, canvas(1024, 1024)))
    write_png(os.path.join(assets, "splash-icon-dark.png"), place(dark, 1024, 0.55, canvas(1024, 1024)))

    # Web: apple-touch-icon and the light/dark favicon SVG.
    public = os.path.join(REPO, "apps", "web", "public")
    write_png(os.path.join(public, "apple-touch-icon.png"), resize(opaque, 180, 180), opaque=True)
    tmp = os.path.join(brand, ".favicon-tmp.png")
    uris = {}
    for key, src in (("light", light), ("dark", dark)):
        write_png(tmp, resize(src, 64, 64))
        with open(tmp, "rb") as fh:
            uris[key] = base64.b64encode(fh.read()).decode("ascii")
    os.remove(tmp)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        "<style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style>"
        f'<image class="l" width="64" height="64" href="data:image/png;base64,{uris["light"]}"/>'
        f'<image class="d" width="64" height="64" href="data:image/png;base64,{uris["dark"]}"/>'
        "</svg>\n"
    )
    with open(os.path.join(public, "favicon.svg"), "w", encoding="ascii", newline="\n") as fh:
        fh.write(svg)


# --------------------------------------------------------------------------- entry


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=sorted(TEX))
    ap.add_argument("--out")
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--samples", type=int, default=256)
    ap.add_argument("--save-blend")
    ap.add_argument("--derive", action="store_true")
    args = ap.parse_args(argv)

    if args.derive:
        derive()
        return

    reset_scene()
    build_tree()
    setup_scene(args.size, args.samples)
    if args.variant:
        set_anvil_variant(args.variant)
    if args.save_blend:
        for name in TEX.values():  # keep the unused steel variant in the file
            bpy.data.images[name].use_fake_user = True
        bpy.ops.file.pack_all()
        bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend), compress=True, copy=True)
    if args.out:
        bpy.context.scene.render.filepath = os.path.abspath(args.out)
        bpy.ops.render.render(write_still=True)


main()
