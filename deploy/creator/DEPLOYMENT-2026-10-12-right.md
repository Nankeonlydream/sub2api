# 右侧升级记录（2026-10-12）

按既有流程升级右侧 yapi.asia，包含用户本地创作中心更新；未操作左侧，未备份数据库，未进行付费生成测试。

- 上游稳定版：v2.10.5。
- 本地改动提交：fe469ee204ee9fb190a38c079c9bbe71cf1bce86（31 个文件，视频播放/封面、历史同步、下载优化、图片计费及创作中心界面更新）。
- 发布源码：df4d08584b370762d06efd7217d841737df9878f。
- 版本：2.10.5-creator.2，集成分支 feature/creator-on-v2.10.2。
- 固定镜像：ghcr.io/nankeonlydream/sub2api@sha256:86f52958b4bc8b0e9dd381ff5d46ded91db2ce23d27c60c485cd0aa476251db2。
- CI：https://github.com/Nankeonlydream/sub2api/actions/runs/38171256880 ，对应源码提交成功，ready.py 验证通过。
- 本地验证：升级工具 10 项；前端 468 个测试文件通过，4028 项通过、9 项跳过；前端构建、后端回归、embed 前端测试通过。
- 节点：iZrj92zzv39jbi7n9fz4fuZ / 172.18.28.229；旧版 2.10.3-creator.1，升级前健康。
- 服务器升级器 SHA256：2804f5fd57663df76df4116074b39303ab1df0d077e6b8cec63a8c8fe51c4789；本次未更换工具。
- 部署：现有 creator-upgrade 使用固定摘要并加 --apply；发布清单/隔离资源验证、容器健康和原配置保留检查通过。
- 应用迁移：239_payment_order_subscription_renewal_mode.sql；新增字段默认 extend，保留历史续费语义，校验通过。
- 创作中心资源：/assets/CreatorStudioView-sB1_gA3w.js。
- 资源 SHA256：7571a96197d7c4f5870795c6e95066bfe8358a46cf800cf564473b34a31cce86；公网资源与服务器验证值一致。
- 公网 /health 返回 status=ok；真实 1K 1024x688、688x1024、1024x768、768x1024 保留。
- 服务器记录：/root/sub2api-creator-release/2.10.5-creator.2-20261012T042957-835858/DEPLOYED_OK。

## 验收局限

Worker 运行包相对当前集成版本无新增修改。升级前线上为 managed 模式，credential-worker 数据目录存在，但容器没有 Python/Node；本次未安装 Worker 运行依赖，不能据本次升级宣称自动登录可用。未做真实账号授权或付费生成测试。

保留原 Compose 和旧镜像作为应用回退条件；镜像回退不会撤销数据库迁移。
