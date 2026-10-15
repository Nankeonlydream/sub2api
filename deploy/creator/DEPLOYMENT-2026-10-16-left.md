# 左侧升级记录（2026-10-16）

按用户授权将左侧 catbee.online 更新到已在右侧验证通过的 2.11.1-creator.2。右侧未改动；未备份数据库、未进行付费生成测试、未重装 Prism。

- 节点：iZrj9eby63lh2zp7dbipn8Z / 172.18.29.45。
- 升级前：2.10.5-creator.2，健康；数据库主机 172.18.28.235。
- 目标版本：2.11.1-creator.2；源码提交 57e1313abbfe8a5c25e119e1f58384def25a6a80。
- 固定镜像：ghcr.io/nankeonlydream/sub2api@sha256:cc07dc2a307e1c9ea20e9d9fa5d2f5d86e36a50a7ba4ca8b5751d8898a0b1abb。
- CI： https://github.com/Nankeonlydream/sub2api/actions/runs/38790824982；ready.py 已核验精确 revision 和成功构建。
- 服务器升级器 SHA256：16aad7c1aec21c2cec18d41e41a44f0e88680266846640bc47af2c0e3fd8e7fa；使用现有工具，未更换。
- 部署前状态：磁盘约 49GB，使用 28GB，可用 9.3GB；sub2api 与数据库健康，数据库重启计数为 0。
- 部署预检：PENDING_MIGRATIONS=[]，隔离 Creator 检查通过；348 项迁移 checksum 无不匹配；DATABASE_HOST 仍为 172.18.28.235；Worker 保持原 managed 模式；无 Prism 环境键。
- creator-upgrade --apply 返回 DEPLOYMENT_COMPLETE；容器 healthy，原环境、挂载、端口和网络配置保留。
- 服务器记录：/root/sub2api-creator-release/2.11.1-creator.2-20261016T041358-860718/DEPLOYED_OK。

## 公网验收

- https://catbee.online/health 返回 HTTP 200，`{"status":"ok"}`。
- 首页返回 HTTP 200。
- /creator 返回 HTTP 200。
- 创作中心资源：/assets/CreatorStudioView-DDzvzcZI.js。
- 公网资源 SHA256：da880fb472a73470dfe60027649cf094c121e02188b494df0a7d69f0c83130f3。
- 真实 1K 尺寸 1024x688、688x1024、1024x768、768x1024 均保留。

未进行真实账号授权或付费生成测试。Worker 仍为原配置，本次未验证自动登录流程。保留旧镜像和原 Compose 作为回退条件；镜像回退不会撤销数据库迁移。
