import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Every integration file initialises Payload against the SAME database, and
    // Payload pushes schema on init in dev. Run files in parallel and those
    // pushes race — producing spurious "constraint does not exist" failures that
    // have nothing to do with the code under test.
    fileParallelism: false,
  },
})
