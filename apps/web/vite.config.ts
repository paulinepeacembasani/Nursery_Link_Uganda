import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, defaultClientConditions, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { renderShell } from './src/shell/appShell.ts';

/**
 * Paints the app shell (src/shell/appShell.ts) into #root before the JavaScript loads: the header on
 * every page, plus the hero on Home. React replaces it with the same markup when it starts.
 */
const appShell = (): Plugin => ({
  name: 'nurserylink-app-shell',
  transformIndexHtml: {
    order: 'pre',
    handler: html => {
      const shell = JSON.stringify(renderShell()).replace(/</g, '\\u003c');
      const script =
        `<script>(function(){var s=${shell};var r=document.getElementById('root');` +
        `if(r&&!r.firstChild)r.innerHTML='<div class="flex min-h-dvh flex-col overflow-x-clip">'+s.header+(location.pathname==='/'?s.home:'')+'</div>';})();</script>`;
      return html.replace('<div id="root"></div>', `<div id="root"></div>\n    ${script}`);
    },
  },
});

/**
 * Production builds start the app's JavaScript just after the first paint instead of with the page:
 * on a slow phone connection the CSS and the hero photo then get the bandwidth first, so the shell
 * (above) and Home's photo appear sooner. The app starts one frame later (or after 150 ms in a
 * background tab, where frames don't run).
 */
const scriptsAfterFirstPaint = (): Plugin => ({
  name: 'nurserylink-scripts-after-first-paint',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: html => {
      const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/.exec(html);
      if (!entry?.[1]) return html;
      const preloads = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">\s*/g)];
      let out = html.replace(entry[0], '');
      for (const p of preloads) out = out.replace(p[0], '');
      const loader =
        `<script>(function(){var done=false,p=${JSON.stringify(preloads.map(p => p[1]))};` +
        `function go(){if(done)return;done=true;p.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l);});` +
        `var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(entry[1])};document.head.appendChild(s);}` +
        `requestAnimationFrame(function(){setTimeout(go,0);});setTimeout(go,150);})();</script>`;
      return out.replace('</body>', `  ${loader}\n  </body>`);
    },
  },
});

/** Preloads Home's first-screen fonts (Taviraj headings, Lora text), so its text doesn't reflow when they arrive late. */
const preloadFonts = (): Plugin => ({
  name: 'nurserylink-preload-fonts',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html, ctx) => {
      const files = Object.keys(ctx.bundle ?? {}).filter(f => /(taviraj|lora)-latin-400-normal-[\w-]+\.woff2$/.test(f));
      // Only on Home, where these fonts are the first screen. Elsewhere (the map) they would take
      // bandwidth from the page's code, which the largest element (a map tile) waits for.
      const script = `<script>if(location.pathname==='/'){${JSON.stringify(files)}.forEach(function(f){var l=document.createElement('link');l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='';l.href='/'+f;document.head.appendChild(l);});}</script>`;
      return html.replace('</title>', `</title>\n    ${script}`);
    },
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev and preview proxy /api to the local API, so the app and API share an origin (and the refresh cookie)
  // /api and uploaded photos (/media) come from the API
  const target = env.API_PROXY_TARGET ?? 'http://localhost:4000';
  const proxy = { '/api': { target, changeOrigin: false }, '/media': { target, changeOrigin: false } };
  return {
    plugins: [
      react(),
      tailwindcss(),
      appShell(),
      scriptsAfterFirstPaint(),
      preloadFonts(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: false,
        injectManifest: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], maximumFileSizeToCacheInBytes: 600_000 },
        manifest: {
          name: 'Nursery Link Uganda',
          short_name: 'Nursery Link',
          description: 'Find tree nurseries near you, order seedlings, and apply for free seedlings.',
          lang: 'en',
          start_url: '/',
          display: 'standalone',
          background_color: '#faf6ee',
          theme_color: '#1b6e44',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    // Workspace packages are consumed as TypeScript source
    resolve: { conditions: ['source', ...defaultClientConditions] },
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: { target: 'es2020', manifest: true, sourcemap: true },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      // Component tests type into forms; slower CI runners need more than the 5 s default
      testTimeout: 15_000,
      include: ['src/**/*.test.{ts,tsx}'],
      // Node's fetch needs an absolute URL; MSW answers at this origin
      env: { VITE_API_URL: 'http://localhost' },
    },
  };
});
