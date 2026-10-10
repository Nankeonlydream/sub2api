# 创作中心镜像部署

创作中心分支：`feature/creator-on-v2.10.2`。
工作流：`.github/workflows/creator-image.yml`。
推送该分支后，GitHub Actions 运行创作中心测试、前端构建及 Go service 测试，再发布 Linux amd64 镜像。

本次版本：`2.10.2-creator.3`，镜像源码提交：`61ca54f205bff657028e2e758a9f103e44c24c46`。

```text
ghcr.io/nankeonlydream/sub2api:2.10.2-creator.3
ghcr.io/nankeonlydream/sub2api@sha256:08b4ab58edc9c963c2867377d235812f4eb3b31c38f1c73ef9919a4d3d48c3c3
```

生产部署固定 digest，避免同名标签后续变化。镜像可匿名拉取，服务器无需 GitHub 凭据。

后续更新流程：

1. 修改代码，并更新 `backend/cmd/server/VERSION` 为新的 creator 版本。
2. 推送创作中心分支，等待 Creator image 工作流成功。
3. 从工作流摘要取得新镜像 digest，服务器执行 `docker pull`。
4. 验证镜像版本、提交以及隔离启动；保留当前 compose override 用于回滚。
5. 将 `/root/sub2api-deploy/docker-compose.creator.yml` 中的 `services.sub2api.image` 改成新 digest。
6. 在 `/root/sub2api-deploy` 执行：

```sh
docker compose -f docker-compose.yml -f docker-compose.creator.yml up -d --no-deps --pull never sub2api
```

7. 验证健康状态、版本、创作中心静态资源，以及环境变量、挂载和端口未变。失败时恢复原 override 并再次执行上述命令。

只更新右侧应用节点。不执行数据库备份或数据库/Redis 容器重建。不要使用上游通用镜像替换自定义镜像，否则会丢失创作中心。

`deploy-creator3-image.py` 是本次从 creator.2 到 creator.3 的固定发布脚本，含主机校验、镜像 revision 校验、隔离启动、配置保留和失败回滚。它不是任意版本升级器；后续版本需要更新脚本中的预期版本和摘要。

creator.3 的 1K 预设最长边均不超过 1024：1024×1024、1024×688、688×1024、1024×768、768×1024。16:9、9:16、21:9 因最小像素约束需要 2K/4K。计费恢复按实际尺寸分档；上游实际输出仍影响最终扣费。


## 从上游 v2.10.2 升级到 v2.10.3

继续使用现有 `feature/creator-on-v2.10.2` 分支（名称保留，当前代码已升级）。

1. 确认工作区干净，拉取 ranxi 发布标签，合并而不是覆盖创作中心代码：

```sh
git fetch ranxi refs/tags/v2.10.3:refs/tags/ranxi-v2.10.3
git merge --no-commit --no-ff ranxi-v2.10.3
```

2. 检查冲突及自动合并的文件。本次仅 VERSION 冲突，改为 `2.10.3-creator.1`；创作中心路由、图片下载、价格查询、历史和 1K 预设保留。先查发布说明和 SQL 迁移，确认外部 Worker 是否需要一起升级。
3. 本地运行前端全套测试和生产构建，Go 网关/服务/路由/配置及迁移测试、go vet；构建后运行 `go test -tags embed ./internal/web`。本次修正了上游嵌入前端测试的旧 logo 名称及 `/v3/` 路由预期，并修正恢复时间测试对北京时间的依赖，分别在 UTC 和 Asia/Shanghai 验证通过。
4. 提交并推送该分支，GitHub Actions 自动测试、构建和发布镜像。等待所有步骤成功，再记录该提交对应的 digest。
5. 服务器拉取固定 digest，先以 `--network none` 和 `AUTO_SETUP=false` 隔离启动验证，不挂载生产数据。保留旧 Compose override 和旧镜像。
6. 只更改右侧 `docker-compose.creator.yml` 的 image，再运行前文的 `docker compose ... up -d --no-deps --pull never sub2api`。
7. 验证版本、提交、容器健康、创作中心资源、1K 尺寸、环境变量/端口/挂载保留，以及 270/271 迁移的 checksum 和公网 HTTPS。

数据库迁移由新版应用启动时自动执行：270 去掉两个平台白名单 CHECK 约束，271 新增独立 Excel 授权表及任务授权类型字段。按用户要求，本次不备份数据库。镜像回滚不会撤销这些迁移；以后如果已写入旧版不支持的新平台数据，需要另行评估回退兼容性。

右侧节点未检测到独立 Worker 服务、`/opt/sub2api-reauth` 目录或 Worker token。若以后启用密码/TOTP 自动登录，需要安装对应版本 Worker 运行包。

本次通过的构建：[Creator image #38016920616](https://github.com/Nankeonlydream/sub2api/actions/runs/38016920616)。

```text
ghcr.io/nankeonlydream/sub2api@sha256:9a148035dc3b81aed5a24a547f224d005a38795a42f9f58b2f5bcd2c0cd18909
源码提交：3e73a11cea3653d48d5decf99735a70d766810d9
```

2026-10-10：右侧节点已完成上述 v2.10.3 镜像部署，健康检查、270/271 迁移校验、配置保留检查及公网创作中心资源校验通过。成功记录位于 `/root/sub2api-creator-release/2.10.3-creator.1/DEPLOYED_OK`。未执行数据库备份或付费生成测试。
