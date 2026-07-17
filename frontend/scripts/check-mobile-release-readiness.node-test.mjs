import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  inspectMobileReleaseReadiness,
  loadMobileReleaseSources,
} from './check-mobile-release-readiness.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function sources() {
  return loadMobileReleaseSources(repositoryRoot)
}

function messages(candidate) {
  return inspectMobileReleaseReadiness(candidate).join('\n')
}

test('accepts the repository-backed release-readiness contract', () => {
  assert.deepEqual(inspectMobileReleaseReadiness(sources()), [])
})

test('rejects native identifier and version drift', () => {
  const candidate = sources()
  candidate.androidAppBuild = candidate.androidAppBuild
    .replace('applicationId "io.github.tyhuang9.dupert"', 'applicationId "io.github.tyhuang9.other"')
    .replace('versionName "1.0"', 'versionName "1.1"')

  const result = messages(candidate)
  assert.match(result, /Android applicationId must match Capacitor appId/)
  assert.match(result, /Android and iOS marketing versions must agree/)
})

test('rejects an unsafe production backend origin', () => {
  const candidate = sources()
  candidate.nativeProductionEnvironment = 'VITE_BACKEND_API_URL=http://localhost:8000?token=unsafe\n'

  const result = messages(candidate)
  assert.match(result, /must use HTTPS/)
  assert.match(result, /must not include credentials, query, or fragment data/)
  assert.match(result, /must be a deployed non-placeholder origin/)
})

test('rejects tracked signing and provisioning material', () => {
  const candidate = sources()
  candidate.trackedFiles = [...candidate.trackedFiles, 'frontend/android/app/release.keystore', 'frontend/ios/App/App.mobileprovision']

  const result = messages(candidate)
  assert.match(result, /release\.keystore/)
  assert.match(result, /App\.mobileprovision/)
})

test('rejects incomplete checklist evidence schema', () => {
  const candidate = sources()
  candidate.releaseDocument = candidate.releaseDocument
    .replace(/^\| Monitoring and ownership \|.*\n/m, '')
    .replace('| Repository contract | PASS | Engineering |', '| Repository contract | PASS | Unassigned |')

  const result = messages(candidate)
  assert.match(result, /release gate is missing: Monitoring and ownership/)
  assert.match(result, /Repository contract cannot pass without an accountable owner/)
})

test('rejects inconsistent CI pins and duplicate release gates', () => {
  const candidate = sources()
  candidate.workflow = candidate.workflow.replace("node-version: '22'", "node-version: '24'")
  candidate.releaseDocument = candidate.releaseDocument.replace(
    '| Artifact provenance | BLOCKED |',
    '| Repository contract | BLOCKED | Unassigned | Duplicate row |\n| Artifact provenance | BLOCKED |',
  )

  const result = messages(candidate)
  assert.match(result, /CI Node version must be present and consistent across jobs/)
  assert.match(result, /release-gate table must not repeat gate names/)
})
