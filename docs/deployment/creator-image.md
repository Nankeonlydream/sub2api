# 创作中心镜像部署

创作中心分支：`feature/creator-on-v2.10.2`。
工作流：`.github/workflows/creator-image.yml`。
推送该分支后，GitHub Actions 运行创作中心测试、前端构建及 Go service 测试，再发布 Linux amd64 镜像。

本次版本：`2.10.2-creator.3`，镜像源码提交：`61ca54f205bff657028e2e758a9f103e44c24c46`。

```text
ghcr.io/nankeonlydream/sub2api:2.10.2-creator.3
ghcr.io/nankeonlydream/sub2api@sha256:08b4ab58edc9c963c2867377d235812f4eb3b31c38f1c73ef9919a4d3d48c3c3
```

生产部署固定 digest，避免同名标签后续变化。镜像可匿名拉取，服务器无需 GitHub 凭据。

后续更新流程：

1. 修改代码，并更新 `backend/cmd/server/VERSION` 为新的 creator 版本。
2. 推送创作中心分支，等待 Creator image 工作流成功。
3. 从工作流摘要取得新镜像 digest，服务器执行 `docker pull`。
4. 验证镜像版本、提交以及隔离启动；保留当前 compose override 用于回滚。
5. 将 `/root/sub2api-deploy/docker-compose.creator.yml` 中的 `services.sub2api.image` 改成新 digest。
6. 在 `/root/sub2api-deploy` 执行：

```sh
docker compose -f docker-compose.yml -f docker-compose.creator.yml up -d --no-deps --pull never sub2api
```

7. 验证健康状态、版本、创作中心静态资源，以及环境变量、挂载和端口未变。失败时恢复原 override 并再次执行上述命令。

只更新右侧应用节点。不执行数据库备份或数据库/Redis 容器重建。不要使用上游通用镜像替换自定义镜像，否则会丢失创作中心。

`deploy-creator3-image.py` 是本次从 creator.2 到 creator.3 的固定发布脚本，含主机校验、镜像 revision 校验、隔离启动、配置保留和失败回滚。它不是任意版本升级器；后续版本需要更新脚本中的预期版本和摘要。

creator.3 的 1K 预设最长边均不超过 1024：1024×1024、1024×688、688×1024、1024×768、768×1024。16:9、9:16、21:9 因最小像素约束需要 2K/4K。计费恢复按实际尺寸分档；上游实际输出仍影响最终扣费。
