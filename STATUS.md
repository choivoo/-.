# STATUS (what is real, what is not)

## Verified working
- Engine, rig (29 required parts, parent/child pivots), 9 expressions + blink + 12 mouth shapes, 15 required action clips (+3), camera, 13 VFX types, 8 placeholder backgrounds.
- 30 s action sample (12 cuts, 720 frames): rendered to 1920x1080 H.264, 24 fps, AAC audio, duration 30.016 s, 720 frames, no black frames.
- 5 s test render, per-cut render with cache, concat tooling, validation and 24 automated tests.
- EP01 data: 105 cuts, exactly 28,800 frames (1,200 s) across the 8 specified scenes; contiguous, validated.

## NOT done / placeholder (do not treat as finished anime)
- **Art**: all characters/backgrounds are procedural placeholder vectors. Replace via `overrides` (public/characters/README.md).
- **EP01 visual content**: only the 720-frame duel (scene S06 opening) is fully choreographed ("final-draft"). The other 28,080 frames are *animatic staging* from generic templates (idle/talk/walk poses, slow cameras) — real engine-rendered visuals but not finished cuts.
- **Audio**: no recorded voices; lip-sync is derived from Hangul vowels. SFX/music are synthesised placeholders.
- **The full 20-minute MP4 has NOT been rendered.** Only two EP01 cuts were rendered to verify the pipeline.
- The script is a first draft.
