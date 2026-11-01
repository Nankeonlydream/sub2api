# 左侧登录 429 排查与配置修复

日期：2026-10-18（Asia/Shanghai）。节点：catbee.online / iZrj9eby63lh2zp7dbipn8Z。

## 原因与证据

- AuthAbuseGuard 使用可信代理链解析 IP；15 分钟内累计 10 次凭据失败后封禁 1 小时。
- 左侧 config.yaml 未配置 server.trusted_proxies，环境变量也未设置该项。Nginx 转发到 127.0.0.1:8080，Docker 中应用看到的直接来源为网桥网关 172.20.0.1。
- 日志显示 21:15:20.682 至 21:15:27.784，来源 189.24.123.4 的 10 次登录返回 401。之后多个不同来源登录返回 429。
- Redis PING 正常，无限流 Redis 错误。auth_abuse 的 banned 键哈希精确对应 172.20.0.1，而非日志中的访客地址。检查时剩余 TTL 为 300 秒。
- 修复前公网空参数登录请求也返回 429，Retry-After 为 166 秒，响应与用户截图一致。
- 请求日志与 AuthAbuseGuard 使用的 IP 解析方式不同，因此日志显示不同访客 IP 并不能排除共用封禁键。

## 修复

仅在左侧 /root/sub2api-deploy/data/config.yaml 的 server 下加入：

```yaml
trusted_proxies: ["172.20.0.1/32"]
```

信任范围仅限已核验的本机 Docker 网关；Nginx 原有 X-Forwarded-For 会追加实际远端地址。未开放任意代理信任，未关闭登录防护或修改阈值。

原配置保留于 /root/sub2api-creator-release/login-proxy-fix-20261018T141653Z/config.before.yaml（0600）。仅重启左侧 sub2api 加载配置，没有更换镜像，没有删除 Redis 封禁键，没有数据库备份或迁移。

## 验证

- 使用用户原登录页已填写的表单成功进入 /dashboard。
- 公网 /health 返回 {"status":"ok"}；空参数登录返回预期的 400 参数校验错误。
- creator-upgrade --status：left、healthy，版本仍为 2.12.1-creator.2，原镜像摘要保持不变。
- 本地 TestAuthAbuseTrustedProxyKeepsClientsSeparate 通过：经同一可信代理的一个访客被封禁后，另一访客仍能成功请求。
- 成功截图：/Users/haojie/Documents/CatBee/creator-login-fix-2026-10-18/login-success.png。

右侧未操作。Creator Studio、真实 1K 和图片加载修复均保留。今后若重建 Docker 网络导致网关地址变化，需同步更新可信代理配置。
