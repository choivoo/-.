import { ease, EaseName, lerp, clamp, hashRand } from '../utils/math';

/** E. CameraDirector — keyframes, tracking, shake, impact zoom, whip pan, bounds clamping. */
export interface CameraKey { f: number; x: number; y: number; zoom: number; rot?: number; ease?: EaseName; /** horizontal motion blur (px) for whip pans */ blur?: number }
export interface ShakeEvent { f: number; dur: number; amp: number; freq?: number; seed?: number }
export interface ImpactZoom { f: number; dur: number; amount: number }
export interface CameraRig {
  keys: CameraKey[];
  shakes?: ShakeEvent[];
  impactZooms?: ImpactZoom[];
  /** tracking: follow a world-x function offset added on top of keys */
  follow?: { char: string; weight: number; dx?: number; dy?: number; from?: number; to?: number };
}
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export interface CamState { x: number; y: number; zoom: number; rot: number; blur: number }
export const VIEW_W = 1920, VIEW_H = 1080;

export function sampleKeys(keys: CameraKey[], frame: number): CamState {
  if (keys.length === 0) return { x: 960, y: 540, zoom: 1, rot: 0, blur: 0 };
  if (frame <= keys[0].f) return { x: keys[0].x, y: keys[0].y, zoom: keys[0].zoom, rot: keys[0].rot ?? 0, blur: keys[0].blur ?? 0 };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (frame <= b.f) {
      const e = ease(b.ease ?? a.ease, (frame - a.f) / Math.max(1, b.f - a.f));
      // zoom interpolates in log space so dolly-ins feel even
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), e)), rot: lerp(a.rot ?? 0, b.rot ?? 0, e), blur: lerp(a.blur ?? 0, b.blur ?? 0, e) };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l.x, y: l.y, zoom: l.zoom, rot: l.rot ?? 0, blur: l.blur ?? 0 };
}

export function shakeOffset(shakes: ShakeEvent[] | undefined, frame: number): { dx: number; dy: number; dr: number } {
  let dx = 0, dy = 0, dr = 0;
  for (const s of shakes ?? []) {
    const t = frame - s.f;
    if (t < 0 || t >= s.dur) continue;
    const decay = Math.pow(1 - t / s.dur, 1.6);
    const seed = s.seed ?? 7;
    dx += (hashRand(seed, t, 1) * 2 - 1) * s.amp * decay;
    dy += (hashRand(seed, t, 2) * 2 - 1) * s.amp * decay;
    dr += (hashRand(seed, t, 3) * 2 - 1) * s.amp * 0.02 * decay;
  }
  return { dx, dy, dr };
}

export function impactZoomAt(zs: ImpactZoom[] | undefined, frame: number): number {
  let z = 1;
  for (const s of zs ?? []) {
    const t = frame - s.f;
    if (t < 0 || t >= s.dur) continue;
    z *= 1 + s.amount * Math.pow(1 - t / s.dur, 2);
  }
  return z;
}

/** Keep the view rectangle inside the background. Returns a possibly raised zoom so no empty area shows. */
export function clampCamera(c: CamState, b: Bounds, margin = 0): CamState {
  const r = (c.rot * Math.PI) / 180, ac = Math.abs(Math.cos(r)), as = Math.abs(Math.sin(r));
  const needW = VIEW_W * ac + VIEW_H * as, needH = VIEW_W * as + VIEW_H * ac;
  const zoom = Math.max(c.zoom, needW / (b.maxX - b.minX - margin * 2), needH / (b.maxY - b.minY - margin * 2));
  const hw = needW / zoom / 2 + margin, hh = needH / zoom / 2 + margin;
  return { ...c, zoom, x: clamp(c.x, b.minX + hw, b.maxX - hw), y: clamp(c.y, b.minY + hh, b.maxY - hh) };
}

export interface CamInputs { rig: CameraRig; frame: number; bounds: Bounds; followX?: number; followY?: number; shakeMargin?: number }
export function cameraAt(i: CamInputs): CamState {
  let c = sampleKeys(i.rig.keys, i.frame);
  const fl = i.rig.follow;
  if (fl && i.followX !== undefined && (fl.from === undefined || i.frame >= fl.from) && (fl.to === undefined || i.frame <= fl.to)) {
    c = { ...c, x: lerp(c.x, i.followX + (fl.dx ?? 0), fl.weight), y: lerp(c.y, (i.followY ?? c.y) + (fl.dy ?? 0), fl.weight * 0.6) };
  }
  c = { ...c, zoom: c.zoom * impactZoomAt(i.rig.impactZooms, i.frame) };
  const margin = i.shakeMargin ?? 24;
  c = clampCamera(c, i.bounds, margin);
  const s = shakeOffset(i.rig.shakes, i.frame);
  return { ...c, x: c.x + s.dx, y: c.y + s.dy, rot: c.rot + s.dr };
}
