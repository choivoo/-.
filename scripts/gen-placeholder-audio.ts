/** Generates deterministic PLACEHOLDER sound effects / music drone (synthesised, not production audio). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/utils/math';

function wav(samples: Float32Array, rate: number): Buffer {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32000 | 0, 44 + i * 2);
  return buf;
}
const noise = (seed: number) => { const r = mulberry32(seed); return () => r() * 2 - 1; };
function lowpass(x: Float32Array, a: number) { let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }
const gen = (sec: number, rate: number, fn: (t: number, i: number) => number) => { const o = new Float32Array(Math.floor(sec * rate)); for (let i = 0; i < o.length; i++) o[i] = fn(i / rate, i); return o; };

const sounds: Record<string, { rate: number; data: Float32Array }> = {};
{ const n = noise(1), R = 44100; sounds.hit_clash = { rate: R, data: gen(0.9, R, (t) => { const e = Math.exp(-t * 7); return e * (0.6 * [1830, 2970, 4130, 5620].reduce((a, f, k) => a + Math.sin(2 * Math.PI * f * t) / (k + 1), 0) * 0.5 + (t < 0.03 ? n() : 0) * 0.8); }) }; }
{ const n = noise(2), R = 44100; sounds.hit_heavy = { rate: R, data: gen(0.7, R, (t) => Math.exp(-t * 9) * (Math.sin(2 * Math.PI * (70 - 30 * t) * t) * 0.9 + (t < 0.06 ? n() * 0.6 : 0))) }; }
{ const n = noise(3), R = 44100; const raw = gen(0.7, R, (t) => n() * Math.sin(Math.PI * Math.min(1, t / 0.7)) ** 2 * 0.8); sounds.whoosh = { rate: R, data: lowpass(raw, 0.18) }; }
{ const n = noise(4), R = 44100; sounds.step = { rate: R, data: lowpass(gen(0.18, R, (t) => Math.exp(-t * 30) * n()), 0.2) }; }
{ const n = noise(5), R = 44100; sounds.draw = { rate: R, data: gen(0.9, R, (t) => { const e = Math.exp(-t * 4); return e * (0.3 * n() * (t < 0.35 ? 1 : 0.1) + 0.35 * Math.sin(2 * Math.PI * (2400 + 3000 * Math.min(t, 0.4)) * t) * (t < 0.4 ? 1 : 0.3) + 0.2 * Math.sin(2 * Math.PI * 3300 * t)); }) }; }
{ const n = noise(6), R = 22050; sounds.rumble = { rate: R, data: lowpass(gen(3, R, (t) => n() * Math.min(1, t * 4) * Math.exp(-t * 0.8)), 0.04).map((v) => v * 6) }; }
{ const n = noise(7), R = 44100; sounds.crack = { rate: R, data: gen(0.6, R, (t) => { const e = Math.exp(-t * 9); return e * n() * (Math.sin(t * 90) > 0.2 ? 1 : 0.3) * 0.9; }) }; }
{ const R = 22050; sounds.heartbeat = { rate: R, data: gen(1.2, R, (t) => { const b = (c: number) => Math.exp(-Math.pow((t - c) * 28, 2)) * Math.sin(2 * Math.PI * 55 * t); return b(0.1) + 0.7 * b(0.38); }) }; }
{ const n = noise(8), R = 22050; const raw = gen(40, R, () => n()); lowpass(raw, 0.05); sounds.wind_loop = { rate: R, data: raw.map((v, i) => v * 5 * (0.6 + 0.4 * Math.sin((i / R) * 0.9))) }; }
{ const R = 22050; sounds.tension_drone = { rate: R, data: gen(60, R, (t) => { const lfo = 0.7 + 0.3 * Math.sin(t * 0.5); const saw = (f: number) => 2 * ((t * f) % 1) - 1; return 0.22 * lfo * (saw(55) + saw(55.4) * 0.8 + saw(82.5) * 0.4) * (0.5 + 0.5 * Math.sin(t * 0.21)) + 0.08 * Math.sin(2 * Math.PI * 440 * t * (1 + 0.001 * Math.sin(t))) * Math.max(0, Math.sin(t * 0.12)); }) }; }

mkdirSync('public/sounds', { recursive: true });
const manifest: Record<string, unknown> = {};
for (const [name, s] of Object.entries(sounds)) {
  let peak = 0; for (const v of s.data) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0 ? 0.85 / peak : 1;
  writeFileSync(`public/sounds/${name}.wav`, wav(s.data.map((v) => v * norm) as Float32Array, s.rate));
  manifest[name] = { file: `sounds/${name}.wav`, durationSec: s.data.length / s.rate, placeholder: true, note: 'synthesised placeholder — replace with production audio' };
}
writeFileSync('public/sounds/manifest.json', JSON.stringify({ placeholder: true, sounds: manifest }, null, 1));
writeFileSync('public/sounds/PLACEHOLDER.md', '# Placeholder audio\nEvery file here is synthesised by `scripts/gen-placeholder-audio.ts` and is NOT production audio. Drop real WAV/MP3 files with the same names to replace them.\n');
console.log('audio:', Object.keys(sounds).join(', '));
