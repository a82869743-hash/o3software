import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// "npm run build:app" builds the phone app: screens are stored in the app, data comes from the live server.
const LIVE = 'https://o3carspa.cloud';
const appEnv = {
  'import.meta.env.VITE_SERVER_ORIGIN': JSON.stringify(LIVE),
  'import.meta.env.VITE_API_URL': JSON.stringify(LIVE + '/api'),
  'import.meta.env.VITE_PUBLIC_URL': JSON.stringify(LIVE),
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'app' ? appEnv : {},
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 800,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('lucide-react')) return 'vendor-icons';
            // React plus the packages React itself imports — keeping them together avoids a circular chunk
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler|react-is|use-sync-external-store)[\\/]/.test(id)) return 'vendor-react';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('socket.io-client')) return 'vendor-socket';
            if (id.includes('date-fns')) return 'vendor-date';
            return 'vendor-libs';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
}));
