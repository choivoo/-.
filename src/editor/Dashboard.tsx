import React, { useEffect, useMemo, useState } from 'react';

interface Rec { shotId: string; sceneId: string; durationFrames: number; priority: string; productionStatus: string; blocked: string[]; renderStatus: string; renderStatus1080?: string; fidelity: string; failed?: string; approved: boolean; purpose: string; qualityResults?: { verdict: string; tag: string; checks: { name: string; verdict: string; info: string }[] }; dialogue: { voiceStatus: string }[] }
interface Prod { state: { shots: Record<string, Rec>; updated: string } | null; checkpoint: Record<string, unknown> | null; running: string; log: string[] }
const STAGES = ['TODO', 'SCRIPT_READY', 'STORYBOARD_READY', 'BLOCKING', 'ANIMATION', 'CLEANUP', 'COLOR', 'COMPOSITING', 'AUDIO', 'QA', 'FINAL'];
const SCENES = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'];

export function Dashboard() {
  const [p, setP] = useState<Prod | null>(null);
  const [err, setErr] = useState('');
  const [stage, setStage] = useState('ALL');
  const [scene, setScene] = useState('ALL');
  const [sel, setSel] = useState<string | null>(null);
  const poll = async () => { try { setP(await (await fetch('/api/production')).json()); setErr(''); } catch { setErr('production API unavailable — start with `npm run editor`'); } };
  useEffect(() => { poll(); const t = setInterval(poll, 2000); return () => clearInterval(t); }, []);
  const run = async (q: string) => { try { const j = await (await fetch('/api/run?' + q)).json(); if (j.error) setErr(j.error); else { setErr(''); poll(); } } catch { setErr('request failed'); } };
  const recs = useMemo(() => Object.values(p?.state?.shots ?? {}), [p]);
  const shown = recs.filter((r) => (stage === 'ALL' || r.productionStatus === stage || (stage === 'BLOCKED' && r.blocked.length) || (stage === 'FAILED' && (r.failed || r.renderStatus1080 === 'FAILED'))) && (scene === 'ALL' || r.sceneId === scene));
  const frames = recs.reduce((a, r) => a + r.durationFrames, 0);
  const done1080 = recs.filter((r) => r.renderStatus1080 === 'DONE' || r.renderStatus1080 === 'SKIPPED_CACHE');
  const rendFrames = done1080.reduce((a, r) => a + r.durationFrames, 0);
  const reviewed = recs.filter((r) => r.approved).reduce((a, r) => a + r.durationFrames, 0);
  const failed = recs.filter((r) => r.failed || r.renderStatus1080 === 'FAILED');
  const cnt = (f: (r: Rec) => boolean) => recs.filter(f).length;
  const s = recs.find((r) => r.shotId === sel);
  const Tile = ({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) => <div style={{ background: 'var(--panel2)', padding: 10, borderRadius: 6, minWidth: 130 }}><div style={{ color: 'var(--dim)', fontSize: 11 }}>{k}</div><div style={{ fontSize: 22 }}>{v}</div><div style={{ color: 'var(--dim)', fontSize: 11 }}>{sub}</div></div>;
  return (
    <div style={{ padding: 12, overflow: 'auto', height: 'calc(100vh - 40px)' }}>
      {err && <div className="log"><div className="e">{err}</div></div>}
      {!p?.state && !err && <div>No production state yet — run <code>npm run production:status</code>.</div>}
      <div className="row" style={{ marginBottom: 8 }}>
        <Tile k="cuts" v={recs.length} sub={`${frames} frames · ${(frames / 24 / 60).toFixed(2)} min`} />
        <Tile k="rendered 1080p" v={`${done1080.length}/${recs.length}`} sub={`${rendFrames} frames (${((rendFrames / Math.max(1, frames)) * 100).toFixed(1)}%)`} />
        <Tile k="human-approved" v={cnt((r) => r.approved)} sub={`${reviewed} frames reviewed`} />
        <Tile k="FINAL" v={cnt((r) => r.productionStatus === 'FINAL')} />
        <Tile k="failed" v={failed.length} sub={failed.slice(0, 3).map((r) => r.shotId).join(', ')} />
        <Tile k="blocked" v={cnt((r) => r.blocked.length > 0)} sub={`${recs.reduce((a, r) => a + r.dialogue.filter((d) => d.voiceStatus === 'MISSING_VOICE').length, 0)} voice lines missing`} />
        <Tile k="QA PASS / REVIEW / FAIL" v={`${cnt((r) => r.qualityResults?.verdict === 'PASS')}/${cnt((r) => r.qualityResults?.verdict === 'REVIEW')}/${cnt((r) => r.qualityResults?.verdict === 'FAIL')}`} sub={`${cnt((r) => !r.qualityResults)} not run`} />
        <Tile k="fidelity" v={`${cnt((r) => r.fidelity === 'animatic')}/${cnt((r) => r.fidelity === 'directed')}/${cnt((r) => r.fidelity === 'final-draft')}`} sub="animatic / directed / final-draft" />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <button onClick={() => run('cmd=resume')}>Resume render (all pending)</button>
        <button onClick={() => run('cmd=resume&failed-only=')}>Render failed only</button>
        <button onClick={() => run('cmd=qa')}>Run QA (1080p cuts)</button>
        <button onClick={() => run('cmd=storyboard')}>Regenerate storyboards</button>
        <button onClick={() => run('cmd=assemble')}>Assemble</button>
        <button onClick={() => run('cmd=report')}>Report</button>
        <button className="warn" onClick={() => { if (confirm('Render ALL pending cuts at 1080p? This takes hours.')) run('cmd=render-all'); }}>Render full episode</button>
        {p?.running && <span className="pill" style={{ color: 'var(--acc)' }}>running: {p.running}</span>}
      </div>
      <h4>Scenes</h4>
      {SCENES.map((sc) => { const r = recs.filter((x) => x.sceneId === sc); const f = r.reduce((a, x) => a + x.durationFrames, 0); const d = r.filter((x) => x.renderStatus1080 === 'DONE' || x.renderStatus1080 === 'SKIPPED_CACHE').reduce((a, x) => a + x.durationFrames, 0);
        return <div key={sc} className="item" onClick={() => setScene(scene === sc ? 'ALL' : sc)} style={{ background: scene === sc ? '#143a38' : undefined }}><span style={{ width: 40 }}>{sc}</span><div style={{ flex: 1, background: 'var(--panel2)', height: 10, alignSelf: 'center' }}><div style={{ width: `${(d / Math.max(1, f)) * 100}%`, height: '100%', background: 'var(--acc)' }} /></div><span className="tag">{r.length} cuts · {Math.round((d / Math.max(1, f)) * 100)}% rendered</span></div>; })}
      <h4>Cuts <select value={stage} onChange={(e) => setStage(e.target.value)}><option>ALL</option>{STAGES.map((x) => <option key={x}>{x}</option>)}<option>BLOCKED</option><option>FAILED</option></select> <span className="tag">{shown.length} shown</span></h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,360px)', gap: 10 }}>
        <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--line)' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}><thead><tr style={{ color: 'var(--dim)', textAlign: 'left' }}><th>cut</th><th>pri</th><th>stage</th><th>render</th><th>QA</th><th>fid.</th></tr></thead><tbody>
            {shown.map((r) => <tr key={r.shotId} onClick={() => setSel(r.shotId)} style={{ cursor: 'pointer', background: sel === r.shotId ? '#143a38' : undefined }}><td>{r.shotId}</td><td>{r.priority}</td><td>{r.productionStatus}{r.blocked.length ? ' ⛔' : ''}</td><td>{r.renderStatus1080 ?? 'PENDING'}</td><td style={{ color: r.qualityResults?.verdict === 'FAIL' ? 'var(--err)' : r.qualityResults?.verdict === 'REVIEW' ? 'var(--warn)' : undefined }}>{r.qualityResults?.verdict ?? '—'}</td><td>{r.fidelity}</td></tr>)}
          </tbody></table>
        </div>
        <div style={{ border: '1px solid var(--line)', padding: 8, maxHeight: 360, overflow: 'auto' }}>
          {s ? <>
            <b>{s.shotId}</b> <span className="tag">{s.productionStatus}</span>
            <div style={{ color: 'var(--dim)' }}>{s.purpose}</div>
            {s.blocked.length > 0 && <div style={{ color: 'var(--warn)' }}>blocked: {s.blocked.join(', ')}</div>}
            {s.failed && <div style={{ color: 'var(--err)' }}>failed: {s.failed}</div>}
            <div className="row" style={{ margin: '6px 0' }}><button onClick={() => run(`cmd=render-shot&shot=${s.shotId}&force=`)}>Re-render this cut</button><button onClick={() => run(`cmd=render-shot&shot=${s.shotId}&720=`)}>720p</button></div>
            {s.qualityResults?.checks.map((c) => <div key={c.name} className="kv"><span>{c.name}</span><span style={{ color: c.verdict === 'FAIL' ? 'var(--err)' : c.verdict === 'REVIEW' ? 'var(--warn)' : undefined }}>{c.verdict}</span></div>)}
            {s.qualityResults && <img style={{ width: '100%', marginTop: 6 }} src={`/files/renders/EP01/contact/${s.shotId}_${s.qualityResults.tag}.png`} alt="contact sheet" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
          </> : <span className="tag">select a cut</span>}
        </div>
      </div>
      <h4>Contact sheets</h4>
      <div className="row">{SCENES.map((sc) => <a key={sc} href={`/files/episode/EP01/storyboard/sheets/${sc}.png`} target="_blank" rel="noreferrer" style={{ color: 'var(--acc)' }}>storyboard {sc}</a>)}<a href="/files/episode/EP01/storyboard/sheets/overview.png" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)' }}>overview (105 cuts)</a></div>
      <h4>Job log</h4>
      <div className="log">{p?.log.map((l, i) => <div key={i}>{l}</div>)}{(p?.log.length ?? 0) === 0 && <div>no job running</div>}</div>
      <h4>Checkpoint</h4>
      <div className="log">{p?.checkpoint ? JSON.stringify(p.checkpoint, null, 1) : 'none'}</div>
    </div>
  );
}
