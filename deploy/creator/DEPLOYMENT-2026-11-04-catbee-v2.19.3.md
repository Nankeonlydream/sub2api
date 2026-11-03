# CatBee 2.19.3-creator.1 部署（2026-11-04，北京时间）

## 部署结果

- 应用源码提交：`35738393193e25bca1c1d7a3e815681d1c124b6d`，包含本地 `9e1425e47` 的上游 v2.19.3 合并及本地 Creator 图片/视频任务恢复、交付计费修改。
- 版本：`2.19.3-creator.1`。
- 镜像：`ghcr.io/nankeonlydream/sub2api@sha256:38087f6a21f73212d151a0ca8090a8a663cce921f9df95b61d4733dd060d3fdb`。
- Creator image CI：https://github.com/Nankeonlydream/sub2api/actions/runs/41691837227 ，全套通过；`ready.py` 确认镜像 revision 对应上述提交。
- 右侧应用：实例 `76793ec040834b62a7d76887fe35f964`，主机 `iZrj97sgqumwizgptmhvzaZ`，公网 `47.77.224.193`，私网 `172.18.29.102`，网站 `catbee.online` / `www.catbee.online`。原 `yapi.asia` 已返回 410。
- 左侧数据库：实例 `69f6334c75944cd5b5436e4f05ecef52`，主机 `iZrj98y2r2rfswybuc7r9bZ`，公网 `43.110.24.140`，私网 `172.18.29.103`。仅运行 PostgreSQL、Redis，未安装应用镜像。
- 应用通过已有 `creator-upgrade --apply` 切换；环境变量、挂载、端口及网络保持一致。未部署 Prism，未改动旧节点。

## 验证

- 本地后端回归、前端构建、嵌入前端测试及 12 项部署工具测试通过。前端全量测试发现上游新增 Mistral 后测试清单遗漏；补齐后目标 13 项复测通过，随后 CI 前端全套通过。
- 镜像隔离启动、运行版本/revision、健康接口与 Creator 资源校验全部通过，启动日志未发现 `panic:`。
- PostgreSQL 为主库，迁移记录由 395 增至 398；校验以下迁移及 checksum 成功：`325_account_performance_monitor.sql`、`325_lottery_invitations.sql`、`326_quality_shared_batches.sql`。
- PostgreSQL 中可见来自 `172.18.29.102` 的业务连接；Redis 返回 `PONG`，角色为 `master`，两个数据库容器均 healthy。
- 公网 `/health` 返回 `{"status":"ok"}`，浏览器登录态 `/creator` 正常显示历史、创作设置及 1K 尺寸。
- 公网与容器资源均为 `/assets/CreatorStudioView-DrPtzO-L.js`，SHA256 `7bebdb433d8e5df27c0f058fd39dd538fef29c3ec529b000c6e793ad7069ad61`；真实 1K 四种非正方形预设校验通过。
- 未进行付费图片/视频生成测试；验收覆盖自动化回归、部署集成、数据库与页面加载。

## 备份清理

- 用户要求验收后删除备份。已删除本次发布目录下 `docker-compose.creator.before.yml`，并验证不存在；临时上传的部署脚本已清理。
- 发布记录目录：`/root/sub2api-creator-release/2.19.3-creator.1-20261104T023326-118915/`，仅保留 `DEPLOYED_OK`、`release.json`、`BACKUP_CLEANED_OK`。
- 本次没有创建数据库备份。数据库机 `/root/sub2api-backups` 仅有历史转移/豁免文本记录，没有数据库备份文件；历史迁移配置目录及旧镜像未清理。
- 部署工具 SHA256：`20cec1c4740dc6a1fc94e73b3ed972d7406577db04add685b7dea5ca21cbfeaa`，从上述固定提交下载并校验后安装。
