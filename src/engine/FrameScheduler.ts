/**
 * A. FrameScheduler — 24fps timeline with per-layer drawing cadence.
 * Characters can be drawn on twos while camera/BG/VFX keep updating every output frame.
 */
export const FPS = 24;
export type Cadence = 'ones' | 'twos' | 'threes' | 'hold';
export type CadenceOverride = 'auto' | Cadence;
export const CADENCE_STEP: Record<Exclude<Cadence, 'hold'>, number> = { ones: 1, twos: 2, threes: 3 };
export interface CadenceKey { f: number; mode: Cadence; /** frame to freeze on when mode==='hold' (defaults to f) */ holdAt?: number }

/** Default On Twos: poseFrame = floor(frame / 2) * 2 */
export function poseFrame(frame: number, mode: Cadence, offset = 0, holdAt = 0): number {
  if (mode === 'hold') return holdAt;
  const n = CADENCE_STEP[mode];
  if (frame < offset) return frame;
  return Math.floor((frame - offset) / n) * n + offset;
}

export function cadenceAt(keys: CadenceKey[] | undefined, frame: number, fallback: Cadence = 'twos'): { mode: Cadence; offset: number; holdAt: number } {
  let cur: CadenceKey | undefined;
  if (keys) for (const k of keys) if (k.f <= frame && (!cur || k.f >= cur.f)) cur = k;
  if (!cur) return { mode: fallback, offset: 0, holdAt: 0 };
  return { mode: cur.mode, offset: cur.f, holdAt: cur.holdAt ?? cur.f };
}

/** Final drawing frame for a layer, taking cadence keys and the editor override into account. */
export function scheduleLayer(frame: number, keys: CadenceKey[] | undefined, fallback: Cadence, override: CadenceOverride = 'auto'): number {
  if (override !== 'auto') return poseFrame(frame, override);
  const c = cadenceAt(keys, frame, fallback);
  return poseFrame(frame, c.mode, c.offset, c.holdAt);
}

export interface TimeRemapKey { f: number; t: number }
/** Piecewise-linear shot-frame -> animation-time map (slow motion, hit-stop). Camera ignores it. */
export function remapTime(frame: number, map: TimeRemapKey[] | undefined): number {
  if (!map || map.length === 0) return frame;
  if (frame <= map[0].f) return map[0].t + (frame - map[0].f);
  for (let i = 1; i < map.length; i++) {
    const a = map[i - 1], b = map[i];
    if (frame <= b.f) return b.f === a.f ? b.t : a.t + ((b.t - a.t) * (frame - a.f)) / (b.f - a.f);
  }
  const last = map[map.length - 1];
  return last.t + (frame - last.f);
}

export const secondsToFrames = (s: number) => Math.round(s * FPS);
export const framesToSeconds = (f: number) => f / FPS;
export function timecode(frame: number): string {
  const s = Math.floor(frame / FPS), m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(frame % FPS).padStart(2, '0')}`;
}
