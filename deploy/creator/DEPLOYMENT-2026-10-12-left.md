# 左侧升级记录（2026-10-12）

按既有流程升级左侧 catbee.online 至右侧已验证的同一镜像，包含用户本地创作中心更新；本次未更新右侧，未备份数据库，未进行付费生成测试，未重装 Prism。

- 上游最新稳定版重新检查：v2.10.5。
- 版本：2.10.5-creator.2。
- 发布源码：df4d08584b370762d06efd7217d841737df9878f，包含本地改动提交 fe469ee204ee9fb190a38c079c9bbe71cf1bce86。
- 固定镜像：ghcr.io/nankeonlydream/sub2api@sha256:86f52958b4bc8b0e9dd381ff5d46ded91db2ce23d27c60c485cd0aa476251db2。
- CI：https://github.com/Nankeonlydream/sub2api/actions/runs/38171256880；ready.py 重新核验精确 revision 与成功 CI。
- 节点：iZrj9eby63lh2zp7dbipn8Z / 172.18.29.45。
- 升级前：2.10.3-creator.2，健康，固定摘要 0362186a1838c296d8ad16769538f29eba16132c4f6304be818f087c3e1bc8b6。
- 服务器升级器 SHA256：16aad7c1aec21c2cec18d41e41a44f0e88680266846640bc47af2c0e3fd8e7fa，与本地已审核 deploy/creator/server.py 一致；未更换工具。
- creator-upgrade --apply：发布清单、隔离创作中心、固定摘要、运行版本、健康和原配置保留检查通过。
- 待执行迁移和本次应用迁移均为空；共享数据库的 239_payment_order_subscription_renewal_mode.sql 已在右侧升级时应用。
- 服务器记录：/root/sub2api-creator-release/2.10.5-creator.2-20261012T043802-519160/DEPLOYED_OK。
- 公网 /health 返回 status=ok。
- 创作中心资源：/assets/CreatorStudioView-sB1_gA3w.js；SHA256 7571a96197d7c4f5870795c6e95066bfe8358a46cf800cf564473b34a31cce86，与服务器验证值一致。
- 真实 1K 1024x688、688x1024、1024x768、768x1024 保留。
- 部署后再次核验 2.10.5-creator.2、对应 revision 和 healthy；运行中只有 sub2api，没有 Prism 容器。

Worker 升级前为 managed 模式，数据目录存在，容器没有 Python/Node；本次未补装运行依赖，未验收自动登录。保留旧镜像及原 Compose 作为应用回退条件；镜像回退不会撤销数据库迁移。
