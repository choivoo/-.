import type { ShotSpec, CharacterTrack, DialogueLine, SfxCue } from '../../src/scenes/types';
import type { Expression } from '../../src/animation/Face';
import type { CameraKey } from '../../src/camera/CameraDirector';
import type { VfxEvent } from '../../src/effects/VFXComposer';
import type { ClipCue } from '../../src/animation/ActionAnimator';

/** Beat templates: each returns a ShotSpec body whose timing is expressed relative to `dur` (frames). */
export type Beat = { sec: number; build: (dur: number, ctx: BeatCtx) => Partial<ShotSpec> & { characters: CharacterTrack[]; cameraKeyframes: CameraKey[] }; minFrames?: (ctx: BeatCtx) => number };
export interface BeatCtx { seed: number }
const amb = (v = 0.3): SfxCue => ({ f: 0, sound: 'wind_loop', volume: v });
const FP = 3.3; // frames per spoken char (placeholder pacing)
export const lineFrames = (text: string) => Math.max(26, Math.round(text.replace(/\s/g, '').length * FP) + 8);

export type Line = [speaker: string, text: string, expr?: Expression];
function layoutLines(lines: Line[], start = 12): { dialogue: DialogueLine[]; end: number } {
  let f = start; const dialogue: DialogueLine[] = [];
  for (const [sp, text] of lines) { const d = lineFrames(text); dialogue.push({ f, dur: d, speaker: sp, text, voiceAsset: null, placeholderVoice: true }); f += d + 10; }
  return { dialogue, end: f + 12 };
}
const faceFor = (id: string, lines: Line[], dialogue: DialogueLine[], base: Expression) => {
  const cues = [{ f: 0, expr: base }];
  lines.forEach((l, i) => { if (l[0] === id && l[2]) cues.push({ f: dialogue[i].f - 4, expr: l[2] } as never); });
  return cues;
};
const talkClips = (id: string, dialogue: DialogueLine[], dur: number): ClipCue[] => {
  const cues: ClipCue[] = [{ f: 0, clip: 'idle' }];
  for (const d of dialogue) if (d.speaker === id) { cues.push({ f: d.f, clip: 'talk', blend: 6 }); cues.push({ f: Math.min(dur - 1, d.f + d.dur), clip: 'idle', blend: 8 }); }
  return cues.sort((a, b) => a.f - b.f);
};

export const minForLines = (lines: Line[]) => layoutLines(lines).end;

export function establish(sec: number, bg: string, c0: [number, number, number], c1: [number, number, number], o: { chars?: [string, number, boolean?][]; vfx?: VfxEvent[]; lines?: Line[]; sfx?: SfxCue[]; fade?: 'in' | 'out' | 'both' } = {}): Beat {
  return {
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
export function talk(sec: number, bg: string, a: string, b: string, lines: Line[], o: { zoom?: number; aX?: number; bX?: number; baseA?: Expression; baseB?: Expression; sfx?: SfxCue[]; vfx?: VfxEvent[] } = {}): Beat {
  return {
    sec, minFrames: () => minForLines(lines),
    build: (dur) => {
      const { dialogue } = layoutLines(lines);
      const ax = o.aX ?? 1380, bx = o.bX ?? 1820, z = o.zoom ?? 1.75, mid = (ax + bx) / 2;
      return {
        backgroundId: bg, dialogue,
        characters: [
          { id: a, x: ax, animationClips: talkClips(a, dialogue, dur), face: faceFor(a, lines, dialogue, o.baseA ?? 'neutral'), cadence: [{ f: 0, mode: 'twos' as const }] },
          { id: b, x: bx, flip: true, animationClips: talkClips(b, dialogue, dur), face: faceFor(b, lines, dialogue, o.baseB ?? 'neutral'), cadence: [{ f: 0, mode: 'twos' as const }] },
        ],
        cameraKeyframes: [{ f: 0, x: mid, y: 600, zoom: z }, { f: dur, x: mid + 20, y: 590, zoom: z * 1.07, ease: 'out' }],
        vfx: [{ type: 'wind', f: 0, dur, seed: 6, intensity: 0.5 }, ...(o.vfx ?? [])], soundEffects: [amb(0.2), ...(o.sfx ?? [])],
      };
    },
  };
}

/** one character, medium or close framing */
export function single(sec: number, bg: string, id: string, lines: Line[], o: { expr?: Expression; zoom?: number; look?: [number, number]; ext?: boolean; sfx?: SfxCue[]; vfx?: VfxEvent[]; flip?: boolean; others?: [string, number][] } = {}): Beat {
  return {
    sec, minFrames: () => (lines.length ? minForLines(lines) : 0),
    build: (dur) => {
      const { dialogue } = layoutLines(lines);
      const z = o.zoom ?? (o.ext ? 5.2 : 3.0);
      const headY = o.ext ? 478 : 560;
      return {
        backgroundId: bg, dialogue,
        characters: [
          { id, x: 1500, flip: !!o.flip, animationClips: talkClips(id, dialogue, dur), face: [{ f: 0, expr: o.expr ?? 'neutral', look: o.look ?? [0.3, 0] }, ...lines.filter((l) => l[2]).map((l, i) => ({ f: dialogue[lines.indexOf(l)].f - 4, expr: l[2]!, look: o.look ?? ([0.3, 0] as [number, number]) }))] },
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
