import { CLIPS } from './clips';
import { clipPoseAt, ClipCue } from './ActionAnimator';
import { partPoint, swordTip } from '../rigs/skeleton';
import { CHARACTERS } from '../characters/defs';
import type { Pose } from './Pose';
import type { CharacterTrack, SfxCue } from '../scenes/types';
import type { VfxEvent } from '../effects/VFXComposer';
import type { ShakeEvent, ImpactZoom } from '../camera/CameraDirector';
import type { TimeRemapKey } from '../engine/FrameScheduler';
import type { FaceCue } from './Face';

/**
 * Combat Choreography Generator.
 * An exchange = attacker action + defender response. Both reactions are derived from ONE shared collision event whose
 * world position comes from forward kinematics (blade geometry), so FX/SFX/hit-stop only exist when contact really happens.
 */
export type AttackClip = 'slashH' | 'slashV' | 'thrust' | 'counter';
export type Response = 'guard' | 'dodge' | 'hit';
export interface Exchange { attacker: 0 | 1; attack: AttackClip; response: Response; strength?: number }
export interface HitEvent { f: number; kind: Response; x: number; y: number; contact: boolean; strength: number; attacker: string; defender: string }

type W = { x: number; y: number; flip: boolean; scale: number };
const toWorld = (w: W, p: [number, number]): [number, number] => [w.x + (w.flip ? -1 : 1) * p[0] * w.scale, w.y + p[1] * w.scale];
const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const impactOf = (c: AttackClip) => CLIPS[c].impactT!;

/** Find the base separation so the attacker's blade tip meets the defender's response pose. Returns gap + residual error (px). */
export function solveGap(aId: string, bId: string, ex: Exchange, ground: number): { gap: number; err: number } {
  const atkId = ex.attacker === 0 ? aId : bId, defId = ex.attacker === 0 ? bId : aId;
  const ad = CHARACTERS[atkId], dd = CHARACTERS[defId];
  const ap = clipPoseAt({ f: 0, clip: ex.attack }, impactOf(ex.attack));
  let dp: Pose;
  if (ex.response === 'guard') dp = clipPoseAt({ f: 0, clip: 'guard' }, CLIPS.guard.impactT!);
  else if (ex.response === 'hit') dp = clipPoseAt({ f: 0, clip: 'stagger' }, 0);
  else dp = clipPoseAt({ f: 0, clip: 'dodge' }, 7);
  let best = { gap: 500, err: 1e9 };
  for (let gap = 180; gap <= 900; gap += 4) {
    const A: W = { x: 0, y: ground, flip: false, scale: ad.height }, D: W = { x: gap, y: ground, flip: true, scale: dd.height };
    const tip = toWorld(A, swordTip(ap));
    let target: number;
    if (ex.response === 'dodge') {
      // blade must pass the spot the defender just left and miss the dodged body by a margin
      const body = toWorld(D, partPoint(dp, 'torso', 0, -50));
      const home = toWorld({ ...D, x: gap }, partPoint({ ...dp, x: 0 }, 'torso', 0, -50));
      target = Math.abs(Math.hypot(tip[0] - body[0], tip[1] - body[1]) - 150) * 0.5 + Math.abs(tip[0] - home[0]) * 0.5;
    } else if (ex.response === 'guard') target = segDist(tip, toWorld(D, partPoint(dp, 'weapon', 0, 30)), toWorld(D, swordTip(dp)));
    else target = Math.hypot(tip[0] - toWorld(D, partPoint(dp, 'torso', 0, -50))[0], tip[1] - toWorld(D, partPoint(dp, 'torso', 0, -50))[1]);
    if (target < best.err) best = { gap, err: target };
  }
  return best;
}

export interface DuelPlan {
  tracks: [CharacterTrack, CharacterTrack];
  vfx: VfxEvent[]; sfx: SfxCue[]; shakes: ShakeEvent[]; zooms: ImpactZoom[]; remap: TimeRemapKey[]; hits: HitEvent[];
  frames: number; midpoints: { f: number; x: number; gap: number }[]; warnings: string[];
}

const RESP_CLIP: Record<Response, { clip: string; lead: number }> = { guard: { clip: 'guard', lead: 5 }, dodge: { clip: 'dodge', lead: 10 }, hit: { clip: 'stagger', lead: 0 } };
const SEG_PAD_BEFORE = 8, SEG_PAD_AFTER = 14;
export const exchangeFrames = (ex: Exchange) => SEG_PAD_BEFORE + Math.max(impactOf(ex.attack), 6) + SEG_PAD_AFTER + (ex.response === 'dodge' ? 4 : 0) + 8;

/** Lay out exchanges over `dur` frames centred at cx. */
export function planDuel(aId: string, bId: string, exchanges: Exchange[], dur: number, o: { cx: number; ground: number; seed: number; lead?: number }): DuelPlan {
  const need = exchanges.reduce((a, e) => a + exchangeFrames(e), 0);
  const holdOf = (e: Exchange) => (e.response === 'dodge' ? 0 : (e.strength ?? (e.response === 'hit' ? 1 : 0.8)) >= 0.8 ? 4 : 3);
  const totalHold = exchanges.reduce((a, e) => a + holdOf(e), 0);
  const lead = Math.max(6, o.lead ?? Math.min(18, Math.max(6, dur - totalHold - need)));
  const warnings: string[] = [];
  if (dur - totalHold < need) warnings.push(`duel needs ${need}f but shot has ${dur}f`);
  const A: CharacterTrack = { id: aId, x: o.cx - 320, animationClips: [{ f: 0, clip: 'stance' }], face: [{ f: 0, expr: 'angry' }], path: [], cadence: [{ f: 0, mode: 'twos' }], swordTrail: [] };
  const B: CharacterTrack = { id: bId, x: o.cx + 320, flip: true, animationClips: [{ f: 0, clip: 'stance' }], face: [{ f: 0, expr: 'angry' }], path: [], cadence: [{ f: 0, mode: 'twos' }], swordTrail: [] };
  const trk = [A, B];
  const plan: DuelPlan = { tracks: [A, B], vfx: [], sfx: [], shakes: [], zooms: [], remap: [{ f: 0, t: 0 }], hits: [], frames: need, midpoints: [], warnings };
  let f = lead, shift = 0; // f = animation time; shift = hit-stop frames inserted so far (real = anim + shift)
  let prevPos: [number, number] | null = null;
  exchanges.forEach((ex, i) => {
    const atk = trk[ex.attacker], def = trk[1 - ex.attacker];
    const { gap, err } = solveGap(aId, bId, ex, o.ground);
    if (err > (ex.response === 'hit' ? 110 : 60) && ex.response !== 'dodge') warnings.push(`exchange ${i} (${ex.attack}/${ex.response}) blade contact residual ${err.toFixed(0)}px`);
    // anchors: attacker on the left in world if attacker is slot 0 (A starts left)
    const leftIsA = true;
    const ax = o.cx - gap / 2, bx = o.cx + gap / 2;
    const pos: [number, number] = leftIsA ? [ax, bx] : [bx, ax];
    const s = f; const hit = s + SEG_PAD_BEFORE + impactOf(ex.attack);
    const move = (t: CharacterTrack, x: number, at: number) => { t.path!.push({ f: at, x, ease: 'out' }); };
    if (!prevPos) { A.x = pos[0]; B.x = pos[1]; A.path = [{ f: 0, x: pos[0] }]; B.path = [{ f: 0, x: pos[1] }]; }
    else { move(A, pos[0], s - 2); move(B, pos[1], s - 2); if (Math.abs(prevPos[0] - pos[0]) + Math.abs(prevPos[1] - pos[1]) > 30) { } }
    prevPos = pos;
    atk.animationClips.push({ f: s + SEG_PAD_BEFORE, clip: ex.attack, blend: 3 } as ClipCue);
    const r = RESP_CLIP[ex.response];
    def.animationClips.push({ f: hit - r.lead, clip: r.clip, blend: ex.response === 'hit' ? 0 : 3 });
    const end = hit + SEG_PAD_AFTER + 6;
    atk.animationClips.push({ f: end, clip: 'stance', blend: 8 }); def.animationClips.push({ f: end, clip: 'stance', blend: 8 });
    atk.cadence!.push({ f: hit - 12, mode: 'ones' }, { f: end, mode: 'twos' }); def.cadence!.push({ f: hit - 12, mode: 'ones' }, { f: end, mode: 'twos' });
    atk.swordTrail!.push({ from: hit - 7, to: hit + 6, frames: 4, color: ex.attacker === 0 ? '#bff9ff' : '#ffc0c8' });
    atk.face!.push({ f: hit - 6, expr: 'angry' }); def.face!.push({ f: hit - 6, expr: ex.response === 'hit' ? 'pain' : ex.response === 'dodge' ? 'surprise' : 'resolve', blend: 2 }, { f: end, expr: 'angry', blend: 8 });
    // shared collision event
    const strength = ex.strength ?? (ex.response === 'hit' ? 1 : ex.response === 'guard' ? 0.8 : 0.5);
    const ap = clipPoseAt({ f: 0, clip: ex.attack }, impactOf(ex.attack));
    const aW: W = { x: pos[ex.attacker], y: o.ground, flip: ex.attacker === 1, scale: CHARACTERS[atk.id].height };
    const tip = toWorld({ ...aW, x: aW.x + (aW.flip ? -1 : 1) * 0 }, swordTip(ap));
    const contact = ex.response !== 'dodge';
    const H = hit + shift;
    const ev: HitEvent = { f: H, kind: ex.response, x: tip[0], y: Math.min(tip[1], o.ground - 20), contact, strength, attacker: atk.id, defender: def.id };
    plan.hits.push(ev);
    plan.midpoints.push({ f: H, x: (pos[0] + pos[1]) / 2, gap });
    if (contact) {
      const hs = holdOf(ex);
      plan.remap.push({ f: H, t: hit }, { f: H + hs, t: hit });
      const sd = o.seed + i * 7;
      plan.vfx.push(
        { type: 'flash', f: H, dur: 3, intensity: 0.3 * strength },
        { type: 'impactBurst', f: H, dur: 9, x: ev.x, y: ev.y, space: 'world', count: 12 + Math.round(strength * 4), seed: sd, color: ex.response === 'hit' ? '#ffc0c8' : '#fff7c8' },
        { type: 'sparks', f: H, dur: 16, x: ev.x, y: ev.y, count: 14 + Math.round(strength * 16), seed: sd + 1, angle: -90, color: ex.response === 'hit' ? '#ff9fb0' : '#ffe9a8' },
        { type: 'dust', f: H, dur: 30, x: (pos[0] + pos[1]) / 2, y: o.ground, seed: sd + 2, count: 10 },
      );
      if (strength >= 0.8) plan.vfx.push({ type: 'shockwave', f: H + 1, dur: 14, x: ev.x, y: o.ground, size: 380 * strength, color: '#d9f6ff' });
      plan.sfx.push({ f: H - 9, sound: 'whoosh', volume: 0.5 }, { f: H, sound: ex.response === 'hit' ? 'hit_heavy' : 'hit_clash', volume: 0.7 + 0.3 * strength });
      plan.shakes.push({ f: H, dur: 10 + Math.round(strength * 6), amp: 10 + 14 * strength, seed: sd });
      plan.zooms.push({ f: H, dur: 8, amount: 0.08 + 0.1 * strength });
    } else {
      plan.sfx.push({ f: H - 9, sound: 'whoosh', volume: 0.7 });
      if (ex.attack === 'slashV' || ex.attack === 'thrust') {
        plan.vfx.push({ type: 'crack', f: H, dur: 26, x: ev.x, y: o.ground + 6, seed: o.seed + i, size: 0.8, color: '#ff4466' }, { type: 'dust', f: H, dur: 24, x: ev.x, y: o.ground, seed: o.seed + i + 3, count: 8 });
        plan.sfx.push({ f: H, sound: 'crack', volume: 0.5 });
      }
    }
    if (contact) shift += holdOf(ex);
    f = end;
  });
  plan.remap.push({ f: dur, t: dur - totalHold });
  for (const t of trk) { t.animationClips.sort((a, b) => a.f - b.f); t.cadence!.sort((a, b) => a.f - b.f); if (t.path!.length === 0) t.path = undefined; }
  plan.frames = f + totalHold;
  return plan;
}
