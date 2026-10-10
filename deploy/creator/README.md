# 创作中心日常升级入口

下次给 Codex 发送：

> 按 `/Users/haojie/Documents/CatBee/sub2api-ranxi-creator/deploy/creator/README.md` 升级右侧到上游最新稳定版，保留创作中心，不备份数据库。

也可以指定 `v2.10.4` 等目标版本。只检查不部署时，明确说“只检查/准备，不上线”。

## 自动执行的部分

GitHub 默认分支 `.github/workflows/creator-upstream.yml` 每 6 小时检查 ranxi 稳定版，也可手动运行。
若已合并则结束；否则创建 `upgrade/creator-vX.Y.Z` 候选分支，自动处理版本号冲突，启动 Creator image 工作流。
其它冲突会使任务失败，报告作为 Actions artifact 保留。工作流不自动创建 PR、发送消息或部署服务器。
若同名候选分支已存在，不覆盖；查看原 CI 结果，必要时修复并在该分支重新运行 Creator image。

Creator image 在所选分支执行：升级工具测试、前端全套测试/构建、后端回归、嵌入前端测试，之后发布镜像。
镜像内 `/app/creator-upgrade/release.json` 保存版本、源码提交、迁移 checksum。

GitHub 对无活动的公开仓库可能暂停定时任务，计划执行也可能延迟；每次请求升级时仍需检查最新上游发布。

## Codex 执行规程

固定信息：

- 集成分支：`feature/creator-on-v2.10.2`（名称不变，内容持续升级）。
- 定制仓库：`Nankeonlydream/sub2api`，上游：`ranxi2001/sub2api`。
- 右侧：`iZrj92zzv39jbi7n9fz4fuZ` / `172.18.28.229`，网站 `https://yapi.asia`。
- 左侧不更新；不备份数据库；不进行付费生成测试。
- 保留真实 1K 预设和实际尺寸计费规则。
- SSH 首选已有可用连接；若只能用阿里云 Chrome SSH 工作台，确认定位右侧终端后操作。
- 不再要求用户重复批准已经明确要求的升级；在合并冲突、测试失败、迁移不兼容时处理具体问题。

1. 在本仓库运行 `python3 deploy/creator/upstream.py check`，读取发布说明。
2. 检查远程候选分支和 Creator image 工作流。候选已存在时，将它检出到独立 worktree，检查与当前集成分支的关系。
   没有候选时，运行 `python3 deploy/creator/upstream.py prepare vX.Y.Z`。
   工具创建相邻独立 worktree、合并上游、将版本设为 `X.Y.Z-creator.1`，报告位于相邻 `creator-upgrade-vX.Y.Z.json`。
3. 检查冲突、自动合并的定制文件、发布说明、所有新增/修改迁移，以及 Worker 变化；检查服务器现有 Worker 状态。
   合并失败绝不可用上游镜像覆盖。确认数据迁移和原有节点兼容；镜像回退不撤销数据库迁移。
4. 手工准备的候选需要解决冲突、运行必要测试并提交。在候选 worktree 执行
   `python3 deploy/creator/upstream.py publish --reviewed`，会正常快进推送集成分支，禁止强推。
   定时任务准备且 CI 已成功的候选也须先审查，再用上述命令纳入集成分支。
   如果集成分支期间前进，先把最新集成分支合入候选并重新验证。
5. 等待本次提交的 Creator image 成功，运行
   `python3 deploy/creator/ready.py X.Y.Z-creator.N`。
   它读取镜像真实 revision，确认该提交的构建成功，并输出固定 digest 的服务器命令。
   不使用另一次构建的旧结果，不仅凭标签或提交消息判断成功。
6. 服务器运行输出的命令：

```sh
sudo /usr/local/sbin/creator-upgrade --image ghcr.io/nankeonlydream/sub2api@sha256:实际摘要 --apply
```

   省略 `--apply` 只拉取和隔离验证，不更改生产容器。`--status` 显示当前版本和健康。
   工具校验主机、镜像 revision/版本、创作中心资源、真实 1K 尺寸，原子更新 override，
   仅重建 sub2api，校验健康、配置及新增迁移，应用检查失败时恢复原 override。
7. 验证公网 `/health` 和 `/creator` 静态资源与新容器一致，记录最终版本、镜像摘要、CI 链接、迁移结果和局限。
   成功标记与旧 Compose 位于 `/root/sub2api-creator-release/<版本>-<时间>-<pid>/`。
   不做 `docker system prune`，保留旧镜像作为回退条件。

旧版 creator.1 等镜像没有 release.json，不能用新工具安装；旧版本回退使用发布目录中的原 Compose 文件及固定摘要。
服务器更新工具本身不自动执行镜像里附带的脚本。修改工具后须审查并从固定源码提交安装。

## 初次安装/维护服务器命令

从已审核提交获取 `deploy/creator/server.py`，校验本地与服务器 SHA256 一致，安装为：

```sh
sudo install -o root -g root -m 0755 server.py /usr/local/sbin/creator-upgrade
sudo /usr/local/sbin/creator-upgrade --status
```

无需额外服务、数据库备份或 GitHub token。服务器只需已有 Python 3、Docker/Compose、GHCR 网络访问。
GitHub API 查询可使用本机已有 git credential，凭据不能打印、提交或上传服务器。

## 自动化工作流入口维护

默认分支上的两个工作流只提供调度/发现入口：

- `.github/workflows/creator-upstream.yml` 与 `upstream-watch.yml` 一致。
- `.github/workflows/creator-image.yml` 的默认分支入口与 `image-dispatch.yml` 一致。

真正的镜像构建配置来自所选择的 Creator/candidate 分支。不要将定制源码覆盖到原本服务于其它项目的 main 分支。


## 验证记录（2026-10-10）

- 升级工具 8 项测试通过，包括独立 Git worktree 合并、自动解版本冲突、错误主机/镜像拒绝及应用回退。
- 定时检查已在默认分支启用，首次修正报告上传路径后运行成功：
  https://github.com/Nankeonlydream/sub2api/actions/runs/38020705321
- 为兼容服务器 Python 3.6，服务器命令使用 `universal_newlines`。
- `2.10.3-creator.2` 添加镜像内发布清单，供通用升级器验证；本次工具安装不要求将线上 creator.1 切换到 creator.2。
- 服务器命令已安装：`/usr/local/sbin/creator-upgrade`；SHA256 `2804f5fd57663df76df4116074b39303ab1df0d077e6b8cec63a8c8fe51c4789`，`--status` 验证成功。
