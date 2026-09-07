"""
Shared setup: import the witch, bind every loose piece to the rig, light it.

The asset ships with 20 meshes that are children of the ARMATURE OBJECT but of
no bone — the hat, the broom, and most of her individual bones. They therefore
follow the rig only when the whole object moves, and any actual pose slides the
skull out of its own hat and leaves her sitting beside her broom.

Each is bone-parented here. The Skeleton.* pieces are matched to their nearest
deform bone, which is unambiguous: every one of them sits within 0.02 units of
exactly one bone because that IS the bone it was modelled on. The two prop roots
are named explicitly, because a bounding-box centre is a poor guide for a long
object — the broom's centre is nearer a shin than a hand.
"""
import bpy, math, mathutils

# The broom follows the SPINE, not a hand. She sits on it, and a hand-parented
# broom would swing the whole thing every time an arm moved.
OVERRIDES = {"Cube": "DEF-spine", "Cube.003": "DEF-spine.005"}


def seg_dist(p, a, b):
    ab = b - a
    t = 0 if ab.length_squared == 0 else max(0, min(1, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def centre(o):
    return sum((o.matrix_world @ mathutils.Vector(c) for c in o.bound_box),
               mathutils.Vector()) / 8


def load(fbx, verbose=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    for n in ("Backlight", "Area", "Area.001", "Camera"):
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)

    arm = bpy.data.objects["rig"]
    defs = [b for b in arm.pose.bones if b.name.startswith("DEF-")]

    # Only the ROOTS of loose hierarchies need binding; children ride along.
    loose = [o for o in bpy.data.objects
             if o.type == 'MESH'
             and not any(m.type == 'ARMATURE' for m in o.modifiers)
             and (o.parent is None or o.parent.type == 'ARMATURE')]

    for o in sorted(loose, key=lambda x: x.name):
        if o.name in OVERRIDES:
            bone = OVERRIDES[o.name]
        else:
            c = centre(o)
            bone = min(defs, key=lambda b: seg_dist(
                c, arm.matrix_world @ b.head, arm.matrix_world @ b.tail)).name

        world = o.matrix_world.copy()
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = bone
        o.matrix_world = world          # keeps it exactly where it was
        if verbose:
            print(f"  bound {o.name:18s} -> {bone}")

    if verbose:
        print(f"bound {len(loose)} loose meshes")
    return arm


def stage(size, ortho_pad=1.55):
    sc = bpy.context.scene
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 64

    mn = [1e9] * 3; mx = [-1e9] * 3
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    ctr = mathutils.Vector([(mn[i] + mx[i]) / 2 for i in range(3)])
    span = max(mx[i] - mn[i] for i in range(3))

    cd = bpy.data.cameras.new("cam"); cd.type = 'ORTHO'; cd.ortho_scale = span * ortho_pad
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam); sc.camera = cam
    cam.location = ctr + mathutils.Vector((-1, 0, 0)) * span * 4
    cam.rotation_euler = mathutils.Vector((1, 0, 0)).to_track_quat('-Z', 'Y').to_euler()

    def sun(name, energy, rot, colour=(1, 1, 1)):
        d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = colour
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
        o.rotation_euler = tuple(math.radians(a) for a in rot)
    sun("key", 4.5, (58, 0, -38))
    sun("fill", 1.5, (72, 0, 150))
    sun("rim", 2.2, (110, 0, 20), (0.75, 0.72, 1.0))
    return ctr, span, cam
