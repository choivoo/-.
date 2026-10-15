import React from 'react';
import { mulberry32 } from '../utils/math';
import type { Bounds } from '../camera/CameraDirector';

export interface BgLayer { id: string; depth: number; render: (frame: number) => React.ReactNode }
export interface BackgroundDef {
  id: string; name: string; bounds: Bounds; groundY: number; layers: BgLayer[];
  /** colour grade applied over the whole shot */
  grade?: { tint: string; opacity: number; blend?: string };
  assetStatus: 'placeholder-vector' | 'final';
  /** optional artist-supplied plate (public/backgrounds/...), drawn at depth 1 behind the characters */
  plate?: string;
}
const BOUNDS: Bounds = { minX: -300, maxX: 3500, minY: -500, maxY: 1500 };
export const GROUND_Y = 840;
const X0 = -2400, X1 = 5600;

interface CityOpts {
  id: string; name: string; skyTop: string; skyBottom: string; celestial: 'blackMoon' | 'sun' | 'moon' | 'none'; stars: boolean;
  far: string; mid: string; near: string; window: string; ground: string; groundTop: string; line: string;
  ruin: boolean; sea: boolean; lamps: boolean; seed: number; fog?: string; grade?: BackgroundDef['grade']; moonX?: number; moonY?: number; moonR?: number;
}

function skyline(seed: number, y: number, minH: number, maxH: number, color: string, win: string | null, step = 150) {
  const r = mulberry32(seed);
  const out: React.ReactNode[] = [];
  for (let x = X0; x < X1; x += step * (0.6 + r() * 0.8)) {
    const w = 90 + r() * 170, h = minH + r() * (maxH - minH);
    out.push(<rect key={`b${x}`} x={x} y={y - h} width={w} height={h + 800} fill={color} />);
    if (r() > 0.6) out.push(<rect key={`a${x}`} x={x + w * 0.4} y={y - h - 40} width={6} height={40} fill={color} />);
    if (win) for (let wy = y - h + 20; wy < y - 10; wy += 26) for (let wx = x + 12; wx < x + w - 14; wx += 22) if (r() > 0.82) out.push(<rect key={`w${x}-${wx}-${wy}`} x={wx} y={wy} width={8} height={12} fill={win} opacity={0.75} />);
  }
  return out;
}
function ruinedBlocks(seed: number, y: number, color: string, edge: string, line: string) {
  const r = mulberry32(seed), out: React.ReactNode[] = [];
  for (let x = X0; x < X1; x += 260 + r() * 340) {
    const w = 150 + r() * 220, h = 200 + r() * 420;
    const top = Array.from({ length: 5 }, (_, i) => `${x + (w * i) / 4},${y - h + (i % 2 ? r() * 110 : r() * 30)}`).join(' ');
    out.push(
      <g key={`r${x}`}>
        <polygon points={`${x},${y} ${top} ${x + w},${y}`} fill={color} stroke={line} strokeWidth="3" />
        <polyline points={`${x + w * 0.2},${y - h * 0.8} ${x + w * 0.35},${y - h * 0.5} ${x + w * 0.28},${y - h * 0.2}`} stroke={edge} strokeWidth="3" fill="none" />
        {r() > 0.4 && <rect x={x + w * 0.5} y={y - h * 0.6} width={24} height={34} fill="#0a0c18" />}
      </g>,
    );
  }
  return out;
}

function city(o: CityOpts): BackgroundDef {
  const gid = (n: string) => `${o.id}-${n}`;
  const mx = o.moonX ?? 1500, my = o.moonY ?? 230, mr = o.moonR ?? 150;
  const layers: BgLayer[] = [
    {
      id: 'sky', depth: 0.05, render: () => (
        <g>
          <defs><linearGradient id={gid('sky')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={o.skyTop} /><stop offset="1" stopColor={o.skyBottom} /></linearGradient>
            <radialGradient id={gid('halo')}><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="0.7" stopColor="#7a2cff" stopOpacity="0.55" /><stop offset="0.82" stopColor="#ff2f6a" stopOpacity="0.35" /><stop offset="1" stopColor="#ff2f6a" stopOpacity="0" /></radialGradient></defs>
          <rect x={X0} y={-1600} width={X1 - X0} height={3400} fill={`url(#${gid('sky')})`} />
          {o.stars && Array.from({ length: 140 }, (_, i) => { const r = mulberry32(o.seed + i); return <circle key={i} cx={X0 + r() * (X1 - X0) * 0.5 + 1000} cy={-300 + r() * 700} r={0.8 + r() * 1.8} fill="#fff" opacity={0.3 + r() * 0.6} />; })}
        </g>
      ),
    },
    {
      id: 'celestial', depth: 0.12, render: () => (
        <g>
          {o.celestial === 'blackMoon' && <g><circle cx={mx} cy={my} r={mr * 2.1} fill={`url(#${gid('halo')})`} /><circle cx={mx} cy={my} r={mr} fill="#05030a" stroke="#c9a6ff" strokeWidth="3" opacity="0.98" /><path d={`M ${mx - mr * 0.7} ${my - mr * 0.35} A ${mr} ${mr} 0 0 1 ${mx + mr * 0.2} ${my - mr * 0.96}`} stroke="#ff4f86" strokeWidth="5" fill="none" opacity="0.8" /></g>}
          {o.celestial === 'sun' && <g><circle cx={mx} cy={my} r={mr * 1.8} fill="#fff3c4" opacity="0.35" /><circle cx={mx} cy={my} r={mr} fill="#fff8dc" /></g>}
          {o.celestial === 'moon' && <g><circle cx={mx} cy={my} r={mr * 1.6} fill="#bcd0ff" opacity="0.2" /><circle cx={mx} cy={my} r={mr} fill="#e9efff" /></g>}
        </g>
      ),
    },
    { id: 'far', depth: 0.3, render: () => <g>{skyline(o.seed + 1, GROUND_Y - 40, 120, 420, o.far, null, 90)}</g> },
  ];
  if (o.sea) layers.push({ id: 'sea', depth: 0.4, render: (f) => (<g><rect x={X0} y={GROUND_Y - 190} width={X1 - X0} height={200} fill="#1d4a78" />{Array.from({ length: 30 }, (_, i) => <path key={i} d={`M ${X0 + i * 260 + ((f * 0.5 + i * 40) % 80)} ${GROUND_Y - 170 + (i % 5) * 30} q 40 -8 80 0`} stroke="#6fb0e0" strokeWidth="3" fill="none" opacity="0.6" />)}</g>) });
  layers.push({ id: 'mid', depth: 0.6, render: () => <g>{o.ruin ? ruinedBlocks(o.seed + 2, GROUND_Y - 30, o.mid, o.line, o.line) : skyline(o.seed + 2, GROUND_Y - 30, 200, 620, o.mid, o.window, 200)}</g> });
  if (o.fog) layers.push({ id: 'fogmid', depth: 0.75, render: (f) => <g opacity="0.55">{Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={X0 + i * 900 + ((f * 3) % 900)} cy={GROUND_Y - 40 - (i % 3) * 30} rx={520} ry={70} fill={o.fog} opacity="0.35" filter="url(#blur30)" />)}</g> });
  layers.push({
    id: 'ground', depth: 1, render: () => {
      const r = mulberry32(o.seed + 3);
      return (
        <g>
          <rect x={X0} y={GROUND_Y} width={X1 - X0} height={900} fill={o.ground} />
          <rect x={X0} y={GROUND_Y} width={X1 - X0} height={26} fill={o.groundTop} />
          <line x1={X0} x2={X1} y1={GROUND_Y} y2={GROUND_Y} stroke={o.line} strokeWidth="4" />
          {Array.from({ length: 70 }, (_, i) => { const x = X0 + r() * (X1 - X0), y = GROUND_Y + 30 + r() * 240, w = 40 + r() * 140; return <path key={i} d={`M ${x} ${y} l ${w} ${r() * 8 - 4}`} stroke={o.line} strokeWidth="2.5" opacity="0.5" />; })}
          {o.ruin && Array.from({ length: 34 }, (_, i) => { const x = X0 + r() * (X1 - X0), s = 14 + r() * 40; return <polygon key={i} points={`${x},${GROUND_Y + 22} ${x + s * 0.3},${GROUND_Y + 22 - s} ${x + s},${GROUND_Y + 22 - s * 0.4} ${x + s * 1.2},${GROUND_Y + 22}`} fill={o.mid} stroke={o.line} strokeWidth="3" />; })}
          {o.ruin && [300, 900, 2200, 2900].map((px, i) => <g key={px}><polygon points={`${px},${GROUND_Y + 10} ${px},${GROUND_Y - 260 - i * 40} ${px + 30},${GROUND_Y - 290 - i * 30} ${px + 50},${GROUND_Y - 220} ${px + 70},${GROUND_Y - 250} ${px + 70},${GROUND_Y + 10}`} fill={o.near} stroke={o.line} strokeWidth="4" /><line x1={px + 20} x2={px + 20} y1={GROUND_Y - 200} y2={GROUND_Y} stroke={o.line} strokeWidth="2" opacity="0.6" /></g>)}
          {o.lamps && [400, 1100, 1800, 2500, 3200].map((lx) => <g key={lx}><rect x={lx} y={GROUND_Y - 330} width={9} height={340} fill={o.near} /><circle cx={lx + 4} cy={GROUND_Y - 336} r={13} fill="#ffe7a0" /><circle cx={lx + 4} cy={GROUND_Y - 336} r={46} fill="#ffe7a0" opacity="0.2" /></g>)}
        </g>
      );
    },
  });
  layers.push({
    id: 'fore', depth: 1.35, render: () => (
      <g>{[-420, 3350].map((px, i) => <g key={px}><polygon points={`${px},${GROUND_Y + 300} ${px},${GROUND_Y - 500 - i * 60} ${px + 130},${GROUND_Y - 540 - i * 60} ${px + 150},${GROUND_Y + 300}`} fill={o.near} opacity="0.96" stroke={o.line} strokeWidth="4" /></g>)}
        {o.ruin && Array.from({ length: 16 }, (_, i) => { const r = mulberry32(o.seed + 40 + i); const x = X0 + r() * (X1 - X0); return <path key={i} d={`M ${x} ${GROUND_Y + 330} q ${r() * 20 - 10} -90 ${r() * 40 - 20} -${120 + r() * 80}`} stroke={o.near} strokeWidth="6" fill="none" />; })}</g>
    ),
  });
  return { id: o.id, name: o.name, bounds: BOUNDS, groundY: GROUND_Y, layers, grade: o.grade, assetStatus: 'placeholder-vector' };
}

function interior(id: string, name: string, wall: string, floor: string, light: string, line: string, seed: number): BackgroundDef {
  const layers: BgLayer[] = [
    {
      id: 'wall', depth: 0.5, render: (f) => {
        const r = mulberry32(seed);
        return (
          <g>
            <rect x={X0} y={-1000} width={X1 - X0} height={1900} fill={wall} />
            {Array.from({ length: 36 }, (_, i) => <g key={i}><rect x={-1000 + i * 260} y={-100} width={12} height={940} fill={line} opacity="0.5" />{r() > 0.55 && <rect x={-1000 + i * 260 + 60} y={250} width={140} height={400} fill="#0a1018" stroke={line} strokeWidth="5" />}{r() > 0.5 && <rect x={-1000 + i * 260 + 40} y={60} width={180} height={14} fill={light} opacity={0.6 + 0.4 * Math.sin(f * 0.4 + i * 3) * (i % 4 === 0 ? 1 : 0.1)} />}</g>)}
          </g>
        );
      },
    },
    { id: 'floor', depth: 1, render: () => (<g><rect x={X0} y={GROUND_Y} width={X1 - X0} height={900} fill={floor} /><line x1={X0} x2={X1} y1={GROUND_Y} y2={GROUND_Y} stroke={line} strokeWidth="5" />{Array.from({ length: 50 }, (_, i) => <line key={i} x1={X0 + i * 200} x2={X0 + i * 200 - 80} y1={GROUND_Y} y2={GROUND_Y + 400} stroke={line} strokeWidth="2" opacity="0.5" />)}</g>) },
    { id: 'fore', depth: 1.3, render: () => <g>{[200, 2100].map((px) => <rect key={px} x={px} y={-400} width={90} height={1700} fill="#06080f" />)}</g> },
  ];
  return { id, name, bounds: BOUNDS, groundY: GROUND_Y, layers, grade: { tint: '#2a6a9a', opacity: 0.16 }, assetStatus: 'placeholder-vector' };
}

const defs: BackgroundDef[] = [
  city({ id: 'ruins_night', name: 'Ruins — Black Moon Night', skyTop: '#05061a', skyBottom: '#2a2250', celestial: 'blackMoon', stars: true, far: '#1a1a3a', mid: '#161830', near: '#0e1022', window: '#ffd27a', ground: '#14142a', groundTop: '#232346', line: '#07070f', ruin: true, sea: false, lamps: false, seed: 11, fog: '#6a6aa8', grade: { tint: '#3a3aa8', opacity: 0.12 }, moonX: 1700, moonY: 190 }),
  city({ id: 'coast_day', name: 'Coastal City — Day', skyTop: '#5fb4f0', skyBottom: '#d6f0ff', celestial: 'sun', stars: false, far: '#8fb4d8', mid: '#6d8fb6', near: '#4e6a8e', window: '#fff', ground: '#9aa4b6', groundTop: '#c4cbd8', line: '#27344a', ruin: false, sea: true, lamps: true, seed: 21, moonX: 700, moonY: 160, moonR: 90 }),
  city({ id: 'street_dusk', name: 'Downtown Street — Dusk', skyTop: '#4a3a7a', skyBottom: '#ff9a6a', celestial: 'sun', stars: false, far: '#6a4a78', mid: '#42335e', near: '#2a2040', window: '#ffd27a', ground: '#3a3248', groundTop: '#5a4a62', line: '#150f22', ruin: false, sea: false, lamps: true, seed: 31, moonX: 2300, moonY: 520, moonR: 110 }),
  city({ id: 'rooftop_night', name: 'Rooftop — Night', skyTop: '#060820', skyBottom: '#2e2c66', celestial: 'blackMoon', stars: true, far: '#16193a', mid: '#101230', near: '#0a0c20', window: '#ffd27a', ground: '#1c1e3c', groundTop: '#2c2e58', line: '#05060f', ruin: false, sea: false, lamps: false, seed: 41, moonX: 1200, moonY: 120, moonR: 190 }),
  city({ id: 'harbor_night', name: 'Harbor — Night', skyTop: '#04051a', skyBottom: '#1a2a58', celestial: 'blackMoon', stars: true, far: '#12204a', mid: '#0e1a3a', near: '#080f26', window: '#8fe8ff', ground: '#161c36', groundTop: '#26305a', line: '#04060f', ruin: false, sea: true, lamps: true, seed: 51, fog: '#6a86c8', moonX: 2400, moonY: 200 }),
  city({ id: 'timestop_void', name: 'Stopped Time — Void Street', skyTop: '#d8d8e0', skyBottom: '#f4f4f8', celestial: 'blackMoon', stars: false, far: '#b8b8c4', mid: '#8e8e9c', near: '#5e5e6c', window: '#fff', ground: '#a0a0ae', groundTop: '#c8c8d4', line: '#20202c', ruin: false, sea: false, lamps: true, seed: 61, grade: { tint: '#ffffff', opacity: 0.08 }, moonX: 1500, moonY: 220 }),
  interior('lab_corridor', 'Abandoned Research Facility', '#1a2536', '#10161f', '#9fe8ff', '#05080e', 71),
  interior('apartment_room', 'Soma — Apartment Room', '#3a3550', '#2a2438', '#ffd9a0', '#120f1c', 81),
];
export const BACKGROUNDS: Record<string, BackgroundDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const backgroundList = () => defs;
