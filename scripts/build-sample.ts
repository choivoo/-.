import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSampleShots } from './lib/sampleShots';
const shots = buildSampleShots();
mkdirSync('episode/SAMPLE01/shots', { recursive: true });
mkdirSync('episode/SAMPLE01/metadata', { recursive: true });
writeFileSync('episode/SAMPLE01/shots/shots.json', JSON.stringify(shots, null, 1));
const total = shots.reduce((a, s) => a + s.durationFrames, 0);
writeFileSync('episode/SAMPLE01/metadata/episode.json', JSON.stringify({ id: 'SAMPLE01', title: 'Ruins Duel (30s action test)', titleKo: '폐허의 대치 — 30초 액션 샘플', fps: 24, width: 1920, height: 1080, totalFrames: total, scenes: [{ sceneId: 'SMP', title: 'Ruins duel', startFrame: 0, durationFrames: total, summary: 'Soma vs Veyra', beat: 'sample' }], shotFiles: ['shots/shots.json'] }, null, 1));
console.log('sample shots:', shots.length, 'frames:', total);
