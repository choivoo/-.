import type { ShotSpec, CharacterTrack, DialogueLine, SfxCue } from '../../src/scenes/types';
import type { Expression } from '../../src/animation/Face';
import type { CameraKey } from '../../src/camera/CameraDirector';
import type { VfxEvent } from '../../src/effects/VFXComposer';
import type { ClipCue } from '../../src/animation/ActionAnimator';
import { planDuel, exchangeFrames, Exchange } from '../../src/animation/Choreography';

/** Beat templates: each returns a ShotSpec body whose timing is expressed relative to `dur` (frames). */
export type Beat = { sec: number; kind?: string; build: (dur: number, ctx: BeatCtx) => Partial<ShotSpec> & { characters: CharacterTrack[]; cameraKeyframes: CameraKey[] }; minFrames?: (ctx: BeatCtx) => number };
export interface BeatCtx { seed: number }
const amb = (v = 0.3): SfxCue => ({ f: 0, sound: 'wind_loop', volume: v });
import { existsSync, readFileSync } from 'node:fs';
const FP = 3.3; // frames per spoken char (fallback pacing when no voice analysis exists)
const ANALYSIS: Record<string, { frames: number; cues: { f: number; shape: string }[] }> = existsSync('episode/EP01/audio/voice_analysis.json') ? JSON.parse(readFileSync('episode/EP01/audio/voice_analysis.json', 'utf8')) : {};
export const lineFrames = (text: string, speaker = '') => { const a = ANALYSIS[`${speaker}|${text}`]; return a ? a.frames + 8 : Math.max(26, Math.round(text.replace(/\s/g, '').length * FP) + 8); };

export type Line = [speaker: string, text: string, expr?: Expression];
function layoutLines(lines: Line[], start = 12): { dialogue: DialogueLine[]; end: number } {
  let f = start; const dialogue: DialogueLine[] = [];
  for (const [sp, text] of lines) { const d = lineFrames(text, sp); const a = ANALYSIS[`${sp}|${text}`]; dialogue.push({ f, dur: d, speaker: sp, text, voiceAsset: null, placeholderVoice: true, ...(a ? { mouthCues: a.cues as never } : {}) }); f += d + 10; }
  return { dialogue, end: f + 12 };
}
const faceFor = (id: string, lines: Line[], dialogue: DialogueLine[], base: Expression) => {
  const cues = [{ f: 0, expr: base }];
  lines.forEach((l, i) => { if (l[0] === id && l[2]) cues.push({ f: dialogue[i].f - 4, expr: l[2] } as never); });
  return cues;
};
const GESTURE: Record<string, string> = { angry: 'gestureA', sad: 'clutch', fear: 'cower', surprise: 'recoil', smile: 'gestureB', embarrassed: 'gestureB', resolve: 'talk', pain: 'clutch', neutral: 'talk' };
const REACT: Record<string, string | null> = { angry: 'recoil', fear: 'recoil', sad: 'nod', smile: 'nod', surprise: 'headShake', embarrassed: 'nod', resolve: null, pain: 'nod', neutral: null };
/** Dialogue-driven acting: speakers gesture according to emotion, listeners react to what was said. */
const talkClips = (id: string, dialogue: DialogueLine[], dur: number, lines: Line[] = []): ClipCue[] => {
  const cues: ClipCue[] = [{ f: 0, clip: 'idle' }];
  let li = 0;
  dialogue.forEach((d, i) => {
    const expr = lines[i]?.[2] ?? 'neutral';
    if (d.speaker === id) {
      const g = expr === 'neutral' && i % 2 ? 'gestureA' : GESTURE[expr] ?? 'talk';
      cues.push({ f: Math.max(1, d.f - 3), clip: g, blend: 5 });
      cues.push({ f: Math.min(dur - 1, d.f + d.dur + 2), clip: 'idle', blend: 8 });
    } else if (d.speaker !== 'narration' && lines[i]) {
      const r = REACT[expr] ?? (i % 2 ? 'nod' : null);
      if (r && d.f + 14 < dur) { cues.push({ f: d.f + 10 + (li++ % 3) * 3, clip: r, blend: 3 }); cues.push({ f: Math.min(dur - 1, d.f + 10 + 24), clip: 'idle', blend: 8 }); }
    }
  });
  const out: ClipCue[] = []; let last = -1;
  for (const c of cues.sort((a, b) => a.f - b.f)) { if (c.f <= last) continue; out.push(c); last = c.f; }
  return out;
};
const reactFace = (id: string, lines: Line[], dialogue: DialogueLine[], base: Expression) => {
  const cues: { f: number; expr: Expression; blend?: number }[] = [{ f: 0, expr: base }];
  lines.forEach((l, i) => {
    const e = l[2] ?? 'neutral';
    if (l[0] === id) cues.push({ f: dialogue[i].f - 4, expr: e, blend: 3 });
    else if (l[0] !== 'narration') {
      const m: Partial<Record<Expression, Expression>> = { angry: 'fear', fear: 'surprise', sad: 'sad', smile: 'smile', surprise: 'surprise', pain: 'sad', embarrassed: 'surprise' };
      const r = m[e]; if (r) cues.push({ f: dialogue[i].f + 6, expr: r, blend: 5 }); 
      cues.push({ f: dialogue[i].f + dialogue[i].dur + 6, expr: base, blend: 8 });
    }
  });
  return cues.sort((a, b) => a.f - b.f);
};

export const minForLines = (lines: Line[]) => layoutLines(lines).end;

export function establish(sec: number, bg: string, c0: [number, number, number], c1: [number, number, number], o: { chars?: [string, number, boolean?][]; vfx?: VfxEvent[]; lines?: Line[]; sfx?: SfxCue[]; fade?: 'in' | 'out' | 'both' } = {}): Beat {
  return {
    kind: 'establish',
    sec,
    minFrames: () => (o.lines ? minForLines(o.lines) : 0),
    build: (dur) => {
      const { dialogue } = layoutLines(o.lines ?? [], 16);
      return {
        backgroundId: bg, dialogue,
        characters: (o.chars ?? []).map(([id, x, flip]) => ({ id, x, flip: !!flip, animationClips: [{ f: 0, clip: 'idle' as const }], face: [{ f: 0, expr: 'neutral' as const }] })),
        cameraKeyframes: [{ f: 0, x: c0[0], y: c0[1], zoom: c0[2] }, { f: dur, x: c1[0], y: c1[1], zoom: c1[2], ease: 'inOut' }],
        vfx: [{ type: 'fog', f: 0, dur, y: 770, seed: 5, intensity: 0.7 }, { type: 'wind', f: 0, dur, seed: 3 }, ...(o.vfx ?? []).map((v) => ({ ...v, dur: v.dur || dur }))],
        soundEffects: [amb(), ...(o.sfx ?? [])],
        transition: o.fade === 'in' ? { inType: 'fadeBlack', inFrames: 18 } : o.fade === 'out' ? { outType: 'fadeBlack', outFrames: 24 } : o.fade === 'both' ? { inType: 'fadeBlack', inFrames: 18, outType: 'fadeBlack', outFrames: 24 } : undefined,
      };
    },
  };
}

/** two characters facing each other, slow push-in, lines laid out sequentially */
/** Camera favours the current speaker: eases toward them before each line, keeps a slow push-in overall. */
function talkCamera(dialogue: DialogueLine[], ids: [string, string], ax: number, bx: number, mid: number, z: number, dur: number) {
  const keys: CameraKey[] = [{ f: 0, x: mid, y: 600, zoom: z }];
  let last = 0;
  dialogue.forEach((d, i) => {
    const sx = d.speaker === ids[0] ? ax : d.speaker === ids[1] ? bx : mid;
    const f0 = Math.max(last + 1, d.f - 8), f1 = Math.max(f0 + 1, d.f + 6);
    if (f1 >= dur) return;
    keys.push({ f: f0, x: keys[keys.length - 1].x, y: keys[keys.length - 1].y, zoom: keys[keys.length - 1].zoom });
    keys.push({ f: f1, x: mid + (sx - mid) * 0.32, y: 595 - (i % 2) * 8, zoom: z * (1.04 + 0.025 * (i % 3)), ease: 'inOut' });
    last = f1;
  });
  keys.push({ f: dur, x: keys[keys.length - 1].x + 12, y: keys[keys.length - 1].y, zoom: keys[keys.length - 1].zoom * 1.03, ease: 'out' });
  return keys;
}
export function talk(sec: number, bg: string, a: string, b: string, lines: Line[], o: { zoom?: number; aX?: number; bX?: number; baseA?: Expression; baseB?: Expression; sfx?: SfxCue[]; vfx?: VfxEvent[] } = {}): Beat {
  return {
    kind: 'dialogue',
    sec, minFrames: () => minForLines(lines),
    build: (dur) => {
      const { dialogue } = layoutLines(lines);
      const ax = o.aX ?? 1380, bx = o.bX ?? 1820, z = o.zoom ?? 1.75, mid = (ax + bx) / 2;
      return {
        backgroundId: bg, dialogue,
        characters: [
          { id: a, x: ax, animationClips: talkClips(a, dialogue, dur, lines), face: reactFace(a, lines, dialogue, o.baseA ?? 'neutral'), cadence: [{ f: 0, mode: 'twos' as const }] },
          { id: b, x: bx, flip: true, animationClips: talkClips(b, dialogue, dur, lines), face: reactFace(b, lines, dialogue, o.baseB ?? 'neutral'), cadence: [{ f: 0, mode: 'twos' as const }] },
        ],
        cameraKeyframes: talkCamera(dialogue, [a, b], ax, bx, mid, z, dur),
        vfx: [{ type: 'wind', f: 0, dur, seed: 6, intensity: 0.5 }, ...(o.vfx ?? [])], soundEffects: [amb(0.2), ...(o.sfx ?? [])],
      };
    },
  };
}

/** one character, medium or close framing */
export function single(sec: number, bg: string, id: string, lines: Line[], o: { expr?: Expression; zoom?: number; look?: [number, number]; ext?: boolean; sfx?: SfxCue[]; vfx?: VfxEvent[]; flip?: boolean; others?: [string, number][] } = {}): Beat {
  return {
    kind: 'closeup',
    sec, minFrames: () => (lines.length ? minForLines(lines) : 0),
    build: (dur) => {
      const { dialogue } = layoutLines(lines);
      const z = o.zoom ?? (o.ext ? 5.2 : 3.0);
      const headY = o.ext ? 478 : 560;
      return {
        backgroundId: bg, dialogue,
        characters: [
          { id, x: 1500, flip: !!o.flip, animationClips: talkClips(id, dialogue, dur, lines), face: [{ f: 0, expr: o.expr ?? 'neutral', look: o.look ?? [0.3, 0] }, ...lines.filter((l) => l[2]).map((l, i) => ({ f: dialogue[lines.indexOf(l)].f - 4, expr: l[2]!, look: o.look ?? ([0.3, 0] as [number, number]) }))] },
          ...(o.others ?? []).map(([oid, ox]) => ({ id: oid, x: ox, animationClips: [{ f: 0, clip: 'idle' }], face: [{ f: 0, expr: 'neutral' as const }] })),
        ],
        cameraKeyframes: [{ f: 0, x: 1500 + (o.flip ? -12 : 12), y: headY, zoom: z }, { f: dur, x: 1500 + (o.flip ? -16 : 16), y: headY + 4, zoom: z * 1.1, ease: 'out' }],
        vfx: [{ type: 'wind', f: 0, dur, seed: 7, intensity: 0.4 }, ...(o.vfx ?? [])], soundEffects: [amb(0.2), ...(o.sfx ?? [])],
      };
    },
  };
}

export function walk(sec: number, bg: string, ids: string[], x0: number, x1: number, o: { run?: boolean; lines?: Line[]; vfx?: VfxEvent[]; sfx?: SfxCue[]; zoom?: number; flip?: boolean } = {}): Beat {
  return {
    kind: 'movement',
    sec, minFrames: () => (o.lines ? minForLines(o.lines) : 0),
    build: (dur) => {
      const { dialogue } = layoutLines(o.lines ?? [], 14);
      const dir = o.flip ? -1 : 1;
      const clip = o.run ? 'run' : 'walk';
      return {
        backgroundId: bg, dialogue,
        characters: ids.map((id, i) => ({
          id, x: x0, flip: !!o.flip, path: [{ f: 0, x: x0 - dir * i * 190 }, { f: dur, x: x1 - dir * i * 190, ease: 'linear' as const }],
          animationClips: [{ f: 0, clip, speed: i ? 0.95 : 1 }], face: [{ f: 0, expr: o.run ? ('resolve' as const) : ('neutral' as const) }],
        })),
        cameraKeyframes: [{ f: 0, x: x0 + dir * 200, y: 610, zoom: o.zoom ?? 1.5 }, { f: dur, x: x1 + dir * 200, y: 610, zoom: o.zoom ?? 1.5 }],
        vfx: [{ type: 'wind', f: 0, dur, seed: 8, intensity: 0.5 }, ...(o.run ? [{ type: 'dust' as const, f: 0, dur, x: x0, y: 840, seed: 77, count: 10 }] : []), ...(o.vfx ?? [])],
        soundEffects: [amb(0.25), ...Array.from({ length: Math.floor(dur / (o.run ? 8 : 14)) }, (_, k) => ({ f: k * (o.run ? 8 : 14) + 2, sound: 'step', volume: 0.25 })), ...(o.sfx ?? [])],
      };
    },
  };
}

/** generic exchange of blows: both fighters trade a slash, with impact FX at the contact point. */
export function clash(sec: number, bg: string, a: string, b: string, o: { x?: number; seed?: number; lines?: Line[]; sfx?: SfxCue[] } = {}): Beat {
  return {
    sec, minFrames: () => (o.lines ? minForLines(o.lines) : 0),
    build: (dur) => {
      const sd = o.seed ?? 3, cx = o.x ?? 1700, hit = Math.round(dur * 0.45);
      const { dialogue } = layoutLines(o.lines ?? [], 6);
      return {
        backgroundId: bg, dialogue,
        characters: [
          { id: a, x: cx - 340, animationClips: [{ f: 0, clip: 'stance' }, { f: hit - 9, clip: 'slashH', blend: 3 }, { f: hit + 14, clip: 'stance', blend: 8 }], face: [{ f: 0, expr: 'angry' }], cadence: [{ f: 0, mode: 'twos' }, { f: hit - 12, mode: 'ones' }, { f: hit + 16, mode: 'twos' }], swordTrail: [{ from: hit - 8, to: hit + 8, frames: 4 }] },
          { id: b, x: cx + 330, flip: true, animationClips: [{ f: 0, clip: 'stance' }, { f: hit - 11, clip: 'slashV', blend: 3 }, { f: hit + 16, clip: 'stance', blend: 8 }], face: [{ f: 0, expr: 'angry' }], cadence: [{ f: 0, mode: 'twos' }, { f: hit - 12, mode: 'ones' }, { f: hit + 16, mode: 'twos' }], swordTrail: [{ from: hit - 10, to: hit + 8, frames: 4, color: '#ffc0c8' }] },
        ],
        timeRemap: [{ f: 0, t: 0 }, { f: hit, t: hit }, { f: hit + 4, t: hit }, { f: dur, t: dur - 4 }],
        cameraKeyframes: [{ f: 0, x: cx - 40, y: 650, zoom: 1.3 }, { f: dur, x: cx, y: 640, zoom: 1.55, ease: 'out' }],
        impactZooms: [{ f: hit, dur: 9, amount: 0.2 }], cameraShake: [{ f: hit, dur: 16, amp: 26, seed: sd }],
        vfx: [
          { type: 'flash', f: hit, dur: 3, intensity: 0.4 }, { type: 'impactBurst', f: hit, dur: 10, x: cx, y: 610, space: 'world', count: 14, seed: sd },
          { type: 'sparks', f: hit, dur: 18, x: cx, y: 610, count: 28, seed: sd + 1, angle: -90 }, { type: 'shockwave', f: hit + 1, dur: 16, x: cx, y: 840, size: 520, color: '#d9f6ff' },
          { type: 'dust', f: hit, dur: 40, x: cx, y: 840, seed: sd + 2, count: 12 },
        ],
        soundEffects: [amb(0.25), { f: hit - 10, sound: 'whoosh', volume: 0.6 }, { f: hit, sound: 'hit_clash', volume: 1 }, ...(o.sfx ?? [])],
      };
    },
  };
}

/** time-stop: world frozen (hold cadence) except the awakened hero */
export function timestop(sec: number, bg: string, hero: string, frozen: [string, number, boolean?][], o: { lines?: Line[]; run?: boolean } = {}): Beat {
  return {
    kind: 'ability',
    sec, minFrames: () => (o.lines ? minForLines(o.lines) : 0),
    build: (dur) => {
      const { dialogue } = layoutLines(o.lines ?? [], 14);
      return {
        backgroundId: bg, dialogue,
        characters: [
          ...frozen.map(([id, x, flip]) => ({ id, x, flip: !!flip, animationClips: [{ f: 0, clip: 'run' as const, from: 5 }], face: [{ f: 0, expr: 'fear' as const, noBlink: true }], cadence: [{ f: 0, mode: 'hold' as const, holdAt: 0 }] })),
          { id: hero, x: 900, path: [{ f: 0, x: 900 }, { f: dur, x: 1900, ease: 'linear' as const }], animationClips: [{ f: 0, clip: o.run ? 'run' : 'walk' }], face: [{ f: 0, expr: 'surprise' as const }, { f: 30, expr: 'resolve' as const, blend: 8 }] },
        ],
        cameraKeyframes: [{ f: 0, x: 1100, y: 620, zoom: 1.4 }, { f: dur, x: 1800, y: 600, zoom: 1.5, ease: 'inOut' }],
        vfx: [{ type: 'energy', f: 0, dur, x: 1400, y: 700, seed: 14, count: 36, size: 2 }, { type: 'bloom', f: 0, dur, x: 960, y: 540, size: 700, color: '#ffffff', intensity: 0.3 }],
        soundEffects: [{ f: 0, sound: 'heartbeat', volume: 0.7 }, { f: 0, sound: 'rumble', volume: 0.3 }],
      };
    },
  };
}

/** opening / ending montage cut with big title text */
export function montage(sec: number, bg: string, id: string, clip: string, text: string, o: { other?: string; zoom?: number; flip?: boolean; expr?: Expression } = {}): Beat {
  return {
    kind: 'montage',
    sec,
    build: (dur) => ({
      backgroundId: bg, title: text,
      characters: [
        { id, x: 1500, flip: !!o.flip, animationClips: [{ f: 0, clip: 'stance' }, { f: Math.round(dur * 0.4), clip, blend: 3 }, { f: Math.round(dur * 0.4) + 24, clip: 'stance', blend: 6 }], face: [{ f: 0, expr: o.expr ?? 'resolve' }], cadence: [{ f: 0, mode: 'twos' }], swordTrail: [{ from: Math.round(dur * 0.4), to: Math.round(dur * 0.4) + 14, frames: 4 }] },
        ...(o.other ? [{ id: o.other, x: 1950, flip: true, animationClips: [{ f: 0, clip: 'stance' as const }], face: [{ f: 0, expr: 'angry' as const }] }] : []),
      ],
      cameraKeyframes: [{ f: 0, x: 1500, y: 640, zoom: (o.zoom ?? 1.5) * 1.15 }, { f: dur, x: 1600, y: 620, zoom: o.zoom ?? 1.5, ease: 'out' }],
      vfx: [{ type: 'speedLines', f: 0, dur: Math.min(dur, 30), seed: 31, intensity: 0.5 }, { type: 'wind', f: 0, dur, seed: 9 }, { type: 'flash', f: Math.round(dur * 0.4), dur: 4, intensity: 0.4 }],
      soundEffects: [amb(0.2), { f: Math.round(dur * 0.4) - 4, sound: 'whoosh', volume: 0.5 }],
    }),
  };
}

/** Physically-grounded exchange of blows (shared collision events from blade geometry). */
export function duel(sec: number, bg: string, a: string, b: string, exchanges: Exchange[], o: { cx?: number; seed?: number; lines?: Line[]; zoom?: number; sfx?: SfxCue[] } = {}): Beat {
  return {
    kind: 'duel',
    sec,
    minFrames: () => exchanges.reduce((n, e) => n + exchangeFrames(e), 0) + 4 * exchanges.length + 6 + (o.lines ? 0 : 0),
    build: (dur) => {
      const cx = o.cx ?? 1700;
      // fill the shot with a varied rally: extra exchanges are inserted before the scripted finishing exchange
      const ex = [...exchanges]; const fin = ex.pop()!;
      const atks = ['slashH', 'slashV', 'thrust', 'counter'] as const, resp = ['guard', 'dodge', 'guard'] as const;
      let used = [...ex, fin].reduce((n, e) => n + exchangeFrames(e) + 4, 0) + 20, k = (o.seed ?? 5) % 4;
      while (ex.length < 9) {
        const e = { attacker: (ex.length + k) % 2 as 0 | 1, attack: atks[(ex.length + k) % 4], response: atks[(ex.length + k) % 4] === 'thrust' ? 'dodge' : resp[(ex.length + k) % 3], strength: 0.8 } as Exchange;
        if (used + exchangeFrames(e) + 4 > dur) break; ex.push(e); used += exchangeFrames(e) + 4;
      }
      ex.push(fin);
      const plan = planDuel(a, b, ex, dur, { cx, ground: 840, seed: o.seed ?? 5 });
      if (plan.warnings.length) console.warn(`  duel warning (${bg}/${a}-${b}): ${plan.warnings.join('; ')}`);
      const { dialogue } = layoutLines(o.lines ?? [], 6);
      const z = o.zoom ?? 1.3;
      const keys: CameraKey[] = [{ f: 0, x: cx, y: 650, zoom: Math.min(z, 1920 * 0.78 / ((plan.midpoints[0]?.gap ?? 600) + 380)) }];
      for (const m of plan.midpoints) { keys.push({ f: Math.max(keys[keys.length - 1].f + 1, m.f - 8), x: keys[keys.length - 1].x, y: keys[keys.length - 1].y, zoom: keys[keys.length - 1].zoom }); const fit = Math.min(z * 1.22, (1920 * 0.78) / (m.gap + 380)); keys.push({ f: m.f + 6, x: m.x, y: 640, zoom: fit, ease: 'out' }); keys.push({ f: m.f + 26, x: m.x, y: 650, zoom: Math.min(z, fit), ease: 'inOut' }); }
      keys.push({ f: dur, x: keys[keys.length - 1].x, y: 650, zoom: keys[keys.length - 1].zoom });
      const uniq = keys.filter((k, i) => i === 0 || k.f > keys[i - 1].f);
      return {
        backgroundId: bg, dialogue, characters: plan.tracks, cameraKeyframes: uniq.filter((k) => k.f <= dur), timeRemap: plan.remap, cameraShake: plan.shakes, impactZooms: plan.zooms,
        vfx: [{ type: 'wind', f: 0, dur, seed: 4, intensity: 0.5 }, ...plan.vfx.filter((v) => v.f < dur)], soundEffects: [amb(0.22), ...plan.sfx.filter((e) => e.f >= 0 && e.f < dur), ...(o.sfx ?? [])],
        kind: 'duel', hitEvents: plan.hits,
      } as never;
    },
  };
}
