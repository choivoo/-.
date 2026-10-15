import { existsSync } from 'node:fs';
import type { ShotSpec } from '../../src/scenes/types';
import { CLIPS } from '../../src/animation/clips';
import { BACKGROUNDS } from '../../src/scenes/backgrounds';
import { CHARACTERS } from '../../src/characters/defs';
import { STAGES, Stage, RenderState, QaVerdict, STATE_FILE, CHECKPOINT, OUT, contentHash, dialogueId, voicePath, readJson, writeJsonAtomic, loadShots, cachePath } from './common';

export interface QaResult { verdict: QaVerdict; at: string; tag: string; checks: { name: string; verdict: QaVerdict; info: string }[]; visual: 'PENDING_HUMAN_REVIEW' | 'APPROVED' }
export interface ShotRecord {
  shotId: string; sceneId: string; title: string; description: string; purpose: string; durationFrames: number; priority: string;
  assignedCharacters: string[]; backgroundId: string; requiredAssets: string[]; dialogue: { dialogueId: string; characterId: string; text: string; startFrame: number; durationFrames: number; emotion: string; voiceAsset: string | null; voiceStatus: 'LINKED' | 'MISSING_VOICE'; voiceKind?: 'synthetic-tts' | 'recording'; lipSync: 'text-derived-hangul-vowels' | 'cues'; subtitle: boolean }[];
  animationClips: string[]; cameraPlan: string; vfxPlan: string[]; audioPlan: string[];
  productionStatus: Stage; blocked: string[]; failed?: string; renderStatus: RenderState; renderStatus1080?: RenderState;
  qualityResults?: QaResult; approved: boolean; lastModified: string; contentHash: string; storyboardHash?: string; fidelity: string;
}
export interface ProductionState { episode: string; updated: string; shots: Record<string, ShotRecord>; log: { at: string; msg: string }[] }

export const emptyState = (): ProductionState => ({ episode: 'EP01', updated: new Date().toISOString(), shots: {}, log: [] });
export const loadState = (): ProductionState => readJson(STATE_FILE, emptyState());
export function saveState(st: ProductionState) { st.updated = new Date().toISOString(); writeJsonAtomic(STATE_FILE, st); }
export function note(st: ProductionState, msg: string) { st.log.push({ at: new Date().toISOString(), msg }); if (st.log.length > 300) st.log = st.log.slice(-300); }

const readJsonSafe = (f: string): any => readJson(f, null);
const emotionOf = (s: ShotSpec, speaker: string, f: number) => { const t = s.characters.find((c) => c.id === speaker); let e = 'neutral'; for (const c of t?.face ?? []) if (c.f <= f + 6) e = c.expr; return e; };
const clipsOf = (s: ShotSpec) => [...new Set(s.characters.flatMap((c) => c.animationClips.map((a) => `${c.id}:${a.clip}`)))];
export function requiredAssets(s: ShotSpec): string[] {
  const a = [`bg:${s.backgroundId}`, ...s.characters.map((c) => `char:${c.id}`), ...s.soundEffects.map((e) => `sfx:${e.sound}`)];
  if (s.musicCue) a.push(`music:${s.musicCue.id}`);
  s.dialogue.forEach((_, i) => a.push(`voice:${dialogueId(s, i)}`));
  return [...new Set(a)];
}
const missingTrue = (s: ShotSpec): string[] => {
  const out: string[] = [];
  if (!BACKGROUNDS[s.backgroundId]) out.push(`missing background ${s.backgroundId}`);
  for (const c of s.characters) { if (!CHARACTERS[c.id]) out.push(`missing character ${c.id}`); for (const a of c.animationClips) if (!CLIPS[a.clip]) out.push(`missing clip ${a.clip}`); }
  return out;
};

/** Evidence-based stage: the highest stage whose requirement (and all before) is satisfied by files/data/checks on disk. */
export function deriveRecord(s: ShotSpec, prev?: ShotRecord, ev: { storyboardOk?: boolean } = {}): ShotRecord {
  const ch = contentHash(s);
  const unchanged = prev && prev.contentHash === ch;
  const dialogue = s.dialogue.map((d, i) => {
    const id = dialogueId(s, i), v = voicePath(id);
    return { dialogueId: id, characterId: d.speaker, text: d.text, startFrame: d.f, durationFrames: d.dur, emotion: emotionOf(s, d.speaker, d.f), voiceAsset: v ?? d.voiceAsset ?? null, voiceStatus: (v ? 'LINKED' : 'MISSING_VOICE') as 'LINKED' | 'MISSING_VOICE', voiceKind: v ? (readJsonSafe('public/voices/manifest.json')?.voices?.[id] ? ('synthetic-tts' as const) : ('recording' as const)) : undefined, lipSync: (d.mouthCues ? 'cues' : 'text-derived-hangul-vowels') as 'cues' | 'text-derived-hangul-vowels', subtitle: true };
  });
  const blocked: string[] = [...missingTrue(s)];
  const missingVoices = dialogue.filter((d) => d.voiceStatus === 'MISSING_VOICE');
  if (missingVoices.length) blocked.push(`MISSING_VOICE x${missingVoices.length}`);
  const qa = unchanged ? prev!.qualityResults : undefined;
  const has720 = existsSync(cachePath(s, '720p')) && !!qa?.checks.some((c) => c.name === 'technical' && c.verdict !== 'FAIL' && qa.tag === '720p');
  const has1080 = existsSync(cachePath(s, '1080p')) && !!qa && qa.tag === '1080p' && qa.checks.some((c) => c.name === 'technical' && c.verdict !== 'FAIL');
  const stageOk: boolean[] = [
    true,
    !!(s.purpose && s.description !== undefined && s.durationFrames > 0),
    (!!unchanged && prev!.storyboardHash === ch) || !!ev.storyboardOk,
    s.characters.length >= 0 && s.cameraKeyframes.length > 0,
    s.fidelity === 'directed' || s.fidelity === 'final-draft',
    has720 || has1080,
    !!qa?.checks.find((c) => c.name === 'continuity' && c.verdict !== 'FAIL'),
    has1080,
    has1080 && missingVoices.length === 0,
    !!qa && qa.tag === '1080p' && (qa.verdict === 'PASS' || qa.verdict === 'REVIEW'),
    !!qa && qa.verdict === 'PASS' && qa.visual === 'APPROVED' && !!prev?.approved && !!unchanged && missingVoices.length === 0,
  ];
  let idx = 0; while (idx + 1 < STAGES.length && stageOk[idx + 1] && stageOk.slice(0, idx + 2).every(Boolean)) idx++;
  const rec: ShotRecord = {
    shotId: s.shotId, sceneId: s.sceneId, title: `${s.shotId} ${s.kind ?? 'shot'}`, description: s.description ?? '', purpose: s.purpose ?? '', durationFrames: s.durationFrames,
    priority: s.priority ?? 'P2', assignedCharacters: s.characters.map((c) => c.id), backgroundId: s.backgroundId, requiredAssets: requiredAssets(s), dialogue,
    animationClips: clipsOf(s), cameraPlan: s.cameraKeyframes.map((k) => `f${k.f}(${Math.round(k.x)},${Math.round(k.y)})x${k.zoom.toFixed(2)}${k.blur ? ' whip' : ''}`).join(' → ') + (s.cameraShake?.length ? ` +${s.cameraShake.length} shake` : ''),
    vfxPlan: (s.vfx ?? []).map((v) => `${v.type}@${v.f}`), audioPlan: [...s.soundEffects.map((e) => `${e.sound}@${e.f}`), ...(s.musicCue ? [`music:${s.musicCue.id}`] : [])],
    productionStatus: STAGES[idx], blocked, renderStatus: unchanged ? prev!.renderStatus : 'PENDING', renderStatus1080: unchanged ? prev!.renderStatus1080 : 'PENDING',
    qualityResults: qa, approved: !!(unchanged && prev?.approved), lastModified: unchanged ? prev!.lastModified : new Date().toISOString(), contentHash: ch, storyboardHash: unchanged ? prev!.storyboardHash : undefined, fidelity: s.fidelity,
  };
  if (prev?.failed && unchanged) rec.failed = prev.failed;
  return rec;
}

export function syncState(opts: { storyboardOk?: Set<string> } = {}): ProductionState {
  const st = loadState(); const shots = loadShots();
  const keep = new Set<string>();
  for (const s of shots) { keep.add(s.shotId); st.shots[s.shotId] = deriveRecord(s, st.shots[s.shotId], { storyboardOk: opts.storyboardOk?.has(s.shotId) }); }
  for (const id of Object.keys(st.shots)) if (!keep.has(id)) delete st.shots[id];
  saveState(st);
  return st;
}

export function summary(st: ProductionState) {
  const recs = Object.values(st.shots);
  const byStage: Record<string, number> = {}, frames: Record<string, number> = {};
  for (const r of recs) { byStage[r.productionStatus] = (byStage[r.productionStatus] ?? 0) + 1; frames[r.productionStatus] = (frames[r.productionStatus] ?? 0) + r.durationFrames; }
  const rs: Record<string, number> = {}; for (const r of recs) rs[r.renderStatus1080 ?? 'PENDING'] = (rs[r.renderStatus1080 ?? 'PENDING'] ?? 0) + 1;
  return {
    shots: recs.length, frames: recs.reduce((a, r) => a + r.durationFrames, 0), byStage, framesByStage: frames, render1080: rs,
    failed: recs.filter((r) => r.failed || r.renderStatus === 'FAILED' || r.renderStatus1080 === 'FAILED').map((r) => r.shotId),
    missingVoiceLines: recs.reduce((a, r) => a + r.dialogue.filter((d) => d.voiceStatus === 'MISSING_VOICE').length, 0),
    qa: { PASS: recs.filter((r) => r.qualityResults?.verdict === 'PASS').length, REVIEW: recs.filter((r) => r.qualityResults?.verdict === 'REVIEW').length, FAIL: recs.filter((r) => r.qualityResults?.verdict === 'FAIL').length, none: recs.filter((r) => !r.qualityResults).length },
    approved: recs.filter((r) => r.approved).length, animatic: recs.filter((r) => r.fidelity === 'animatic').length, directed: recs.filter((r) => r.fidelity === 'directed').length, finalDraft: recs.filter((r) => r.fidelity === 'final-draft').length,
  };
}

export function writeCheckpoint(extra: Record<string, unknown>) {
  const prev = readJson<Record<string, unknown>>(CHECKPOINT, {});
  writeJsonAtomic(CHECKPOINT, { ...prev, updated: new Date().toISOString(), ...extra, outDir: OUT });
}
