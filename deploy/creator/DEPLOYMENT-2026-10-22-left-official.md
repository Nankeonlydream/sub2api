# 左侧官方版切换记录

2026-10-22，按用户要求将 catbee.online（iZrj9eby63lh2zp7dbipn8Z）切换到 Wei-Shaw/sub2api v0.2.17。右侧未部署；未备份数据库；未执行付费生成测试。

- 发布日期：2026-10-16 12:41:43 Asia/Shanghai。
- 镜像：`ghcr.io/wei-shaw/sub2api@sha256:44b59fc74b0b582750ef5f38146782db177767ef9d3f34351f1c75c157b1bb88`。
- revision：`060d0160417782cd962a0c7f460f6cd4565d4916`。
- 旧镜像保留：`ghcr.io/nankeonlydream/sub2api@sha256:a610d0843f7a810867c78e5acc1bb583ecc39450daaf9e6185d4534c1bd31072`。
- 服务器记录：`/root/sub2api-official-release/0.2.17-20261022T161110/`，含原 Compose、配置签名、迁移记录、前后统计及 DEPLOYED_OK；配置文件含秘密，不应公开。
- 仅替换 Compose override 的镜像，容器环境、挂载、端口、网络配置校验一致。复用现有部署工具函数，未放宽 Creator 升级工具检查。
- 官方共有迁移 checksum 一致；额外 fork 迁移保留。应用 `242_drop_platform_check_constraints.sql`，checksum `a7725f31f637208d200e0f37d5270e9f263743d99fa9e4f1bb9a7387e8be5a61`。
- 用户明确批准将用户 1190 并发从 20 改为 1，补偿官方不支持 Key 2967 的单 Key 并发限制。
- 容器健康、实际版本/revision、公网 /health 已通过。

## 数据核验及异常

切换前后用户 1196、余额合计 8786.58832394、冻结余额 0、API Key 2997、账号 1623（当时均软删除）一致。此为汇总核验，不是逐行内容校验。

使用记录在 16:11:11 至 16:11:44 从 4104509 减少为 4099816，减少 4693 条，不能声称历史记录完整保留。

随后通过 Edge Workbench 检查：官方 dashboard aggregation 默认使用记录保留 90 天，数据库 ops_runtime_log_config 未设置 request_retention_days。当前最早记录为 2026-07-24 16:11:13.508037+08，与官方启动时间减 90 天吻合，强烈指向启动时自动保留清理；日志未找到逐条删除证据。已将该 JSON 的 request_retention_days 设置为 0（禁用使用记录及对应 dedup 的自动过期删除），UPDATE 1 返回核验成功；其余 JSON 字段保留。源码每次清理从 settings 读取此值，无需重启。

减少的 4693 条尚未恢复。本次未生成数据库备份，应用镜像回退不能恢复已删除记录。是否存在此前备份或 WAL 需另行检查，不能承诺可恢复。

约 17:21 核验时记录已增至 4100687，最新记录为当日 17:21:45；随后账号数为 1642，其中未删除 19，说明业务数据在持续变化。账号可用性未以付费调用验证。

## 后续用户确认

2026-10-22，用户要求重新开启 90 天使用记录保留策略。已在左侧将 `ops_runtime_log_config.request_retention_days` 从 0 设置为 90，数据库返回 `ops_runtime_log_config|90`、`UPDATE 1`，核验成功。最终策略：保留最近 90 天使用记录，自动清理超过 90 天的记录。
