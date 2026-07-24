import assert from 'node:assert/strict'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const lifecycleScript = join(repositoryRoot, 'scripts/ios-lifecycle.sh')

async function fixture({ devices, state } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dupert-ios-lifecycle-'))
  const bin = join(root, 'bin')
  const log = join(root, 'commands.log')
  await mkdir(join(root, 'scripts'), { recursive: true })
  await mkdir(join(root, 'frontend/node_modules/.bin'), { recursive: true })
  await mkdir(bin)
  await cp(lifecycleScript, join(root, 'scripts/ios-lifecycle.sh'))
  await writeFile(join(root, 'frontend/.env.native-development.local'), 'VITE_BACKEND_API_URL=http://localhost:8000\n')
  await writeFile(join(root, 'frontend/node_modules/.bin/cap'), '')
  await chmod(join(root, 'frontend/node_modules/.bin/cap'), 0o755)
  if (state) {
    await mkdir(join(root, '.dupert'))
    await writeFile(join(root, '.dupert/ios-lifecycle.json'), JSON.stringify({ repositoryRoot: root, ...state }))
  }
  const payload = JSON.stringify({ devices: { 'iOS 26.0': devices ?? [] } })
  const commands = {
    uname: '#!/usr/bin/env bash\necho Darwin\n',
    'xcode-select': '#!/usr/bin/env bash\necho /Applications/Xcode.app\n',
    npm: `#!/usr/bin/env bash\necho "npm $*" >> "$DUPERT_TEST_LOG"\n`,
    npx: `#!/usr/bin/env bash\necho "npx $*" >> "$DUPERT_TEST_LOG"\n`,
    xcrun: `#!/usr/bin/env bash
echo "xcrun $*" >> "$DUPERT_TEST_LOG"
if [[ "$1" == "--find" ]]; then echo /usr/bin/simctl; exit 0; fi
if [[ "$1 $2 $3 $4" == "simctl list devices available" ]]; then echo '${payload}'; exit 0; fi
if [[ "$1 $2" == "simctl boot" ]]; then exit "\${DUPERT_TEST_BOOT_EXIT:-0}"; fi
exit 0
`,
  }
  await Promise.all(Object.entries(commands).map(async ([name, contents]) => {
    const path = join(bin, name)
    await writeFile(path, contents)
    await chmod(path, 0o755)
  }))
  const run = (command, env = {}) => spawnSync('bash', [join(root, 'scripts/ios-lifecycle.sh'), command], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env, DUPERT_TEST_LOG: log, PATH: `${bin}:${process.env.PATH}` },
  })
  const commandsRun = async () => readFile(log, 'utf8').catch(() => '')
  return { root, run, commandsRun, cleanup: () => rm(root, { recursive: true, force: true }) }
}

const iphone = (state = 'Shutdown') => ({ udid: 'iphone-udid', name: 'iPhone 17', state, isAvailable: true })

test('selects an explicit simulator name, boots it once, and records ownership', async (t) => {
  const subject = await fixture({ devices: [iphone()] })
  t.after(subject.cleanup)
  const result = subject.run('start', { DUPERT_IOS_SIMULATOR: 'iPhone 17' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(await subject.commandsRun(), /xcrun simctl boot iphone-udid/)
  assert.match(await subject.commandsRun(), /xcrun simctl bootstatus iphone-udid -b/)
  assert.match(await subject.commandsRun(), /npm run sync:native:development/)
  assert.match(await subject.commandsRun(), /npx cap run ios --target iphone-udid --no-sync/)
  assert.deepEqual(JSON.parse(await readFile(join(subject.root, '.dupert/ios-lifecycle.json'))), {
    repositoryRoot: subject.root, simulatorUdid: 'iphone-udid', bootedByShortcut: true,
  })
})

test('uses exactly one prebooted iPhone without claiming ownership', async (t) => {
  const subject = await fixture({ devices: [iphone('Booted')] })
  t.after(subject.cleanup)
  const result = subject.run('start')
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(await subject.commandsRun(), /simctl boot /)
  assert.equal(JSON.parse(await readFile(join(subject.root, '.dupert/ios-lifecycle.json'))).bootedByShortcut, false)
})

test('reuses the worktree-owned booted simulator without a second boot', async (t) => {
  const subject = await fixture({ devices: [iphone('Booted')], state: { simulatorUdid: 'iphone-udid', bootedByShortcut: true } })
  t.after(subject.cleanup)
  const result = subject.run('start')
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(await subject.commandsRun(), /simctl boot /)
  assert.equal(JSON.parse(await readFile(join(subject.root, '.dupert/ios-lifecycle.json'))).bootedByShortcut, true)
})

test('fails instead of guessing when no safe default simulator exists', async (t) => {
  const subject = await fixture({ devices: [iphone()] })
  t.after(subject.cleanup)
  const result = subject.run('start')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Set DUPERT_IOS_SIMULATOR/)
  assert.doesNotMatch(await subject.commandsRun(), /simctl boot /)
})

test('fails before invoking Simulator when the native development environment is absent', async (t) => {
  const subject = await fixture({ devices: [iphone('Booted')] })
  t.after(subject.cleanup)
  await rm(join(subject.root, 'frontend/.env.native-development.local'))
  const result = subject.run('start')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Missing frontend\/\.env\.native-development\.local/)
  assert.equal(await subject.commandsRun(), 'xcrun --find simctl\n')
})

test('does not record ownership when Simulator cannot boot the selected device', async (t) => {
  const subject = await fixture({ devices: [iphone()] })
  t.after(subject.cleanup)
  const result = subject.run('start', {
    DUPERT_IOS_SIMULATOR: 'iphone-udid',
    DUPERT_TEST_BOOT_EXIT: '42',
  })
  assert.equal(result.status, 42)
  await assert.rejects(readFile(join(subject.root, '.dupert/ios-lifecycle.json')))
})

test('stops only the recorded app and preserves a prebooted simulator', async (t) => {
  const subject = await fixture({ devices: [iphone('Booted')], state: { simulatorUdid: 'iphone-udid', bootedByShortcut: false } })
  t.after(subject.cleanup)
  const result = subject.run('stop')
  assert.equal(result.status, 0, result.stderr)
  const commands = await subject.commandsRun()
  assert.match(commands, /xcrun simctl terminate iphone-udid io\.github\.tyhuang9\.dupert/)
  assert.doesNotMatch(commands, /simctl shutdown/)
})

test('stops a shortcut-booted simulator only after terminating this app', async (t) => {
  const subject = await fixture({ devices: [iphone('Booted')], state: { simulatorUdid: 'iphone-udid', bootedByShortcut: true } })
  t.after(subject.cleanup)
  const result = subject.run('stop')
  assert.equal(result.status, 0, result.stderr)
  const commands = await subject.commandsRun()
  assert.match(commands, /terminate iphone-udid io\.github\.tyhuang9\.dupert/)
  assert.match(commands, /shutdown iphone-udid/)
})
