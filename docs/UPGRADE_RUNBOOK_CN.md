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

2026-09-06 检查结果：两台应用的 PostgreSQL 和 Redis 均已连接中间节点；两台应用上的旧本地 PostgreSQL/Redis 容器均已停止。

## 2. Git 和镜像约定

```text
官方仓库: https://github.com/Wei-Shaw/sub2api
个人 Fork: https://github.com/Nankeonlydream/sub2api
功能分支: feature/my-first-feature
镜像仓库: ghcr.io/nankeonlydream/sub2api
```

每次更新使用新的不可变版本号，例如官方 `0.2.1` 对应自定义版本 `0.2.1-creator.19`。服务器不得直接部署 `latest`。

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
git commit -m "Merge upstream main v0.2.1 while preserving creator studio"
git tag -a v0.2.1-creator.19 -m "Sub2API 0.2.1 with Creator Studio"
git push origin feature/my-first-feature
git push origin v0.2.1-creator.19
```

等待 GitHub Actions 成功，并确认两个应用节点所需架构的镜像已发布。

## 4. 发布前检查

在两台应用节点分别检查实际容器环境，不要只检查 `.env` 文件：

```bash
docker inspect sub2api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DATABASE_HOST|DATABASE_PORT|DATABASE_USER|DATABASE_DBNAME|DATABASE_SSLMODE|REDIS_HOST|REDIS_PORT|REDIS_DB|RUN_MODE)='
docker inspect sub2api --format 'image={{.Config.Image}} health={{.State.Health.Status}} compose={{index .Config.Labels "com.docker.compose.project.config_files"}}'
docker port sub2api 8080/tcp
curl -fsS http://127.0.0.1:8080/health
```

必须满足：

- `DATABASE_HOST=172.18.28.235`
- `DATABASE_PORT=5432`
- `REDIS_HOST=172.18.28.235`
- `REDIS_PORT=6379`
- 两台应用的 `DATABASE_DBNAME`、`DATABASE_USER` 和 `REDIS_DB` 一致
- 容器名必须为 `sub2api`，`docker port sub2api 8080/tcp` 必须显示宿主机 `8080` 端口。
- Compose 标签中的 `com.docker.compose.project.config_files` 必须同时包含 `docker-compose.yml` 和 `docker-compose.creator.yml`。

在中间节点检查数据服务：

```bash
docker inspect sub2api-postgres --format '{{.State.Health.Status}}'
docker inspect sub2api-redis --format '{{.State.Health.Status}}'
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'
```

## 5. 备份中央数据库

默认必须备份。只有变更负责人在本次发布中明确授权“跳过数据库备份”时才可跳过，并在发布记录中写明授权和风险接受；配置文件副本仍然必须保留。不要因为跳过数据库备份而跳过数据库健康检查。

只在中间节点执行。备份文件权限设为 `600`，并用 `pg_restore -l` 验证归档可读。

```bash
set -euo pipefail
BACKUP_DIR=/root/sub2api-backups
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/sub2api-before-v0.2.1-creator.19-$STAMP.dump"
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

未获得明确跳过授权时，备份完成前不得更新任何应用节点。

## 6. 2026-09-06 更新事故复盘

### 6.1 事故现象与影响

- 右侧节点更新后生成了容器 `sub2api-deploy-sub2api-1`，而不是约定的 `sub2api`。
- 新容器没有发布宿主机 `8080` 端口，Docker health 为 `unhealthy`，本机 `curl http://127.0.0.1:8080/health` 连接失败。
- 右侧应用节点在 11:36 至 11:57 的处理窗口内不可用；左侧节点和中间 PostgreSQL/Redis 始终保持健康。
- 数据库未损坏、未回滚，也没有启动应用节点上的旧本地 PostgreSQL/Redis。

### 6.2 直接根因

错误命令只加载了 Creator 覆盖文件：

```bash
# 错误：禁止执行
docker compose -f docker-compose.creator.yml pull sub2api
docker compose -f docker-compose.creator.yml up -d --no-deps sub2api
```

`docker-compose.creator.yml` 只覆盖镜像和中央数据地址，不是完整 Compose 项目。显式传入任意 `-f` 后，Compose 不会再自动补载默认的 `docker-compose.yml`。因此单独加载覆盖文件时，基础文件中的 `container_name`、端口、数据卷、网络、restart policy、healthcheck 等配置会缺失。

正确命令必须始终按固定顺序同时加载两个文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.creator.yml ...
```

基础文件必须在前，覆盖文件必须在后。禁止在本三节点环境使用无 `-f` 的 `docker compose ...`，也禁止单独使用任意一个文件。

### 6.3 为什么原检查没有拦住

- 原手册在说明中要求修改 `docker-compose.creator.yml`，但发布和回滚命令没有明确列出两个文件，存在歧义。
- `docker compose ... config --quiet` 只证明 YAML 可以解析，不证明容器名、端口、环境变量和数据卷符合生产拓扑。
- 发布前虽读取过旧容器状态，但没有把 Compose 文件标签、容器名和端口映射做成失败即停止的硬断言。
- 镜像拉取和容器重建放在一个长命令中；拉取成功后，错误配置已创建容器，随后 health 超时只能报告失败，不能自动恢复旧服务。

### 6.4 恢复动作

没有回滚镜像或数据库。使用完整 Compose 文件组合重新创建同一个应用服务：

```bash
cd /root/sub2api-deploy
docker compose -f docker-compose.yml -f docker-compose.creator.yml \
  up -d --no-deps sub2api
```

恢复后容器名为 `sub2api`，宿主机 `8080` 端口重新发布，health 和 `/health` 均恢复正常，数据库与 Redis 仍指向 `172.18.28.235`。

### 6.5 强制防复发规则

1. 所有 `config`、`pull`、`up`、`logs` 和回滚命令必须使用完全相同的双文件参数和顺序。
2. `config --quiet` 后必须检查渲染配置至少包含 `sub2api`、`postgres`、`redis` 三个服务；只有 `sub2api` 说明错误地只加载了覆盖文件。
3. 重建前必须断言渲染配置包含目标固定镜像、`container_name: sub2api`、宿主机 `8080` 端口以及中央数据库/Redis 地址。
4. 每次只更新一台；灰度节点通过容器 health、`/health`、端口、Compose 标签和业务请求后才能更新另一台。
5. 若新节点未在规定时间内健康，立即停止后续节点更新，采集状态和日志，并使用上一版覆盖文件配合相同的双文件参数回滚。

## 7. 滚动发布

先更新右侧应用 `172.18.28.229`。它已经是纯应用节点，可作为灰度节点。

在 `/root/sub2api-deploy/docker-compose.creator.yml` 固定镜像并强制声明中央数据地址：

```yaml
services:
  sub2api:
    image: ghcr.io/nankeonlydream/sub2api:0.2.1-creator.19
    environment:
      DATABASE_HOST: "172.18.28.235"
      DATABASE_PORT: "5432"
      REDIS_HOST: "172.18.28.235"
      REDIS_PORT: "6379"
```

保留 `.env` 和原 Creator 覆盖文件的带时间戳副本。以下脚本是三节点环境的标准发布入口；不要拆掉或省略 `COMPOSE` 数组中的任何一个 `-f` 参数：

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /root/sub2api-deploy
NEW_VERSION=0.2.1-creator.19
EXPECTED_IMAGE="ghcr.io/nankeonlydream/sub2api:$NEW_VERSION"
DATA_HOST=172.18.28.235
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.creator.yml)
STAMP=$(date +%Y%m%d-%H%M%S)
test -f docker-compose.yml
test -f docker-compose.creator.yml

# 更新右侧时填左侧地址；更新左侧时填已验证的新右侧地址。
PEER_APP_HOST=172.18.29.45
test "$(docker inspect sub2api --format '{{.State.Health.Status}}')" = healthy
curl -fsS --max-time 5 "http://$PEER_APP_HOST:8080/health"

cp -a .env ".env.before-$NEW_VERSION-$STAMP"
cp -a docker-compose.creator.yml \
  "docker-compose.creator.yml.before-$NEW_VERSION-$STAMP"

# 先修改覆盖文件中的固定镜像；不要改基础文件。
sed -i -E \
  "s#ghcr.io/nankeonlydream/sub2api:[^[:space:]]+#$EXPECTED_IMAGE#" \
  docker-compose.creator.yml

# 语法检查不足以保证生产配置正确，必须检查渲染后的完整配置。
RENDERED=$(mktemp)
trap 'rm -f "$RENDERED"' EXIT
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" config > "$RENDERED"
for SERVICE in sub2api postgres redis; do
  "${COMPOSE[@]}" config --services | grep -qx "$SERVICE"
done
grep -Eq "^[[:space:]]+image: ${EXPECTED_IMAGE}$" "$RENDERED"
grep -Eq '^[[:space:]]+container_name: sub2api$' "$RENDERED"
grep -Eq '^[[:space:]]+published: "?8080"?$' "$RENDERED"
grep -Eq "^[[:space:]]+DATABASE_HOST: \"?${DATA_HOST}\"?$" "$RENDERED"
grep -Eq "^[[:space:]]+REDIS_HOST: \"?${DATA_HOST}\"?$" "$RENDERED"

# --no-deps 保证应用节点不会启动基础文件中的本地 PostgreSQL/Redis。
"${COMPOSE[@]}" pull sub2api
"${COMPOSE[@]}" up -d --no-deps sub2api
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
  ghcr.io/nankeonlydream/sub2api:0.2.1-creator.19
test "$(docker inspect sub2api --format '{{.Name}}')" = /sub2api
docker port sub2api 8080/tcp | grep -Eq '(^|:)8080$'
COMPOSE_FILES=$(docker inspect sub2api --format \
  '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
case "$COMPOSE_FILES" in
  *docker-compose.yml*docker-compose.creator.yml*) ;;
  *) echo "错误：容器不是由完整的双 Compose 文件创建：$COMPOSE_FILES" >&2; exit 1 ;;
esac
docker inspect sub2api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -qx 'DATABASE_HOST=172.18.28.235'
docker inspect sub2api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -qx 'REDIS_HOST=172.18.28.235'
curl -fsS http://127.0.0.1:8080/health
docker logs --since 10m sub2api 2>&1 \
  | grep -Ei 'error|fatal|panic|migration|database|redis' || true
```

若出现以下任一情况，视为发布失败并立即进入回滚：

- 容器名不是 `sub2api`；
- 出现 `sub2api-deploy-sub2api-1` 等 Compose 自动生成名称；
- `docker port sub2api 8080/tcp` 没有输出；
- health 不是 `healthy` 或 `/health` 失败；
- Compose 标签未同时包含两个文件；
- 数据库或 Redis 地址不是 `172.18.28.235`。

确认右侧业务请求、登录、Creator 图片和视频流程正常后，再用相同步骤更新左侧应用 `172.18.29.45`。

左侧更新后再次读取容器环境，确认 PostgreSQL 和 Redis 都指向中间节点。随后只停止旧本地数据容器，不删除容器和数据卷：

```bash
docker stop sub2api-postgres sub2api-redis
docker inspect sub2api --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(DATABASE_HOST|REDIS_HOST)='
curl -fsS http://127.0.0.1:8080/health
```

观察一段时间后再单独安排清理旧容器和卷；清理属于不可逆操作，不应与版本发布放在同一次变更中。

## 8. 回滚

应用回滚只恢复上一版 creator compose 和镜像，然后逐台执行：

```bash
cd /root/sub2api-deploy
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.creator.yml)
cp -a docker-compose.creator.yml.before-v0.2.1-creator.19-<时间戳> \
  docker-compose.creator.yml
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" pull sub2api
"${COMPOSE[@]}" up -d --no-deps sub2api
test "$(docker inspect sub2api --format '{{.Name}}')" = /sub2api
docker port sub2api 8080/tcp | grep -Eq '(^|:)8080$'
test "$(docker inspect sub2api --format '{{.State.Health.Status}}')" = healthy
curl -fsS http://127.0.0.1:8080/health
```

不要在应用仍写入数据库时直接恢复数据库备份。若新迁移不向后兼容并且必须恢复数据库，应先停止两台应用、保留故障现场、恢复中央数据库，再启动上一版应用。

## 9. 发布完成标准

- 两台应用均运行同一个固定 creator 镜像，Docker health 为 `healthy`。
- 两台应用的容器名均为 `sub2api`，宿主机 `8080` 端口均已发布。
- 两台容器的 Compose 标签均同时包含 `docker-compose.yml` 和 `docker-compose.creator.yml`。
- 两台应用的 PostgreSQL 和 Redis 均指向 `172.18.28.235`。
- 中间节点仅运行 PostgreSQL/Redis；右侧仅运行 Sub2API；左侧旧数据容器已停止。
- `/health`、登录、API 请求、计费记录、Creator 图片和视频流程通过。
- Git commit、tag、镜像 digest 和发布时间已记录；若本次执行了中央数据库备份，同时记录备份文件和 SHA-256；若经授权跳过，记录授权和风险接受。
