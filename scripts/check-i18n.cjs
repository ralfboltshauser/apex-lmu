const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('@babel/parser')

const root = path.join(__dirname, '..')
const sourceRoot = path.join(root, 'src')
const translatedAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title'])
const ignoredFiles = new Set(['vite-env.d.ts'])
const failures = []

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolute)
    if (!/\.tsx?$/.test(entry.name) || ignoredFiles.has(entry.name) || entry.name.endsWith('.test.tsx')) return []
    return [absolute]
  })
}

function hasWords(value) {
  return /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(value)
}

function report(file, node, value) {
  failures.push(`${path.relative(root, file)}:${node.loc.start.line}:${node.loc.start.column + 1}  ${JSON.stringify(value.trim())}`)
}

function checkVisibleExpression(file, node) {
  if (node.type === 'StringLiteral') {
    if (hasWords(node.value)) report(file, node, node.value)
    return
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const value = node.quasis[0]?.value.cooked || ''
    if (hasWords(value)) report(file, node, value)
    return
  }
  if (node.type === 'ConditionalExpression') {
    checkVisibleExpression(file, node.consequent)
    checkVisibleExpression(file, node.alternate)
  }
}

for (const file of sourceFiles(sourceRoot)) {
  if (file.includes(`${path.sep}i18n${path.sep}`)) continue
  const text = fs.readFileSync(file, 'utf8')
  const source = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] })

  function visit(node, parent) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXText' && hasWords(node.value)) report(file, node, node.value)

    if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && translatedAttributes.has(node.name.name)) {
      const value = node.value
      if (value?.type === 'StringLiteral' && hasWords(value.value)) report(file, value, value.value)
      if (value?.type === 'JSXExpressionContainer') checkVisibleExpression(file, value.expression)
    }

    if (node.type === 'JSXExpressionContainer' && (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment')) {
      checkVisibleExpression(file, node.expression)
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue
      if (Array.isArray(child)) child.forEach((entry) => visit(entry, node))
      else visit(child, node)
    }
  }
  visit(source, null)
}

if (failures.length) {
  console.error('i18n: untranslated user-facing JSX was found:')
  console.error(failures.map((failure) => `  ${failure}`).join('\n'))
  console.error('\nMove this copy into a defineMessages(en, de) resource. Technical logs may remain English, but rendered UI may not.')
  process.exit(1)
}

console.log('i18n: all rendered JSX copy is sourced through localization resources.')
