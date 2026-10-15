# 右侧故障恢复与升级记录（2026-10-16）

右侧 yapi.asia 已恢复，并完成此前授权的 2.11.1-creator.1 部署。左侧应用未升级；未备份数据库、未删除业务数据、未进行付费生成测试。

## 故障与恢复

- 右侧节点：iZrj92zzv39jbi7n9fz4fuZ / 172.18.28.229。
- 故障表现：公网 502；应用已回退到 2.10.5-creator.2，但持续重启，日志提示连接 172.18.28.235:5432 被拒绝。
- 数据库节点：CatBee数据库-mzwz，实例 7cb522f9bb804ed29c39d99cb38a24da，主机 iZrj9hczwdl3x94db3nxj6Z / 172.18.28.235。
- PostgreSQL 容器持续重启，日志为 `could not write lock file "postmaster.pid": No space left on device`。根分区 100%，数据库目录约 28GB。
- 现有云盘为 50GB，但根分区仅 39.8GB，约 10GB 尚未分配给根分区。
- 先执行 `dnf clean all` 清理可重建的软件包缓存；`growpart -N /dev/vda 3` 确认可扩展后，执行 `growpart /dev/vda 3` 和 `resize2fs /dev/vda3`，使用现有磁盘容量。未购买云盘或改变套餐。
- 重启原有 sub2api-postgres 容器后恢复健康。根文件系统约 49GB，使用 38GB，可用 9.6GB，使用率 80%。最终复查数据库持续健康约 10 分钟，重启计数为 0。
- 数据库恢复后，旧版应用自动恢复，公网健康接口、首页及创作中心均返回 200。
- 本次确认了直接故障原因；没有足够证据断言磁盘增长由本次升级造成。

## 新版部署

- 版本：2.11.1-creator.1；集成分支仍为 feature/creator-on-v2.10.2。
- 源码：9595b6fc0f7d4fca8926c430aa8e975d7e13c0ab。
- 固定镜像：ghcr.io/nankeonlydream/sub2api@sha256:9141e057e438a17a5f31315178c1fc8c1cfa5ef23a4b6704788daf0cf0d01d54。
- CI：https://github.com/Nankeonlydream/sub2api/actions/runs/38781784464 ，此前 ready.py 已验证精确提交。
- 沿用服务器既有 creator-upgrade；未更换工具。
- 故障后重新运行无 --apply 的预检：PENDING_MIGRATIONS 为 []，隔离 Creator 资源检查通过，返回 CHECK_OK。原先列出的 16 项新增迁移已存在。
- 随后对右侧执行同一固定摘要的 --apply，返回 DEPLOYMENT_COMPLETE；容器 healthy，原环境、挂载、端口与网络配置保留，重启计数为 0。
- 额外只读核验运行镜像发布清单与 schema_migrations：348 项迁移 checksum 全部一致，无缺失或不匹配。
- 成功记录：/root/sub2api-creator-release/2.11.1-creator.1-20261016T024640-1093698/DEPLOYED_OK。
- 先前失败部署记录目录：/root/sub2api-creator-release/2.11.1-creator.1-20261016T021317-1086617/。

## 公网验收

- https://yapi.asia/health 返回 HTTP 200，status=ok。
- 首页及 /creator 返回 HTTP 200。
- 创作中心资源：/assets/CreatorStudioView-2GfvM5T8.js。
- 公网资源 SHA256：794eb1adab895d6768f5f4d73a5d798fbfd8a1269d35b0a7a049f99c4176d51e，与服务器部署验证值一致。
- 真实 1K 尺寸 1024x688、688x1024、1024x768、768x1024 均存在。
- 只读检查左侧 catbee.online/health 同样返回 HTTP 200；未操作左侧部署。

未进行真实账号授权或付费生成测试。Worker 仍为原配置，本次不能据此声称其自动登录流程已验证。保留旧镜像和原 Compose；镜像回退不会撤销数据库迁移。

阿里云控制台当时显示右侧实例到期时间为 2026-10-17 23:59:59；本次未执行续费。

## 后续 TPS 配色恢复（2.11.1-creator.2）

按用户要求恢复使用记录中 TPS 数值的原有颜色：20 t/s 及以上绿色，10–20 t/s 黄色，低于 10 t/s 红色；继续适配深色模式。撤销固定黑色的样式及对应测试断言，未改计算方式。

- 源码提交：57e1313abbfe8a5c25e119e1f58384def25a6a80。
- 本地 UsageTable 43 项测试通过；完整发布 CI 成功：https://github.com/Nankeonlydream/sub2api/actions/runs/38790824982。
- ready.py 校验精确提交后，仅更新右侧到 2.11.1-creator.2。
- 镜像：ghcr.io/nankeonlydream/sub2api@sha256:cc07dc2a307e1c9ea20e9d9fa5d2f5d86e36a50a7ba4ca8b5751d8898a0b1abb。
- creator-upgrade 返回 DEPLOYMENT_COMPLETE，容器 healthy，配置保留，无待执行迁移。
- 服务器记录：/root/sub2api-creator-release/2.11.1-creator.2-20261016T031829-1096207/DEPLOYED_OK。
- 公网 /health 为 200/status=ok，/creator 为 200。
- Creator 资源 /assets/CreatorStudioView-DDzvzcZI.js，SHA256 da880fb472a73470dfe60027649cf094c121e02188b494df0a7d69f0c83130f3，与部署验证结果一致，真实 1K 尺寸保留。
- 公网使用记录组件所在资源 /assets/GroupDistributionChart.vue_vue_type_script_setup_true_lang-rASSNTRI.js，SHA256 40e0721e3f55363355d1f5c9b630c6dcc3d914e2b4e0370e1d75f11a05bb307e；确认 TPS 已使用按速度选择颜色的绑定，固定 text-black 已移除。
