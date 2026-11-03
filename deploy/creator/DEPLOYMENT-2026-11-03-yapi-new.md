# yapi.asia 新服务器部署（2026-11-03）

用户授权部署 Creator 镜像、接入现有 CatBee 数据库及修改域名解析，完成 DNSPod 身份验证并明确同意 Let's Encrypt 服务条款。

## 节点与镜像

- 新节点 `iZrj97sgqumwizgptmhvzaZ`，阿里云实例 `76793ec040834b62a7d76887fe35f964`。
- 公网 `47.77.224.193`，内网 `172.18.29.102`。
- 版本 `2.19.1-creator.2`，源码 `60c8ab53ab10dc7cdb4b7fa5f40539e173d6300d`。
- 镜像 `ghcr.io/nankeonlydream/sub2api@sha256:e3084e62f6994aa11e8d6500d10c1ff9c4e209ab32402ebeea2c65aa72cf85f9`。
- CI：https://github.com/Nankeonlydream/sub2api/actions/runs/41342377957 ，`ready.py` 核验通过。
- Compose 文件位于 `/root/sub2api-deploy/`，主文件为有效 JSON，权限 0600；固定摘要 override 为 `docker-compose.creator.yml`。
- 应用仅发布 `127.0.0.1:8080`，由 Nginx 对外代理；Docker、Nginx 开机启动，应用 `unless-stopped`。

## 数据与配置

从左侧运行中 Creator 节点读取配置并复制应用数据目录，保留 JWT/TOTP 等现有配置；传输使用加密归档，源服务器临时公开加密文件已撤下。没有备份数据库或部署 Prism。

连接现有 PostgreSQL `172.18.28.235:5432/sub2api` 和同主机 Redis `6379/0`。凭据保存在服务器私有配置，不写入此记录。新节点 `/root/` 内私有传输归档及 env 导出保留，非业务所需运行文件。

## DNS 与 HTTPS

- DNSPod `yapi.asia`：`@ A 47.77.224.193`，默认线路，TTL 600，保存时间 `2026-11-03 00:27:34`。
- 未添加 www 或通配符记录。
- Nginx 配置 `/etc/nginx/conf.d/yapi.asia.conf`；HTTP 跳转 HTTPS，保留 ACME webroot，TLS 1.2/1.3。
- Let's Encrypt 证书 `/etc/letsencrypt/live/yapi.asia/`，本次证书到期 `2027-01-31`，ACME 账号未登记邮箱。
- `creator-cert-renew.timer` 每日两次检查（随机延迟至多 1 小时，Persistent），调用对应 service，成功后校验并重载 Nginx。
- Certbot 固定镜像 `certbot/certbot@sha256:bc93cb710b413e6b456d622f9b0133b3e109c0a78c2ed9976af43d209b0a1805`。
- `renew --dry-run --no-random-sleep-on-renew` 成功，退出码 0；service 手动运行成功，timer 为 active。

## 验收

- 浏览器通过 `https://yapi.asia/home` 正常显示 Cat Bee 首页。
- 服务器经公网域名获取 `/health` 返回 `{"status":"ok"}`。
- 运行容器 healthy，二进制版本及 revision 与镜像发布信息一致。
- 升级工具检查 `PENDING_MIGRATIONS []`、`ALREADY_DEPLOYED 2.19.1-creator.2`。
- 已认证读取数据库迁移记录 395 条。
- 公网 CreatorStudioView 资源与容器 SHA256 一致，真实 1K 尺寸检查通过。
- 服务器升级工具增加新节点登记，SHA256 `418c6285583f099e2a7626bab6df3243262c97b3c29490622ee64e31b9ead2ca`，12 项工具测试通过。
- 没有执行付费生成或完整业务调用测试；原有共享数据库定时任务配置未改动。

旧左右节点不执行应用升级。后续 `yapi.asia` 部署应选择此新节点，旧右侧登记仅作历史保留。
