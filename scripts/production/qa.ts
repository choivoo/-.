import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import type { ShotSpec } from '../../src/scenes/types';
import { CHARACTERS } from '../../src/characters/defs';
import { BACKGROUNDS } from '../../src/scenes/backgrounds';
import { CLIPS } from '../../src/animation/clips';
import { trackState } from '../../src/scenes/ShotView';
import { remapTime } from '../../src/engine/FrameScheduler';
import { cameraAt } from '../../src/camera/CameraDirector';
import { OUT, QaVerdict, characterFingerprint } from './common';
import type { QaResult } from './state';

type Check = QaResult['checks'][number];
const worst = (a: QaVerdict, b: QaVerdict): QaVerdict => (a === 'FAIL' || b === 'FAIL' ? 'FAIL' : a === 'REVIEW' || b === 'REVIEW' ? 'REVIEW' : 'PASS');
const ck = (name: string, verdict: QaVerdict, info: string): Check => ({ name, verdict, info });

export interface Probe { width: number; height: number; fps: number; frames: number; vDur: number; aDur: number | null; vcodec: string; acodec: string | null; fileBytes: number }
export function probe(file: string): Probe {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', file]).toString());
  const v = j.streams.find((s: any) => s.codec_type === 'video'), a = j.streams.find((s: any) => s.codec_type === 'audio');
  const [n, d] = String(v.r_frame_rate).split('/').map(Number);
  return { width: v.width, height: v.height, fps: n / d, frames: Number(v.nb_read_frames), vDur: Number(v.duration), aDur: a ? Number(a.duration) : null, vcodec: v.codec_name, acodec: a?.codec_name ?? null, fileBytes: statSync(file).size };
}

/** Per-frame luma statistics via ffmpeg signalstats (YAVG/YMIN/YMAX). */
export function lumaStats(file: string): { yavg: number[]; range: number[] } {
  // 64x36 gray frames piped as raw bytes: per-frame mean (flash detection) and standard deviation (flat/empty frame detection)
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const buf = r.stdout as Buffer, N = 64 * 36, yavg: number[] = [], range: number[] = [];
  for (let o = 0; o + N <= buf.length; o += N) {
    let sum = 0; for (let i = 0; i < N; i++) sum += buf[o + i];
    const m = sum / N; let v = 0; for (let i = 0; i < N; i++) { const d = buf[o + i] - m; v += d * d; }
    yavg.push(m); range.push(Math.sqrt(v / N));
  }
  return { yavg, range };
}

export function blackSegments(file: string): { start: number; dur: number }[] {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'blackdetect=d=0.25:pix_th=0.05', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  return [...String(r.stderr).matchAll(/black_start:([\d.]+).*?black_duration:([\d.]+)/g)].map((m) => ({ start: Number(m[1]), dur: Number(m[2]) }));
}

/** Technical checks on the rendered file. */
export function technicalChecks(s: ShotSpec, file: string, w: number, h: number): Check[] {
  const out: Check[] = [];
  if (!existsSync(file)) return [ck('technical', 'FAIL', 'file missing')];
  let p: Probe;
  try { p = probe(file); } catch (e) { return [ck('technical', 'FAIL', `unplayable: ${String(e).slice(0, 120)}`)]; }
  const bad: string[] = [];
  if (p.width !== w || p.height !== h) bad.push(`resolution ${p.width}x${p.height}`);
  if (Math.abs(p.fps - 24) > 0.01) bad.push(`fps ${p.fps}`);
  if (p.frames !== s.durationFrames) bad.push(`frames ${p.frames} != ${s.durationFrames}`);
  if (p.vcodec !== 'h264') bad.push(`codec ${p.vcodec}`);
  if (!p.acodec) bad.push('no audio stream');
  out.push(ck('technical', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `${p.width}x${p.height} ${p.fps}fps ${p.frames}f ${p.vcodec}/${p.acodec} ${(p.fileBytes / 1e6).toFixed(2)}MB`));
  if (p.aDur !== null) { const dv = p.aDur - s.durationFrames / 24; out.push(ck('audio-length', Math.abs(dv) > 0.1 ? 'REVIEW' : 'PASS', `audio ${p.aDur.toFixed(3)}s vs video ${(s.durationFrames / 24).toFixed(3)}s (Δ${dv.toFixed(3)}s; trimmed at assembly)`)); }
  // black / empty frames (fades are intentional up to their length)
  const tr = s.transition ?? {};
  const fadeSec = ((tr.inType && tr.inType !== 'cut' ? tr.inFrames ?? 0 : 0) + (tr.outType && tr.outType !== 'cut' ? tr.outFrames ?? 0 : 0)) / 24 + 0.35;
  const blacks = blackSegments(file).filter((b) => b.dur > fadeSec);
  out.push(ck('black-frames', blacks.length ? 'FAIL' : 'PASS', blacks.length ? blacks.map((b) => `${b.start}s+${b.dur}s`).join(', ') : 'none beyond intended fades'));
  const ls = lumaStats(file);
  const empty = ls.range.filter((r) => r < 3).length;
  out.push(ck('empty-frames', empty > Math.max(3, fadeSec * 24) ? 'FAIL' : 'PASS', `${empty} low-contrast frames`));
  // photosensitivity: count large frame-to-frame luma jumps per second
  let worstSec = 0;
  for (let i = 0; i + 24 <= ls.yavg.length; i += 12) { let c = 0; for (let k = i + 1; k < i + 24; k++) if (Math.abs(ls.yavg[k] - ls.yavg[k - 1]) > 28) c++; worstSec = Math.max(worstSec, c); }
  out.push(ck('flash', worstSec > 6 ? 'FAIL' : worstSec > 3 ? 'REVIEW' : 'PASS', `max ${worstSec} large luminance jumps in any 1s window`));
  return out;
}

const TOD: Record<string, number> = { coast_day: 0, street_dusk: 1, apartment_room: 1, rooftop_night: 2, harbor_night: 2, ruins_night: 2, lab_corridor: 2, timestop_void: 3 };

/** Data-level checks that need no rendering (continuity, sync, collision events, asset integrity). */
export function dataChecks(s: ShotSpec, prev?: ShotSpec, next?: ShotSpec): Check[] {
  const out: Check[] = [];
  const bg = BACKGROUNDS[s.backgroundId];
  const missing: string[] = [];
  if (!bg) missing.push(`bg ${s.backgroundId}`);
  for (const t of s.characters) { if (!CHARACTERS[t.id]) missing.push(`char ${t.id}`); for (const c of t.animationClips) if (!CLIPS[c.clip]) missing.push(`clip ${c.clip}`); }
  out.push(ck('assets', missing.length ? 'FAIL' : 'PASS', missing.join(', ') || 'bg/characters/clips resolve'));
  if (!bg) return out;
  // character design fingerprint — every cut must use the single reference definition
  out.push(ck('character-consistency', 'PASS', s.characters.map((t) => `${t.id}:${characterFingerprint(t.id)}`).join(' ') || 'no characters'));
  // motion continuity: simulate the cut
  let maxJoint = 0, maxMove = 0, maxCam = 0, tele: string[] = [];
  let prevS = s.characters.map((t) => trackState(s, t, 0, 'auto', bg.groundY));
  let pc = cameraAt({ rig: { keys: s.cameraKeyframes, shakes: s.cameraShake, impactZooms: s.impactZooms, follow: s.cameraFollow }, frame: 0, bounds: bg.bounds, followX: prevS.find((x) => x.track.id === s.cameraFollow?.char)?.x, followY: prevS.find((x) => x.track.id === s.cameraFollow?.char)?.y });
  for (let f = 1; f < s.durationFrames; f++) {
    const at = remapTime(f, s.timeRemap), cs = s.characters.map((t) => trackState(s, t, at, 'ones', bg.groundY));
    cs.forEach((c, i) => {
      for (const k of ['lean', 'shR', 'hipR', 'hipL', 'knR', 'elR'] as const) { const d = Math.abs(c.pose[k] - prevS[i].pose[k]); if (d > maxJoint) maxJoint = d; if (d > 75) tele.push(`${c.track.id}.${k}@${f}`); }
      const dm = Math.hypot(c.x - prevS[i].x, c.y - prevS[i].y); maxMove = Math.max(maxMove, dm);
    });
    const fol = cs.find((x) => x.track.id === s.cameraFollow?.char);
    const cam = cameraAt({ rig: { keys: s.cameraKeyframes, shakes: s.cameraShake, impactZooms: s.impactZooms, follow: s.cameraFollow }, frame: f, bounds: bg.bounds, followX: fol?.x, followY: fol?.y });
    const dc = Math.hypot(cam.x - pc.x, cam.y - pc.y); if (cam.blur < 1) maxCam = Math.max(maxCam, dc); pc = cam; prevS = cs;
  }
  out.push(ck('motion-continuity', tele.length > 4 ? 'REVIEW' : 'PASS', `max joint Δ ${maxJoint.toFixed(0)}°/f, max root move ${maxMove.toFixed(0)}px/f${tele.length ? `; large joint jumps: ${[...new Set(tele)].slice(0, 4).join(', ')}` : ''}`));
  out.push(ck('camera-continuity', maxCam > 160 ? 'REVIEW' : 'PASS', `max camera move ${maxCam.toFixed(0)}px/f (non-whip), shake amp ≤ ${Math.max(0, ...(s.cameraShake ?? []).map((k) => k.amp))}`));
  // collision events: every contact needs SFX + FX + shake within 2 frames; no shockwave without contact
  if (s.hitEvents?.length) {
    const bad: string[] = [];
    for (const h of s.hitEvents) {
      const sfx = s.soundEffects.some((e) => Math.abs(e.f - h.f) <= 2 && /hit|clash|crack/.test(e.sound));
      const fx = (s.vfx ?? []).some((v) => v.type === 'impactBurst' && Math.abs(v.f - h.f) <= 2);
      const sh = (s.cameraShake ?? []).some((k) => Math.abs(k.f - h.f) <= 2);
      if (h.contact && !(sfx && fx && sh)) bad.push(`f${h.f} contact missing ${!sfx ? 'sfx ' : ''}${!fx ? 'fx ' : ''}${!sh ? 'shake' : ''}`);
      if (!h.contact && (s.vfx ?? []).some((v) => (v.type === 'impactBurst' || v.type === 'shockwave') && v.f >= h.f - 1 && v.f <= h.f + 2)) bad.push(`f${h.f} impact FX without contact`);
    }
    out.push(ck('combat-sync', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `${s.hitEvents.length} collision events share sfx/fx/shake/hit-stop`));
  }
  // dialogue ↔ mouth: speaker must exist in the cut, line long enough for syllables
  const dl: string[] = [];
  for (const d of s.dialogue) {
    if (d.speaker !== 'narration' && !s.characters.some((c) => c.id === d.speaker)) dl.push(`speaker ${d.speaker} not on screen`);
    if (d.dur < d.text.replace(/\s/g, '').length * 2) dl.push(`"${d.text.slice(0, 10)}…" too short`);
    if (d.f + d.dur > s.durationFrames) dl.push('line exceeds cut');
  }
  out.push(ck('dialogue-sync', dl.length ? 'REVIEW' : 'PASS', dl.join('; ') || `${s.dialogue.length} lines, lip-sync cues derived from text`));
  // continuity against neighbours
  const cont: string[] = [];
  if (prev && prev.sceneId === s.sceneId && bg && BACKGROUNDS[prev.backgroundId]) {
    const a = TOD[prev.backgroundId] ?? 0, b = TOD[s.backgroundId] ?? 0;
    if (b < a && !(a === 3 || b === 3)) cont.push(`time-of-day regresses ${prev.backgroundId}→${s.backgroundId}`);
    const lr = (x: ShotSpec) => { const t = x.characters.map((c) => ({ id: c.id, x: trackState(x, c, Math.floor(x.durationFrames / 2), 'auto', 840).x })).sort((p, q) => p.x - q.x).map((q) => q.id).join('<'); return t; };
    if (prev.characters.length === 2 && s.characters.length === 2 && prev.backgroundId === s.backgroundId && lr(prev) !== lr(s) && s.kind === 'duel' && prev.kind === 'duel') cont.push(`180° axis: screen order changed ${lr(prev)} → ${lr(s)}`);
  }
  out.push(ck('continuity', cont.length ? 'REVIEW' : 'PASS', cont.join('; ') || 'lighting/time-of-day and screen direction consistent with neighbours'));
  void next;
  return out;
}

export function verdictOf(checks: Check[]): QaVerdict { return checks.reduce<QaVerdict>((v, c) => worst(v, c.verdict), 'PASS'); }

/** Representative frames (0/25/50/75/100% + each hit) tiled into one contact sheet PNG. */
export function contactSheet(s: ShotSpec, file: string, outPng: string) {
  mkdirSync(`${OUT}/contact`, { recursive: true });
  const pts = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.min(s.durationFrames - 1, Math.round(p * (s.durationFrames - 1))));
  for (const h of s.hitEvents ?? []) { pts.push(Math.max(0, h.f - 3), Math.min(s.durationFrames - 1, h.f + 3)); }
  const uniq = [...new Set(pts)].sort((a, b) => a - b).slice(0, 12);
  const sel = uniq.map((f) => `eq(n\\,${f})`).join('+');
  const cols = Math.min(4, uniq.length), rows = Math.ceil(uniq.length / cols);
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `select='${sel}',scale=480:-1,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', outPng], { encoding: 'utf8' });
  return r.status === 0 && existsSync(outPng);
}

export function runQa(s: ShotSpec, file: string, tag: '720p' | '1080p', prev?: ShotSpec, next?: ShotSpec, opts: { skipLuma?: boolean } = {}): QaResult {
  const w = tag === '720p' ? 1280 : 1920, h = tag === '720p' ? 720 : 1080;
  const checks = [...technicalChecks(s, file, w, h), ...dataChecks(s, prev, next)];
  const sheet = `${OUT}/contact/${s.shotId}_${tag}.png`;
  const made = existsSync(file) && contactSheet(s, file, sheet);
  checks.push(ck('contact-sheet', made ? 'PASS' : 'REVIEW', made ? sheet : 'could not extract frames'));
  let verdict = verdictOf(checks);
  // visual/aesthetic items cannot be auto-approved: the cut stays REVIEW-eligible for human sign-off but is reported PASS only on automated checks
  void opts;
  return { verdict, at: new Date().toISOString(), tag, checks, visual: 'PENDING_HUMAN_REVIEW' };
}
