import React from 'react';
import { hashRand, ease, clamp, lerp } from '../utils/math';

/** F. VFXComposer — stateless, seeded, frame-deterministic effects. Same (event, frame) -> same markup. */
export type VfxType = 'dust' | 'smoke' | 'fog' | 'wind' | 'speedLines' | 'slash' | 'flash' | 'bloom' | 'shockwave' | 'debris' | 'crack' | 'energy' | 'sparks' | 'impactBurst' | 'vignette';
export interface VfxEvent {
  type: VfxType; f: number; dur: number;
  x?: number; y?: number; seed?: number; count?: number; size?: number; color?: string; angle?: number;
  space?: 'world' | 'screen';
  intensity?: number; dir?: 1 | -1;
}
const W = 1920, H = 1080;

// cache of random tables per (seed,count) — avoids recomputing hashes every frame
const tableCache = new Map<string, Float32Array>();
function table(seed: number, n: number): Float32Array {
  const key = `${seed}:${n}`;
  let t = tableCache.get(key);
  if (!t) { t = new Float32Array(n * 6); for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) t[i * 6 + k] = hashRand(seed, i, k); if (tableCache.size > 300) tableCache.clear(); tableCache.set(key, t); }
  return t;
}

export function isVfxActive(e: VfxEvent, frame: number) { return frame >= e.f && frame < e.f + e.dur; }
export const vfxSpace = (e: VfxEvent): 'world' | 'screen' => e.space ?? (['flash', 'speedLines', 'bloom', 'vignette', 'impactBurst'].includes(e.type) ? 'screen' : 'world');

export function renderVfx(e: VfxEvent, frame: number, key: string): React.ReactNode {
  if (!isVfxActive(e, frame)) return null;
  const t = frame - e.f, u = t / e.dur;
  const seed = e.seed ?? 1, x = e.x ?? 0, y = e.y ?? 0, I = e.intensity ?? 1, col = e.color;
  switch (e.type) {
    case 'flash':
      return <rect key={key} width={W} height={H} fill={col ?? '#fff'} opacity={clamp(I * (1 - u) * (1 - u), 0, 1)} />;
    case 'vignette':
      return <rect key={key} width={W} height={H} fill="url(#vignette)" opacity={I} />;
    case 'bloom':
      return <circle key={key} cx={x || W / 2} cy={y || H / 2} r={(e.size ?? 420) * (0.6 + u * 0.8)} fill={col ?? '#9ff'} opacity={0.5 * I * (1 - u)} style={{ mixBlendMode: 'screen' }} filter="url(#blur30)" />;
    case 'shockwave': {
      const r = (e.size ?? 380) * ease('out', u);
      return (
        <g key={key} opacity={1 - u}>
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.32} fill="none" stroke={col ?? '#fff'} strokeWidth={lerp(26, 2, u) * I} />
          <ellipse cx={x} cy={y} rx={r * 0.8} ry={r * 0.26} fill={col ?? '#fff'} opacity={0.18} />
        </g>
      );
    }
    case 'impactBurst': {
      const n = e.count ?? 14, r0 = 40 + u * 220, r1 = r0 + 160 * (1 - u) * I;
      const tb = table(seed, n);
      return (
        <g key={key} opacity={1 - u * u} style={{ mixBlendMode: 'screen' }}>
          {Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + tb[i * 6] * 0.4; return <line key={i} x1={x + Math.cos(a) * r0} y1={y + Math.sin(a) * r0 * 0.8} x2={x + Math.cos(a) * r1} y2={y + Math.sin(a) * r1 * 0.8} stroke={col ?? '#fff'} strokeWidth={4 + tb[i * 6 + 1] * 8 * (1 - u)} strokeLinecap="round" />; })}
        </g>
      );
    }
    case 'sparks': {
      const n = e.count ?? 28, tb = table(seed, n);
      return (
        <g key={key} style={{ mixBlendMode: 'screen' }}>
          {Array.from({ length: n }, (_, i) => {
            const a = (e.angle ?? -90) * Math.PI / 180 + (tb[i * 6] - 0.5) * 3.2, sp = 260 + tb[i * 6 + 1] * 520, life = 0.35 + tb[i * 6 + 2] * 0.65;
            if (u > life) return null;
            const tt = t / 24, px = x + Math.cos(a) * sp * tt, py = y + Math.sin(a) * sp * tt + 900 * tt * tt * 0.5;
            const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp + 900 * tt;
            const l = 0.045;
            return <line key={i} x1={px} y1={py} x2={px - vx * l} y2={py - vy * l} stroke={col ?? '#ffe9a8'} strokeWidth={3.5 * (1 - u / life)} strokeLinecap="round" />;
          })}
        </g>
      );
    }
    case 'debris': {
      const n = e.count ?? 22, tb = table(seed, n);
      return (
        <g key={key}>
          {Array.from({ length: n }, (_, i) => {
            const a = -Math.PI / 2 + (tb[i * 6] - 0.5) * 2.6 + (e.dir ?? 1) * 0.15, sp = 220 + tb[i * 6 + 1] * 640, tt = t / 24, s = (e.size ?? 1) * (6 + tb[i * 6 + 2] * 16);
            const px = x + Math.cos(a) * sp * tt, py = y + Math.sin(a) * sp * tt + 1500 * tt * tt * 0.5;
            if (py > y + 60) return null;
            const rot = tb[i * 6 + 3] * 360 + tt * (300 + tb[i * 6 + 4] * 600);
            return <polygon key={i} points={`0,${-s} ${s * 0.9},${s * 0.4} ${-s * 0.7},${s * 0.6}`} transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot.toFixed(1)})`} fill={col ?? '#4a4658'} stroke="#12101a" strokeWidth="2.5" opacity={clamp(1 - (u - 0.7) * 3.3, 0, 1)} />;
          })}
        </g>
      );
    }
    case 'dust': case 'smoke': {
      const n = e.count ?? 12, tb = table(seed, n), smoke = e.type === 'smoke';
      return (
        <g key={key}>
          {Array.from({ length: n }, (_, i) => {
            const delay = tb[i * 6 + 3] * 0.3, uu = clamp((u - delay) / (1 - delay), 0, 1);
            if (uu <= 0) return null;
            const dir = (tb[i * 6] - 0.5) * 2, r = (e.size ?? 1) * (smoke ? 40 : 22) * (0.5 + tb[i * 6 + 1]) * (0.5 + uu);
            const px = x + dir * (smoke ? 90 : 160) * ease('out', uu) + (e.dir ?? 0) * 60 * uu, py = y - (smoke ? 160 : 60) * ease('out', uu) * (0.4 + tb[i * 6 + 2]);
            return <circle key={i} cx={px} cy={py} r={r} fill={col ?? (smoke ? '#2c2a3c' : '#b9b3c6')} opacity={(smoke ? 0.55 : 0.5) * (1 - uu) * I} />;
          })}
        </g>
      );
    }
    case 'fog': {
      const n = e.count ?? 7, tb = table(seed, n);
      return (
        <g key={key} opacity={I * 0.5}>
          {Array.from({ length: n }, (_, i) => <ellipse key={i} cx={((tb[i * 6] * 2600 + frame * (6 + tb[i * 6 + 1] * 10) * (e.dir ?? 1)) % 3200) - 400} cy={y + tb[i * 6 + 2] * 120} rx={260 + tb[i * 6 + 3] * 300} ry={34 + tb[i * 6 + 4] * 40} fill={col ?? '#7a86ad'} opacity={0.22} filter="url(#blur30)" />)}
        </g>
      );
    }
    case 'wind': {
      const n = e.count ?? 16, tb = table(seed, n);
      return (
        <g key={key} opacity={I * 0.55}>
          {Array.from({ length: n }, (_, i) => { const sp = 40 + tb[i * 6 + 2] * 50; const px = ((tb[i * 6] * 2400 + frame * sp * (e.dir ?? -1)) % 2400 + 2400) % 2400 - 240; const py = tb[i * 6 + 1] * H; const len = 60 + tb[i * 6 + 3] * 160; return <path key={i} d={`M ${px} ${py} q ${len / 2} ${-10 - tb[i * 6 + 4] * 14} ${len} 0`} stroke={col ?? '#cfd8ff'} strokeWidth="2" fill="none" opacity={0.5} />; })}
        </g>
      );
    }
    case 'speedLines': {
      const n = e.count ?? 40, tb = table(seed + frame * 3, n);
      return (
        <g key={key} opacity={I * Math.min(1, (1 - u) * 3)}>
          {Array.from({ length: n }, (_, i) => { const a = tb[i * 6] * Math.PI * 2, r0 = 380 + tb[i * 6 + 1] * 380, r1 = r0 + 160 + tb[i * 6 + 2] * 520; return <line key={i} x1={W / 2 + Math.cos(a) * r0 * 1.5} y1={H / 2 + Math.sin(a) * r0 * 0.85} x2={W / 2 + Math.cos(a) * r1 * 1.5} y2={H / 2 + Math.sin(a) * r1 * 0.85} stroke={col ?? '#fff'} strokeWidth={1.5 + tb[i * 6 + 3] * 3.5} opacity={0.5 + tb[i * 6 + 4] * 0.4} />; })}
        </g>
      );
    }
    case 'slash': {
      // crescent energy arc (검기): sweeps open over the first third, fades afterwards
      const r = e.size ?? 300, a0 = (e.angle ?? -60) * Math.PI / 180, sweep = 2.0 * ease('out', clamp(u * 2.2, 0, 1)), a1 = a0 + sweep * (e.dir ?? 1);
      const P = (a: number, rr: number) => `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr * 0.7).toFixed(1)}`;
      const d = `M ${P(a0, r)} A ${r} ${r * 0.7} 0 0 ${(e.dir ?? 1) > 0 ? 1 : 0} ${P(a1, r)} A ${r * 0.8} ${r * 0.56} 0 0 ${(e.dir ?? 1) > 0 ? 0 : 1} ${P(a0, r * 0.97)} Z`;
      return <path key={key} d={d} fill={col ?? '#bff9ff'} stroke="#fff" strokeWidth="3" opacity={clamp((1 - u) * 1.4, 0, 1) * I} style={{ mixBlendMode: 'screen' }} filter="url(#glow)" />;
    }
    case 'crack': {
      const n = e.count ?? 7, tb = table(seed, n), grow = ease('out', clamp(u * 3, 0, 1));
      return (
        <g key={key} opacity={clamp(2 - u * 1.5, 0, 1)}>
          {Array.from({ length: n }, (_, i) => { const dir = i % 2 ? 1 : -1, len = (120 + tb[i * 6] * 260) * (e.size ?? 1) * grow; const a = tb[i * 6 + 1] * 0.5; let d = `M ${x} ${y}`, cx = x, cy = y; for (let s = 1; s <= 4; s++) { cx += dir * len / 4 * Math.cos(a); cy += (tb[i * 6 + 2 + (s % 3)] - 0.3) * 26 + len / 4 * Math.sin(a); d += ` L ${cx.toFixed(1)} ${cy.toFixed(1)}`; } return <path key={i} d={d} stroke="#0c0a12" strokeWidth={9 - i * 0.7} fill="none" strokeLinejoin="round" strokeLinecap="round" />; })}
          <path d={`M ${x - 30} ${y} L ${x + 30} ${y}`} stroke={col ?? '#ff4466'} strokeWidth="6" opacity={0.5 * (1 - u)} />
        </g>
      );
    }
    case 'energy': {
      const n = e.count ?? 30, tb = table(seed, n);
      return (
        <g key={key} style={{ mixBlendMode: 'screen' }}>
          {Array.from({ length: n }, (_, i) => { const ang = tb[i * 6] * 6.283 + t * 0.06 * (1 + tb[i * 6 + 1]), rad = (30 + tb[i * 6 + 2] * 150) * (1 - u * 0.7) * (e.size ?? 1); const py = y - u * 160 * (0.4 + tb[i * 6 + 3]); return <circle key={i} cx={x + Math.cos(ang) * rad} cy={py + Math.sin(ang) * rad * 0.35} r={2 + tb[i * 6 + 4] * 5} fill={col ?? '#7ff9ec'} opacity={clamp(1.3 - u, 0, 1)} />; })}
        </g>
      );
    }
    default: return null;
  }
}
