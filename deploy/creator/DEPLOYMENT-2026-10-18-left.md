# 左侧升级记录（2026-10-18）

按用户要求更新左侧 catbee.online 到上游最新稳定版 v2.12.1 对应的 Creator 定制版本。仅切换左侧应用，右侧未部署；未备份数据库、未重装 Prism、未进行付费生成测试。

- 节点：iZrj9eby63lh2zp7dbipn8Z / 172.18.29.45。
- 升级前：2.11.1-creator.2，healthy；磁盘可用 9.6GB，数据库主机 172.18.28.235。
- 目标版本：2.12.1-creator.1。
- 源码提交：bbed2bfb7b94a1093883d2dec05b0e37c092dccc。
- 固定镜像：ghcr.io/nankeonlydream/sub2api@sha256:e7d5dca881deeb53e615b86ab983db2b62c8e4754cde7d953969d11e90c30715。
- CI：https://github.com/Nankeonlydream/sub2api/actions/runs/39069387228 。ready.py 已核验镜像实际 revision 与该提交成功 CI。
- 使用现有升级器，SHA256：16aad7c1aec21c2cec18d41e41a44f0e88680266846640bc47af2c0e3fd8e7fa。
- 服务器成功记录：/root/sub2api-creator-release/2.12.1-creator.1-20261018T052237-1036789/DEPLOYED_OK。

## 候选审查与验证

复用已有独立候选 worktree；确认保留 Creator 更新保护、创作中心、真实 1K 预设和定制计费逻辑。审查 6 项新增迁移与 Worker 变化。新增分组开关默认 false，数据库变更为新增表/字段，认证缓存快照版本由 27 更新到 29；没有调整任何分组策略。

本地初次后端回归发现模型列表缓存并发测试偶发重复请求。修复 singleflight 开始前缺少新鲜缓存复查的问题，新增确定性回归测试，提交 bbed2bfb7。相关测试连续 10 次通过，修复后完整后端回归通过。

- 升级工具 10 项测试通过。
- 前端 490 个测试文件通过，4225 项通过、9 项跳过；生产构建通过。
- 后端 service、handler、server、config、domain、apicompat、migrations 回归通过。
- 嵌入前端资源测试通过。
- GitHub 对最终提交重新执行全部流水线检查，成功后发布镜像。
- 候选通过现有 publish --reviewed 工具正常快进推送集成分支；本地集成分支已同步。

## 服务器预检与部署

隔离启动返回 CHECK_OK，Creator 资源验证通过。数据库升级前记录 349 项迁移，目标镜像包含 354 项，重叠迁移 checksum 无不匹配。以下 6 项待迁移已执行并由升级器逐项验证：

- 285_openai_session_cookies.sql
- 285_registration_ip_quotas.sql
- 286_registration_ip_quota_created_at.sql
- 287_group_codex_cli_only.sql
- 287_openai_session_export_tasks.sql
- 288_group_block_subagents.sql

creator-upgrade --apply 返回 DEPLOYMENT_COMPLETE。容器 healthy，版本及源码提交匹配；环境变量、挂载、端口、网络配置一致。保留旧镜像和原 Compose；应用镜像回退不会撤销数据库迁移。

## 公网验收与局限

- https://catbee.online/health：HTTP 200，{"status":"ok"}。
- https://catbee.online/creator：HTTP 200。
- Creator 资源：/assets/CreatorStudioView-1PF5EkKf.js。
- 公网资源 SHA256：1c7abe36f8ed1e78e0fcc016c4c292dee229e6729ede96e91c482a9f5edce030，与新容器一致。
- 真实 1K 预设 1024x688、688x1024、1024x768、768x1024 全部保留。

Worker 继续使用既有配置，数据目录存在；容器未安装 Python/Node，也未发现独立 reauth/totp 服务。本次未补装 Worker 依赖，未验证真实账号登录、2FA Session 导出或付费生成流程。Prism 未运行且无相关环境键。
