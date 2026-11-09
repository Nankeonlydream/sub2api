# 2026-11-09 CatBee 应用迁至左侧

用户授权将右侧应用迁到左侧数据库服务器，并沿用其 GitHub 镜像。新请求已切至左侧，主域名和 www 的 A 记录均已更新；右侧保留缓存期间转发和旧图片任务兼容。旧应用的停止已安排，尚未发生。

## 当前部署

- 左侧实例：`69f6334c75944cd5b5436e4f05ecef52`，主机 `iZrj98y2r2rfswybuc7r9bZ`，公网 `43.110.24.140`，私网 `172.18.29.103`。
- 应用：`/root/catbee-app/docker-compose.yml` 加 `docker-compose.creator.yml`，只包含 `sub2api`，绑定 `127.0.0.1:8080`。
- 数据库：原 `/root/sub2api-deploy` 项目及 PostgreSQL / Redis 容器保持不变，未重建、未重启。应用连接既有外部网络 `sub2api-deploy_sub2api-network`，使用 `postgres` / `redis` 别名。
- 左侧 Nginx：`/www/server/panel/vhost/nginx/catbee.online.conf`，使用已有宝塔 Nginx，不额外安装另一套 Web 服务。
- 右侧过渡实例：`76793ec040834b62a7d76887fe35f964`，主机 `iZrj97sgqumwizgptmhvzaZ`，公网 `47.77.224.193`，私网 `172.18.29.102`。

## 固定镜像与数据连续性

- 镜像仓库：`ghcr.io/nankeonlydream/sub2api`。
- 镜像：`ghcr.io/nankeonlydream/sub2api@sha256:cc64d1d7c84417ff608cb230ec8f49d0a36f568927f8f67dfee79d2c5189a49e`。
- 版本：`2.20.1-creator.1`。
- 源码提交：`7b7ff3277365a9f836acc647de4cec2f118a6070`。
- 左右镜像 ID、二进制版本和发布清单一致；没有重建、升级或替换为上游通用镜像。
- 保留原环境变量及登录签名、加密等配置，仅将数据库和 Redis 主机改为同网络别名。数据库、Redis 和域名不变，原用户数据与会话继续使用。
- 迁移原应用挂载目录，逐项比较 6,980 个非日志文件的 SHA256 和大小，全部一致；日志保留在各自节点。
- 左侧历史 `weishaw/sub2api:latest` 容器自 7 月起已停止，仅重命名为 `sub2api-historical-stopped-20261109` 解决名称冲突，未启动或删除。
- 未备份数据库，未安装 Prism，未执行付费生成测试。

## 流量切换与旧任务

2026-11-09 16:32（北京时间）右侧 Nginx 主入口改为转发左侧私网 HTTPS，启用 SNI、证书验证及证书链校验，保留客户端 IP、流式代理和 3600 秒超时。通过右侧发出的唯一健康探针已在左侧访问日志中确认。旧连接使用 Nginx 平滑重载继续结束，后续核对右侧应用的既有 TCP 连接为 0。

DNSPod 中仅更新 `catbee.online` 的 `@` 与 `www` A 记录为 `43.110.24.140`，TTL 保持 600。外部 Google DNS 查询已确认两条记录；通配符记录及其它域名未修改。右侧继续保留 HTTPS 转发，承接尚未刷新 DNS 的客户端。

迁移时 Redis 中有 17 条旧图片记录（15 完成、2 失败，无 processing）。完成图片的首次读取可能触发原进程内的计费闭包，因此不能仅凭“任务已完成”立即停止旧应用。左侧为这 17 个任务 ID 保留精确匹配路由，通过仅允许左侧私网地址访问的右侧 HTTPS 兼容路径回到原进程。新任务在左侧创建和读取。切换前后复核，没有新增的右侧任务漏出快照；没有重放生成请求、重建账单或修改任务状态。

批量图片表为空；视频结算表中原有 5 条 submitting 记录保持原状，没有手工重试或改写。两侧迁移检查时待写入流量与结算目录均无待处理 JSON 文件。

## 证书和后续升级

迁移原 catbee 证书、ACME 账号与续期配置。证书有效至 `2027-01-31 17:54:10 UTC`。左侧 `creator-cert-renew.timer` 已启用，限定续期 catbee 证书，使用原固定摘要 Certbot 镜像；Nginx 后置检查与重载已适配宝塔路径。HTTP challenge 公网读取和 Certbot staging 续期模拟均通过。修正了新建 webroot 的目录权限后验证成功，未关闭 TLS 校验。

右侧 catbee 的续期配置移至迁移记录目录，避免继续由旧节点续期；现有证书仍供旧地址转发使用，其它证书续期配置保持原状。

更新器已从审核的本地固定提交 `7e2afb948593f0a53e813ad281af21cfdae85237` 安装到左侧 `/usr/local/sbin/creator-upgrade`，SHA256 为 `cd84d9fe73ab9eb635e94c66cfe8eeba87799321cc8f2b0ed7648514653ebe4b`。该版本为合并节点选择 `/root/catbee-app`，避免应用升级改动数据库 Compose 项目。13 项测试通过；服务器 `--status` 为 healthy，同镜像校验返回 `ALREADY_DEPLOYED 2.20.1-creator.1`，迁移清单校验为 415 项已应用、待执行为空。该工具提交尚未推送，不会触发镜像重建。

## 旧应用退场和释放限制

两侧已启用 `catbee-migration-retire.timer`，最早执行时间是 **2026-11-10 15:38:55 北京时间**（`07:38:55 UTC`）。脚本与计划位于 `/root/catbee-app-move-20261109/{retire.py,retire-plan.json}`，脚本 SHA256 为 `7c4666d5c02b78aec9a7e9581ae08e78f9d80e30eaf2d946e2a4a676c20e1aed`。

右侧脚本先核对指定旧容器 ID、Nginx 配置摘要、左侧 HTTPS 健康、17 条旧记录均已过期、旧应用连接为 0、待写入文件为 0，再将兼容路径改为 404 并停止旧应用。左侧脚本在旧记录全部过期后移除对应兼容路由。检查不满足则保留原服务，15 分钟后重试；不会删除服务器、镜像、原业务数据或数据库。

当前只验证了脚本检查模式、Python 编译、systemd 单元及定时器。未来执行结果须分别核对：

```sh
sudo systemctl status catbee-migration-retire.service
sudo cat /root/catbee-app-move-20261109/RETIRED_OK.json
```

本次未释放右侧服务器。释放前还需确认两侧退场完成、DNS 缓存消退，以及右侧没有其它需要保留的服务。不可因定时器已启用就提前释放。

## 验收与清理

左侧健康、Creator Studio 与真实 1K 资源通过检查；源摘要 `10bf7774461104a91d92b638bd98930b3105404c5a9e20bb78e6c6f2f3a06a2f` 保持一致。左右两个公网入口、主域名和 www 均用于健康和静态资源验证。最终采样左侧应用使用约 379 MiB 内存，整机约 2.3 GiB 可用内存，具体以实时负载为准，未进行压力测试。

服务器记录：左侧 `/root/catbee-app-move-20261109/MIGRATED_OK.json`；右侧 `/root/catbee-app-move-20261109/traffic-cutover.json`。保留原应用及 Nginx 切换前配置作为回退条件。临时加密传输文件、传输密钥、应用传输归档和重复配置快照已清理；原业务目录及旧镜像保留。临时 SSH 密钥在完成操作后撤销。

没有观察到探针错误或主动中断既有应用请求；这不等于对所有客户端的绝对零中断保证。
