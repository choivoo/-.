import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { CLIPS } from '../src/animation/clips';
import { CHARACTERS } from '../src/characters/defs';
import { CharacterRig2D } from '../src/rigs/CharacterRig2D';
import { faceAt } from '../src/animation/Face';
import type { Expression } from '../src/animation/Face';

// usage: tsx scripts/posesheet.tsx out.svg charId clip:t,clip:t,... [expr]
const [out, charId = 'soma', list = 'idle:0', expr = 'neutral'] = process.argv.slice(2);
const items = list.split(',').map((s) => { const [c, t] = s.split(':'); return { c, t: Number(t) }; });
const W = 420, H = 560;
const svg = (
  <svg xmlns="http://www.w3.org/2000/svg" width={W * items.length} height={H} viewBox={`0 0 ${W * items.length} ${H}`}>
    <rect width="100%" height="100%" fill="#8fa2c8" />
    {items.map((it, i) => (
      <g key={i}>
        <line x1={i * W} x2={(i + 1) * W} y1={470} y2={470} stroke="#223" />
        <text x={i * W + 10} y={24} fontSize="16" fill="#112">{it.c}:{it.t}</text>
        <CharacterRig2D def={CHARACTERS[charId]} pose={CLIPS[it.c].sample(it.t)} face={faceAt([{ f: 0, expr: expr as Expression }], 0, 3)} x={i * W + 180} y={470} t={it.t} uid={`s${i}`} />
      </g>
    ))}
  </svg>
);
writeFileSync(out, renderToStaticMarkup(svg));
