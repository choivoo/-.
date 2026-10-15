import React from 'react';
import type { CharacterDef } from '../characters/types';
import type { Pose } from '../animation/Pose';
import type { FaceParams } from '../animation/Face';
import { PART_TREE, PartNode, childrenOf, localTransform, solvePose, BONE } from './skeleton';
import { hairPaths } from './hair';
import { assetUrl } from '../utils/assets';

/** B. CharacterRig2D — hierarchical SVG puppet. Every part can be replaced by a PNG/SVG override (def.overrides). */
interface Ctx { def: CharacterDef; pose: Pose; face: FaceParams; t: number; lw: number; uid: string }
const f1 = (n: number) => n.toFixed(2);

const tube = (len: number, w0: number, w1: number) => {
  const r0 = w0 / 2, r1 = w1 / 2;
  return `M ${-r0} 0 A ${r0} ${r0} 0 0 1 ${r0} 0 L ${r1} ${len} A ${r1} ${r1} 0 0 1 ${-r1} ${len} Z`;
};

/** Cel-shaded shape: base shade, offset "lit" copy clipped to the contour, then the outline. */
function Cel(p: { d: string; fill: string; shade: string; id: string; ctx: Ctx; lit?: [number, number]; lw?: number; noLine?: boolean }) {
  const lit = p.lit ?? [4, -4];
  const lw = p.lw ?? p.ctx.lw;
  return (
    <g>
      <clipPath id={`${p.ctx.uid}-${p.id}`}><path d={p.d} /></clipPath>
      <path d={p.d} fill={p.shade} />
      <g clipPath={`url(#${p.ctx.uid}-${p.id})`}><path d={p.d} fill={p.fill} transform={`translate(${lit[0]} ${lit[1]})`} /></g>
      {!p.noLine && <path d={p.d} fill="none" stroke={p.ctx.def.palette.outline} strokeWidth={lw} strokeLinejoin="round" strokeLinecap="round" />}
    </g>
  );
}
const Line = ({ d, ctx, w = 0.6, color }: { d: string; ctx: Ctx; w?: number; color?: string }) => (
  <path d={d} fill="none" stroke={color ?? ctx.def.palette.outline} strokeWidth={ctx.lw * w} strokeLinecap="round" strokeLinejoin="round" />
);

function sleeveColors(def: CharacterDef) {
  const p = def.palette;
  if (def.sleeves === 'coat' && def.coat !== 'none') return [p.coat, p.coatShade];
  if (def.sleeves === 'inner' || def.coat === 'none') return [p.inner, p.innerShade];
  return [p.skin, p.skinShade];
}

// ---- face ------------------------------------------------------------------------------------
const EYE_PATH = 'M -8.5,0.5 C -8.5,-9 8.5,-10 8.5,0 C 8.5,10 -8.5,10.5 -8.5,0.5 Z';
function Eye({ ctx, near }: { ctx: Ctx; near: boolean }) {
  const { def, face, uid } = ctx;
  const p = def.palette;
  const lid = Math.min(1, Math.max(-0.1, near ? face.lidR : face.lidL));
  const slant = (near ? face.slantR : face.slantL) * (near ? -1 : 1);
  const id = `${uid}-eye${near ? 'R' : 'L'}`;
  const sx = (near ? 1 : 0.82) * def.eyeStyle.size, sy = def.eyeStyle.size * def.eyeStyle.tall * (near ? 1 : 0.96);
  const iris = face.irisScale;
  const lx = face.lookX * 3.2 * (near ? 1 : 0.8), ly = face.lookY * 3;
  const coverY = -12 + Math.max(0, lid) * 23;
  const lashY = Math.max(-10, coverY + 1);
  return (
    <g transform={`scale(${f1(sx)} ${f1(sy)})`}>
      <clipPath id={id}><path d={EYE_PATH} /></clipPath>
      <path d={EYE_PATH} fill="#fff" />
      <g clipPath={`url(#${id})`}>
        <g transform={`translate(${f1(lx)} ${f1(ly)})`}>
          <ellipse cx="0.5" cy="0" rx={5.8 * iris} ry={9.2 * (0.55 + 0.45 * iris)} fill={`url(#${uid}-irisgrad)`} />
          <ellipse cx="0.5" cy="1" rx={2.4 * iris} ry={4.2 * iris} fill={p.outline} />
          <circle cx="-1.6" cy="-3.2" r="2.1" fill="#fff" />
          <circle cx="2.4" cy="3.2" r="1" fill="#fff" opacity="0.8" />
        </g>
        <g transform={`rotate(${f1(slant)})`}>
          <path d={`M -16,-22 H 16 V ${f1(coverY)} H -16 Z`} fill={p.skin} />
        </g>
      </g>
      <path d={`M -9.6,${f1(lashY + 2.2)} C -6,${f1(lashY - 3)} 6,${f1(lashY - 4)} 10,${f1(lashY + 1)}`} fill="none" stroke={p.outline} strokeWidth={ctx.lw * 1.15} strokeLinecap="round" transform={`rotate(${f1(slant)})`} />
      <path d={`M -7,9.6 C -3,11 3,11 7,8.8`} fill="none" stroke={p.outline} strokeWidth={ctx.lw * 0.3} opacity="0.55" />
    </g>
  );
}
function Brow({ ctx, near }: { ctx: Ctx; near: boolean }) {
  const { face, def } = ctx;
  const y = near ? face.browRy : face.browLy, a = near ? face.browRa : face.browLa;
  const sc = near ? 1 : 0.82;
  return <g transform={`translate(0 ${f1(y)}) rotate(${f1(-a)}) scale(${sc} 1)`}><path d="M -9,1 Q 0,-3.5 9,0.5" fill="none" stroke={def.palette.hair} strokeWidth={ctx.lw * 1.05} strokeLinecap="round" /></g>;
}
function Mouth({ ctx }: { ctx: Ctx }) {
  const m = ctx.face.mouth, p = ctx.def.palette;
  const w = m.w / 2;
  if (m.h < 1.2) return <path d={`M ${-w},0 Q 0,${f1(m.curve * 2.2)} ${w},${f1(-m.curve * 0.3)}`} fill="none" stroke={p.outline} strokeWidth={ctx.lw * 0.8} strokeLinecap="round" />;
  const d = `M ${-w},0 Q 0,${f1(-m.curve)} ${w},0 Q ${w * 0.9},${f1(m.h * 1.5)} 0,${f1(m.h * 1.5)} Q ${-w * 0.9},${f1(m.h * 1.5)} ${-w},0 Z`;
  return (
    <g>
      <clipPath id={`${ctx.uid}-mouthclip`}><path d={d} /></clipPath>
      <path d={d} fill="#4a1018" />
      <g clipPath={`url(#${ctx.uid}-mouthclip)`}>
        {m.teeth > 0 && <rect x={-w} y="-2" width={w * 2} height={Math.max(2.2, m.h * 0.55)} fill="#fff" />}
        <ellipse cx="0" cy={m.h * 1.4} rx={w * 0.6} ry={m.h * 0.5} fill="#d4586b" />
      </g>
      <path d={d} fill="none" stroke={p.outline} strokeWidth={ctx.lw * 0.8} strokeLinejoin="round" />
    </g>
  );
}

// ---- part drawers ----------------------------------------------------------------------------
function draw(id: string, c: Ctx): React.ReactNode {
  const { def, pose, t, uid } = c;
  const p = def.palette;
  const bw = def.build;
  const [slv, slvS] = sleeveColors(def);
  const wind = pose.hair + Math.sin(t * 0.21) * 0.12 * (0.4 + pose.hair);
  const cf = Math.min(1.3, pose.coat + Math.sin(t * 0.17) * 0.06 * (0.3 + pose.coat));
  const sm = 1 + pose.smear * 0.12;
  switch (id) {
    case 'pelvis': {
      if (def.skirt) {
        const d = `M -17,-8 L ${f1(-27 - cf * 8)},40 Q 0,50 ${f1(29 + cf * 4)},40 L 17,-8 Z`;
        return <Cel d={d} fill={p.pants} shade={p.pantsShade} id="pelvis" ctx={c} />;
      }
      return <Cel d={`M -17,-10 C ${-20 * bw.hips},4 ${-18 * bw.hips},16 -8,22 L 14,22 C ${21 * bw.hips},12 ${20 * bw.hips},0 17,-10 Z`} fill={p.pants} shade={p.pantsShade} id="pelvis" ctx={c} />;
    }
    case 'thighL': case 'thighR': {
      const w = 28 * bw.limb;
      const bare = def.skirt;
      return <Cel d={tube(BONE.thigh, w, w * 0.8)} fill={bare ? p.skin : p.pants} shade={bare ? p.skinShade : p.pantsShade} id={id} ctx={c} lit={[4, -3]} />;
    }
    case 'shinL': case 'shinR': {
      const w = 22 * bw.limb;
      return (
        <g>
          <Cel d={tube(BONE.shin, w, w * 0.75)} fill={def.skirt ? p.skin : p.pants} shade={def.skirt ? p.skinShade : p.pantsShade} id={id} ctx={c} lit={[4, -3]} />
          <Cel d={`M ${-w * 0.62},56 L ${w * 0.62},56 L ${w * 0.5},${BONE.shin} L ${-w * 0.5},${BONE.shin} Z`} fill={p.boots} shade={p.bootsShade} id={id + 'b'} ctx={c} lit={[3, -3]} />
        </g>
      );
    }
    case 'footL': case 'footR':
      return <Cel d="M -9,-4 L 11,-4 L 12,2 L 36,6 Q 45,9 42,14 L -10,14 Q -13,6 -9,-4 Z" fill={p.boots} shade={p.bootsShade} id={id} ctx={c} lit={[2, -3]} />;
    case 'torso': {
      const sh = bw.shoulder;
      const d = `M -17,6 C ${-19 * sh},-30 ${-23 * sh},-60 ${-21 * sh},-84 C -12,-98 14,-98 ${22 * sh},-84 C ${24 * sh},-60 20,-30 17,6 Z`;
      return (
        <g>
          <Cel d={d} fill={p.inner} shade={p.innerShade} id="torso" ctx={c} />
          <path d="M -17,-2 L 17,-2 L 17,8 L -17,8 Z" fill={p.outline} opacity="0.9" />
          <rect x="-3" y="-3" width="8" height="10" rx="1.5" fill={p.accent} stroke={p.outline} strokeWidth={c.lw * 0.5} />
        </g>
      );
    }
    case 'coat': {
      switch (def.coat) {
        case 'longcoat':
          return (
            <g>
              <Cel d={`M 14,-92 C 12,-60 12,-20 14,20 L 16,70 L -2,78 L ${f1(-20 - cf * 32)},${f1(82 - cf * 16)} L ${f1(-38 - cf * 50)},${f1(74 - cf * 30)} C ${f1(-34 - cf * 22)},30 -28,-40 -23,-90 C -10,-100 6,-100 14,-92 Z`} fill={p.coat} shade={p.coatShade} id="coat" ctx={c} lit={[5, -3]} />
              <Line d={`M 14,-90 C 12,-60 12,-20 14,20 L 16,70`} ctx={c} w={1.3} color={p.coatTrim} />
              <Line d={`M 16,70 L -2,78 L ${f1(-20 - cf * 32)},${f1(82 - cf * 16)}`} ctx={c} w={1.1} color={p.coatTrim} />
              <Line d={`M -6,-30 C ${f1(-12 - cf * 6)},-4 ${f1(-14 - cf * 12)},30 ${f1(-14 - cf * 14)},60`} ctx={c} w={0.5} />
            </g>
          );
        case 'cloak': {
          const k = cf;
          return (
            <g>
              <Cel d={`M 20,-92 C 30,-62 32,-20 30,24 L 34,92 L 18,80 L 10,98 L -6,82 L ${f1(-22 - k * 20)},100 L ${f1(-38 - k * 40)},${f1(86 - k * 20)} L ${f1(-54 - k * 60)},${f1(96 - k * 34)} L ${f1(-46 - k * 50)},${f1(56 - k * 20)} C -40,10 -28,-50 -24,-92 C -10,-104 10,-104 20,-92 Z`} fill={p.coat} shade={p.coatShade} id="coat" ctx={c} lit={[5, -3]} />
              <Line d={`M 20,-92 C 30,-62 32,-20 30,24 L 34,92`} ctx={c} w={1.3} color={p.coatTrim} />
              <Line d="M -20,-96 C -2,-82 14,-86 24,-94" ctx={c} w={1.1} color={p.coatTrim} />
            </g>
          );
        }
        case 'jacket':
          return (
            <g>
              <Cel d={`M 14,-92 C 18,-60 18,-30 18,22 L -2,28 L ${f1(-24 - cf * 12)},${f1(24 - cf * 6)} C -26,-20 -24,-60 -22,-90 C -10,-100 6,-100 14,-92 Z`} fill={p.coat} shade={p.coatShade} id="coat" ctx={c} />
              <Line d={`M 14,-90 C 18,-60 18,-30 18,22 L -2,28`} ctx={c} w={1.2} color={p.coatTrim} />
            </g>
          );
        case 'labcoat':
          return (
            <g>
              <Cel d={`M 15,-92 C 14,-60 14,-20 16,20 L 18,86 L -6,90 L ${f1(-26 - cf * 22)},${f1(88 - cf * 8)} C ${f1(-30 - cf * 10)},30 -28,-40 -23,-90 C -10,-100 6,-100 15,-92 Z`} fill={p.coat} shade={p.coatShade} id="coat" ctx={c} />
              <Line d={`M 15,-90 C 14,-60 14,-20 16,20 L 18,86`} ctx={c} w={0.8} />
              <rect x="-18" y="-24" width="14" height="14" fill="none" stroke={p.outline} strokeWidth={c.lw * 0.5} />
            </g>
          );
        default: return null;
      }
    }
    case 'accessory': {
      const sw = Math.sin(t * 0.23) * 5 * (0.4 + cf);
      switch (def.accessory) {
        case 'scarf':
          return (
            <g>
              <Cel d={`M -12,-3 C ${f1(-30 - cf * 30)},${f1(8 + sw)} ${f1(-52 - cf * 50)},${f1(-6 + sw * 2)} ${f1(-74 - cf * 62)},${f1(16 + sw * 3)} L ${f1(-66 - cf * 54)},${f1(34 + sw * 3)} C ${f1(-48 - cf * 40)},${f1(12 + sw * 2)} ${f1(-26 - cf * 20)},${f1(24 + sw)} -8,14 Z`} fill={p.accent} shade={p.coatShade} id="scarf" ctx={c} lit={[2, -4]} />
              <Cel d="M -15,-8 C -15,-18 15,-18 15,-8 C 15,6 -15,6 -15,-8 Z" fill={p.accent} shade={p.coatShade} id="scarfring" ctx={c} lit={[2, -3]} />
            </g>
          );
        case 'collar':
          return <Cel d="M -16,2 L -22,-30 L 2,-14 L 20,-28 L 18,4 Z" fill={p.coat} shade={p.coatShade} id="collar" ctx={c} lit={[3, -3]} />;
        case 'ribbon':
          return (
            <g>
              <Cel d="M 4,0 L 22,-12 L 22,12 Z" fill={p.accent} shade={p.innerShade} id="rib1" ctx={c} />
              <Cel d="M 4,0 L -14,-12 L -14,12 Z" fill={p.accent} shade={p.innerShade} id="rib2" ctx={c} />
              <circle cx="4" cy="0" r="4" fill={p.accent} stroke={p.outline} strokeWidth={c.lw * 0.6} />
            </g>
          );
        default: return null;
      }
    }
    case 'upperArmL': case 'upperArmR': {
      const w = 19 * bw.limb;
      return <Cel d={tube(BONE.upperArm * sm, w, w * 0.85)} fill={slv} shade={slvS} id={id} ctx={c} lit={[4, -3]} />;
    }
    case 'foreArmL': case 'foreArmR': {
      const w = 16 * bw.limb;
      const bare = def.sleeves === 'bare';
      return <Cel d={tube(BONE.foreArm * sm, w, w * 0.78)} fill={bare ? def.palette.skin : slv} shade={bare ? def.palette.skinShade : slvS} id={id} ctx={c} lit={[3, -3]} />;
    }
    case 'handL': case 'handR':
      return (
        <g>
          <Cel d="M -7,-3 C -10,8 -7,17 0,18 C 8,18 10,8 7,-3 Z" fill={p.skin} shade={p.skinShade} id={id} ctx={c} lit={[2, -2]} />
          <Line d="M 3,4 C 9,6 11,12 8,15" ctx={c} w={0.5} />
        </g>
      );
    case 'neck':
      return <Cel d="M -7,-14 L 7,-14 L 8,8 L -8,8 Z" fill={p.skin} shade={p.skinShade} id="neck" ctx={c} lit={[3, -1]} />;
    case 'hairBack': {
      const h = hairPaths(def.hair, wind, pose.variant);
      return (
        <g transform="translate(0 -40)">
          <Cel d={h.back} fill={p.hair} shade={p.hairShade} id="hback" ctx={c} />
          {h.ponytail && <Cel d={h.ponytail} fill={p.hair} shade={p.hairShade} id="hpony" ctx={c} />}
        </g>
      );
    }
    case 'faceContour': {
      const face = 'M -31,-22 C -31,-44 -16,-52 2,-52 C 22,-52 33,-38 32,-16 C 31,2 24,22 9,35 C 4,40 -3,41 -8,37 C -19,29 -30,8 -31,-22 Z';
      const f = c.face;
      return (
        <g transform="translate(0 -40)">
          <Cel d={face} fill={p.skin} shade={p.skinShade} id="face" ctx={c} lit={[3.5, -3]} />
          <Line d="M 16,6 L 19,11 L 15,12" ctx={c} w={0.45} />
          {f.blush > 0 && <><ellipse cx="14" cy="14" rx="9" ry="4.5" fill="#ff6f8f" opacity={0.35 * f.blush} /><ellipse cx="-14" cy="12" rx="7" ry="4" fill="#ff6f8f" opacity={0.3 * f.blush} /></>}
          {f.shade > 0 && <path d="M -31,-22 C -31,-30 -22,-36 -10,-37 L 28,-37 C 31,-30 32,-24 32,-16 L 20,-20 L -20,-20 Z" fill="#1a1530" opacity={0.28 * f.shade} />}
          {f.sweat > 0 && <path d="M 24,-34 C 20,-27 20,-23 24,-21 C 28,-23 28,-27 24,-34 Z" fill="#9fe3ff" stroke={p.outline} strokeWidth={c.lw * 0.5} opacity={f.sweat} />}
          {f.fearLines > 0 && [0, 1, 2, 3].map((i) => <line key={i} x1={-18 + i * 11} y1="-48" x2={-18 + i * 11} y2={-34 + (i % 2) * 5} stroke="#4b5bd8" strokeWidth={c.lw * 0.7} opacity={0.75 * f.fearLines} />)}
          {f.vein > 0 && <g stroke="#e0243c" strokeWidth={c.lw * 0.7} strokeLinecap="round"><path d="M 20,-40 l 6,-4 M 22,-33 l 7,0 M 20,-44 l 0,-7 M 26,-38 l 3,-6" opacity={f.vein} /></g>}
          {f.tear > 0 && <path d="M 16,-2 C 14,5 14,9 17,11 C 20,9 20,5 17,-2 Z" fill="#bfeaff" stroke={p.outline} strokeWidth={c.lw * 0.4} opacity={f.tear} />}
        </g>
      );
    }
    case 'eyeL': return <g transform="translate(0 0)"><Eye ctx={c} near={false} /></g>;
    case 'eyeR': return <Eye ctx={c} near />;
    case 'browL': return <Brow ctx={c} near={false} />;
    case 'browR': return <Brow ctx={c} near />;
    case 'mouth': return def.headAcc === 'mask' ? null : <Mouth ctx={c} />;
    case 'hairSide': {
      const h = hairPaths(def.hair, wind, pose.variant);
      return <g transform="translate(0 -40)"><Cel d={h.side} fill={p.hair} shade={p.hairShade} id="hside" ctx={c} /></g>;
    }
    case 'hairFront': {
      const h = hairPaths(def.hair, wind, pose.variant);
      return (
        <g transform="translate(0 -40)">
          <Cel d={h.front} fill={p.hair} shade={p.hairShade} id="hfront" ctx={c} lit={[5, 4]} />
          {h.hi.map((d, i) => <path key={i} d={d} fill="none" stroke={p.hairHi} strokeWidth={c.lw * 1.2} strokeLinecap="round" opacity="0.85" />)}
        </g>
      );
    }
    case 'headAcc': {
      if (def.headAcc === 'mask')
        return <g transform="translate(0 -40)"><Cel d="M -24,6 C -8,2 20,2 33,4 C 32,20 24,32 9,38 C 2,40 -4,39 -8,36 C -16,28 -22,18 -24,6 Z" fill="#ecebf2" shade="#b9b6c8" id="mask" ctx={c} /><Line d="M -20,14 L 28,12" ctx={c} w={0.5} color={p.accent} /><Line d="M -6,8 L -2,32" ctx={c} w={0.5} color={p.accent} /></g>;
      if (def.headAcc === 'glasses')
        return <g transform="translate(0 -40)" fill="none" stroke={p.outline} strokeWidth={c.lw * 0.7}><rect x="-26" y="-14" width="18" height="15" rx="4" fill="#cfe8ff" fillOpacity="0.2" /><rect x="-1" y="-14" width="22" height="15" rx="4" fill="#cfe8ff" fillOpacity="0.2" /><path d="M -8,-8 L -1,-8 M 21,-8 L 33,-12" /></g>;
      return null;
    }
    case 'sheath': {
      if (def.weapon !== 'katana') return null;
      const drawn = pose.drawn >= 0.5;
      return (
        <g>
          <Cel d={tube(150, 9, 8)} fill="#241c2c" shade="#120d18" id="scab" ctx={c} lw={c.lw * 0.8} />
          {!drawn && <Hilt c={c} />}
        </g>
      );
    }
    case 'weapon':
      return def.weapon === 'katana' && pose.drawn >= 0.5 ? <Blade c={c} /> : null;
    default: return null;
  }
}

function Hilt({ c }: { c: Ctx }) {
  const p = c.def.palette;
  return (
    <g transform="rotate(180) translate(0 -26)">
      <Cel d="M -4,-14 L 4,-14 L 4.5,22 L -4.5,22 Z" fill={p.accent} shade={p.coatShade} id="hilt" ctx={c} lw={c.lw * 0.7} />
      <ellipse cx="0" cy="23" rx="10" ry="3.6" fill="#c9a24a" stroke={p.outline} strokeWidth={c.lw * 0.6} />
    </g>
  );
}
function Blade({ c }: { c: Ctx }) {
  const p = c.def.palette;
  const L = BONE.bladeLen * (1 + c.pose.smear * 0.08);
  return (
    <g>
      <Cel d="M -4,-14 L 4,-14 L 4.5,22 L -4.5,22 Z" fill={p.accent} shade={p.coatShade} id="grip" ctx={c} lw={c.lw * 0.7} />
      <ellipse cx="0" cy="23" rx="10" ry="3.6" fill="#c9a24a" stroke={p.outline} strokeWidth={c.lw * 0.6} />
      <Cel d={`M -3.6,24 L 4.2,24 L 3.6,${L - 16} L 0,${L} L -3.6,${L - 12} Z`} fill={p.blade} shade="#9aa7bb" id="blade" ctx={c} lw={c.lw * 0.8} lit={[2.2, 0]} />
      <path d={`M 2.4,28 L 2.2,${L - 24}`} stroke="#fff" strokeWidth={c.lw * 0.5} opacity="0.9" />
      <path d={`M -3.6,24 L 4.2,24 L 3.6,${L - 16} L 0,${L} L -3.6,${L - 12} Z`} fill="none" stroke={p.bladeGlow} strokeWidth={c.lw * 0.25} opacity="0.55" />
    </g>
  );
}

// ---- tree renderer -----------------------------------------------------------------------------
function Node({ node, ctx, acc }: { node: PartNode; ctx: Ctx; acc: number }) {
  const l = localTransform(node, ctx.pose, acc);
  const kids = childrenOf(node.id);
  const back = kids.filter((k) => k.z < 0).sort((a, b) => a.z - b.z);
  const front = kids.filter((k) => k.z >= 0).sort((a, b) => a.z - b.z);
  const ov = ctx.def.overrides[`${node.id}@${ctx.pose.variant}`] ?? ctx.def.overrides[node.id];
  const own = ov ? (
    <image href={assetUrl(ov.src)} x={ov.x} y={ov.y} width={ov.w} height={ov.h} transform={ov.rot ? `rotate(${ov.rot})` : undefined} preserveAspectRatio="none" />
  ) : draw(node.id, ctx);
  return (
    <g transform={`translate(${f1(l.x)} ${f1(l.y)}) rotate(${f1(l.rot)})`}>
      {back.map((k) => <Node key={k.id} node={k} ctx={ctx} acc={acc + l.rot} />)}
      {own}
      {front.map((k) => <Node key={k.id} node={k} ctx={ctx} acc={acc + l.rot} />)}
    </g>
  );
}

export interface RigProps {
  def: CharacterDef; pose: Pose; face: FaceParams;
  x: number; y: number; scale?: number; flip?: boolean;
  /** secondary-motion clock (frame) */
  t: number;
  /** outline width in character units */
  lw?: number;
  uid: string;
  opacity?: number;
}
export function CharacterRig2D(props: RigProps) {
  const { def, pose, face, x, y, flip, t, uid } = props;
  const s = (props.scale ?? 1) * def.height;
  const ctx: Ctx = { def, pose, face, t, lw: props.lw ?? 3.2, uid };
  const solved = solvePose(pose);
  const root = PART_TREE[0];
  return (
    <g transform={`translate(${f1(x)} ${f1(y)}) scale(${f1(flip ? -s : s)} ${f1(s)})`} opacity={props.opacity}>
      <defs>
        <linearGradient id={`${uid}-irisgrad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={def.palette.eyeShade} /><stop offset="0.55" stopColor={def.palette.eye} /><stop offset="1" stopColor="#fff" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <g transform={`translate(${f1(pose.x)} 0) scale(${f1(pose.stretchX)} ${f1(pose.squashY)}) translate(0 ${f1(solved.groundShift - pose.air)})`}>
        <Node node={root} ctx={ctx} acc={0} />
      </g>
    </g>
  );
}
