# 左侧 Creator 2.19.1 部署记录

2026-11-02（Asia/Shanghai），按用户明确要求，仅升级左侧 `catbee.online` / `iZrj9eby63lh2zp7dbipn8Z`。用户确认目标为上游最新稳定版 2.19.1，保留 Creator 定制，不包含主工作区未提交的功能改动。

- 原版本：`2.16.0-creator.1`。
- 新版本：`2.19.1-creator.1`。
- 源码 revision：`ac342f9bd7cd2976be672b78c81b4d28fd95b650`。
- 固定镜像：`ghcr.io/nankeonlydream/sub2api@sha256:0f1575a1cead621a9f30b7c20b14f83f26c64ef180187b5d1d34f905bfef8dd7`。
- 原镜像：`ghcr.io/nankeonlydream/sub2api@sha256:30df7481c84782e92a0dbc4d6af29e482d4a0f634534394de33a8c9350e61deb`，保留用于评估回退。
- Creator image CI：https://github.com/Nankeonlydream/sub2api/actions/runs/41339823853 ，全部成功；`ready.py` 已核验镜像真实 revision 与成功构建一致。
- 候选分支：`upgrade/creator-v2.19.1`，通过现有 `upstream.py publish --reviewed` 正常快进推送到集成分支 `feature/creator-on-v2.10.2`，未强推。
- 服务器现有升级工具 SHA256：`7e147447e8db655a2057c038ef61a30a7661080f2d708b7d7a2005ff250c8f62`，与审核源码一致，本次未替换工具。
- 成功记录：`/root/sub2api-creator-release/2.19.1-creator.1-20261102T032141-909500/DEPLOYED_OK`。

## 验证

本地升级工具 12 项测试通过；前端 545 个测试文件通过，4,944 项通过、53 项跳过；生产前端构建、后端 service/handler/server/config/domain/apicompat/migrations 回归及嵌入前端测试通过。远端 Creator image 对同一提交重新完成测试、构建和镜像发布。

服务器工具返回 `DEPLOYMENT_COMPLETE`：镜像及二进制版本/revision 一致，容器健康，环境变量、挂载、端口、网络配置保留；隔离 Creator 检查和真实 1K 预设检查通过。

公网 `/health` 返回 `{"status":"ok"}`。公网 Creator 资源 `/assets/CreatorStudioView-DhsTSlJM.js` 的 SHA256 为 `2fe7c6433f71f44246ba4e5356e3684d1d58fdd48da88af6b174acdb0c5febd3`，与隔离检查和新容器结果一致；包含 `1024x688`、`688x1024`、`1024x768`、`768x1024` 预设。

## 迁移、Worker 和范围

已审查从原版本新增的 30 项 SQL（编号 298–324，其中 309、312、313 各有两个不同文件）。共有迁移 checksum 校验通过，新增 30 项均已应用并由服务器工具核验。内容主要为审核豁免、质量模板、重登录预算、计费持久化、流量统计、渠道运营、管理密钥、授权连接、网络/排队观测和默认关闭的抽奖配置。迁移不会随镜像回退自动撤销；新授权连接投入使用后，回退还需遵循其旧路由兼容要求。

数据库和 Redis 连接仍指向原 `172.18.28.235`，本次没有重建这些服务。数据库迁移作用于原共享数据库，不表示数据库层与其他节点隔离。

部署前运行容器仅有 sub2api；未发现 reauth/oauth/prism 命名的独立 systemd 服务，独立 Worker token/enable 环境变量不存在，TOTP 加密密钥存在（仅检查存在状态）。本次未安装独立 Worker，也未验证真实 OAuth 自动登录。

右侧应用未执行部署；未备份数据库、未安装 Prism、未清理旧镜像、未进行付费生成测试。健康和资源检查不等同于全部生产业务链路或历史数据逐行验收。
