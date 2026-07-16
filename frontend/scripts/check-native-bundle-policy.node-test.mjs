import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inspectNativeBundle } from './check-native-bundle-policy.mjs'

async function createBundle(files) {
  const directory = await mkdtemp(join(tmpdir(), 'dupert-native-bundle-'))
  await mkdir(join(directory, '.vite'))
  await writeFile(join(directory, '.vite', 'manifest.json'), '{}')
  await Promise.all(Object.entries(files).map(([name, contents]) =>
    writeFile(join(directory, name), contents),
  ))
  return directory
}

test('accepts a native bundle without browser-only integrations', async (t) => {
  const directory = await createBundle({ 'app.js': 'const target = "native";' })
  t.after(() => rm(directory, { force: true, recursive: true }))

  assert.deepEqual(inspectNativeBundle(directory, {}), [])
})

test('reports browser-only source and configured value leakage without echoing values', async (t) => {
  const directory = await createBundle({
    'app.js': 'navigator.serviceWorker.register("/sw.js"); const key = "public-browser-key"; const heading = "Private trip planner";',
  })
  t.after(() => rm(directory, { force: true, recursive: true }))

  assert.deepEqual(inspectNativeBundle(directory, { VITE_GOOGLE_MAPS_API_KEY: 'public-browser-key' }), [
    {
      file: 'app.js',
      findings: ['service-worker registration', 'AppAccessGate UI', 'VITE_GOOGLE_MAPS_API_KEY value'],
    },
  ])
})
