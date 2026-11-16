import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths keep the static build portable across subpaths and hosts.
  base: './',
  plugins: [react()],
});
