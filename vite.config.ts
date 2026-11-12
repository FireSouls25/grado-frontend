import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// Tauri expects a fixed port when running `tauri dev`.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
    }
  },
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ['VITE_'],
  build: {
    target: process.env.TAURI_PLATFORM ? 'chrome105' : 'esnext',
    // Dos páginas: la app y la política de privacidad, que es estática
    // (se lee sin JavaScript) pero comparte tokens, fuentes y temas.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacidad: fileURLToPath(new URL('./privacidad.html', import.meta.url))
      }
    }
  }
});
