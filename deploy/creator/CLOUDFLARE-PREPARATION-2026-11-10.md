# Cloudflare 接入准备（2026-11-10）

状态：PROXY_ENABLED_BASIC_CONNECTIVITY_VERIFIED（2026-11-10 北京时间约 02:45–02:54）。主域名与 www 已开启橙云；源站真实 IP 配置已平滑加载，应用未重启。下文旧阶段记录按时间保留，以末尾上线验收为准。

## 已核验

- CF Free 区域 catbee.online；SSL/TLS 为 Full (strict)。
- CF 和 DNSPod 均有且仅有 3 条 A 记录：@ / www → 43.110.24.140；* → 47.251.39.106。CF 全部为 DNS-only，TTL 自动；DNSPod TTL 600。
- 原 NS：ellis.dnspod.net / sausage.dnspod.net。注册商现已显示 zoe.ns.cloudflare.com / rene.ns.cloudflare.com；CF 区域尚待传播验证。旧 DNSPod 记录保留。
- 左侧生产主机 iZrj98y2r2rfswybuc7r9bZ（43.110.24.140），应用 /root/catbee-app，数据库 /root/sub2api-deploy。
- 服务器独立目录 /root/catbee-cf-prepare-20261110 含候选配置、官方 CF IP API 响应、独立 nginx-check.conf 和 PREPARED.json。
- 候选使用官方 API 返回的 22 个 IPv4/IPv6 网段，保留右侧私网代理信任；递归解析可信 X-Forwarded-For，并规范转发给应用的 X-Forwarded-For / CF-Connecting-IP。
- 独立 nginx -t 检查成功；脚本断言生产文件内容未变化。未 reload，未重启应用或数据库。
- 生产配置 SHA256：f04977e556e88e4809abfdcfa9bcf1245471c410c76a66c83475eaf9709f879f。
- 候选配置 SHA256：f45b81dd23716f3a7f1cfbaa1ea4092685637d58d915194857829dce800f32b2。
- 本次公网首页检查 HTTP 200，TLS 校验成功；单次本机 TTFB 3.659 秒不代表 CF 性能（流量尚未经过 CF）。

## 上线前约束

1. NS 切换是将权威 DNS 委派给 CF；切换前再次核对全部记录和 DNSSEC，首次保持 DNS-only。
2. 现有迁移退场脚本校验生产 Nginx 精确 SHA256，最早于北京时间 2026-11-10 15:38:55 执行。不能直接应用候选破坏其校验，也不能退场后应用包含旧兼容路由的候选。应核对两侧 RETIRED_OK.json 后基于届时线上配置重新生成，或另行完整审查退场联动方案。
3. 开启橙云前需完成边缘证书、真实客户端 IP、登录、限流、SSE、长时间非流式生成请求兼容验证。前端 Gemini 同步分支仍存在，不能假定所有生成均为异步。
4. 未进行付费生成测试，未启用新的公开测试入口，未更改防火墙或释放服务器。
5. 本记录表示准备完成，不表示防护已生效，也不表示速度/首字延迟验证通过。

## NS 提交后验收（北京时间 2026-11-10 01:43–01:44）

- 用户确认：确认切换 DNS，保持仅 DNS。注册商提交后 DNS 服务商为“其他”，NS 为 zoe.ns.cloudflare.com / rene.ns.cloudflare.com。
- CF 的“立即检查名称服务器”已触发，界面显示正在检查、等待传播；尚未确认 Active。
- Google DoH 尚返回旧 DNSPod NS，A 仍为 43.110.24.140；这是当前查询结果，不能据此宣称全球传播已完成。
- HTTPS 首页、www 首页及 /health 全部 HTTP 200，健康状态为 ok，Server 为 nginx。
- 本地直连 CF 权威 DNS 的 UDP 查询超时；CF 控制台 3 条记录和代理状态已核对，不将超时当作权威答案验证成功。
- 未开启橙云，CF 代理防护及隐藏源 IP 尚未生效。后续先确认 DNS Active 和边缘证书，再处理真实 IP 与长连接兼容，不能直接开启代理。

## 后续只读检查（2026-11-10）

- Google DoH NS 已返回 rene.ns.cloudflare.com / zoe.ns.cloudflare.com，A 仍指向 43.110.24.140；不据单个解析器声称全球缓存全部刷新。
- CF 概述已从等待传播变为激活页面；DNS 记录页无 Pending 提示，3 条 A 记录均保持仅 DNS。概述通用的“受保护”提示不代表橙云已开启。
- 边缘通用证书覆盖 catbee.online / *.catbee.online，状态有效，到期 2027-02-08，备份证书已发放。
- 首页、www 首页、/health 均 HTTP 200，健康状态 ok；本轮未变更服务器、代理或防火墙。
- 下一阶段仍需处理生产真实 IP 配置与退场脚本联动，并验证流式及长请求，再开启代理。

## 条件上线检查：长请求阻断项（2026-11-10）

用户允许仅短暂中断时继续。未开启橙云，未修改生产 Nginx。

- 左侧 docker inspect 已确认：GATEWAY_IMAGE_NONSTREAM_KEEPALIVE_INTERVAL=15；GATEWAY_IMAGE_STREAM_KEEPALIVE_INTERVAL=10；GATEWAY_IMAGE_STREAM_DATA_INTERVAL_TIMEOUT=900。配置 trusted_proxies 为 172.20.0.1/32。
- RETIRED_OK.json 尚不存在；退场脚本仍校验 Nginx 哈希及 old_block，不能直接替换候选。
- 纠正此前笼统描述：15 秒 JSON 保活仅在 OpenAI 图片 handler 中使用。部署 revision 7b7ff3277365a9f836acc647de4cec2f118a6070 的 Gemini ForwardNative 非流式路径会收集上游完整响应后 c.Data；Creator 的 Gemini 请求调用 generateContent，而非异步任务。不能以 OpenAI 保活证明 Gemini 可通过 CF。
- 本次从官方 524 页面直接抓取文档，其描述的默认 Proxy Read Timeout 为 125 秒，建议长任务使用状态轮询或 DNS-only 子域。地址：https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/ 。这属于请求超时风险，不能当作上线时一次性短暂断连。
- 后续应先修复并验证 Gemini 长请求兼容，或由用户明确接受该功能限制后再实施其他方案。当前不满足用户“仅片刻中断”的上线条件。


## 橙云上线与验收（2026-11-10）

- 用户明确将本次目标限定为普通用户 Token 连接，不要求保证 Gemini / 图片长请求；随后在操作前确认“确认开启橙云，继续验证连接”，已说明 CF 会处理含 Token 的 HTTPS/API 请求。
- catbee.online / www.catbee.online 的 A 记录源站仍为 43.110.24.140，代理状态均已保存为“已代理”。历史通配符 * → 47.251.39.106 仍为仅 DNS。Full (strict) 沿用，边缘证书有效。
- 源站候选已应用：SHA256 f45b81dd23716f3a7f1cfbaa1ea4092685637d58d915194857829dce800f32b2；仅 nginx reload，应用容器 Id 和 StartedAt 前后相同。健康检查 ok。
- 退场计划的 site_sha256 与 old_block 同步更新；retire.py --check 返回 expected_nginx=true / destination_healthy=true。定时器恢复 active。检查时旧任务记录仍有 5 条，time_reached=false，未提前退场。
- 第一次执行因退场只读检查遗漏 --check 参数而自动恢复原配置及原计划，timer active；修正参数后重新执行成功。没有应用或数据库重启、数据库备份。
- 成功标记：/root/catbee-cf-prepare-20261110/ORIGIN_APPLIED.json。
- 配置回退资料：/root/catbee-cf-prepare-20261110/apply-1794249036/site-before.conf 与 retire-plan-before.json。首选回退仅将 apex/www 改为 DNS-only；如果恢复源站配置，必须同时核对退场状态和计划，不能在退场后直接恢复含旧兼容路由的文件。
- Google DoH 查询 apex/www 返回 172.67.143.175 / 104.21.27.246；公共 HTTPS 首页和两域名 /health 返回 200，server=cloudflare，cf-cache-status=DYNAMIC，health=ok。不能据单个解析器声称全球缓存全部刷新。
- /v1/models 无 Token 请求经 CF 返回应用 JSON 401 API_KEY_REQUIRED，而非验证码页面；这证明 API 路由连通，不等同于有效 Token / 模型生成成功。
- 真实 IP：带唯一标记的正常 CF 请求在源站 access log 中记录的客户端 IPv6 与 /cdn-cgi/trace 一致。直连源站并伪造 X-Forwarded-For / CF-Connecting-IP 后，日志仍记录实际连接 IP，而非伪造值。额外在 CF 入口伪造 CF-Connecting-IP 的测试被边缘以 403 / error 1000 拒绝，正常请求随后 200。
- 未做付费生成、有效 Token 鉴权、SSE 持续输出或 Gemini/图片长请求测试；不宣称零丢包、所有请求无中断或性能提升。
- 防火墙未收紧，历史源 IP 仍可直连；目前域名流量通过 CF，不代表源站已彻底隐藏。未释放右侧服务器。

## 通配符清理与源站复核（2026-11-10 04:50–05:00 北京时间）

本节更新并覆盖上方较早的“通配符仍为 DNS-only”和“防火墙未收紧”状态。

- DNSPod `catbee.online` 解析记录页现仅有 `@` 与 `www` 两条 A 记录，均指向 `43.110.24.140`；旧 `*` 记录已删除。
- Cloudflare 权威区现仅有 apex 与 `www` 两条已代理 A 记录，均指向 `43.110.24.140`；不再有 `*` 记录。公共递归 DNS `1.1.1.1` 和 `8.8.8.8` 对 `random-check-20261110.catbee.online` 均返回 NXDOMAIN。清理初期 1.1.1.1 曾短暂返回旧通配符地址 `47.251.39.106`（剩余 TTL 30 秒），随后两处解析器均转为 NXDOMAIN。
- 轻量服务器云防火墙共 34 条已启用规则：Cloudflare 官方 15 个 IPv4 网段各有 TCP 80/443 两条规则；右侧中转机私网 `172.18.29.102/32` 有 TCP 80/443 规则。逐页核对清单与 Cloudflare 官方 `https://www.cloudflare.com/ips-v4` 完全一致；没有 `0.0.0.0/0` 的公网 80/443 规则。
- TCP 22 SSH 仍允许 `0.0.0.0/0`，ICMP 也对公网开放；未更改，避免在没有稳定管理出口 IP 的情况下造成 SSH 锁定。
- 主机 `nftables` 服务为 disabled/inactive，配置文件不存在；Nginx 仍监听 `0.0.0.0:80` 和 `0.0.0.0:443`，公网 Web 入口当前由阿里云云防火墙源地址规则限制。
- 验证时经域名访问 `/health` 返回 HTTP 200、`server: cloudflare`、健康状态 `ok`。从当前非 Cloudflare 网络直连 `43.110.24.140:443` 握手超时，直连 `:80` 未得到 HTTP 响应。测试仅代表本次来源和时点。
- 本节只做 DNS/防火墙只读核验和外网连通测试；没有修改应用、Nginx、主机防火墙或数据库，也没有重启服务器/容器或创建数据库备份。

## Token 首字延迟排查与短流式验收（2026-11-10 中午，北京时间）

用户反馈“很久才出第一个字”。只读检查生产节点，并在用户单独授权后执行两次短流式生成（源站、CF 各一次；gpt-6-astra，low，最多 64 输出 Token，仅发送“Reply exactly OK.”）。没有部署、重启、调整调度、修改 DNS/防火墙或备份数据库。

### 真实慢请求定位

- 用户请求 5719973（11:40:26）：服务端首字 26,371 ms；转发前 56 ms，最终上游转发首字 26,315 ms。
- 用户请求 5719909（11:36:06）：服务端首字 40,534 ms；转发前 26 ms，最终上游转发首字 40,508 ms。
- 用户请求 5719848（11:33:39）：服务端首字 81,008 ms，最终转发前已耗时 51,350 ms。详细追踪中 account 1806 出现四次 403；随后 account 1837 的一次传输尝试约 48.67 秒后 transport_error；最终切换 account 1646 成功，最终转发首字 29,658 ms。追踪同时记录 egress/http 层，不能把两层记录重复计为两次实际调用。这里的 queue_wait_ms 包含先前失败尝试，不能全部解释为服务器容量排队。
- 请求 5719849 的 54,146 ms 服务端首字也包含 account 1837 传输错误及切换：转发前 33,306 ms，最终转发首字 20,840 ms。
- 检查时 account 1806、1646 的 schedulable 已为 false；本轮没有改动。account 1837 仍参与调度，最近 15 分钟已入库追踪中有 160 条 egress 状态 200；两次诊断生成也命中此账号并成功。这仅说明该采样窗口的已记录请求，不能覆盖所有进行中或未入库失败请求。

### 实测与边界

- 使用用户已有有效 Token（仅在生产主机进程内读取，未打印或保存密钥）请求 /v1/models：源站应用 200，约 0.025 秒；经 CF 200，约 0.105 秒，CF 边缘 SJC。
- 两次短流式请求均 HTTP 200、text/event-stream，收到 response.output_text.delta 及 response.completed，各 10 个 SSE 数据事件、实际输出 5 Token。源站首个文本 1.349 秒、总计 1.369 秒；CF 首个文本 1.763 秒、总计 1.766 秒。
- 对应用量记录 5720717（源站）、5720718（CF）；上游首字分别 1,327/1,676 ms，转发前分别 16/12 ms。实际扣费各 0.00029823 USD，合计 0.00059646 USD。
- 两次调用时间不同，上游本身耗时不同；不能把 0.414 秒的端到端差值全归因于 CF。这是生产服务器发起的 SJC 路径短流式验证，不是用户电脑/梯子路径或长时间 SSE 压力测试。
- 本机不带 Token 的 /health 首字约 2.55 秒、TLS 建连约 1.91 秒；/v1/models 返回预期 401、首字约 2.36 秒。这些公共检查也不能代替用户实际客户端路径测速。
- Nginx 生产配置的正常应用及旧任务兼容代理均为 proxy_buffering off，proxy_read_timeout 3600s。
- 应用、PostgreSQL、Redis 均 healthy；资源采样时可用内存 1,780 MiB，load average 1.19/0.78/0.61。未观察到这次慢请求由资源耗尽造成的证据。
- 最后一次最近 10 分钟、最多 10,000 条应用日志采样中，/v1/ 访问状态包含 200:399、101:32、403:13、409:12、202:7、401:6、404:6、402:4、499:1，未见 429；记录到 44 个不同客户端 IP。不是全站全时段无错误的保证。

结论：已证实用户部分长等待由上游拒绝、传输失败及切换重试叠加，上游最终生成等待也占显著时间。有效 Token 和短流式 CF 通路本次验收成功；没有依据把上述数十秒等待归因于 CF，也未进行关闭 CF 或扩大公网入口操作。持续长流、不同用户出口及长上下文仍未进行主动对照测试。

## 现有链路免费优化核查（2026-11-10 12:32–12:38，北京时间）

用户要求检查现有链路的免费优化。本轮仅只读核验 CF 控制台、生产 Nginx 配置，以及非计费健康接口；没有修改 CF、DNS、防火墙或生产配置，没有 reload、重启、升级或额外模型生成。以下是检查结果及建议，不能作为优化已上线的记录。

### 已启用或已正确配置

- CF 协议优化页显示 HTTP/2、HTTP/3、HTTP/2 到源服务器、TLS 1.3 均开启；0-RTT 关闭。Cache Rules 与缓存响应规则均为 0 条，不代表 CF 不会按默认规则缓存静态资源。
- 生产 Nginx 为 1.28.3，编译包含 `--with-http_v2_module`；TLS 实测为 TLSv1.3，证书正常验证。
- 正常应用入口及旧图片任务兼容入口均为 `proxy_buffering off`，读取超时 3600 秒。无需重复修改关闭流式响应缓冲。
- 全局 `keepalive_timeout 60`、`tcp_nodelay on`；这不等于 Nginx 到应用已配置连接池。
- 12:38 对正在使用的完整配置执行 `nginx -T` 返回 0。站点 SHA256 仍为 `f45b81dd23716f3a7f1cfbaa1ea4092685637d58d915194857829dce800f32b2`，与此前上线记录一致。

### 明确缺口一：源站 HTTP/2 尚未开启

- HTTPS server 只有 `listen 443 ssl;`，没有 `http2 on;`，完整配置也未见启用 HTTP/2 的指令。
- 使用 SNI `catbee.online`、正常证书验证、ALPN 同时提供 h2/http1.1 的本地 TLS 探测，实际协商为 `http/1.1`。
- `curl --http2 --resolve catbee.online:443:127.0.0.1 https://catbee.online/health` 返回 200，协议仍为 HTTP/1.1。
- 从生产主机经 CF 发出的三次带 `cf-free-probe=1/2/3` 标记的健康请求，在源站 access log 中全部为 HTTP/1.1。因此 CF 控制台开关开启，不代表实际回源已使用 HTTP/2。
- 首要建议：在现有 HTTPS server 中启用 `http2 on;`。现有二进制支持该指令，无需应用升级或付费套餐。作用是允许 CF 回源使用 HTTP/2 和多路复用，减少连接开销；实际首字收益应在上线后测量，不能承诺消除上游生成等待。

### 次要缺口二：Nginx 到应用未配置连接复用池

- 完整 `nginx -T` 中 upstream block 数为 0。正常入口使用 `proxy_pass http://127.0.0.1:8080` 和 `proxy_http_version 1.1`，每个请求均设置 `Connection "upgrade"`。
- 次要建议：为本机应用增加适量 upstream keepalive 池，并只在客户端实际请求协议升级时发送 `Connection: upgrade`，普通 HTTP 请求清空 Connection 头以配合连接复用。必须保留现有 WebSocket 升级支持，不能一律移除 Upgrade 头。
- 此段是本机回环网络，建立连接的成本相对较低；当前没有证据证明它导致数十秒首字等待，不应把它宣传为主要提速来源。

### 免费健康探测与解释边界

同一 curl 进程顺序执行三次 CF 请求，首个请求建立连接，随后两次复用客户端到 CF 的连接：

- 本地 Nginx：HTTP 200、HTTP/1.1，首字 0.013474 秒。
- CF 第一次：HTTP 200、HTTP/2，新建连接 1，TLS 0.042707 秒，首字 0.071767 秒。
- CF 第二次：HTTP 200、HTTP/2，新建连接 0，首字 0.025742 秒。
- CF 第三次：HTTP 200、HTTP/2，新建连接 0，首字 0.029114 秒。

以上仅代表生产服务器发起的健康接口路径，证明该测试客户端到 CF 的 HTTP/2 与连接复用正常；不代表用户电脑/代理出口路径，也不证明 CF 到源站连接的复用状态，更不等同于模型首文本延迟。

### 实施约束与验收方案（本轮未执行）

- 建议先实施源站 HTTP/2，再单独评估内部连接池，便于判断收益和回退。
- 变更前重新读取线上站点和迁移退场状态。退场脚本校验精确站点哈希；不能直接修改配置而遗漏 `/root/catbee-app-move-20261109/{retire.py,retire-plan.json}` 中 `site_sha256` 与 `old_block` 的联动，也不能在退场后恢复含旧兼容路由的历史文件。
- 候选配置先语法检查，再通过 Nginx 平滑 reload 应用。应用与数据库无需重启；不能承诺所有客户端绝对无瞬时重连。
- 验收应包括：证书正常验证、ALPN 协商 h2、本地 HTTP/2 健康成功、带标记 CF 请求在源站记录为 HTTP/2、普通 HTTP/API 与 WebSocket 兼容，并观察 5xx/499 及既有流式连接。退场联动只读检查必须显式使用 `retire.py --check`。
- 不建议为此盲目延长到 900 秒 keepalive、开启 0-RTT、缓存 Token/API 响应、关闭 CF 防护或新增公开源站直连入口。

官方参考（2026-11-10 核对）：

- Cloudflare HTTP/2 to Origin：源站通过 ALPN 宣告支持 HTTP/2 才会使用，否则回退 HTTP/1.1；Free 支持回源 HTTP/2。https://developers.cloudflare.com/speed/optimization/protocol/http2-to-origin/
- Nginx HTTP/2 module：`http2 on;` 自 1.25.1 提供，现有 1.28.3 与已编译模块满足该配置条件。https://nginx.org/en/docs/http/ngx_http_v2_module.html
- Nginx upstream keepalive：对 1.28.3 应显式配置连接池，HTTP/1.1 配合清空普通请求 Connection 头。https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive
- Nginx WebSocket 与响应缓冲说明：https://nginx.org/en/docs/http/websocket.html 、https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering

## 首页 Lighthouse 建议复核（2026-11-10）

用户提供 Cloudflare 桌面合成测试截图。本轮读取同一报告、公开首页和静态资源响应，以及仓库源码；没有开启 Rocket Loader、修改 Cache Rules、修改前端或部署生产。

- 报告测试区域 Iowa, USA，显示测试时间 2026-11-10 11:51 AM，性能分数 94；TTFB 83 ms、FCP 912 ms、LCP/TTI 1,152 ms、TBT 0、Speed Index 1,818 ms、CLS 0。这是首页实验室页面加载指标，不是模型 Token 首文本耗时，也不代表用户电脑/代理出口的体验。
- 两条红色建议的“查看详情”仅给通用说明与 Rocket Loader / Cache Rules 功能入口，没有受影响资源 URL、节省时间或节省字节明细。因此不能仅凭该页断定缓存配置缺失或 Rocket Loader 是对应修复。
- 首页 HTML HTTP 200，`Cache-Control: no-cache`、`CF-Cache-Status: DYNAMIC`；入口脚本为 `type="module"`，有 Vue、i18n、misc 的 modulepreload，以及两条外链 stylesheet。
- 以下首页主资源均 HTTP 200，且均为 `Cache-Control: public, max-age=31536000, immutable`：`index-BopiCyLi.js`、`vendor-vue-CXFTpHOh.js`、`vendor-i18n-BlekLdSj.js`、`vendor-misc-fnk3JXGa.js`、`vendor-misc-DB0Q8XAf.css`、`index-Bnp5dBeP.css`。初次 HEAD 为 MISS，不代表未缓存；后续同路径 GET 的两条 CSS 均为 HIT，Age 分别约 215/217 秒。
- CSS GET 解码后大小：vendor-misc 3,938 bytes、index 299,912 bytes；两者未发现 `@import` 或外部 HTTP 字体 URL。以上是解压后的内容大小，不是网络压缩传输量。约 300 KB 的主样式值得分析并精简首屏不需要的样式，但本轮没有完整 Lighthouse 网络瀑布，不能量化它的阻塞贡献。
- 从线上 entry JS 确认首页样式为 `/assets/HomeView-Dagk0jRk.css`（2,355 bytes），其中 `.code-line` 初始 `opacity: 0`，入场动画 0.5 秒，四行延迟依次为 0.3/1/1.8/2.5 秒。与仓库 `frontend/src/views/HomeView.vue` 对应。视觉完成会受这类延迟影响，这是 Speed Index 的明确候选优化点；尚未通过修改前后录屏/A-B 测试证明其对本次 1,818 ms 的具体贡献。
- 页面另加载 `static.cloudflareinsights.com` 的 beacon，响应 `max-age=86400`，内容长度约 31,853 bytes。一天缓存的第三方统计脚本可能触发缓存时长建议，但没有完整报告资源清单，不能断言它是唯一或确定来源。该响应属于第三方域名，本站 Cache Rules 不能直接改它的缓存头。

建议顺序：优先缩短/取消首页终端的长延迟入场动画，再用完整 Lighthouse 报告定位并精简阻塞 CSS；保留现有带 hash 静态资源的一年缓存。首页 HTML 与鉴权 API 不应为消除警告而套用全站长缓存。现有入口为 module 脚本，先分析具体阻塞资源；Rocket Loader 属于脚本加载行为变更，若后续单独启用，应验证登录、路由、创作中心等功能，不能把产品推荐当成自动修复。

参考：Chrome Speed Index 衡量页面内容的视觉显示进度；Render blocking requests 建议移除首屏不需要的样式/脚本阻塞；Use efficient cache lifetimes 主要改善重复访问，第三方缓存通常无法由本站控制。

- https://developer.chrome.com/docs/lighthouse/performance/speed-index
- https://developer.chrome.com/docs/performance/insights/render-blocking
- https://developer.chrome.com/docs/performance/insights/cache
- https://developers.cloudflare.com/speed/optimization/content/rocket-loader/

## 源站 HTTP/2 平滑上线（2026-11-10 13:16:49，北京时间）

状态：ORIGIN_HTTP2_ENABLED_AND_CF_ORIGIN_PROTOCOL_VERIFIED。本节覆盖此前“源站仍使用 HTTP/1.1”和“HTTP/2 尚未上线”的检查状态。用户授权在不主动中断请求的前提下启用源站 HTTP/2；执行前确认没有 `worker_shutdown_timeout` 强制结束旧进程的设置，使用 Nginx 平滑 reload。

### 变更范围与联动

- 仅操作左侧生产主机 `iZrj98y2r2rfswybuc7r9bZ`，在 `/www/server/panel/vhost/nginx/catbee.online.conf` 的 HTTPS server 中增加一行 `http2 on;`，保留 HTTP/1.1 支持。
- 没有调整内部 upstream 连接池、代理头、缓存、Cloudflare 开关、DNS、防火墙或首页代码；旧图片任务兼容路由保持原样。没有更新镜像、重启应用或数据库，也没有数据库备份或模型生成测试。
- 站点 SHA256 从 `f45b81dd23716f3a7f1cfbaa1ea4092685637d58d915194857829dce800f32b2` 更新为 `1a1333077e9afc82878da3c79734acab8a00ae1662d19a5ffcc5b4324001c4e8`。
- 同步左侧 `/root/catbee-app-move-20261109/retire-plan.json` 的 `site_sha256`，确认 `old_block` 在候选中仍完整且仅出现一次。变更期间暂停退场 timer，服务未运行，完成后恢复 active。`retire.py --check` 上线前后均确认 `expected_nginx=true`；没有执行退场 apply。
- 候选配置先在不替换生产配置的情况下执行独立 `nginx -t`。最初隔离目录检查遇到宝塔公共 PHP 配置的相对 include 路径，修正独立检查的 conf_prefix 后通过；这两次检查失败均发生于生产配置替换之前。生产配置替换后的完整 `nginx -t` 同样通过。
- 经过审核的执行器 `/root/catbee-enable-origin-http2-20261110.py`，SHA256 `d736896cb7c54840aa174b5d9194884b09b25500b6992113d785f3ac59c145c2`。它验证主机、配置/计划哈希、应用状态和退场时间窗口；错误时恢复站点与退场计划并平滑 reload。没有执行 stop/restart Nginx。

### 验收证据

- TLS 使用正常证书验证，源站 ALPN 已协商为 `h2`；本地带 SNI 的 HTTP/2 `/health` 返回 200。
- 经 CF 的主域名和 www 健康请求均 HTTP 200、客户端协议 HTTP/2。带唯一标记请求在源站 access log 中记录为 `GET /health?origin-http2-1794287809=0 HTTP/2.0`，状态 200，证明 CF → 源站实际使用 HTTP/2。
- 变更前建立一条 HTTP/1.1 健康请求并只发送部分请求体，确认请求处于进行中；平滑 reload 后补齐请求体，原连接正常返回 HTTP 200。该检查验证未完成 HTTP 请求跨重载继续处理，不等同于主动验证长期模型 SSE。
- 重载期间并行执行 7 次不计费 HTTP/1.1 健康检查，失败 0 次。Nginx 主进程 PID 仍为 664，新工作进程接管；应用容器 ID、StartedAt、healthy 状态均与上线前一致。
- `/v1/models` 不带 Token 返回预期 401；没有再次调用收费模型或读取/输出用户密钥。
- 上线后短窗口的最近最多 3,000 条源站 access log 中，完成的 `/v1/` 请求协议统计为 HTTP/2.0:185、HTTP/1.1:8；状态为 200:171、202:8、401:1、403:10、404:3，该采样未见 5xx、429 或 499。状态统计只描述该窗口，不能证明所有用户、所有时段均无错误。
- 左侧退场复核：`expected_nginx=true`、`destination_healthy=true`、`expected_container=true`，旧任务记录 4，`time_reached=false`；timer active，尚未退场，不能据此释放右侧服务器。

上线成功记录：`/root/catbee-http2-20261110/APPLIED_OK.json`，UTC 时间 `2026-11-10T05:16:49.444909`。配置回退资料：同目录 `site-before.conf`、`retire-plan-before.json`。如需回退，必须同时核对最新退场状态与当前文件哈希，不能在退场后盲目覆盖含旧兼容路由的历史站点文件。

结论：HTTP/2 已上线并实际用于 CF 回源，检查中未观察到中断，用户地址和 Token 无需变更。没有进行优化前后同条件模型首文本测速，不能据此量化提速或承诺消除上游生成等待。

官方平滑重载机制参考：https://nginx.org/en/docs/control.html#reconfiguration 。

## HTTP/2 上线后的模型首文本实测（2026-11-10 14:12:55–14:13:15，北京时间）

用户本轮单独授权：使用已有 CatBee Token，最多 6 次短流式生成，每次最多 64 输出 Token，总预算 0.01 USD；不切换线上协议。沿用上次公开模型 `gpt-6-astra`、reasoning effort `low`、提示词 `Reply exactly OK.`，生产服务器经 `catbee.online` / CF 请求 `/v1/responses`。此授权仅用于本轮额度，不自动扩展至后续付费测试。

- 6 次首个非空 `response.output_text.delta` 到达时间依次为 **2.499、4.226、2.471、2.812、2.218、4.234 秒**。使用单调时钟从启动请求前开始计时；响应头、空事件和非文本事件均不作为首字。
- 首文本中位数 **2.655568 秒**，平均 **3.076577 秒**，最小 **2.217597 秒**，最大 **4.233584 秒**。每次独立 curl 进程、建立一条新连接；这是当前低并发短提示词样本，不衡量连接复用或 HTTP/2 多路复用的并发收益。
- 6 次均 HTTP 200、客户端 HTTP/2、SSE 完整结束（收到 `response.completed`），CF Ray 均为 SJC；带唯一查询标记的 6 条源站 access log 均记录 `POST ... HTTP/2.0`、200，确认实际 CF 回源协议。
- 对应 `usage_logs` ID 为 **5726301、5726304、5726306、5726312、5726316、5726321**。均命中 account 1701，公开模型 `gpt-6-astra` 的当前上游映射为 `gpt-6.1-sol`；历史 5720718 同样映射到 `gpt-6.1-sol`，但命中 account 1837。
- 最终上游转发首字依次 **2388、3912、2385、2742、1808、3674 ms**；转发前耗时 **15、92、12、12、15、20 ms**；包含转发前耗时的服务端首字 **2403、4004、2397、2754、1823、3694 ms**。这些服务端指标的观测点与客户端首个文字不同，差值不能全部归为 CF 或网络耗时。
- 每次实际输出 5 Token、实际扣费 **0.00016938 USD**；6 次合计 **0.00101628 USD**，低于用户授权上限。每次确认用量入库后才发下一次，6 次后停止。密钥仅在服务器进程内读取并经 curl stdin 传递，未打印或保存。
- 历史 HTTP/2 上线前 CF 单次首文本为 **1.763 秒**；本轮中位数较它增加约 **0.893 秒**。该比较未显示首字提速；历史样本只有一次、测试相隔约两小时、上游账号和输入/缓存 Token 构成不同，不能据此判定 HTTP/2 导致变慢，也不能量化 HTTP/2 的净收益。本轮未做切换 CF 回源 HTTP/1.1/HTTP/2 的同条件 A/B。
- 这次是生产服务器经 CF SJC 发起的测试，不代表用户电脑及梯子出口的端到端速度，也不涵盖长上下文或其他模型。
- 生产 Nginx 站点配置前后 SHA256 均为 `1a1333077e9afc82878da3c79734acab8a00ae1662d19a5ffcc5b4324001c4e8`。没有 reload、重启、部署或修改 CF / DNS / 防火墙 / 调度。

服务器留存 `/root/catbee-ttft-http2-20261110.py`（SHA256 `f14e9d0bf2c1e7dde247fe21466b2d55f325d2f5d3924c4b0af4a529c834664c`）与 `/root/catbee-ttft-http2-20261110/{run.log,result.json,STARTED}`。唯一启动标记防止误重跑；结果已补充源站协议和只读计费明细。没有保留新的 Token 文件。

## Nginx 到本机应用连接复用上线（2026-11-10 14:47:34，北京时间）

状态：UPSTREAM_KEEPALIVE_ENABLED_AND_REUSE_VERIFIED。用户授权在验证连续性的前提下补齐 Nginx → 本机应用连接复用；本节覆盖前文“尚未配置内部连接复用池”的检查状态。仅操作左侧生产节点 `iZrj98y2r2rfswybuc7r9bZ`。

### 最终变更

- 在现有站点文件的 HTTP 上下文新增 `catbee_app_backend` upstream，指向原来的 `127.0.0.1:8080`；每工作进程最多缓存 32 条空闲连接，`keepalive_requests 1000`、`keepalive_timeout 60s`。32 仅是空闲缓存上限，不限制活跃用户请求总数。
- 正常应用入口 `proxy_pass` 改为引用该 upstream。新增站点专用 `$catbee_app_connection` map：收到 Upgrade 请求时为 `upgrade`，普通请求为空。保留原 `Upgrade $http_upgrade`，不修改其他站点共用的 `$connection_upgrade` map。
- 保留源站 HTTP/2、真实客户端 IP、Host、鉴权转发、`proxy_buffering off`、3600 秒读写超时、旧图片任务兼容块。没有改动 CF、DNS、防火墙、应用镜像或数据库。
- 候选完整配置先独立 `nginx -t` 通过，生产替换后再次通过。复用已核验 SHA256 的 HTTP/2 上线工具中的主机/哈希保护、原子写入、自动回退、平滑 reload 与连续性检查函数；没有 stop/restart Nginx。
- 站点 SHA256 从 `1a1333077e9afc82878da3c79734acab8a00ae1662d19a5ffcc5b4324001c4e8` 更新为 `6b467f75d11881df18a4cd948a6fa7fd91f45311ee00de4968f30ba2654fce61`。同步左侧 `retire-plan.json` 的 `site_sha256`；候选中的旧兼容块仍完整且仅出现一次。变更期间暂停退场 timer，完成后恢复 active，没有执行退场 apply。

### 直接验收证据

- 同一条客户端 TLS/HTTP/1.1 连接依次发送 8 个带唯一标记的非计费 `/health` 请求：上线前，Nginx → 应用使用 **8 个不同 TCP 源端口/连接**，请求中均含 `Connection: upgrade`；上线后，8 次均使用 **同一个 TCP 源端口 35426**，普通请求的 Connection 头为空/未发送。这是实际复用证据，不只检查配置文本。
- 上述验证只从 loopback 数据中筛选精确匹配本轮健康探针路径的请求，保存请求路径、TCP 源端口和 Connection 头等诊断信息，没有保存业务流量抓包或用户鉴权头。
- 使用既有有效 Token 在重载前完成一次 WebSocket 101 握手并收到 ping/pong；平滑 reload 后，**同一条 WebSocket 再次收到 pong**。上线后新建源站 WebSocket 和经 CF 的 WebSocket 均完成 101 握手与 ping/pong。
- WebSocket 只做握手、协议心跳和正常关闭，未发送 `response.create` 或模型生成文本，因此本轮新增付费模型请求为 0。密钥仅在生产进程内读取及向现有 CatBee 入口传递，没有打印或保存。
- 重载前建立并保持未完成的 HTTP/1.1 健康请求，重载后补齐请求体，原请求返回 200。重载期间 **4 次**并行健康检查失败 **0 次**。这与 WebSocket 连续性验证均成功，但不等同于覆盖所有用户或主动验收长期模型 SSE。
- 本地 HTTP/2、经 CF 主域名和 www 健康检查均为 `200 2`；不带 Token 的 `/v1/models` 返回预期 401。CF 唯一探针在源站日志记录为 HTTP/2.0、200，源站 HTTP/2 保持正常。
- Nginx master PID 仍为 **664**；应用容器 ID、StartedAt、healthy 状态均与变更前一致，应用和数据库未重启。
- 部署前退场只读检查为 `expected_nginx=true`、`destination_healthy=true`、`expected_container=true`，旧任务记录 1、`time_reached=false`。部署工具在变更中及变更后再次检查通过，timer 恢复 active；这不构成释放右侧服务器的验收。

实施工具 `/root/catbee-upstream-keepalive-20261110.py`，SHA256 `018b4f7077b042bb6e90b1fd55aa26e23e17567550a25e3904c1fe24ecfa472b`。依赖已核验的原 HTTP/2 工具 SHA256 `d736896cb7c54840aa174b5d9194884b09b25500b6992113d785f3ac59c145c2`。

成功证据 `/root/catbee-upstream-keepalive-20261110/COMPLETE_OK.json`，UTC 时间 `2026-11-10T06:47:34.241008`；同目录保留 `APPLIED_OK.json`、`PREPARED.json`、`pool-before.json`、`pool-after.json`、`apply.log` 及站点/退场计划回退资料。回退时必须核对最新退场状态与文件哈希，不能在旧任务退场后盲目覆盖历史兼容路由。

本轮验证了连接复用和重载连续性，没有再次进行模型首文本测速，不能据此声称模型首字明显加快。

## Nginx 连接复用后的模型首文本复测（2026-11-10 15:10，北京时间）

用户本轮单独授权：使用既有 CatBee Token，最多 6 次短流式生成，每次最多 64 个输出 Token，总预算 0.01 USD；沿用 `gpt-6-astra`、`low` 和 `Reply exactly OK.`。仅测试左侧生产节点经 `catbee.online` / Cloudflare 的 `/v1/responses` 请求，没有切换协议或修改线上配置。

- 6 次均 HTTP 200、curl 返回码 0、客户端协商 HTTP/2，收到 `response.output_text.delta` 与 `response.completed`；CF Ray 均为 SJC。每次均输出 5 Token，命中 account 1701，上游映射为 `gpt-6.1-sol`；对应 `usage_logs` ID：5729057、5729060、5729061、5729066、5729069、5729073。
- 客户端从启动请求至首个非空文本的中位数 **2.215 秒**、平均 **2.279 秒**，范围 **2.213–2.470 秒**。服务端记录的上游首字时间为 **2389、1859、2265、2073、1859、1979 ms**。这是 6 个低并发短提示词样本，不代表用户电脑及梯子出口的端到端耗时。
- 每次实际扣费 **0.00016938 USD**，6 次共 **0.00101628 USD**，低于授权上限。每次等待对应计费记录后再继续；Token 仅在生产进程中读取并经 curl stdin 传递，没有打印或保存。
- 与连接复用上线前最近一次 6 样本对照（客户端首文本中位数 2.656 秒、平均 3.077 秒）相比，本轮观测值中位数低约 **0.441 秒（16.6%）**、平均低约 **0.797 秒（25.9%）**。两批测试并非随机交替的同条件 A/B；该差异不能单独归因于 Nginx 到应用的连接复用，也不能承诺所有用户都会获得相同提速。
- 站点配置运行前后 SHA256 均为 `6b467f75d11881df18a4cd948a6fa7fd91f45311ee00de4968f30ba2654fce61`。应用、Nginx、数据库、Cloudflare 和 DNS 均未修改或重启。

服务器结果保存在 `/root/catbee-ttft-http2-20261110-rerun-01/result.json`，独立复测脚本为 `/root/catbee-ttft-http2-20261110-rerun-01.py`；旧脚本和旧 `STARTED` 标记保持不变。
