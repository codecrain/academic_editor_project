import { defineConfig } from 'vite';
import { resolve, extname, join } from 'path';
import { readFileSync, readFile } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appBasePath = normalizeBasePath(process.env.RHWP_STUDIO_BASE_PATH || '/hwpx/');

function normalizeBasePath(value: string): string {
  const raw = String(value || '/hwpx/').trim() || '/hwpx/';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

export default defineConfig({
  base: appBasePath,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wasm': resolve(__dirname, '..', 'pkg'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 7700,
    fs: {
      // [Task #741 ?꾩냽] ?몃? file path 洹몃┝ ?곸뿭 ?곸뿭 samples/ dir ?곸뿭 ?곸뿭 fetch 媛???곸뿭.
      allow: [__dirname, resolve(__dirname, '..', 'pkg'), resolve(__dirname, '..', 'samples')],
    },
  },
  plugins: [
    // [Task #741 ?꾩냽] dev ?쒕쾭 ?곸뿭 ?곸뿭 /samples/* 寃쎈줈 ?곸뿭 ?곸뿭 parent samples/ dir ?곸뿭
    // ?곸뿭 ?뺤쟻 serve ?곸뿭 ??wasm-bridge.ts ?곸뿭 ?곸뿭 ?몃? image fetch ?곸뿭 ?곸뿭 ?곸뿭.
    {
      name: 'serve-samples-dir',
      configureServer(server) {
        const samplesDir = resolve(__dirname, '..', 'samples');
        server.middlewares.use('/samples', (req, res, next) => {
          if (!req.url) return next();
          // URL decode + sanitize (path traversal 李⑤떒)
          const reqPath = decodeURIComponent(req.url.split('?')[0]);
          const relPath = reqPath.replace(/^\/+/, '');
          if (relPath.includes('..')) { res.statusCode = 403; return res.end(); }
          const full = join(samplesDir, relPath);
          if (!full.startsWith(samplesDir)) { res.statusCode = 403; return res.end(); }
          readFile(full, (err: NodeJS.ErrnoException | null, data: Buffer) => {
            if (err) { res.statusCode = 404; return res.end(); }
            const ext = extname(full).toLowerCase();
            const mime: Record<string, string> = {
              '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.png': 'image/png', '.bmp': 'image/bmp', '.webp': 'image/webp',
            };
            res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
            // [Task #741 ?꾩냽] OS ?곸뿭 ?덈? 寃쎈줈 ?곸뿭 ?곸뿭 response header ?곸뿭 ?몄텧 ??JS
            // ?곸뿭 ?곸뿭 dialog ?곸뿭 ?곸뿭 ?쒖뺨 viewer ?뺥빀 (D:\\... ?곸뿭 ?곸뿭 ?곸뿭 ???곸뿭 ?곸뿭) ?곸뿭.
            res.setHeader('X-File-Path', encodeURI(full));
            res.setHeader('Access-Control-Expose-Headers', 'X-File-Path');
            res.end(data);
          });
        });
      },
    },
    VitePWA({
      selfDestroying: process.env.RHWP_STUDIO_ENABLE_PWA !== 'true',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Tlooto HWPX Editor',
        short_name: 'Tlooto HWPX',
        description: 'Tlooto HWPX Editor for opening, editing, and saving HWP and HWPX documents.',
        lang: 'ko',
        theme_color: '#2b6cb0',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: appBasePath,
        scope: appBasePath,
        icons: [
          { src: 'icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-256.png', sizes: '256x256', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // WASM (~12 MB) is kept out of precache to avoid blocking SW installation;
        // CacheFirst at runtime still gives offline access after the first load.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2,ttf,otf}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
