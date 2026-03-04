import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.github.io',
  base: '/StarPage',
  integrations: [react()]
});
