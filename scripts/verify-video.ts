import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';

/** usage: tsx scripts/verify-video.ts file.mp4 expectedFrames [width height] — checks duration/res/fps, extracts sample frames, flags black frames. */
const [file, expFrames, w = '1920', h = '1080'] = process.argv.slice(2);
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,codec_name,nb_frames,duration:format=duration', '-of', 'json', file]).toString());
const st = probe.streams[0];
const [n, d] = String(st.r_frame_rate).split('/').map(Number);
const fps = n / d, dur = Number(probe.format.duration);
const frames = Math.round(dur * fps);
const aud = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]).toString().trim();
const checks: [string, boolean, string][] = [
  ['codec h264', st.codec_name === 'h264', st.codec_name],
  ['resolution', String(st.width) === w && String(st.height) === h, `${st.width}x${st.height}`],
  ['fps 24', Math.abs(fps - 24) < 0.01, String(fps)],
  ['frame count', expFrames ? Math.abs(frames - Number(expFrames)) <= 1 : true, `${frames} (expected ${expFrames})`],
  ['has audio', aud.length > 0, aud || 'none'],
];
// black-frame detection
const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.5:pix_th=0.06", "-an", "-f", "null", "-"], { encoding: "utf8" });
const blackText = String(r.stderr ?? "");
const blacks = [...blackText.matchAll(/black_start:([\d.]+).*?black_duration:([\d.]+)/g)].map((m) => `${m[1]}s+${m[2]}s`);
checks.push(['no long black frames (>0.5s)', blacks.length === 0, blacks.join(', ') || 'none']);
const outDir = `renders/frames_${file.replace(/[^\w]+/g, '_')}`;
mkdirSync(outDir, { recursive: true });
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `fps=1/${Math.max(1, Math.round(dur / 8))},scale=640:-1`, `${outDir}/f%02d.png`]);
let ok = true;
for (const [name, pass, info] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${info}`); ok &&= pass; }
console.log(`duration ${dur.toFixed(3)}s, sample frames: ${readdirSync(outDir).length} in ${outDir}, size ${(statSync(file).size / 1e6).toFixed(1)}MB`);
process.exit(ok ? 0 : 1);
