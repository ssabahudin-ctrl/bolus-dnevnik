import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages servira aplikaciju iz podfoldera repozitorija; relativna putanja radi svuda.
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
