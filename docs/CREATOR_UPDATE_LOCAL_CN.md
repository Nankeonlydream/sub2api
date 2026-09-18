# 保留自定义功能的一键更新与自动部署

左上角更新入口支持两种模式：默认仅合并、测试和构建；配置 `auto_deploy: true` 并通过 `creator-supervisor` 启动后，按钮变为“一键更新并部署”。测试通过后自动备份数据库、切换程序、重启并检查健康状态。

当前自动部署用于单机本地 Docker，切换时有短暂中断。不推送 Git、不发布镜像、不连接远程服务器。原站点配置、数据卷、PostgreSQL 和 Redis 容器继续沿用。

## 一次性配置

使用本机架构的 `creator-local` Docker 构建目标，包含 Git、Go、Node、pnpm、pg_dump、pg_restore 和独立管理进程。标准精简镜像不包含自动部署环境。

`deploy/creator-update.docker.json` 示例：

```json
{
  "repository": "/workspace/sub2api",
  "work_dir": "/app/creator-builds",
  "upstream_url": "https://github.com/Wei-Shaw/sub2api.git",
  "upstream_ref": "refs/heads/main",
  "pnpm": "/usr/local/bin/pnpm",
  "include_working_tree": true,
  "auto_deploy": true,
  "supervisor_socket": "/app/creator-builds/supervisor.sock"
}
```

`repository` 与 `work_dir` 必须使用互不嵌套的绝对路径。`main` 是开发分支，验证正式版本时可固定为明确的 `refs/tags/...`。任务记录实际官方提交 SHA。

`include_working_tree` 默认为 false；本地设为 true 会复制已跟踪的未提交改动和未被忽略的新文件，仅在隔离副本提交快照。原分支、索引和提交保持不变。未跟踪符号链接被拒绝，Git 忽略的文件不复制。快照期间应暂停编辑。

沿用现有 Compose 项目名和三个配置文件，例如本地项目 `deploy`：

```bash
docker compose -p deploy -f deploy/docker-compose.yml -f deploy/docker-compose.build.yml -f deploy/docker-compose.creator-local.yml build sub2api
docker compose -p deploy -f deploy/docker-compose.yml -f deploy/docker-compose.build.yml -f deploy/docker-compose.creator-local.yml up -d --no-deps --no-build --pull never sub2api
```

部署前备份原镜像、配置和数据库。覆盖文件以只读方式挂载源码，保留原应用数据卷，额外使用任务与缓存卷。它以非 root 的 `creator-supervisor` 作为管理进程；应用是其子进程。管理进程通过权限为 `0600` 的 Unix 套接字处理开始任务和读取状态，不开放 TCP 管理端口，不挂载 Docker socket。

## 一次点击的执行顺序

1. 在独立 Git 副本中保存当前自定义代码快照，拉取指定官方版本并执行普通合并。
2. 合并冲突立即停止并报告文件；不使用强制覆盖合并策略。
3. 执行完整前端测试、类型检查、前端构建、后端全量测试、更新相关单元测试和 `go vet`。
4. 生成嵌入前端的二进制，标记 `*-creator.local.<job_id>`，记录 SHA-256。
5. 对比候选版本和当前版本的迁移文件摘要。有数据库迁移变化时停止自动部署，要求审查迁移与回退方案。
6. 用实际站点数据库配置运行 `pg_dump -Fc`，通过 `pg_restore --list` 验证备份，备份失败则继续运行旧程序。
7. 保存切换日志和旧版本信息，停止旧应用，从候选目录启动新程序，使用该版本的资源文件。
8. 连续三次 `/health` 成功后持久化当前版本。新程序启动失败则自动恢复旧程序及资源目录；不自动覆盖恢复数据库。
9. 页面切换期间继续重连，成功后刷新加载新版本的页面资源。

构建预算为 90 分钟，备份最长 5 分钟，新应用健康检查最长 120 秒，回退使用独立期限。构建进程不继承数据库、JWT、上游账号等应用环境变量；数据库密码仅传给备份进程，不写入参数或构建日志。构建代码仍以当前系统用户身份运行，仓库应可信。

## 状态和恢复

- `ready`：仅构建模式验证通过，尚未部署。
- `deployed`：自动部署完成，健康检查通过。
- `failed`：合并、测试、备份或部署前检查失败，查看任务消息和日志。
- `rolled_back`：更新未完成，旧版本已恢复并通过健康检查。
- `recovery_required`：自动恢复未完成，后续更新被阻止，需要检查部署日志。

每个任务目录包含 `source/`、`build.log`、`status.json`、成功构建的 `sub2api`，自动部署时还包含 `database.dump`。任务根目录有最近任务状态、`active-release.json`、进程锁和切换期间的 `deployment-pending.json`。

**不要删除当前或回退版本所引用的目录、部署日志、备份及正在运行的任务。** 部署后的二进制和资源保存在任务卷，容器重启或重建后继续启动持久化的当前版本。切换中断后，管理进程先恢复旧版本，通过健康检查才结束恢复。

页面和命令行使用同一管理进程，重复点击返回同一运行任务，应用重启不会中断构建。仅构建模式中断时需检查残留 `run.lock`；不要在构建过程中删除锁。

数据库迁移兼容性无法仅凭旧二进制回退保证，因此迁移变化不自动安装。管理进程、工具链和系统依赖由基础镜像提供，修改这些组件需重建镜像；按钮更新应用二进制、嵌入前端及资源。健康检查证明启动及 HTTP 就绪，不代替所有真实业务测试。

代码冲突应在原自定义分支解决后重试；只修改构建副本不会纳入下次更新。官方二进制覆盖及旧的官方版本回退入口继续被保护逻辑阻止。

## 接口和命令行

管理员接口 `POST /api/v1/admin/system/update` 立即返回任务，`need_restart: false` 表示无需用户手动重启；`GET /api/v1/admin/system/creator-update` 恢复状态。两者沿用原管理员认证与合规确认，不接收网页传入的路径、仓库、命令或部署参数。

在 backend 目录执行：

```bash
CREATOR_UPDATE_CONFIG=/absolute/path/to/config.json go run ./cmd/creator-update
```

自动部署模式连接现有管理进程并触发实际部署。仅构建模式在命令行进程中执行。退出码 0 表示 ready 或 deployed；回退返回非 0，不会被误报为更新成功。

## 验证

```bash
cd backend
go test -race ./internal/creatorupdate
go test -tags=unit ./internal/handler/admin -run TestSystemHandler
cd ../frontend
corepack pnpm exec vitest run src/components/common/__tests__/CreatorUpdatePanel.spec.ts src/i18n/__tests__/localeKeyCompleteness.spec.ts
```

覆盖合并保留代码、冲突停止、重复点击、请求断开、备份失败阻止切换、迁移变化拦截、校验和检查、健康失败回退、真实子进程启停、中断恢复、页面重连和成功后刷新。
