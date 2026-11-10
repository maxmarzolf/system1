import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
          'src/main.tsx',
          'src/shared/data/**',
          'src/vite-env.d.ts',
        ],
        reporter: ['text-summary', 'text', 'html'],
        // A floor, not a target: raise it as coverage grows; never lower it to make CI pass.
        thresholds: { statements: 93, lines: 93, functions: 92, branches: 85 },
      },
    },
  }),
)
