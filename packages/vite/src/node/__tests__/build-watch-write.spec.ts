import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { RolldownWatcher } from 'rolldown'
import { afterEach, describe, expect, test } from 'vitest'
import { build } from '../build'

// BUNDLE_END is followed by END once the whole build cycle (including any
// output handling) has finished, so no timer is needed before asserting.
function waitForWatcherEnd(watcher: RolldownWatcher): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    watcher.on('event', (event) => {
      if (event.code === 'END') {
        resolvePromise()
      } else if (event.code === 'ERROR') {
        rejectPromise(event.error)
      }
    })
  })
}

describe('build watch write:false', () => {
  let tmp: string
  let watcher: RolldownWatcher | undefined

  afterEach(async () => {
    if (watcher) {
      await watcher.close()
      watcher = undefined
    }
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('does not write to disk in watch mode when write is false', async () => {
    tmp = fs.mkdtempSync(join(tmpdir(), 'vite-watch-write-'))
    fs.writeFileSync(join(tmp, 'entry.js'), `console.log('hello')\n`)

    const output = await build({
      root: tmp,
      logLevel: 'silent',
      build: {
        write: false,
        watch: {},
        outDir: 'dist',
        rollupOptions: { input: resolve(tmp, 'entry.js') },
      },
    })

    watcher = output as RolldownWatcher
    expect(watcher).toHaveProperty('on')

    await waitForWatcherEnd(watcher)

    const distDir = join(tmp, 'dist')
    const wroteToDisk =
      fs.existsSync(distDir) && fs.readdirSync(distDir).length > 0
    expect(wroteToDisk, 'files should not be written to disk').toBe(false)
  })

  test('generateBundle hook receives output in watch mode when write is false', async () => {
    tmp = fs.mkdtempSync(join(tmpdir(), 'vite-watch-gen-'))
    fs.writeFileSync(join(tmp, 'entry.js'), `console.log('hi')\n`)

    let bundleKeys: string[] | undefined
    const output = await build({
      root: tmp,
      logLevel: 'silent',
      build: {
        write: false,
        watch: {},
        outDir: 'dist',
        rollupOptions: { input: resolve(tmp, 'entry.js') },
      },
      plugins: [
        {
          name: 'capture',
          generateBundle(_options, bundle) {
            bundleKeys = Object.keys(bundle)
          },
        },
      ],
    })

    watcher = output as RolldownWatcher
    await waitForWatcherEnd(watcher)
    expect(bundleKeys, 'generateBundle should receive chunks').toBeDefined()
    expect(bundleKeys!.length).toBeGreaterThan(0)
  })
})
