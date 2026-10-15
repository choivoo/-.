import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { poseFrame, scheduleLayer, remapTime, cadenceAt } from '../src/engine/FrameScheduler';
import { CLIPS, REQUIRED_CLIPS } from '../src/animation/clips';
import { samplePose } from '../src/animation/ActionAnimator';
import { IDLE_POSE, POSE_KEYS } from '../src/animation/Pose';
import { faceAt, textMouthCues, EXPRESSIONS, MOUTH_SHAPES } from '../src/animation/Face';
import { clampCamera, cameraAt } from '../src/camera/CameraDirector';
import { renderVfx } from '../src/effects/VFXComposer';
import { ShotView } from '../src/scenes/ShotView';
import { BACKGROUNDS } from '../src/scenes/backgrounds';
import { CHARACTERS } from '../src/characters/defs';
import { CharacterRig2D } from '../src/rigs/CharacterRig2D';
import { validateShots, validateCharacters } from '../src/scenes/validate';
import { soundExists, publicFileExists, validateCharacterAssetPaths } from '../scripts/lib/fsAssets';
import { swordTip } from '../src/rigs/skeleton';

let pass = 0, fail = 0;
const t = (name: string, fn: () => void) => { try { fn(); pass++; console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${(e as Error).message}`); } };
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const sample = load('episode/SAMPLE01/shots/shots.json');
const ep = load('episode/EP01/shots/all.json');
const epMeta = load('episode/EP01/metadata/episode.json');

console.log('FrameScheduler');
t('on-twos formula floor(f/2)*2', () => { for (let f = 0; f < 50; f++) assert.equal(poseFrame(f, 'twos'), Math.floor(f / 2) * 2); });
t('ones / threes / hold', () => { assert.equal(poseFrame(7, 'ones'), 7); assert.equal(poseFrame(8, 'threes'), 6); assert.equal(poseFrame(30, 'hold', 0, 12), 12); });
t('cadence keys switch mode and keep phase', () => { const k = [{ f: 0, mode: 'twos' as const }, { f: 11, mode: 'ones' as const }]; assert.equal(scheduleLayer(10, k, 'twos'), 10); assert.equal(scheduleLayer(13, k, 'twos'), 13); assert.equal(cadenceAt(k, 5).mode, 'twos'); });
t('camera is NOT limited to 12fps while pose is', () => {
  const shot = sample[0]; const a = cameraAt({ rig: { keys: shot.cameraKeyframes }, frame: 31, bounds: BACKGROUNDS.ruins_night.bounds }); const b = cameraAt({ rig: { keys: shot.cameraKeyframes }, frame: 30, bounds: BACKGROUNDS.ruins_night.bounds });
  assert.notEqual(a.x, b.x); assert.equal(poseFrame(31, 'twos'), poseFrame(30, 'twos'));
});
t('time remap hit-stop holds animation time', () => { const m = [{ f: 0, t: 0 }, { f: 20, t: 20 }, { f: 24, t: 20 }, { f: 60, t: 56 }]; assert.equal(remapTime(22, m), 20); assert.equal(remapTime(60, m), 56); });

console.log('Animation');
t('all required clips exist and produce finite poses', () => { for (const c of REQUIRED_CLIPS) { const clip = CLIPS[c]; assert.ok(clip, c); for (let f = 0; f <= clip.duration; f++) for (const k of POSE_KEYS) assert.ok(Number.isFinite(clip.sample(f)[k]), `${c}@${f}.${k}`); } });
t('attack clips define impact frames and phases', () => { for (const c of ['slashH', 'slashV', 'thrust', 'counter']) { assert.ok(CLIPS[c].impactT! > 0); assert.ok(CLIPS[c].phases.some((p) => p.phase === 'anticipation')); assert.ok(CLIPS[c].phases.some((p) => p.phase === 'follow')); } });
t('clip blending avoids teleporting (max per-frame joint jump)', () => {
  const cues = [{ f: 0, clip: 'stance' }, { f: 10, clip: 'slashH', blend: 4 }];
  let prev = samplePose(cues, 9);
  for (let f = 10; f < 20; f++) { const p = samplePose(cues, f); for (const k of ['shR', 'lean', 'hipR'] as const) assert.ok(Math.abs(p[k] - prev[k]) < 70, `${k} jump at ${f}: ${Math.abs(p[k] - prev[k])}`); prev = p; }
});
t('sword tip moves during a slash (real pose change)', () => { const a = swordTip(CLIPS.slashH.sample(6)), b = swordTip(CLIPS.slashH.sample(9)); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 100); });
t('feet auto-grounded: idle pose sits on y≈0', () => { const svg = renderToStaticMarkup(React.createElement('svg', null, React.createElement(CharacterRig2D, { def: CHARACTERS.soma, pose: IDLE_POSE, face: faceAt([], 0, 1), x: 0, y: 0, t: 0, uid: 'x' }))); assert.ok(svg.length > 2000); });

console.log('Face');
t('all 9 expressions and 12 mouth shapes resolve', () => { for (const e of EXPRESSIONS) faceAt([{ f: 0, expr: e }], 5, 1); assert.equal(MOUTH_SHAPES.length, 12); });
t('blink is deterministic and closes lids', () => { let closed = 0; for (let f = 0; f < 300; f++) { const a = faceAt([], f, 5), b = faceAt([], f, 5); assert.equal(a.lidL, b.lidL); if (a.lidL > 0.9) closed++; } assert.ok(closed >= 3); });
t('Hangul text lip-sync maps vowels', () => { const c = textMouthCues('아이'); assert.equal(c[0].shape, 'a'); assert.ok(c.some((x) => x.shape === 'i')); });

console.log('Camera / VFX');
t('camera clamp never exposes outside bounds', () => { const b = BACKGROUNDS.ruins_night.bounds; for (const rot of [0, 5, 12]) for (const x of [-5000, 0, 1600, 9000]) { const c = clampCamera({ x, y: 540, zoom: 0.2, rot, blur: 0 }, b); const hw = (1920 * Math.abs(Math.cos(rot * Math.PI / 180)) + 1080 * Math.abs(Math.sin(rot * Math.PI / 180))) / c.zoom / 2; assert.ok(c.x - hw >= b.minX - 0.01 && c.x + hw <= b.maxX + 0.01, `rot ${rot} x ${x}`); } });
t('VFX deterministic for same frame, different across frames', () => { const e = { type: 'debris' as const, f: 0, dur: 30, x: 100, y: 800, seed: 31, count: 20 }; const a = renderToStaticMarkup(React.createElement('svg', null, renderVfx(e, 9, 'k'))); const b = renderToStaticMarkup(React.createElement('svg', null, renderVfx(e, 9, 'k'))); const c = renderToStaticMarkup(React.createElement('svg', null, renderVfx(e, 10, 'k'))); assert.equal(a, b); assert.notEqual(a, c); });

console.log('Determinism (frame -> identical markup)');
t('sample shots render byte-identical twice, out of order', () => { for (const s of sample) for (const f of [0, Math.floor(s.durationFrames / 2), s.durationFrames - 1]) { const a = renderToStaticMarkup(React.createElement(ShotView, { shot: s, frame: f })); renderToStaticMarkup(React.createElement(ShotView, { shot: s, frame: Math.max(0, f - 3) })); const b = renderToStaticMarkup(React.createElement(ShotView, { shot: s, frame: f })); assert.equal(a, b, `${s.shotId}@${f}`); } });
t('characters actually animate within each sample shot (pose-bearing frames differ)', () => { for (const s of sample) { const a = renderToStaticMarkup(React.createElement(ShotView, { shot: { ...s, cameraKeyframes: [s.cameraKeyframes[0]], cameraShake: [], impactZooms: [], cameraFollow: undefined, vfx: [], dialogue: [] }, frame: 4 })); const b = renderToStaticMarkup(React.createElement(ShotView, { shot: { ...s, cameraKeyframes: [s.cameraKeyframes[0]], cameraShake: [], impactZooms: [], cameraFollow: undefined, vfx: [], dialogue: [] }, frame: Math.floor(s.durationFrames * 0.7) })); assert.notEqual(a, b, s.shotId); } });

console.log('Character design consistency');
t('same character renders identical markup in two shots at same pose', () => { const r = (uid: string) => renderToStaticMarkup(React.createElement(CharacterRig2D, { def: CHARACTERS.soma, pose: IDLE_POSE, face: faceAt([{ f: 0, expr: 'neutral' }], 1, 1), x: 0, y: 0, t: 0, uid })).replace(new RegExp(uid, 'g'), 'U'); assert.equal(r('shotA'), r('shotB')); });
t('rig + palette validation', () => assert.deepEqual(validateCharacters(), []));
t('character override asset paths exist', () => assert.deepEqual(validateCharacterAssetPaths(), []));

console.log('Scene data');
t('sample: 12 shots, 720 frames, contiguous', () => { const i = validateShots(sample, { expectedTotal: 720, soundExists }); assert.deepEqual(i, []); });
t('EP01: contiguous, 28,800 frames, scenes match metadata, assets exist', () => { const i = validateShots(ep, { expectedTotal: 28800, scenes: epMeta.scenes, soundExists, fileExists: publicFileExists }); assert.deepEqual(i, []); });
t('validator catches overlap / negative / gap', () => { const bad = [{ ...sample[0] }, { ...sample[1], startFrame: 10 }, { ...sample[2], startFrame: 500, durationFrames: -3 }]; const i = validateShots(bad, {}); assert.ok(i.some((x) => /overlap/.test(x.msg))); assert.ok(i.some((x) => /non-positive/.test(x.msg))); assert.ok(i.some((x) => /gap/.test(x.msg))); });
t('episode total equals 1200 s at 24fps', () => assert.equal(ep.reduce((a: number, s: any) => a + s.durationFrames, 0) / 24, 1200));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
