# ANIME FORGE — code-driven Japanese-style 2D anime production

TypeScript · React · Remotion · SVG · Node · FFmpeg. Original project: **흑월의 잔향 (Echoes of the Black Moon)**, episode 1.

## Quick start (Linux / Windows)
```bash
npm install
npm run audio:placeholder   # synthesise placeholder SFX/music into public/sounds (already committed)
npm run build:data          # regenerate episode/SAMPLE01 + episode/EP01 JSON from scripts/lib/*
npm run check               # typecheck + 24 tests + episode validation
npm run editor              # browser workspace at http://localhost:5173/editor.html (Android browsers: preview + simple controls)
npm run studio              # Remotion Studio
npm run render:test         # 5 s test render  -> renders/test5_1080p.mp4  (add -- --720 for preview)
npm run render:sample       # 30 s action sample -> renders/sample30_1080p.mp4
npx tsx scripts/verify-video.ts renders/sample30_1080p.mp4 720 1920 1080
```
Chromium is auto-detected (`BROWSER_EXECUTABLE` or `PLAYWRIGHT_BROWSERS_PATH`); otherwise Remotion fetches its own. FFmpeg must be on PATH.

## Episode pipeline
```bash
npm run render:episode -- --scene S01 --720        # render one scene's cuts (cached by content hash)
npm run render:episode -- --retry-failed           # only failed cuts
npm run render:episode -- --batch 4 --concat       # batch render everything, then FFmpeg-join
npm run render:episode:concat -- --partial         # join whatever exists
```
Each cut renders to `renders/cache/<ep>_<shot>_<res>_<hash>.mp4`; the hash covers the shot JSON, engine source and audio files, so unchanged cuts are reused.
Failures are isolated per cut and recorded in `renders/status_*.json`.

## Layout
- `src/engine` FrameScheduler (cadence ones/twos/threes/hold, time remap) · `src/animation` poses, 18 clips, ActionAnimator, Face/lip-sync
- `src/rigs` part tree + FK + SVG puppet (`CharacterRig2D`, PNG/SVG part overrides) · `src/characters` 4 original characters
- `src/camera` CameraDirector · `src/effects` VFXComposer (seeded, stateless) · `src/scenes` backgrounds, ShotView, validation
- `src/editor` browser UI · `src/render` Remotion compositions · `scripts/` build/render/verify · `tests/run.ts`
- `episode/SAMPLE01` (30 s) and `episode/EP01` (script, storyboard, shots, audio plan, metadata) — plain JSON, editable without recompiling.

See `STATUS.md` for what is real and what is placeholder.
