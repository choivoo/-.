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

## Episode Factory 3.0 (production commands)
All commands: `npm run production:<name> -- [args]` (implemented in `scripts/production/*`; state in `episode/EP01/production/state.json`, checkpoint in `PRODUCTION_CHECKPOINT.json`, outputs in `renders/EP01/`).

| command | what it does (all implemented) |
|---|---|
| `production:audit` | environment/resources/assets/validation audit → `renders/EP01/audit.json` |
| `production:status` | sync + print per-stage counts, render/QA/approval counts |
| `production:storyboard [-- --scene S01]` | scene contact sheets + 105-cut overview into `episode/EP01/storyboard/sheets/` (marks cuts STORYBOARD_READY by content hash) |
| `production:voices [-- --force]` | synthetic **espeak-ng TTS placeholders** → `public/voices/<dialogueId>.wav` + waveform lip-sync analysis (then `npm run build:data`) |
| `production:audio` | `episode/EP01/audio/voice_manifest.json` (dialogue ids, lip-sync, subtitles, track classes) |
| `production:preview [-- --scene S01]` | 720p cut renders |
| `production:render-shot -- <ids> [--720] [--frames a-b] [--force]` | render specific cuts (partial frame range goes to `renders/EP01/partial/`) |
| `production:render-scene -- --scene S01` / `production:render-all [-- --limit N]` | priority-ordered queue (P0→P3), retries, per-cut verification, content-hash cache |
| `production:resume [-- --failed-only]` | continue after interruption / re-render failed cuts |
| `production:qa [-- --scene S01]` | technical + continuity + combat-sync + flash checks, contact sheets per cut |
| `production:approve -- --shots A,B` | explicit human sign-off (only for QA PASS cuts) — never automatic |
| `production:assemble [-- --partial] [--720]` | trims audio per cut to exact frame length, joins cuts, verifies frame count |
| `production:report` / `production:finalize` | QA report, manifest, status JSON, asset report, contact sheets. `finalize` only names a file `EP01_FINAL_1080P.mp4` when every condition is met |
| `scripts/production/run-all.sh` | whole chain (pilot S01 → all cuts → assemble → report); safe to re-run |

Dashboard: `npm run editor` → **Production** tab (real state from the files above; buttons call these commands).
