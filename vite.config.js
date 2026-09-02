import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/space-program-plus/',
  plugins: [react()],
})
