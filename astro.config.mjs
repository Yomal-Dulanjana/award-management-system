import 'dotenv/config';
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

// Full SSR mode with @astrojs/vercel adapter for Vercel deployment
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [tailwind()],
  security: {
    checkOrigin: false,
  },
  vite: {
    // Ensure server-only modules don't leak to client
    ssr: { noExternal: [] },
  },
});