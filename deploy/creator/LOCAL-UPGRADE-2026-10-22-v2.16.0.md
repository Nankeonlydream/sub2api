# 本地 Creator 升级至 v2.16.0

- 范围：本地代码及构建产物；未推送、未部署服务器、未连接业务数据库或执行迁移。
- 起点：本地集成分支提交 `01606f15d`（`2.15.0-creator.1`），保留此前未推送的定制修改。
- 上游：ranxi2001/sub2api 稳定版 `v2.16.0`。
- 结果版本：`2.16.0-creator.1`，集成分支仍为 `feature/creator-on-v2.10.2`。
- 使用 `upstream.py check/prepare` 创建独立候选目录；因远程集成分支落后于本地，撤销工具基于远程旧提交的初次合并，先快进至本地起点，再合并同一上游引用。
- 最终只有版本号冲突，已设为 Creator 版本；自动合并的网关和路由保留 Creator 图片下载及 `/creator` 页面。
- Creator Studio、真实 1K 尺寸与实际尺寸计费代码相对本地起点未变，相关前后端回归通过。

## 验证

- 升级工具：10 项测试通过。
- 前端全量：511 个测试文件通过，4412 项测试通过、9 项跳过。
- 前端生产构建：通过（含 i18n 检查、TypeScript 检查）。
- 后端回归：service、handler、server、config、domain、apicompat、cyberevidence、repository、migrations 全部通过。
- 嵌入资源与程序入口：`go test -tags embed ./internal/web ./cmd/server` 通过。
- 本机后端：`go build -tags embed` 通过，`-version` 返回 `2.16.0-creator.1`。
- 未执行付费生成测试或真实数据库集成验收。

## 迁移与任务审查

新增 `296_content_moderation_user_recovery.sql` 与 `297_cyber_policy_evidence.sql`，包含用户状态 revision 触发器、来源状态/命中/动作记录、旧计数快照及加密证据表和索引。均为 forward-only，程序回退不撤销数据库结构。

证据写入与过期清理在主程序内运行，复用固定 TOTP 加密密钥，并接入退出清理；独立 OAuth Worker 脚本无变化。本次未启动服务，迁移尚未应用。
