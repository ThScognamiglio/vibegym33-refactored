
/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/tests/setup.ts',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['icon-192x192.png', 'apple-touch-icon.png', 'icon-512x512.png'],

          // ─── WORKBOX: Cache strategies for offline & standby resilience ───────
          workbox: {
            cacheId: 'vibegym-v1', // Centralized cache version per Senior Architect's recommendation
            // Precache ALL static assets so app loads fully offline
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            globIgnores: ['**/*.map'],
            runtimeCaching: [
              // Firebase Firestore: try network first (4s timeout), fall back to cache
              {
                urlPattern: /^https:\/\/firestore\.googleapis\.com/,
                handler: 'NetworkFirst',
                options: {
                  networkTimeoutSeconds: 4,
                  cacheName: 'firestore-api-cache',
                  expiration: { maxAgeSeconds: 60 * 60 * 24, maxEntries: 50 },
                },
              },
              // Firebase Auth: same strategy
              {
                urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com/,
                handler: 'NetworkFirst',
                options: {
                  networkTimeoutSeconds: 4,
                  cacheName: 'firebase-auth-cache',
                  expiration: { maxAgeSeconds: 60 * 60 * 24, maxEntries: 10 },
                },
              },
              // Google Fonts: cache-first, 30 days
              {
                urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: { maxAgeSeconds: 60 * 60 * 24 * 30, maxEntries: 20 },
                },
              },
            ],
          },
          // ─────────────────────────────────────────────────────────────────────

          manifest: {
            short_name: "Vibe Gym",
            name: "Vibe Gym - Premium Coaching Platform",
            icons: [
              {
                src: "/icon-192x192.png",
                sizes: "192x192",
                type: "image/png"
              },
              {
                src: "/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable"
              }
            ],
            start_url: "/",
            scope: "/",
            display: "standalone",
            orientation: "portrait",
            theme_color: "#111827",
            background_color: "#111827",
            description: "Traccia i tuoi allenamenti, analizza il volume in tempo reale e raggiungi nuovi record."
          },
          devOptions: {
            enabled: false
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});