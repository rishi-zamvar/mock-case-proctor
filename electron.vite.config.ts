import { createReadStream, statSync } from 'node:fs'
import { extname, resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { CSP } from './src/shared/csp'
import { resolveSafePath } from './src/main/protocol'
import { copyVoiceVendor } from './scripts/vendorVoice'

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
      {
        name: 'vendor-voice',
        buildStart() {
          copyVoiceVendor({
            nodeModules: resolve('node_modules'),
            out: resolve('src/renderer/public/vendor'),
            shim: resolve('src/renderer/vendor/tf-shim.mjs')
          })
        },
        // ponytail: dev-only /res mirror of the app:// route, untested (E2E runs the built app).
        configureServer(server) {
          const root = resolve('resources/assets')
          const mime: Record<string, string> = {
            '.mjs': 'text/javascript',
            '.js': 'text/javascript',
            '.wasm': 'application/wasm'
          }
          server.middlewares.use((req, res, next) => {
            const path = req.url?.split(/[?#]/)[0] ?? ''
            const file = path.startsWith('/res/') ? resolveSafePath(root, path.slice(4)) : null
            const st = file ? statSync(file, { throwIfNoEntry: false }) : undefined
            if (!file || !st?.isFile()) return next()
            res.setHeader('Content-Length', String(st.size))
            const type = mime[extname(file).toLowerCase()]
            if (type) res.setHeader('Content-Type', type)
            createReadStream(file).pipe(res)
          })
        }
      },
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
