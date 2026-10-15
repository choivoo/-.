import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ShotView } from '../scenes/ShotView';
import { loadEpisodeMeta, loadEpisodeShots, loadSampleMeta, loadSampleShots } from '../scenes/episodeData';
import { CHARACTERS } from '../characters/defs';
import { CLIPS } from '../animation/clips';
import { validateShots, validateCharacters, Issue } from '../scenes/validate';
import type { CadenceOverride } from '../engine/FrameScheduler';
import { FPS, timecode } from '../engine/FrameScheduler';
import { assetUrl } from '../utils/assets';
import type { ShotSpec } from '../scenes/types';

const KV = ({ children }: { children?: React.ReactNode }) => <div className="kv">{children}</div>;
type Status = { running: string; log: string[]; status: Record<string, { status: string; error?: string }> };
const SOURCES = { EP01: { meta: loadEpisodeMeta(), shots: loadEpisodeShots() }, SAMPLE01: { meta: loadSampleMeta(), shots: loadSampleShots() } };
type SrcId = keyof typeof SOURCES;

export function App() {
  const [src, setSrc] = useState<SrcId>('SAMPLE01');
  const { meta, shots } = SOURCES[src];
  const [shotIdx, setShotIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cadence, setCadence] = useState<CadenceOverride>('auto');
  const [hidden, setHidden] = useState<string[]>([]);
  const [sound, setSound] = useState(false);
  const [badge, setBadge] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [apiErr, setApiErr] = useState('');
  const shot: ShotSpec = shots[Math.min(shotIdx, shots.length - 1)];
  const issues: Issue[] = useMemo(() => [...validateShots(shots, { expectedTotal: meta.totalFrames, scenes: meta.scenes }), ...validateCharacters()], [shots, meta]);
  const st = useRef({ shotIdx, frame, speed, shots, sound });
  st.current = { shotIdx, frame, speed, shots, sound };

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * FPS * st.current.speed; last = now;
      while (acc >= 1) {
        acc -= 1;
        let { shotIdx: si, frame: f } = st.current; f += 1;
        if (f >= st.current.shots[si].durationFrames) { if (si + 1 < st.current.shots.length) { si += 1; f = 0; } else { setPlaying(false); return; } }
        if (st.current.sound) for (const e of st.current.shots[si].soundEffects) if (e.f === f && e.sound !== 'wind_loop') { const a = new Audio(assetUrl(`sounds/${e.sound}.wav`)); a.volume = e.volume ?? 1; a.play().catch(() => undefined); }
        st.current.shotIdx = si; st.current.frame = f; setShotIdx(si); setFrame(f);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const poll = async () => { try { const r = await fetch('/api/status'); setStatus(await r.json()); setApiErr(''); } catch { setApiErr('render API unavailable (run `npm run editor`)'); } };
  useEffect(() => { poll(); const id = setInterval(poll, 2000); return () => clearInterval(id); }, []);
  const render = async (q: string) => { try { const r = await fetch('/api/render?' + q + `&episode=${src}`); const j = await r.json(); if (j.error) setApiErr(j.error); else poll(); } catch { setApiErr('render API unavailable'); } };

  const go = (si: number, f = 0) => { setShotIdx(si); setFrame(f); };
  const step = (d: number) => { setPlaying(false); const f = frame + d; if (f < 0) { if (shotIdx > 0) go(shotIdx - 1, shots[shotIdx - 1].durationFrames - 1); } else if (f >= shot.durationFrames) { if (shotIdx + 1 < shots.length) go(shotIdx + 1, 0); } else setFrame(f); };
  const global = shot.startFrame + frame;
  const scene = meta.scenes.find((s) => s.sceneId === shot.sceneId);
  const sceneShots = shots.filter((s) => s.sceneId === shot.sceneId);
  const sceneStart = scene?.startFrame ?? 0, sceneDur = scene?.durationFrames ?? 1;
  const seek = (e: React.MouseEvent<HTMLDivElement>, a: number, b: number, per: 'shot' | 'scene') => {
    const r = e.currentTarget.getBoundingClientRect(); const g = Math.floor(a + ((e.clientX - r.left) / r.width) * (b - a));
    if (per === 'shot') setFrame(Math.max(0, Math.min(shot.durationFrames - 1, g - a)));
    else { const i = shots.findIndex((s) => g >= s.startFrame && g < s.startFrame + s.durationFrames); if (i >= 0) go(i, g - shots[i].startFrame); }
  };
  const pct = (f: number) => `${(f / shot.durationFrames) * 100}%`;
  const rs = (id: string) => status?.status?.[id]?.status;

  return (
    <div className="app">
      <div className="top">
        <b>ANIME FORGE</b><span>{meta.titleKo}</span>
        <select value={src} onChange={(e) => { setSrc(e.target.value as SrcId); go(0); setPlaying(false); }}><option>SAMPLE01</option><option>EP01</option></select>
        <span className="pill">{timecode(global)} / {timecode(meta.totalFrames)}</span>
        <span className="pill">{shot.shotId} · {shot.fidelity}</span>
        {status?.running && <span className="pill" style={{ color: 'var(--acc)' }}>rendering: {status.running}</span>}
      </div>

      <div className="left">
        <h4>Scenes / Shots</h4>
        {meta.scenes.map((sc) => (
          <div key={sc.sceneId}>
            <div className={'item' + (sc.sceneId === shot.sceneId ? ' sel' : '')} onClick={() => go(shots.findIndex((s) => s.sceneId === sc.sceneId))}><span>{sc.sceneId} {sc.title}</span><span className="tag">{sc.beat}</span></div>
            {sc.sceneId === shot.sceneId && sceneShots.map((s) => (
              <div key={s.shotId} className={'item' + (s.shotId === shot.shotId ? ' sel' : '')} style={{ paddingLeft: 18 }} onClick={() => go(shots.indexOf(s))}>
                <span>{s.shotId}</span><span><span className={'tag ' + s.fidelity}>{s.fidelity}</span> <span className="tag">{rs(s.shotId) ?? s.renderStatus}</span></span>
              </div>
            ))}
          </div>
        ))}
        <h4>Characters in shot</h4>
        {shot.characters.map((c) => (
          <label key={c.id} className="item"><span>{CHARACTERS[c.id].nameKo}</span><input type="checkbox" checked={!hidden.includes(c.id)} onChange={(e) => setHidden(e.target.checked ? hidden.filter((h) => h !== c.id) : [...hidden, c.id])} /></label>
        ))}
        <h4>Character library</h4>
        {Object.values(CHARACTERS).map((c) => <div key={c.id} className="item"><span>{c.nameKo}</span><span className="tag">{c.assetStatus}</span></div>)}
      </div>

      <div className="center">
        <div className="stage"><div><ShotView shot={shot} frame={frame} opts={{ cadence, hidden, badge }} /></div></div>
        <div className="row">
          <button onClick={() => step(-1)}>◀ 1f</button>
          <button className={playing ? 'on' : ''} onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button onClick={() => step(1)}>1f ▶</button>
          <button onClick={() => go(Math.max(0, shotIdx - 1))}>⏮ shot</button><button onClick={() => go(Math.min(shots.length - 1, shotIdx + 1))}>shot ⏭</button>
          <label>촬영 <select value={cadence} onChange={(e) => setCadence(e.target.value as CadenceOverride)}><option value="auto">auto (shot data)</option><option value="ones">1s (24)</option><option value="twos">2s (12)</option><option value="threes">3s (8)</option><option value="hold">hold</option></select></label>
          <label>속도 <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.1, 0.25, 0.5, 1, 2].map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
          <label><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> SFX</label>
          <label><input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} /> badge</label>
          <span className="pill">f {frame}/{shot.durationFrames}</span>
        </div>
      </div>

      <div className="right">
        <h4>Shot</h4>
        <KV><span>scene / shot</span><span>{shot.sceneId} / {shot.shotId}</span></KV>
        <KV><span>startFrame</span><span>{shot.startFrame}</span></KV><KV><span>duration</span><span>{shot.durationFrames}f ({(shot.durationFrames / 24).toFixed(2)}s)</span></KV>
        <KV><span>background</span><span>{shot.backgroundId}</span></KV><KV><span>transition</span><span>{JSON.stringify(shot.transition ?? 'cut')}</span></KV>
        <KV><span>music</span><span>{shot.musicCue?.id ?? '—'}</span></KV><KV><span>voice</span><span>{shot.voiceAsset ?? 'none (placeholder lip-sync)'}</span></KV>
        <h4>Camera keyframes</h4>
        {shot.cameraKeyframes.map((k, i) => <KV key={i}><span>f{k.f} {k.ease ?? ''}</span><span>({Math.round(k.x)},{Math.round(k.y)}) ×{k.zoom.toFixed(2)}{k.blur ? ` blur${k.blur}` : ''}</span></KV>)}
        {shot.cameraShake?.map((k, i) => <KV key={'s' + i}><span>shake f{k.f}</span><span>amp {k.amp} / {k.dur}f</span></KV>)}
        <h4>Animation clips</h4>
        {shot.characters.map((c) => c.animationClips.map((a, i) => <KV key={c.id + i}><span>{c.id} f{a.f}</span><span>{a.clip}{CLIPS[a.clip]?.impactT !== undefined ? ' ⚡' : ''}</span></KV>))}
        <h4>Dialogue</h4>
        {shot.dialogue.length ? shot.dialogue.map((d, i) => <div key={i}>f{d.f}: <b>{d.speaker}</b> {d.text} {d.placeholderVoice && <span className="tag">no voice</span>}</div>) : <span className="tag">none</span>}
        <h4>SFX</h4>{shot.soundEffects.map((s, i) => <KV key={i}><span>f{s.f}</span><span>{s.sound}</span></KV>)}
        <h4>Render</h4>
        <div className="row">
          <button onClick={() => render(`shot=${shot.shotId}&res=720`)}>Shot 720p</button><button onClick={() => render(`shot=${shot.shotId}`)}>Shot 1080p</button>
          <button onClick={() => render(`scene=${shot.sceneId}&res=720`)}>Scene 720p</button><button className="warn" onClick={() => render('res=720')}>Full episode 720p</button>
          <button onClick={() => render('concat=1&shot=NONE&res=720')}>Concat</button>
        </div>
      </div>

      <div className="bottom">
        <div className="row"><b>Shot timeline</b><span className="pill">24fps · {cadence === 'auto' ? 'per-shot cadence' : cadence}</span>
          <span style={{ color: 'var(--dim)' }}>markers: <span style={{ color: '#8aa8ff' }}>camera</span> <span style={{ color: '#7dffa0' }}>clip</span> <span style={{ color: '#ffb347' }}>sfx</span> <span style={{ color: '#ff7fd1' }}>vfx</span> <span>dialogue</span></span></div>
        <div className="tl" onClick={(e) => seek(e, shot.startFrame, shot.startFrame + shot.durationFrames, 'shot')}>
          {shot.cameraKeyframes.map((k, i) => <div key={'c' + i} className="mk cam" style={{ left: pct(k.f) }} />)}
          {shot.characters.flatMap((c) => c.animationClips.map((a, i) => <div key={c.id + i} className="mk clip" style={{ left: pct(a.f), top: 0, height: '35%' }} />))}
          {shot.soundEffects.map((s, i) => <div key={'s' + i} className="mk sfx" style={{ left: pct(s.f), top: '35%', height: '30%' }} />)}
          {(shot.vfx ?? []).map((v, i) => <div key={'v' + i} className="mk vfx" style={{ left: pct(v.f), top: '65%', height: '35%' }} />)}
          {shot.dialogue.map((d, i) => <div key={'d' + i} className="mk dlg" style={{ left: pct(d.f), width: `${(d.dur / shot.durationFrames) * 100}%`, height: 4, bottom: 0, top: 'auto', opacity: 0.8 }} />)}
          <div className="head" style={{ left: pct(frame) }} />
        </div>
        <div className="row"><b>Scene {shot.sceneId}</b><span className="pill">{timecode(sceneStart)} – {timecode(sceneStart + sceneDur)}</span></div>
        <div className="tl" onClick={(e) => seek(e, sceneStart, sceneStart + sceneDur, 'scene')}>
          {sceneShots.map((s) => <div key={s.shotId} className="blk" title={s.shotId} style={{ left: `${((s.startFrame - sceneStart) / sceneDur) * 100}%`, width: `${(s.durationFrames / sceneDur) * 100}%`, background: s.shotId === shot.shotId ? '#2ee6d0' : s.fidelity === 'final-draft' ? '#2a7a70' : '#6a5a2a' }} />)}
          <div className="head" style={{ left: `${((global - sceneStart) / sceneDur) * 100}%` }} />
        </div>
        <h4>Progress / error log</h4>
        <div className="log">
          {apiErr && <div className="e">{apiErr}</div>}
          {issues.map((i, k) => <div key={k} className={i.level === 'error' ? 'e' : 'w'}>{i.level.toUpperCase()} {i.shotId} {i.msg}</div>)}
          {issues.length === 0 && <div>validation: no issues ({shots.length} shots, {meta.totalFrames} frames)</div>}
          {Object.entries(status?.status ?? {}).filter(([, v]) => v.status === 'failed').map(([k, v]) => <div key={k} className="e">render FAILED {k}: {v.error}</div>)}
          {status?.log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}
