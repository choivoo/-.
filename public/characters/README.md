# Replacing placeholder art with real parts

Every character is currently **procedural placeholder vector art** (`assetStatus: 'placeholder-vector'`).
To use hand-drawn PNG/SVG parts, put files under `public/characters/<id>/` and register them in the
character's `overrides` map in `src/characters/defs.ts`:

```ts
overrides: {
  'head':        { src: 'characters/soma/head.png', x: -50, y: -95, w: 100, h: 110 },
  'hairFront@1': { src: 'characters/soma/hair_front_wind.png', x: -50, y: -100, w: 110, h: 90 }, // replacement drawing for pose.variant = 1
}
```
Keys are part ids from `src/rigs/skeleton.ts` (`PART_TREE`); x/y/w/h are in that part's local space (pivot = origin).
Rigging, face, clips, camera and VFX keep working unchanged. `npm run validate` fails if an override file is missing.
