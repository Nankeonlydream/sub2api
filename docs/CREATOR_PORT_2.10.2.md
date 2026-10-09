# Creator Studio on ranxi v2.10.2

Base: `ranxi2001/sub2api` v2.10.2 (`d3e43f2de33af9e987cffa511d76dfabbcd749da`).
Custom version: `2.10.2-creator.3`.

Ports the Creator Studio UI, browser history/thumbnails, image/video pricing
queries, protected image downloads and browser FFmpeg composition from the local
Creator branch. Keeps ranxi generation, routing and longest-edge billing rules.
Creator.3 removes creator.2's special 1K billing exemption. The 1K preset list now
uses only dimensions whose longest edge is at most 1024: 1024x1024, 1024x688,
688x1024, 1024x768 and 768x1024. These also satisfy the existing multiple-of-16
and minimum 655360-pixel constraints. Ratios 16:9, 9:16 and 21:9 are disabled
at 1K because they cannot meet both limits; they remain available at 2K/4K.
Custom and historical dimensions are classified by their actual longest edge;
1536x1024 and the other legacy large 1K presets are billed as 2K again.
Estimates are labelled as estimates; final output/usage controls billing.
No SQL migrations are added. Video task reads remain available after generation
uses the remaining balance. API key authentication and task ownership checks remain.

The custom version rejects upstream binary updates and built-in rollback, which
would remove Creator Studio. Upgrade by rebasing this branch onto a reviewed ranxi
release, testing and rebuilding a custom image. Do not point this deployment at
an upstream image without explicitly intending to remove Creator Studio.

## Build

Use pnpm 9.15.9 and the Go toolchain required by backend/go.mod.

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm build
cd ../backend
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -tags embed -trimpath \
  -ldflags="-s -w -X main.Version=2.10.2-creator.3 -X main.Commit=$(git rev-parse --short HEAD) -X main.BuildType=release" \
  -o ../sub2api ./cmd/server
```

Include `backend/resources` with the binary. Build a Docker runtime image on the
server and pin its local version tag in the existing compose override. Recreate
only `sub2api` with both existing compose files and `--no-deps`.

## Deployment constraints

The initial rollout is limited to the right node, 47.251.252.57. The other node is
not changed. Both use the existing central PostgreSQL/Redis configuration.
The operator requested no additional database backup.

The current container's image tag is older than its running binary because it was
updated in place. Rollback must preserve the actual running 2.10.2 binary and
resources, not merely reuse the old image tag. Keep the previous compose override
and a rollback image containing that actual binary. A failed health check should
restore that image using the same compose configuration.

## Validation

- Frontend production build (typecheck, i18n and Vite).
- Creator frontend tests and BaseDialog integration tests.
- Unit tests for service, handler, middleware, routes and config.
- Go vet for these packages.
- On-server checksum/version and isolated startup checks before replacement.
- After replacement: health, version, Creator route/assets and API authentication.

Real image/video generation additionally requires a working provider account and
an authorized test API key. Browser history is local to the origin and browser.
