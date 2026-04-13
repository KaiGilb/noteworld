import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],

  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'NoteworldNotes',
      fileName: () => 'index.js',
      formats: ['es']
    },
    rollupOptions: {
      // vue is external — consumers supply it via their own Vue install.
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' }
      }
    }
  },

  test: {
    environment: 'jsdom'
  }
})
