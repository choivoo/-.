import { hashRand, lerp, ease, EaseName } from '../utils/math';

/** C. FaceAnimation — expression table, blinking and lip-sync (voice cues or Hangul-vowel text fallback). */
export type Expression = 'neutral' | 'smile' | 'angry' | 'fear' | 'embarrassed' | 'surprise' | 'sad' | 'resolve' | 'pain';
export const EXPRESSIONS: Expression[] = ['neutral', 'smile', 'angry', 'fear', 'embarrassed', 'surprise', 'sad', 'resolve', 'pain'];
export type MouthShape = 'closed' | 'small' | 'wide' | 'a' | 'i' | 'u' | 'e' | 'o' | 'smile' | 'frown' | 'grit' | 'shout';
export const MOUTH_SHAPES: MouthShape[] = ['closed', 'small', 'wide', 'a', 'i', 'u', 'e', 'o', 'smile', 'frown', 'grit', 'shout'];

export interface MouthParams { w: number; h: number; curve: number; teeth: number }
export const MOUTHS: Record<MouthShape, MouthParams> = {
  closed: { w: 8, h: 0, curve: 0.5, teeth: 0 }, small: { w: 8, h: 3, curve: 0.5, teeth: 0 }, wide: { w: 12, h: 7, curve: 1, teeth: 0 },
  a: { w: 11, h: 10, curve: 1, teeth: 0 }, i: { w: 13, h: 3.5, curve: 0.8, teeth: 1 }, u: { w: 5.5, h: 5, curve: 0.2, teeth: 0 },
  e: { w: 12, h: 6, curve: 0.8, teeth: 0 }, o: { w: 7.5, h: 8, curve: 0.4, teeth: 0 }, smile: { w: 11, h: 0, curve: 3.5, teeth: 0 },
  frown: { w: 9, h: 0, curve: -2.6, teeth: 0 }, grit: { w: 13, h: 4.5, curve: 0, teeth: 1 }, shout: { w: 13, h: 13, curve: 1, teeth: 0 },
};

export interface FaceParams {
  browLy: number; browLa: number; browRy: number; browRa: number;
  lidL: number; lidR: number; slantL: number; slantR: number; irisScale: number;
  mouth: MouthParams; lookX: number; lookY: number;
  sweat: number; vein: number; blush: number; fearLines: number; tear: number; shade: number;
}
type ExprDef = Omit<FaceParams, 'mouth' | 'lookX' | 'lookY'> & { mouth: MouthShape };
const E = (o: Partial<ExprDef>): ExprDef => ({
  browLy: 0, browLa: 0, browRy: 0, browRa: 0, lidL: 0, lidR: 0, slantL: 0, slantR: 0, irisScale: 1,
  mouth: 'closed', sweat: 0, vein: 0, blush: 0, fearLines: 0, tear: 0, shade: 0, ...o,
});
export const EXPR_DEFS: Record<Expression, ExprDef> = {
  neutral: E({ lidL: 0.1, lidR: 0.1 }),
  smile: E({ browLy: -1, browRy: -1, lidL: 0.28, lidR: 0.28, mouth: 'smile', blush: 0.3 }),
  angry: E({ browLa: 16, browRa: -16, browLy: 3, browRy: 3, lidL: 0.32, lidR: 0.32, slantL: 14, slantR: 14, mouth: 'grit', vein: 1 }),
  fear: E({ browLa: -10, browRa: 10, browLy: -5, browRy: -5, irisScale: 0.62, mouth: 'wide', sweat: 1, fearLines: 1, lidL: -0.05, lidR: -0.05 }),
  embarrassed: E({ browLa: -10, browRa: 10, browLy: -1, browRy: -1, lidL: 0.25, lidR: 0.25, slantL: -6, slantR: -6, mouth: 'wide', sweat: 1, blush: 1 }),
  surprise: E({ browLy: -7, browRy: -7, irisScale: 0.55, mouth: 'o', lidL: -0.08, lidR: -0.08 }),
  sad: E({ browLa: -14, browRa: 14, browLy: -1, browRy: -1, lidL: 0.3, lidR: 0.3, slantL: -12, slantR: -12, mouth: 'frown', tear: 1 }),
  resolve: E({ browLa: 8, browRa: -8, browLy: 2, browRy: 2, lidL: 0.2, lidR: 0.2, slantL: 8, slantR: 8, mouth: 'closed', shade: 0.25 }),
  pain: E({ browLa: -12, browRa: 12, browLy: 1, browRy: 1, lidL: 0.55, lidR: 0.55, slantL: -8, slantR: -8, mouth: 'grit', sweat: 1 }),
};

export interface FaceCue {
  f: number; expr: Expression; blend?: number; look?: [number, number]; noBlink?: boolean;
  /** force a mouth shape (otherwise from expression / lip-sync) */
  mouth?: MouthShape;
}

const NUM_KEYS = ['browLy', 'browLa', 'browRy', 'browRa', 'lidL', 'lidR', 'slantL', 'slantR', 'irisScale', 'sweat', 'vein', 'blush', 'fearLines', 'tear', 'shade'] as const;

function resolve(cue: FaceCue): FaceParams {
  const d = EXPR_DEFS[cue.expr];
  const out = { ...d, mouth: MOUTHS[cue.mouth ?? d.mouth], lookX: cue.look?.[0] ?? 0, lookY: cue.look?.[1] ?? 0 } as FaceParams & { mouth: MouthParams };
  return out;
}
const mixFace = (a: FaceParams, b: FaceParams, w: number): FaceParams => {
  const o: any = { ...b };
  for (const k of NUM_KEYS) o[k] = lerp(a[k], b[k], w);
  o.lookX = lerp(a.lookX, b.lookX, w); o.lookY = lerp(a.lookY, b.lookY, w);
  o.mouth = { w: lerp(a.mouth.w, b.mouth.w, w), h: lerp(a.mouth.h, b.mouth.h, w), curve: lerp(a.mouth.curve, b.mouth.curve, w), teeth: w > 0.5 ? b.mouth.teeth : a.mouth.teeth };
  return o;
};

const BLINK = [0.35, 1, 1, 0.6, 0.15];
export function blinkAmount(frame: number, seed: number): number {
  const period = 90 + Math.floor(hashRand(seed, 1) * 50);
  const off = Math.floor(hashRand(seed, 2) * period);
  const ph = (frame + off) % period;
  return ph < BLINK.length ? BLINK[ph] : 0;
}

export function faceAt(cues: FaceCue[] | undefined, frame: number, seed: number, speechShape?: MouthShape | null, blinkEase: EaseName = 'linear'): FaceParams {
  const list = cues && cues.length ? cues : [{ f: 0, expr: 'neutral' as Expression }];
  let idx = 0;
  for (let i = 0; i < list.length; i++) if (list[i].f <= frame) idx = i;
  const cur = list[idx];
  let p = resolve(cur);
  if (idx > 0) {
    const b = cur.blend ?? 3;
    const into = frame - cur.f;
    if (b > 0 && into < b) p = mixFace(resolve(list[idx - 1]), p, ease('inOut', (into + 1) / (b + 1)));
  }
  if (speechShape) p = { ...p, mouth: MOUTHS[speechShape] };
  if (!cur.noBlink) {
    const bl = ease(blinkEase, blinkAmount(frame, seed));
    if (bl > 0) { p = { ...p, lidL: Math.max(p.lidL, bl), lidR: Math.max(p.lidR, bl) }; }
  }
  return p;
}

// ---- lip sync --------------------------------------------------------------------------------
export interface MouthCue { f: number; shape: MouthShape }
const JUNG_SHAPE: MouthShape[] = ['a', 'e', 'a', 'e', 'e', 'e', 'e', 'e', 'o', 'a', 'e', 'o', 'o', 'u', 'u', 'e', 'i', 'u', 'u', 'i', 'i'];
/** Fallback lip-sync when no recorded voice exists: one syllable every `framesPerSyllable`, shape from the Hangul vowel. */
export function textMouthCues(text: string, framesPerSyllable = 3): MouthCue[] {
  const cues: MouthCue[] = [];
  let f = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const jung = Math.floor(((code - 0xac00) % 588) / 28);
      const jong = (code - 0xac00) % 28;
      cues.push({ f, shape: JUNG_SHAPE[jung] });
      cues.push({ f: f + Math.max(1, Math.round(framesPerSyllable * 0.65)), shape: jong ? 'small' : 'closed' });
      f += framesPerSyllable;
    } else if (/[\s,.!?…~—-]/.test(ch)) {
      cues.push({ f, shape: 'closed' });
      f += /[,.!?…]/.test(ch) ? framesPerSyllable * 2 : Math.ceil(framesPerSyllable / 2);
    } else { cues.push({ f, shape: 'e' }); f += framesPerSyllable; }
  }
  cues.push({ f, shape: 'closed' });
  return cues;
}
export function mouthAt(cues: MouthCue[], local: number): MouthShape | null {
  if (local < 0 || cues.length === 0 || local > cues[cues.length - 1].f) return null;
  let s: MouthShape | null = null;
  for (const c of cues) if (c.f <= local) s = c.shape;
  return s;
}
