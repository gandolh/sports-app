# Brief 07: The image's node base is pinned

**Depends on:** nothing.
**Builder:** Sonnet.
**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Filed 2026-11-24 from the estate's infra review. Every app image is built on the box by vps-deploy's `server`
phase. The same pin is filed in every repo with a Dockerfile; this one already scopes its build install
(`npm ci -w @sports-app/server`, line 35), the pattern the other repos are copying.

## Context

- `infrastructure/Dockerfile` has three `FROM node:24-alpine` lines (14, 27, 40). The tag follows whatever it is
  on the build day: on the laptop on 2026-11-24 it is Node 24.21.0 on alpine 3.24.2, while imbatranimOS pins
  `node:24.22.1-alpine`. On the box that is two separate 171 MB bases, and two copies of any toolchain layer built
  on them.
- vps-deploy's weekly housekeeping removes a base tag no image uses after two weeks; the next deploy pulls the
  tag's current image, every cache entry keyed on the old one is dead, and each app lands on a different Node
  patch depending on when it was last built. On 2026-11-23 the box's build cache reached 9.3 GB and its disk 90%.

## Decisions

- All three `FROM` lines are `node:24.22.1-alpine`. The estate moves to a new patch in one sweep, not per repo.
- Nothing else in the Dockerfile changes.

## Files you OWN

- `infrastructure/Dockerfile`
- The closeout: the outcome note, `corpus/log.md`, `corpus/wiki/status.md`

## Files you must NOT touch

- Any `package.json` or `package-lock.json`; `infrastructure/docker-compose.yml`.

## What to do

1. Edit the three `FROM` lines.
2. Note in the outcome whether the `build` stage's `npm ci -w @sports-app/server` (no `--include-workspace-root`)
   compiles because the server declares its own TypeScript; the other repos' briefs use the flag, and a reader
   comparing them should know why this one doesn't.
3. Build the image on the laptop (`docker compose -f infrastructure/docker-compose.yml build sports-app-api`),
   start it on a scratch data folder with `SPORTS_APP_PUBLIC_ORIGIN` set (the service refuses to start without
   it): the container turns healthy and `/api/health` answers.

If your session can't build Docker images, make the edit, run the checks, and hand back with step 3 for the
controller.

## Acceptance

- [ ] The image builds and step 3 passes.
- [ ] `npm run check` exits 0; `bash corpus/lint.sh` passes.
- [ ] End move `ready_for_deploy`.

## Owner steps

- `node cli.ts sports-app server` from vps-deploy. The image builds on the box.

## Outcome

Built 2026-11-24 by the controller (32fb73a). Ready for deploy: `node cli.ts sports-app server`.

- **Step 1**: the three `FROM` lines are `node:24.22.1-alpine`, with a comment on why the base is pinned.
- **Step 2**: the `build` stage's `npm ci -w @sports-app/server` compiles without `--include-workspace-root`
  because `server/package.json` declares `typescript` 6.0.3 in its own `devDependencies`, and `npm ci`
  installs a workspace's dev dependencies. The other repos' servers rely on the root's `typescript`, hence the flag.
- **Step 3**: the image builds (191 MB before, 192 MB after: the pinned Node patch) and, on a scratch data folder
  with `SPORTS_APP_PUBLIC_ORIGIN` set, turned healthy; `/api/health` answered `{"status":"ok"}`; Node is v24.22.1.
  Test images and the container were removed.
- `npm run check` exits 0; `bash corpus/lint.sh` passes.
