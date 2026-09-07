"""
Bake a seamless flight cycle for the witch.

Every curve is a sine in the loop parameter, so the last frame runs into the
first with no seam and the cycle can play under a flight of any length.

WHAT IS ANIMATED, AND WHAT DELIBERATELY IS NOT

  torso  - the whole body sways and pitches. Everything hangs off this,
           including the broom, so her grip on the handle is preserved.
  head   - looks around against the sway. The hat is parented to the head
           bone, so it comes along.
  legs   - trail and kick. Nothing is attached to them, so they are free.

The CHEST is left alone on purpose. Her arms hang off it and the broom does
not, so rotating the chest slides her hands straight off the handle — the same
class of problem the binding pass fixed, reintroduced from the other end.
"""
import bpy, sys, os, math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import witch_bind as witchlib

argv = sys.argv[sys.argv.index("--")+1:]
fbx, outdir, frames, size = argv[0], argv[1], int(argv[2]), int(argv[3])

arm = witchlib.load(fbx, verbose=False)
witchlib.stage(size)
sc = bpy.context.scene

def bone(n):
    b = arm.pose.bones.get(n)
    if b: b.rotation_mode = 'XYZ'
    return b

torso, head = bone("torso"), bone("head")
# Whichever leg controls this rig exposes.
legs = [(bone(f"thigh_fk.{s}"), bone(f"shin_fk.{s}"), s) for s in ("L", "R")]
legs = [(t, s, side) for t, s, side in legs if t]
print("legs driven:", [side for _, _, side in legs] or "none (no thigh_fk)")

TAU = math.pi * 2
for i in range(frames):
    u = i / frames
    w = TAU * u

    if torso:
        torso.rotation_euler = (0.055 * math.sin(w + 0.7), 0.0, 0.085 * math.sin(w))
    if head:
        # Against the body's sway, and lagging it — a head does not snap about
        # in time with the hips.
        head.rotation_euler = (0.10 * math.sin(w + 1.5), 0.13 * math.sin(w + 2.2), 0.0)
    for thigh, shin, side in legs:
        phase = w + (0 if side == "L" else math.pi)
        thigh.rotation_euler = (0.28 * math.sin(phase), 0, 0)
        if shin:
            shin.rotation_euler = (max(0.0, 0.34 * math.sin(phase - 1.1)), 0, 0)

    bpy.context.view_layer.update()
    sc.render.filepath = os.path.join(outdir, f"fly_{i:02d}.png")
    bpy.ops.render.render(write_still=True)
    print("frame", i)
