import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    clearScreen: false,
    plugins: [
        react({
            babel: {
                // React Compiler should run before other Babel transforms.
                plugins: [['babel-plugin-react-compiler', {}]],
            },
        }),
        tailwindcss(),
    ],

    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        hmr: host
            ? {
                  host,
                  port: 1421,
                  protocol: 'ws',
              }
            : undefined,
        host: host || false,
        port: 1420,
        strictPort: true,
        watch: {
            ignored: ['**/src-tauri/**'],
        },
    },
    worker: {
        format: 'es',
    },
}));
