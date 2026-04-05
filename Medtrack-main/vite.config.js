import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // listen on 0.0.0.0 so other devices on the LAN can connect
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../Medtrack server/Medtrack-server-main/Medtrack-server-main/hospital-asset-tracker.jsx'),
    },
  },
  base: process.env.NODE_ENV === 'production' ? '/mm1330.github.io/' : '/',
})
