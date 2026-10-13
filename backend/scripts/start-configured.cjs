// Load the project's saved environment before Node initializes its HTTP proxy support.
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { parse } = require('dotenv')
const backend = resolve(__dirname, '..')
const env = { ...process.env, ...parse(readFileSync(resolve(backend, '.env'))) }
const args = process.argv.includes('--watch')
  ? [require.resolve('@nestjs/cli/bin/nest.js'), 'start', '--watch']
  : [resolve(backend, 'dist/main.js')]
const result = spawnSync(process.execPath, args, {
  cwd: backend, env, stdio: 'inherit', windowsHide: true,
})
if (result.error) console.error('Backend startup failed:', result.error.message)
process.exit(result.status ?? 1)
