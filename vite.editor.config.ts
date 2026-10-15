import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

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
        res.statusCode = 404; res.end('{}');
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
