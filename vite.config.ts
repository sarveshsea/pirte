import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-router-dom')) return 'vendor-react'
            if (id.includes('ogl')) return 'vendor-ogl'
          }

          if (id.includes('/src/routes/waves/') || id.includes('/src/modules/waves/')) return 'route-waves'
          if (id.includes('/src/routes/Bloom') || id.includes('/src/modules/bloom/')) return 'route-bloom'
          if (id.includes('/src/routes/Voxels') || id.includes('/src/modules/voxels/')) return 'route-voxels'
          if (
            id.includes('/src/routes/Pigment') ||
            id.includes('/src/modules/pigment/') ||
            id.includes('/src/workers/pigment.worker')
          ) {
            return 'route-pigment'
          }

          return undefined
        },
      },
    },
  },
})
