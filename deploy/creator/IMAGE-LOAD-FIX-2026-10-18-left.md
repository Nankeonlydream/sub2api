# 左侧图片加载修复（2026-10-18）

## 原因与证据

截图中的 2K 作品使用 gpt-image-2.5-sunburst，历史保存的是 HTTP 图片链接。浏览器 HTTPS 页面不能加载该地址；无认证 GET 返回 HTTP 401。

经用户授权（真实生成测试总费用不超过 $0.30），在左侧同一分组进行 1K 生成，复现“生成成功但图片加载失败”。响应 HTTP 200，data[0] 同时包含 b64_json（1,821,880 字符 PNG 数据）、size、url、revised_prompt。前端 normalizeOpenAIImages 优先使用 url，随后历史只保存该链接，丢弃了可直接显示的图片数据。这不是 2K 专属问题。

## 修复

优先使用 b64_json 组成自包含 data URL；只有未返回图片数据时才使用 URL。保留原有 1K 尺寸归一化、计费和其他模型参数。

源码提交：ffe4668a2（feature/creator-on-v2.10.2）。版本：2.12.1-creator.2。

## 验证

- 增加 1024x1024、2048x1152、3840x2160 的响应回归用例，确保同时包含 Base64 与不可用 HTTP URL 时选择图片数据。
- 本地前端：490 个测试文件通过，4228 项通过、9 项跳过。
- 本地前端构建、类型检查通过。
- 部署工具 10 项测试通过。
- CI：https://github.com/Nankeonlydream/sub2api/actions/runs/39074436171

## 旧作品限制

旧版历史只保存链接，未保存原响应中的 Base64。修复不可能从无效链接推回已丢弃的图片数据；旧作品不保证恢复。原始历史未删除。

## 部署与在线验收

已部署左侧 iZrj9eby63lh2zp7dbipn8Z / catbee.online；未更新右侧，无数据库备份、迁移或 Prism 安装。

- 镜像：ghcr.io/nankeonlydream/sub2api@sha256:a610d0843f7a810867c78e5acc1bb583ecc39450daaf9e6185d4534c1bd31072
- 版本：2.12.1-creator.2
- 完整 revision：ffe4668a20a654e6f8a9e6566c77855ad9701aed
- ready.py 精确 revision/CI 校验通过，creator-upgrade 返回 DEPLOYMENT_COMPLETE，容器 healthy，config_preserved=true，pending_migrations=[]。
- 服务器记录：/root/sub2api-creator-release/2.12.1-creator.2-20261018T063023-1041528/
- 公网 /health 正常，CreatorStudioView-DSllcpsV.js SHA256 为 50ec708bca5d3075d072158db4b81f73523c824eae895763e6d753bacf39c643，与容器验证结果一致，真实 1K 预设保留。
- 2K 在线验收通过：浏览器图片和大图预览均解码为 2048x1152，来源为 data:image/png;base64；下载 PNG 2,542,995 字节，文件头尺寸 2048x1152。
- 4K 在线验收通过：大图、预览为 3840x2160，下载 PNG 5,401,722 字节，文件头尺寸 3840x2160。
- 修复后补做 1K 验收通过：实际显示、下载均为 1024x1024。
- 刷新页面后逐一打开 1K、2K、4K 历史，全部正常解码；三个作品的本地缩略图均为 128x128。
- 保留了测试作品和下载文件；未删除用户旧作品。
- 验收截图：/Users/haojie/Documents/CatBee/creator-image-fix-2026-10-18/2k-after-refresh.png。
- 四次真实测试实际扣费：修复前 1K 请求（上游实际输出落入 2K）$0.04，修复后 2K $0.04、4K $0.06、1K $0.02，合计 $0.16，小于授权 $0.30。
