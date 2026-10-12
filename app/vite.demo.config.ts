import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Builds the shareable demo (src/demo/entry.tsx) into dist-demo/: one script, plus a page
// fragment with the styles inlined, in the shape a Claude artifact is published in (the host
// adds the document skeleton, so the fragment has no <html>, <head> or <body>).
const demoPage = (): Plugin => ({
  name: 'origo-demo-page',
  // After Vite's own CSS step, which is what adds the stylesheet to the bundle.
  enforce: 'post',
  generateBundle(_options, bundle) {
    const css = bundle['demo.css'];
    if (css?.type !== 'asset') this.error('demo.css is missing from the bundle');
    const styles = String(css.source);
    this.emitFile({
      type: 'asset',
      fileName: 'origo-organizacion.html',
      source: `<title>Árbol de organización Origo</title>
<style>
${styles}
html, body, #root { min-height: 100%; }
.app-header { top: env(safe-area-inset-top, 0px); }
.demo-boot { padding: 48px 16px; font: 500 0.95rem var(--f-ui); color: var(--txt); text-align: center; }
</style>
<div id="root"><p class="demo-boot">Cargando la organización de demostración…</p></div>
<script>document.documentElement.lang = 'es';</script>
<script src="demo.js"></script>
`,
    });
  },
});

export default defineConfig({
  plugins: [react(), demoPage()],
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/demo/entry.tsx',
      output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'demo.js', assetFileNames: 'demo.[ext]' },
    },
  },
});
