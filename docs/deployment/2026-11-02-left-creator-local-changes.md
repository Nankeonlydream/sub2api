# 左侧部署本地 Creator 修改

2026-11-02（Asia/Shanghai），用户明确要求提交本地修改并部署，沿用本会话仅更新左侧 `catbee.online` / `iZrj9eby63lh2zp7dbipn8Z` 的范围。

- 本地修改提交：`d28094e39`，73 个应用代码、测试和部署记录文件，包含 Creator 界面与媒体缓存、MiniMax/Seedance 视频接入及计价、多账户登录风控。
- 与上游 2.19.1 合并后的发布提交：`60c8ab53ab10dc7cdb4b7fa5f40539e173d6300d`。
- 版本：`2.19.1-creator.2`。
- 镜像：`ghcr.io/nankeonlydream/sub2api@sha256:e3084e62f6994aa11e8d6500d10c1ff9c4e209ab32402ebeea2c65aa72cf85f9`。
- 精确提交的 Creator image CI：https://github.com/Nankeonlydream/sub2api/actions/runs/41342377957 ，全部成功，`ready.py` 已核验镜像 revision。
- 服务器成功记录：`/root/sub2api-creator-release/2.19.1-creator.2-20261102T035000-912510/DEPLOYED_OK`。
- 回退参考镜像：`ghcr.io/nankeonlydream/sub2api@sha256:0f1575a1cead621a9f30b7c20b14f83f26c64ef180187b5d1d34f905bfef8dd7`（creator.1），原镜像和 Compose 已保留。

合并时保留上游风控折叠布局与本地多账户配置，适配新版分页事件测试，并补全路由测试中的新配置字段。CI 新增运行 `internal/iprisk` 回归。原工作区已快进同步到发布提交，没有丢弃本地功能修改。浏览器测试产物、运行缓存和独立 `pelican-bicycle.html` 演示文件仍留在本地，未加入应用提交。

本地前端首轮 545 个文件通过，另两个文件的接口测试数据经适配后 37 项复测全部通过；生产构建、后端回归（含 IP 风控）、嵌入前端测试通过。远端对最终提交重新运行完整前端测试、生产构建、后端及嵌入测试并发布镜像，全部成功。

服务器返回 `DEPLOYMENT_COMPLETE`，版本和 revision 一致，健康状态为 healthy，环境变量/挂载/端口/网络配置保留，`PENDING_MIGRATIONS=[]`。本次未增加迁移或修改 Worker/升级器。

公网 `/health` 返回 `{"status":"ok"}`，Creator 资源 `/assets/CreatorStudioView-BSduQUlM.js` 的 SHA256 为 `9ebbbae488062947db6ec272f2e2503789daac80b66b0f0744f61cfd8e153968`，与容器结果一致，真实 1K 预设检查通过。

右侧未部署；未备份数据库、未安装 Prism、未清理旧镜像、未进行付费生成或真实告警邮件测试。新多账户风控配置缺省为关闭，本次没有启用生产风控开关。健康和资源验证不等同于真实付费视频生成链路验收。
