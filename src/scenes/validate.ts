import { BACKGROUNDS } from './backgrounds';
import { CHARACTERS } from '../characters/defs';
import { CLIPS } from '../animation/clips';
import { REQUIRED_PARTS, PART_BY_ID } from '../rigs/skeleton';
import type { ShotSpec, SceneMeta } from './types';

export interface Issue { level: 'error' | 'warn'; shotId?: string; msg: string }
const isInt = (n: unknown) => Number.isInteger(n);

export function validateShots(shots: ShotSpec[], opts: { expectedTotal?: number; scenes?: SceneMeta[]; soundExists?: (name: string) => boolean; fileExists?: (publicPath: string) => boolean } = {}): Issue[] {
  const out: Issue[] = [];
  const err = (shotId: string | undefined, msg: string) => out.push({ level: 'error', shotId, msg });
  const ids = new Set<string>();
  let cursor = 0;
  const sorted = [...shots].sort((a, b) => a.startFrame - b.startFrame);
  for (const s of sorted) {
    const id = s.shotId;
    if (ids.has(id)) err(id, 'duplicate shotId'); ids.add(id);
    if (![s.startFrame, s.durationFrames].every(isInt)) err(id, 'frames must be integers');
    if (s.durationFrames <= 0) err(id, `non-positive duration ${s.durationFrames}`);
    if (s.startFrame < 0) err(id, 'negative startFrame');
    if (s.startFrame < cursor) err(id, `overlaps previous shot (start ${s.startFrame} < ${cursor})`);
    if (s.startFrame > cursor) err(id, `gap before shot: missing frames ${cursor}..${s.startFrame - 1}`);
    cursor = Math.max(cursor, s.startFrame + s.durationFrames);
    if (!BACKGROUNDS[s.backgroundId]) err(id, `unknown background ${s.backgroundId}`);
    for (const t of s.characters) {
      if (!CHARACTERS[t.id]) err(id, `unknown character ${t.id}`);
      if (!s.characterIds.includes(t.id)) err(id, `characterIds missing ${t.id}`);
      let last = -1;
      for (const c of t.animationClips) {
        if (!CLIPS[c.clip]) err(id, `unknown clip ${c.clip}`);
        if (c.f < last) err(id, `clip cues out of order for ${t.id}`);
        if (c.f < 0 || c.f >= s.durationFrames) err(id, `clip cue frame ${c.f} outside shot`);
        last = c.f;
      }
    }
    const inRange = (f: number, what: string) => { if (f < 0 || f > s.durationFrames) err(id, `${what} frame ${f} outside 0..${s.durationFrames}`); };
    s.cameraKeyframes.forEach((k) => inRange(k.f, 'camera key'));
    if (s.cameraKeyframes.length === 0) err(id, 'no camera keyframes');
    s.soundEffects.forEach((e) => { inRange(e.f, 'sfx'); if (opts.soundExists && !opts.soundExists(e.sound)) err(id, `sound file missing: ${e.sound}`); });
    s.dialogue.forEach((d) => { if (d.f < 0 || d.f + d.dur > s.durationFrames) err(id, `dialogue "${d.text.slice(0, 12)}…" exceeds shot (${d.f}+${d.dur} > ${s.durationFrames})`); });
    (s.vfx ?? []).forEach((v) => { if (v.f < 0 || v.f >= s.durationFrames) err(id, `vfx ${v.type} starts outside shot`); });
    if (s.musicCue && opts.soundExists && !opts.soundExists(s.musicCue.id)) err(id, `music missing: ${s.musicCue.id}`);
    for (const d of s.dialogue) if (d.voiceAsset && opts.fileExists && !opts.fileExists(d.voiceAsset)) err(id, `voice asset missing: ${d.voiceAsset}`);
  }
  if (opts.expectedTotal !== undefined && cursor !== opts.expectedTotal) err(undefined, `total frames ${cursor} != expected ${opts.expectedTotal}`);
  if (opts.scenes) for (const sc of opts.scenes) {
    const inScene = sorted.filter((s) => s.sceneId === sc.sceneId);
    if (!inScene.length) { err(undefined, `scene ${sc.sceneId} has no shots`); continue; }
    const a = inScene[0].startFrame, b = inScene[inScene.length - 1].startFrame + inScene[inScene.length - 1].durationFrames;
    if (a !== sc.startFrame || b - a !== sc.durationFrames) err(undefined, `scene ${sc.sceneId} spans ${a}..${b} but metadata says ${sc.startFrame}+${sc.durationFrames}`);
  }
  return out;
}

/** Rig + character-design consistency: required parts, proportions and palette sanity. */
export function validateCharacters(): Issue[] {
  const out: Issue[] = [];
  for (const p of REQUIRED_PARTS) if (!PART_BY_ID[p]) out.push({ level: 'error', msg: `rig missing required part ${p}` });
  for (const c of Object.values(CHARACTERS)) {
    if (c.height < 0.7 || c.height > 1.3) out.push({ level: 'error', msg: `${c.id}: height ${c.height} out of range` });
    for (const [k, v] of Object.entries(c.palette)) if (!/^#[0-9a-f]{6}$/i.test(v)) out.push({ level: 'error', msg: `${c.id}: palette.${k} not #rrggbb` });
    if (c.build.shoulder < 0.7 || c.build.shoulder > 1.3) out.push({ level: 'error', msg: `${c.id}: shoulder build out of range` });
  }
  return out;
}
