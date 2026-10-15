import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';

/** Local render API used by the editor's Render buttons. */
function renderApi(): Plugin {
  let proc: ChildProcess | null = null;
  let log: string[] = [];
  let running = '';
  const push = (s: string) => { log.push(...s.split(/\r|\n/).filter(Boolean)); if (log.length > 400) log = log.slice(-400); };
  return {
    name: 'forge-render-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        res.setHeader('content-type', 'application/json');
        if (url.pathname === '/render') {
          if (proc) { res.statusCode = 409; res.end(JSON.stringify({ error: 'render already running: ' + running })); return; }
          const q = url.searchParams, args = ['tsx', 'scripts/render-episode.ts', '--episode', q.get('episode') ?? 'EP01'];
          if (q.get('shot')) args.push('--shots', q.get('shot')!.replace(/[^\w,-]/g, ''));
          if (q.get('scene')) args.push('--scene', q.get('scene')!.replace(/[^\w-]/g, ''));
          if (q.get('res') === '720') args.push('--720');
          if (q.get('concat')) args.push('--concat', '--partial');
          running = args.slice(2).join(' '); log = [`$ ${running}`];
          proc = spawn('npx', args, { env: { ...process.env, NODE_ENV: 'production' } });
          proc.stdout?.on('data', (d) => push(String(d))); proc.stderr?.on('data', (d) => push(String(d)));
          proc.on('close', (c) => { push(`exit ${c}`); proc = null; running = ''; });
          res.end(JSON.stringify({ started: running })); return;
        }
        if (url.pathname === '/status') {
          const sf = readdirSync('renders').filter((f) => f.startsWith('status_'));
          const status: Record<string, unknown> = {};
          for (const f of sf) Object.assign(status, JSON.parse(readFileSync(`renders/${f}`, 'utf8')));
          res.end(JSON.stringify({ running, log: log.slice(-60), status, hasRenders: existsSync('renders') })); return;
        }
        if (url.pathname === '/production') {
          const sf = 'episode/EP01/production/state.json';
          res.end(JSON.stringify({ state: existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')) : null, checkpoint: existsSync('PRODUCTION_CHECKPOINT.json') ? JSON.parse(readFileSync('PRODUCTION_CHECKPOINT.json', 'utf8')) : null, running, log: log.slice(-80) })); return;
        }
        if (url.pathname === '/run') {
          const OK = ['render-shot', 'render-scene', 'render-all', 'resume', 'qa', 'storyboard', 'assemble', 'report', 'finalize', 'audio', 'status', 'audit'];
          const c = url.searchParams.get('cmd') ?? '';
          if (!OK.includes(c)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'command not allowed' })); return; }
          if (proc) { res.statusCode = 409; res.end(JSON.stringify({ error: 'a job is already running: ' + running })); return; }
          const args = ['tsx', 'scripts/production/cli.ts', c];
          for (const [k, v] of url.searchParams) if (k !== 'cmd' && /^[\w,.-]*$/.test(k) && /^[\w,.-]*$/.test(v)) { args.push('--' + k); if (v) args.push(v); }
          running = args.slice(2).join(' '); log = [`$ ${running}`];
          proc = spawn('npx', args, { env: { ...process.env, NODE_ENV: 'production' } });
          proc.stdout?.on('data', (d) => push(String(d))); proc.stderr?.on('data', (d) => push(String(d)));
          proc.on('close', (code) => { push(`exit ${code}`); proc = null; running = ''; });
          res.end(JSON.stringify({ started: running })); return;
        }
        res.statusCode = 404; res.end('{}');
      });
      // read-only static access to generated review images/videos
      server.middlewares.use('/files', (req, res) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const abs = path.resolve(rel);
        const ok = ['renders', 'episode'].some((d) => abs.startsWith(path.resolve(d) + path.sep));
        if (!ok || !existsSync(abs) || !statSync(abs).isFile()) { res.statusCode = 404; res.end(); return; }
        res.setHeader('content-type', abs.endsWith('.png') ? 'image/png' : abs.endsWith('.mp4') ? 'video/mp4' : abs.endsWith('.svg') ? 'image/svg+xml' : 'text/plain');
        createReadStream(abs).pipe(res);
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), renderApi()],
  publicDir: 'public',
  server: { host: true, port: 5173, open: '/editor.html' },
  build: { outDir: 'dist/editor', rollupOptions: { input: 'editor.html' } },
});
