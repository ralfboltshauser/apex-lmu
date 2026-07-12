const { execFileSync } = require('node:child_process')
const path = require('node:path')

const root = path.join(__dirname, '..')
try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' })
  console.log('Apex Git hooks installed (.githooks).')
} catch {
  console.log('Apex Git hooks skipped: this is not a Git working tree.')
}
