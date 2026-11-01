# 左侧切回 Creator 2.16.0

2026-10-22，按用户明确要求，通过已打开的 Edge 阿里云终端将左侧 `catbee.online` / `iZrj9eby63lh2zp7dbipn8Z` 从官方 v0.2.17 切回本地 Creator 版本。右侧未部署；未备份数据库；未执行付费生成测试；未安装 Prism。

- 版本：`2.16.0-creator.1`。
- 源码 revision：`49f2bc1265ee0459e4d881afff96fdff03c419fe`。
- 固定镜像：`ghcr.io/nankeonlydream/sub2api@sha256:30df7481c84782e92a0dbc4d6af29e482d4a0f634534394de33a8c9350e61deb`。
- 精确提交 CI 全部成功：https://github.com/Nankeonlydream/sub2api/actions/runs/39788802739 。`ready.py` 已核验镜像真实 revision 对应该成功构建。
- 使用现有升级工具；新增仅允许左侧从已核验官方镜像 digest 返回的入口，并新增共有迁移 checksum 一致性检查。工具 12 项测试通过。
- 服务器工具 SHA256：`7e147447e8db655a2057c038ef61a30a7661080f2d708b7d7a2005ff250c8f62`，固定源码下载并在安装前核验一致。
- 原官方镜像仍保留：`ghcr.io/wei-shaw/sub2api@sha256:44b59fc74b0b582750ef5f38146782db177767ef9d3f34351f1c75c157b1bb88`。
- 成功记录：`/root/sub2api-creator-release/2.16.0-creator.1-20261022T222835-34141/DEPLOYED_OK`。
- 容器启动：2026-10-22 22:28:41 Asia/Shanghai。健康、实际版本及 revision、环境/挂载/端口/网络一致性通过。
- 隔离 Creator 检查通过，真实 1K 预设保留。公网 `/health` 为 `ok`，公网 Creator 资源与容器一致。
- Creator 资源 SHA256：`1249b3dc9bdc04df3ac77597c8885e263e8b00ff37e777f9c646e115a7aedb89`。

## 迁移及 Worker

全部共有迁移 checksum 一致，保留官方独有 `242_drop_platform_check_constraints.sql` 历史。应用并验证 289–297 共 9 项迁移：监控显示配置、Key 多分组、SIWC、风控处罚、连接诊断、账号定时调度、用户恢复、加密证据。已审查 SQL，程序回退不撤销这些迁移。

固定 TOTP 密钥已配置，仅输出配置存在状态，未读取或传输密钥。Compose 服务为 postgres、redis、sub2api，无共享网络附属服务；运行容器仅 sub2api，未发现 reauth/oauth/prism 命名的 systemd 单元。未安装独立 OAuth Worker 或宣称其新 SIWC 流程已实测。

## 数据汇总与90天保留策略

切换前汇总记录于 `/root/creator-return-2.16.0-before.json`（21:51:35），切换后记录于 `/root/creator-return-2.16.0-after.json`（22:33:57）。此为汇总核验，不是逐行备份或内容一致性证明，期间业务持续运行。

- 用户数：1197 → 1198；余额合计：8581.86859834 → 8523.83564132；冻结余额均为 0。
- API Key 数均为 3006，账号数均为 1649。
- 使用记录：4107478 → 4091313，净减少 16165，不能声称全部历史记录完整保留。
- `ops_runtime_log_config.request_retention_days` 前后均为 90，遵循用户当天重新开启的保留策略，本次未修改。
- 核验时最早使用记录为 `2026-07-24 22:28:42.702111+08`，与新容器启动时间减 90 天相差约一秒；源码启动聚合后会按该设置清理过期记录。时间边界与重启时的90天过期清理一致，未发现逐条删除日志，不能把净减少数当作精确删除数或逐条归因证据。
- 最新记录为 `2026-10-22 22:44:29.157282+08`，表明服务继续写入使用记录。未执行人工删除或恢复操作。
