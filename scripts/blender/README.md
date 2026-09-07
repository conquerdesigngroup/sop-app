# Blender: baking the witch

How `src/assets/holiday/halloween/wi_fly*.webp` was made, so it can be redone
when the pose, the size or the frame count needs to change.

The source is a purchased FBX (a cartoon witch skeleton on a broom) that is NOT
committed — it is 12MB and only needed to re-bake. Point the scripts at your own
copy.

## Why a bind pass is needed first

The asset ships with a full Rigify armature and **no animation clip**, and with
20 meshes parented to the armature OBJECT rather than to any bone: the hat, the
broom, and most of her individual bones. They follow the rig only when the whole
object moves, so posing a bone slides the skull out of its own hat and leaves
her sitting beside her broom.

`witch_bind.py` fixes that. Each Skeleton.* piece goes to its nearest deform
bone — unambiguous, because every one sits within 0.02 units of exactly one
bone, being the bone it was modelled on. The two prop roots are named
explicitly, since a bounding-box centre is a poor guide for a long object: the
broom's centre is nearer a shin than a hand.

The broom is bound to `DEF-spine`, not to a hand. She sits on it, and a
hand-parented broom would swing the whole thing every time an arm moved.

## Baking a cycle

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -noaudio \
  --python scripts/blender/witch_cycle.py -- "/path/to/Skeleton 14.fbx" /tmp/out 8 600
```

Arguments: fbx, output directory, frame count, render size.

Every curve is a sine in the loop parameter, so the last frame runs into the
first and the cycle plays under a crossing of any length.

The CHEST is deliberately not animated. Her arms hang off it and the broom does
not, so rotating it slides her hands off the handle — the same class of problem
the bind pass fixes, reintroduced from the other end.

## Turning frames into sprites

Crop all frames to ONE union box across the whole cycle before scaling, so a
frame swap moves her body and never her position, then save as WebP. The witch
displays at 101px tall, so 230px of art is a little over 2x.
