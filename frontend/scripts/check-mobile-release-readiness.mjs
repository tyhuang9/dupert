import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_GATES = [
  'Repository contract',
  'Artifact provenance',
  'Signing and secrets',
  'Identity and versioning',
  'Production configuration',
  'Authentication and guest sessions',
  'Maps',
  'Universal/App Links',
  'Privacy and store metadata',
  'Device install smoke',
  'Backward compatibility and rollback',
  'Monitoring and ownership',
]

const ALLOWED_GATE_STATUSES = new Set(['PASS', 'BLOCKED', 'UNVERIFIED', 'FAIL'])
const FORBIDDEN_TRACKED_RELEASE_FILES = /(?:^|\/)(?:[^/]+\.(?:jks|keystore|p12|p8|pfx|pem|key|cer|crt|mobileprovision|provisionprofile)|keystore\.properties)$/i

function capture(text, pattern, label, violations) {
  const match = text.match(pattern)
  if (!match) {
    violations.push(`${label} is missing`)
    return null
  }
  return match[1]
}

function uniqueCaptures(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))]
}

function parseContract(document, violations) {
  const block = document.match(/<!-- mobile-release-contract\n([\s\S]*?)\n-->/)
  if (!block) {
    violations.push('release-readiness document is missing the machine-readable toolchain contract')
    return new Map()
  }

  const contract = new Map()
  for (const line of block[1].split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const separator = line.indexOf('=')
    if (separator <= 0 || separator === line.length - 1) {
      violations.push(`release contract entry is malformed: ${line}`)
      continue
    }
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (contract.has(key)) violations.push(`release contract repeats ${key}`)
    contract.set(key, value)
  }
  return contract
}

function parseGateRow(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

function inspectGateTable(document, violations) {
  const block = document.match(
    /<!-- mobile-release-gates:start -->([\s\S]*?)<!-- mobile-release-gates:end -->/,
  )
  if (!block) {
    violations.push('release-readiness document is missing the release-gate table markers')
    return
  }

  const lines = block[1].split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|'))
  if (lines.length < 3) {
    violations.push('release-gate table is incomplete')
    return
  }

  const header = parseGateRow(lines[0])
  if (header.join('|') !== 'Gate|Status|Owner|Evidence') {
    violations.push('release-gate table must use Gate, Status, Owner, and Evidence columns')
    return
  }

  const rows = lines.slice(2).map(parseGateRow)
  for (const row of rows) {
    if (row.length !== 4 || row.some((cell) => cell.length === 0)) {
      violations.push('every release gate must have non-empty status, owner, and evidence fields')
      continue
    }
    const [gate, status, owner, evidence] = row
    if (!ALLOWED_GATE_STATUSES.has(status)) {
      violations.push(`${gate} has unsupported status ${status}`)
    }
    if (status === 'PASS' && /unassigned|tbd/i.test(owner)) {
      violations.push(`${gate} cannot pass without an accountable owner`)
    }
    if (status === 'PASS' && /not recorded|unverified|tbd/i.test(evidence)) {
      violations.push(`${gate} cannot pass without recorded evidence`)
    }
  }

  const gateNames = new Set(rows.map(([gate]) => gate))
  if (gateNames.size !== rows.length) {
    violations.push('release-gate table must not repeat gate names')
  }
  for (const requiredGate of REQUIRED_GATES) {
    if (!gateNames.has(requiredGate)) violations.push(`release gate is missing: ${requiredGate}`)
  }
}

function inspectProductionBackend(environmentFile, violations) {
  const rawUrl = capture(
    environmentFile,
    /^VITE_BACKEND_API_URL=(.+)$/m,
    'native production backend URL',
    violations,
  )
  if (!rawUrl) return

  let url
  try {
    url = new URL(rawUrl.trim())
  } catch {
    violations.push('native production backend URL is invalid')
    return
  }

  if (url.protocol !== 'https:') violations.push('native production backend URL must use HTTPS')
  if (url.username || url.password || url.search || url.hash) {
    violations.push('native production backend URL must not include credentials, query, or fragment data')
  }
  if (url.pathname !== '/' || /localhost|127\.0\.0\.1|\.test$|\.example$|invalid|placeholder|change-me/i.test(url.hostname)) {
    violations.push('native production backend URL must be a deployed non-placeholder origin')
  }
}

export function loadMobileReleaseSources(repositoryRoot, trackedFiles = []) {
  const root = resolve(repositoryRoot)
  const read = (path) => readFileSync(resolve(root, path), 'utf8')

  return {
    frontendPackage: read('frontend/package.json'),
    capacitorConfig: read('frontend/capacitor.config.ts'),
    androidVariables: read('frontend/android/variables.gradle'),
    androidBuild: read('frontend/android/build.gradle'),
    androidAppBuild: read('frontend/android/app/build.gradle'),
    androidGradleWrapper: read('frontend/android/gradle/wrapper/gradle-wrapper.properties'),
    iosProject: read('frontend/ios/App/App.xcodeproj/project.pbxproj'),
    iosPackage: read('frontend/ios/App/CapApp-SPM/Package.swift'),
    nativeProductionEnvironment: read('frontend/.env.native-production'),
    workflow: read('.github/workflows/ci.yml'),
    releaseDocument: read('docs/mobile/release-readiness.md'),
    trackedFiles,
  }
}

export function inspectMobileReleaseReadiness(sources) {
  const violations = []
  let frontendPackage
  try {
    frontendPackage = JSON.parse(sources.frontendPackage)
  } catch {
    violations.push('frontend/package.json is invalid JSON')
    return violations
  }

  const capacitorPackages = ['@capacitor/core', '@capacitor/android', '@capacitor/ios']
    .map((name) => [name, frontendPackage.dependencies?.[name]])
    .concat([['@capacitor/cli', frontendPackage.devDependencies?.['@capacitor/cli']]])
  const capacitorVersions = new Set(capacitorPackages.map(([, version]) => version).filter(Boolean))
  for (const [name, version] of capacitorPackages) {
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
      violations.push(`${name} must use an exact semantic version`)
    }
  }
  if (capacitorVersions.size !== 1) violations.push('Capacitor platform, core, and CLI versions must agree')
  const capacitorVersion = capacitorVersions.size === 1 ? [...capacitorVersions][0] : null

  const appId = capture(sources.capacitorConfig, /appId:\s*['"]([^'"]+)['"]/, 'Capacitor appId', violations)
  const appName = capture(sources.capacitorConfig, /appName:\s*['"]([^'"]+)['"]/, 'Capacitor appName', violations)
  const webDir = capture(sources.capacitorConfig, /webDir:\s*['"]([^'"]+)['"]/, 'Capacitor webDir', violations)
  if (webDir && webDir !== 'dist') violations.push('Capacitor webDir must remain dist')
  if (/^\s*url\s*:/m.test(sources.capacitorConfig)) {
    violations.push('Capacitor must bundle the app and must not configure server.url')
  }

  const androidNamespace = capture(sources.androidAppBuild, /namespace\s*=\s*['"]([^'"]+)['"]/, 'Android namespace', violations)
  const androidAppId = capture(sources.androidAppBuild, /applicationId\s+['"]([^'"]+)['"]/, 'Android applicationId', violations)
  const iosAppIds = uniqueCaptures(sources.iosProject, /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;\s]+);/g)
  if (iosAppIds.length !== 1) violations.push('iOS bundle identifier must be present and consistent across configurations')
  for (const [label, value] of [['Android namespace', androidNamespace], ['Android applicationId', androidAppId], ['iOS bundle identifier', iosAppIds[0]]]) {
    if (appId && value && value !== appId) violations.push(`${label} must match Capacitor appId`)
  }

  const androidVersionCode = capture(sources.androidAppBuild, /versionCode\s+(\d+)/, 'Android versionCode', violations)
  const androidVersionName = capture(sources.androidAppBuild, /versionName\s+['"]([^'"]+)['"]/, 'Android versionName', violations)
  const iosBuildVersions = uniqueCaptures(sources.iosProject, /CURRENT_PROJECT_VERSION\s*=\s*([^;\s]+);/g)
  const iosMarketingVersions = uniqueCaptures(sources.iosProject, /MARKETING_VERSION\s*=\s*([^;\s]+);/g)
  if (!androidVersionCode || Number(androidVersionCode) <= 0) violations.push('Android versionCode must be positive')
  if (iosBuildVersions.length !== 1 || Number(iosBuildVersions[0]) <= 0) violations.push('iOS build number must be positive and consistent')
  if (iosMarketingVersions.length !== 1) violations.push('iOS marketing version must be present and consistent')
  if (androidVersionCode && iosBuildVersions.length === 1 && androidVersionCode !== iosBuildVersions[0]) {
    violations.push('Android and iOS build numbers must agree')
  }
  if (androidVersionName && iosMarketingVersions.length === 1 && androidVersionName !== iosMarketingVersions[0]) {
    violations.push('Android and iOS marketing versions must agree')
  }

  const swiftCapacitorVersion = capture(sources.iosPackage, /capacitor-swift-pm\.git['"],\s*exact:\s*['"]([^'"]+)['"]/, 'iOS Capacitor package version', violations)
  if (capacitorVersion && swiftCapacitorVersion && capacitorVersion !== swiftCapacitorVersion) {
    violations.push('iOS generated Capacitor package must match frontend Capacitor version')
  }

  const nodeVersions = uniqueCaptures(sources.workflow, /node-version:\s*['"]([^'"]+)['"]/g)
  const javaVersions = uniqueCaptures(sources.workflow, /java-version:\s*['"]([^'"]+)['"]/g)
  if (nodeVersions.length !== 1) violations.push('CI Node version must be present and consistent across jobs')
  if (javaVersions.length !== 1) violations.push('CI Java version must be present and consistent across jobs')
  const nodeVersion = nodeVersions.length === 1 ? nodeVersions[0] : null
  const javaVersion = javaVersions.length === 1 ? javaVersions[0] : null
  const gradleVersion = capture(sources.androidGradleWrapper, /gradle-([\d.]+)-(?:all|bin)\.zip/, 'Android Gradle version', violations)
  const androidGradlePlugin = capture(sources.androidBuild, /com\.android\.tools\.build:gradle:([\d.]+)/, 'Android Gradle Plugin version', violations)
  const compileSdk = capture(sources.androidVariables, /compileSdkVersion\s*=\s*(\d+)/, 'Android compile SDK', violations)
  const targetSdk = capture(sources.androidVariables, /targetSdkVersion\s*=\s*(\d+)/, 'Android target SDK', violations)
  const minSdk = capture(sources.androidVariables, /minSdkVersion\s*=\s*(\d+)/, 'Android minimum SDK', violations)
  const iosTargets = uniqueCaptures(sources.iosProject, /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([^;\s]+);/g)
  if (iosTargets.length !== 1) violations.push('iOS deployment target must be present and consistent')

  const expectedContract = new Map([
    ['app_id', appId],
    ['app_name', appName],
    ['capacitor', capacitorVersion],
    ['node', nodeVersion],
    ['java', javaVersion],
    ['gradle', gradleVersion],
    ['android_gradle_plugin', androidGradlePlugin],
    ['android_compile_sdk', compileSdk],
    ['android_target_sdk', targetSdk],
    ['android_min_sdk', minSdk],
    ['ios_deployment_target', iosTargets.length === 1 ? iosTargets[0] : null],
  ])
  const documentedContract = parseContract(sources.releaseDocument, violations)
  for (const [key, expected] of expectedContract) {
    if (expected && documentedContract.get(key) !== expected) {
      violations.push(`documented ${key} must match repository configuration (${expected})`)
    }
  }

  inspectProductionBackend(sources.nativeProductionEnvironment, violations)
  inspectGateTable(sources.releaseDocument, violations)

  for (const path of sources.trackedFiles ?? []) {
    if (FORBIDDEN_TRACKED_RELEASE_FILES.test(path)) {
      violations.push(`tracked release credential material is forbidden: ${path}`)
    }
  }

  return violations
}

export function assertMobileReleaseReadiness(repositoryRoot, trackedFiles) {
  const violations = inspectMobileReleaseReadiness(
    loadMobileReleaseSources(repositoryRoot, trackedFiles),
  )
  if (violations.length > 0) {
    throw new Error(`Mobile release-readiness preflight failed:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  }
}

const invokedPath = process.argv[1] && resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--tracked-files-stdin')) {
    throw new Error('Pass the repository tracked-file list with --tracked-files-stdin')
  }
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const trackedFiles = readFileSync(0, 'utf8').split('\0').filter(Boolean)
  assertMobileReleaseReadiness(repositoryRoot, trackedFiles)
  console.log('PASS mobile release-readiness preflight (artifact signing and device gates remain separate)')
}
