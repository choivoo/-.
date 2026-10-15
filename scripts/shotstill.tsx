import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readFileSync } from 'node:fs';
import { ShotView } from '../src/scenes/ShotView';
// usage: tsx scripts/shotstill.tsx shots.json shotId frame,frame,... outPrefix
const [file, id, frames, prefix] = process.argv.slice(2);
const shots = JSON.parse(readFileSync(file, 'utf8'));
const shot = shots.find((s: any) => s.shotId === id);
for (const f of frames.split(',')) writeFileSync(`${prefix}-${id}-${f}.svg`, renderToStaticMarkup(<ShotView shot={shot} frame={Number(f)} opts={{ badge: true }} />));
