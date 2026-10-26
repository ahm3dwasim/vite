import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { RolldownWatcher } from 'rolldown'
import { afterEach, describe, expect, test } from 'vitest'
import { build } from '../build'

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

    // wait for the first BUNDLE_END
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(
        () => rejectPromise(new Error('timed out waiting for BUNDLE_END')),
        15000,
      )
      watcher!.on('event', (event) => {
        if (event.code === 'BUNDLE_END') {
          clearTimeout(timeout)
          resolvePromise()
        } else if (event.code === 'ERROR') {
          clearTimeout(timeout)
          rejectPromise(event.error)
        }
      })
    })

    // give it a tick for any write to flush
    await new Promise((r) => setTimeout(r, 200))

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
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(
        () => rejectPromise(new Error('timed out waiting for BUNDLE_END')),
        15000,
      )
      watcher!.on('event', (event) => {
        if (event.code === 'BUNDLE_END') {
          clearTimeout(timeout)
          resolvePromise()
        } else if (event.code === 'ERROR') {
          clearTimeout(timeout)
          rejectPromise(event.error)
        }
      })
    })

    await new Promise((r) => setTimeout(r, 200))
    expect(bundleKeys, 'generateBundle should receive chunks').toBeDefined()
    expect(bundleKeys!.length).toBeGreaterThan(0)
  })
})
