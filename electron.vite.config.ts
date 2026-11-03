import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { CSP } from './src/shared/csp'

// frame-ancestors is ignored (with a console error) in <meta>; the app:// header still sends it.
const META_CSP = CSP.split('; ')
  .filter((d) => !d.startsWith('frame-ancestors'))
  .join('; ')

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      react(),
      // Build only: the dev server needs inline HMR scripts the CSP would block.
      {
        name: 'csp-meta',
        apply: 'build',
        transformIndexHtml: (html) =>
          html.replace(
            '<head>',
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}">`
          )
      }
    ]
  }
})
