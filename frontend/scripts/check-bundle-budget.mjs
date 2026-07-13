import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const MAX_ENTRY_GZIP_BYTES = 150 * 1024
const MAX_FAVICON_BYTES = 10 * 1024
const cwd = process.cwd()
const manifestPath = resolve(cwd, 'dist/.vite/manifest.json')
const faviconPath = resolve(cwd, 'public/favicon.svg')
const enforce = process.env.BUNDLE_BUDGET_ENFORCE === 'true'

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read Vite manifest at ${manifestPath}. Run npm run build first.`, {
      cause: error,
    })
  }
}

function collectInitialJavaScript(manifest, entryKey, seen = new Set()) {
  if (seen.has(entryKey)) {
    return []
  }
  seen.add(entryKey)

  const entry = manifest[entryKey]
  if (!entry) {
    throw new Error(`Vite manifest is missing imported entry ${entryKey}.`)
  }

  const importedFiles = (entry.imports ?? []).flatMap((importKey) =>
    collectInitialJavaScript(manifest, importKey, seen),
  )
  return entry.file.endsWith('.js') ? [...importedFiles, entry.file] : importedFiles
}

function reportBudget(label, actualBytes, budgetBytes) {
  const withinBudget = actualBytes <= budgetBytes
  const status = withinBudget ? 'PASS' : enforce ? 'FAIL' : 'WARN'
  console.log(
    `${status} ${label}: ${formatBytes(actualBytes)} (target ${formatBytes(budgetBytes)})`,
  )
  return withinBudget
}

const manifest = readManifest()
const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
if (!entryKey) {
  throw new Error('Vite manifest does not contain an initial entry.')
}

const entryFiles = collectInitialJavaScript(manifest, entryKey)
const entryGzipBytes = entryFiles.reduce(
  (total, file) => total + gzipSync(readFileSync(resolve(cwd, 'dist', file))).length,
  0,
)
const faviconBytes = statSync(faviconPath).size

console.log(`Initial JavaScript files: ${entryFiles.join(', ')}`)
const passed = [
  reportBudget('initial JavaScript (gzip)', entryGzipBytes, MAX_ENTRY_GZIP_BYTES),
  reportBudget('favicon', faviconBytes, MAX_FAVICON_BYTES),
].every(Boolean)

if (!passed && enforce) {
  process.exitCode = 1
} else if (!passed) {
  console.log('Budget enforcement is deferred until the frontend-startup optimization lands.')
}
