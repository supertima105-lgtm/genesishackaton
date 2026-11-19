import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EXAMPLES = path.resolve(process.cwd(), 'public/examples');
const safePath = (p: string) => /^[\w\-.]+(\/[\w\-.]+)*$/.test(p) && !p.split('/').includes('..');

/**
 * Примеры дней. В dev архив можно сохранить в public/examples (кнопка в архиве):
 * POST /__examples/reset, /__examples/file?path=…, /__examples/manifest.
 * Сайт подхватывает их при первом открытии, а автономная сборка вшивает их в index.html
 * через виртуальный модуль virtual:examples.
 */
function examples(inline: boolean): Plugin {
  const id = 'virtual:examples';
  return {
    name: 'examples',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      const manifestPath = path.join(EXAMPLES, 'manifest.json');
      if (!inline || !fs.existsSync(manifestPath)) return 'export default null;';
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files: { path: string }[] };
      const files: Record<string, string> = {};
      for (const f of manifest.files) files[f.path] = fs.readFileSync(path.join(EXAMPLES, 'files', f.path)).toString('base64');
      return `export default ${JSON.stringify({ manifest, files })};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__examples/') || req.method !== 'POST') return next();
        const u = new URL(req.url, 'http://localhost');
        try {
          if (u.pathname === '/__examples/reset') {
            fs.rmSync(EXAMPLES, { recursive: true, force: true });
            fs.mkdirSync(path.join(EXAMPLES, 'files'), { recursive: true });
          } else if (u.pathname === '/__examples/file') {
            const p = u.searchParams.get('path') ?? '';
            if (!safePath(p)) throw new Error(`bad path ${p}`);
            const dest = path.join(EXAMPLES, 'files', p);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, await readBody(req));
          } else if (u.pathname === '/__examples/manifest') {
            fs.writeFileSync(path.join(EXAMPLES, 'manifest.json'), await readBody(req));
          } else return next();
          res.statusCode = 204;
          res.end();
        } catch (e) {
          res.statusCode = 400;
          res.end(String((e as Error).message));
        }
      });
    },
  };
}

/**
 * В dev-режиме обслуживает файлы из /api так же, как это делает Vercel в проде:
 * каждый api/<name>.ts экспортирует функции GET/POST(Request) => Response.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const name = req.url.slice(5).split('?')[0];
        if (!/^[a-z-]+$/.test(name)) {
          res.statusCode = 404;
          return res.end();
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const body = await readBody(req);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: { 'content-type': String(req.headers['content-type'] ?? 'application/json') },
            body: body.length ? new Uint8Array(body) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(`[api/${name}] ${(e as Error).stack ?? e}`);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String((e as Error).message ?? e) }));
        }
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Автономная сборка: весь JS и CSS вшиваются прямо в index.html.
 * Такой файл открывается двойным щелчком (file://), где браузер не грузит модули из соседних файлов.
 */
function inlineIntoHtml(): Plugin {
  return {
    name: 'inline-into-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && source.includes(file.fileName)) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          source = source.replace(new RegExp(`<script[^>]*src="[^"]*${escapeRe(file.fileName)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && file.fileName.endsWith('.css') && source.includes(file.fileName)) {
          const css = String(file.source).replace(/<\/style/gi, '<\\/style');
          source = source.replace(new RegExp(`<link[^>]*href="[^"]*${escapeRe(file.fileName)}"[^>]*>`), () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig(({ mode }) => {
  // серверные ключи (без префикса VITE_) отдаём только в process.env dev-сервера
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_TTS_MODEL']) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }
  if (mode === 'standalone') {
    return {
      base: './',
      publicDir: false, // примеры уже вшиты в файл — копировать папку не нужно
      plugins: [react(), tailwindcss(), examples(true), inlineIntoHtml()],
      build: {
        outDir: 'docs',
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        chunkSizeWarningLimit: 4000,
        rolldownOptions: { output: { codeSplitting: false } },
      },
    };
  }
  return {
    plugins: [react(), tailwindcss(), devApi(), examples(false)],
  };
});
