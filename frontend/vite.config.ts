import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em produção o site vive em https://<user>.github.io/brazil-yield-curve/,
// então o bundle precisa de base com o nome do repositório. Troque para '/'
// se publicar em domínio próprio ou em <user>.github.io.
const base = '/brazil-yield-curve/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? base : '/',
  plugins: [react()],
  // A API é servida como arquivos estáticos em public/api/v1 (gerados por
  // backend/export_static.py), tanto em dev quanto no build. Sem proxy.
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 5173 },
}))
