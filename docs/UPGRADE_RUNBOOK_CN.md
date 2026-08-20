# Sub2API 三节点更新手册

本文档适用于当前三节点部署：两台应用服务器共享中间服务器上的 PostgreSQL 和 Redis。

## 1. 当前拓扑

| 角色 | 公网 IP | 私网 IP | 运行服务 |
| --- | --- | --- | --- |
| 左侧应用 | `47.251.39.106` | `172.18.29.45` | Sub2API；旧的本地 PostgreSQL/Redis 仅作临时回退 |
| 中间数据 | `47.251.191.210` | `172.18.28.235` | PostgreSQL、Redis |
| 右侧应用 | `47.251.252.57` | `172.18.28.229` | Sub2API |

目标状态：

- 两台应用的 `DATABASE_HOST` 和 `REDIS_HOST` 均为 `172.18.28.235`。
- 两台应用使用相同的数据库名、数据库账号、Redis DB 和固定 JWT/TOTP 密钥。
- 中间节点不运行 Sub2API；左右节点不运行本地 PostgreSQL/Redis。
- 应用逐台更新，任何时刻至少保留一台健康应用。

2026-08-21 检查结果：两台应用的 PostgreSQL 已连接中间节点；右侧 Redis 已连接中间节点；左侧 Redis 仍连接本地容器，发布时必须先修正。

## 2. Git 和镜像约定

```text
官方仓库: https://github.com/Wei-Shaw/sub2api
个人 Fork: https://github.com/Nankeonlydream/sub2api
功能分支: feature/my-first-feature
镜像仓库: ghcr.io/nankeonlydream/sub2api
```

每次更新使用新的不可变版本号，例如官方 `0.1.179` 对应自定义版本 `0.1.179-creator.11`。服务器不得直接部署 `latest`。

## 3. 合并官方更新

先确认工作树没有待提交的业务改动。未跟踪的依赖缓存不应加入 Git。

```bash
git status --short --branch
git fetch --prune upstream
git fetch --prune origin
git switch feature/my-first-feature
git merge --no-ff upstream/main
```

冲突处理原则：

- Creator Studio 页面、API、路由、i18n 和图片/视频兼容代码保留自定义功能。
- 通用网关、计费、调度、迁移、安全和依赖更新优先采用官方实现，再将自定义逻辑接回新接口。
- 不使用 GitHub 的 `Discard commits`，它会删除自定义提交。
- 合并后把 `backend/cmd/server/VERSION` 更新为新的 `*-creator.*` 版本。

至少执行以下验证：

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm test -- --run
pnpm build

cd ../backend
go test ./...
go vet ./...
```

验证通过后提交、打 annotated tag 并推送。推送 tag 会触发 Release workflow 构建 GHCR 镜像。

```bash
git status --short
git add <逐个确认过的冲突文件>
git add .gitignore docs/UPGRADE_RUNBOOK_CN.md
git diff --cached --stat
git commit -m "Merge upstream main v0.1.179 while preserving creator studio"
git tag -a v0.1.179-creator.11 -m "Sub2API 0.1.179 with Creator Studio"
git push origin feature/my-first-feature
git push origin v0.1.179-creator.11
```

等待 GitHub Actions 成功，并确认两个应用节点所需架构的镜像已发布。

## 4. 发布前检查

在两台应用节点分别检查实际容器环境，不要只检查 `.env` 文件：

```bash
docker inspect sub2api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DATABASE_HOST|DATABASE_PORT|DATABASE_USER|DATABASE_DBNAME|DATABASE_SSLMODE|REDIS_HOST|REDIS_PORT|REDIS_DB|RUN_MODE)='
docker inspect sub2api --format 'image={{.Config.Image}} health={{.State.Health.Status}} compose={{index .Config.Labels "com.docker.compose.project.config_files"}}'
curl -fsS http://127.0.0.1:8080/health
```

必须满足：

- `DATABASE_HOST=172.18.28.235`
- `DATABASE_PORT=5432`
- `REDIS_HOST=172.18.28.235`
- `REDIS_PORT=6379`
- 两台应用的 `DATABASE_DBNAME`、`DATABASE_USER` 和 `REDIS_DB` 一致

在中间节点检查数据服务：

```bash
docker inspect sub2api-postgres --format '{{.State.Health.Status}}'
docker inspect sub2api-redis --format '{{.State.Health.Status}}'
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'
```

## 5. 备份中央数据库

只在中间节点执行。备份文件权限设为 `600`，并用 `pg_restore -l` 验证归档可读。

```bash
set -euo pipefail
BACKUP_DIR=/root/sub2api-backups
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/sub2api-before-v0.1.179-creator.11-$STAMP.dump"
mkdir -p "$BACKUP_DIR"
docker exec sub2api-postgres sh -lc \
  'pg_dump -U "${POSTGRES_USER:-sub2api}" -d "${POSTGRES_DB:-sub2api}" -Fc' \
  > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
docker exec -i sub2api-postgres pg_restore -l < "$BACKUP_FILE" >/dev/null
chmod 600 "$BACKUP_FILE"
sha256sum "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
```

备份完成前不得更新任何应用节点。

## 6. 滚动发布

先更新右侧应用 `172.18.28.229`。它已经是纯应用节点，可作为灰度节点。

在 `/root/sub2api-deploy/docker-compose.creator.yml` 固定镜像并强制声明中央数据地址：

```yaml
services:
  sub2api:
    image: ghcr.io/nankeonlydream/sub2api:0.1.179-creator.11
    environment:
      DATABASE_HOST: "172.18.28.235"
      DATABASE_PORT: "5432"
      REDIS_HOST: "172.18.28.235"
      REDIS_PORT: "6379"
```

保留 `.env` 和原 creator compose 的带时间戳副本，然后发布：

```bash
set -euo pipefail
cd /root/sub2api-deploy
STAMP=$(date +%Y%m%d-%H%M%S)
cp -a .env ".env.before-v0.1.179-creator.11-$STAMP"
cp -a docker-compose.creator.yml \
  "docker-compose.creator.yml.before-v0.1.179-creator.11-$STAMP"
docker compose config --quiet
docker compose pull sub2api
docker compose up -d --no-deps sub2api
```

等待并验证：

```bash
for n in $(seq 1 90); do
  STATUS=$(docker inspect sub2api --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')
  [ "$STATUS" = healthy ] && break
  [ "$STATUS" = exited ] && { docker logs --tail 100 sub2api; exit 1; }
  sleep 2
done
test "$(docker inspect sub2api --format '{{.State.Health.Status}}')" = healthy
test "$(docker inspect sub2api --format '{{.Config.Image}}')" = \
  ghcr.io/nankeonlydream/sub2api:0.1.179-creator.11
curl -fsS http://127.0.0.1:8080/health
docker logs --since 10m sub2api 2>&1 \
  | grep -Ei 'error|fatal|panic|migration|database|redis' || true
```

确认右侧业务请求、登录、Creator 图片和视频流程正常后，再用相同步骤更新左侧应用 `172.18.29.45`。

左侧更新后再次读取容器环境，确认 PostgreSQL 和 Redis 都指向中间节点。随后只停止旧本地数据容器，不删除容器和数据卷：

```bash
docker stop sub2api-postgres sub2api-redis
docker inspect sub2api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DATABASE_HOST|REDIS_HOST)='
curl -fsS http://127.0.0.1:8080/health
```

观察一段时间后再单独安排清理旧容器和卷；清理属于不可逆操作，不应与版本发布放在同一次变更中。

## 7. 回滚

应用回滚只恢复上一版 creator compose 和镜像，然后逐台执行：

```bash
cd /root/sub2api-deploy
cp -a docker-compose.creator.yml.before-v0.1.179-creator.11-<时间戳> \
  docker-compose.creator.yml
docker compose config --quiet
docker compose pull sub2api
docker compose up -d --no-deps sub2api
curl -fsS http://127.0.0.1:8080/health
```

不要在应用仍写入数据库时直接恢复数据库备份。若新迁移不向后兼容并且必须恢复数据库，应先停止两台应用、保留故障现场、恢复中央数据库，再启动上一版应用。

## 8. 发布完成标准

- 两台应用均运行同一个固定 creator 镜像，Docker health 为 `healthy`。
- 两台应用的 PostgreSQL 和 Redis 均指向 `172.18.28.235`。
- 中间节点仅运行 PostgreSQL/Redis；右侧仅运行 Sub2API；左侧旧数据容器已停止。
- `/health`、登录、API 请求、计费记录、Creator 图片和视频流程通过。
- 中央备份文件、SHA-256、Git commit、tag、镜像 digest 和发布时间已记录。
