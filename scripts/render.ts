import { mkdirSync } from 'node:fs';
import { renderComp } from './render-lib';
// quick renders: test5 (first 5 s of the sample), sample30 (whole sample)
const mode = process.argv[2] ?? 'test5';
const res = process.argv.includes('--720') ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
mkdirSync('renders', { recursive: true });
const t0 = Date.now();
if (mode === 'test5') await renderComp({ comp: 'Sample30', out: `renders/test5_${res.height}p.mp4`, ...res, frameRange: [0, 119], onProgress: (p) => process.stdout.write(`\r${(p * 100).toFixed(0)}%`) });
else if (mode === 'sample30') await renderComp({ comp: 'Sample30', out: `renders/sample30_${res.height}p.mp4`, ...res, onProgress: (p) => process.stdout.write(`\r${(p * 100).toFixed(0)}%`) });
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
