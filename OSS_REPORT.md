# OSS Report — vitejs/vite #20412

Cannot extract the bundle in watch mode via the JS API.

## FLAG: SMALL FIX

One-line conditional in `build.ts` that makes `build.write: false` be respected
in watch mode. It fully unblocks the reported use case (reading build output in
memory without writing to disk) with no new API surface.

## Root cause (3 lines)

In watch mode Vite hands the options straight to Rolldown's `watch()`, which
writes every rebuild to disk by default, so `build.write: false` was silently
ignored (unlike a normal build). The user therefore could not get clean,
disk-free output, and Rolldown's current `BUNDLE_END` `event.result` only
exposes `close()`, so the Rollup-style `event.result.generate()` path no longer
exists — the supported way to read output is the `generateBundle` hook, which
only helps once writing to disk is actually skipped.

## Diff summary

- `packages/vite/src/node/build.ts`: when `build.write === false`, default the
  Rolldown watch option `skipWrite: true` (an explicit `build.watch.skipWrite`
  still wins, since it is spread afterwards). This matches non-watch behavior.
- `docs/config/build-options.md`: note under `build.watch` documenting that
  `write: false` skips disk writes in watch mode and that output is available via
  `generateBundle`.
- `packages/vite/src/node/__tests__/build-watch-write.spec.ts`: new focused
  tests — (1) no files written to disk in watch mode with `write: false`,
  (2) `generateBundle` still receives the output.

## Test commands and output

Reproduction (before fix) — test 1 failed:

```
$ npx vitest run packages/vite/src/node/__tests__/build-watch-write.spec.ts
× does not write to disk in watch mode when write is false
AssertionError: files should not be written to disk: expected true to be false
Tests  1 failed | 1 passed (2)
```

After fix:

```
$ npx vitest run packages/vite/src/node/__tests__/build-watch-write.spec.ts
Test Files  1 passed (1)
     Tests  2 passed (2)
```

Lint / format / typecheck on the touched files:

```
$ npx oxlint packages/vite/src/node/build.ts packages/vite/src/node/__tests__/build-watch-write.spec.ts
(no errors)
$ npx oxfmt --check <touched files>
(clean)
$ (cd packages/vite && npx tsc -p src/node)
exit: 0
```

(The repo-wide `pnpm typecheck` reports a pre-existing error in
`scripts/benchCircularImport.ts` because the `dist` type declarations were not
built in this environment; it is unrelated to this change.)

## Risks

- Behavior change: previously `build.write: false` + watch wrote to disk; now it
  does not. This is the intended fix and aligns watch with non-watch builds, but
  anyone relying on the old (arguably buggy) disk writes would need to set
  `build.watch.skipWrite: false` explicitly.
- Scope is limited to `build.write === false`, which is opt-in, so default
  `vite build --watch` behavior is unchanged.

## Draft PR description (for the owner to rewrite)

> fix(build): respect `build.write: false` in watch mode
>
> In watch mode the options were passed straight to Rolldown's `watch()`, which
> writes each rebuild to disk by default, so `build.write: false` was ignored —
> unlike a normal build. This made it impossible to run a watch build purely in
> memory and read the output (e.g. from a `generateBundle` hook) without also
> getting unwanted files on disk.
>
> When `build.write` is `false`, default Rolldown's `skipWrite` watch option to
> `true` so watch mode matches non-watch behavior. An explicit
> `build.watch.skipWrite` still takes precedence.
>
> Adds focused tests and a short docs note.
>
> Fixes #20412

## Estimated cost

~ $2.0 of usage.
