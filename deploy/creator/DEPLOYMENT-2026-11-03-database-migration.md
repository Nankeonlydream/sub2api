# 数据库迁移（2026-11-03，北京时间）

## 最终状态

- 新数据库实例：`69f6334c75944cd5b5436e4f05ecef52`，主机 `iZrj98y2r2rfswybuc7r9bZ`，私网 `172.18.29.103`，公网 `43.110.24.140`。容量型 2 vCPU / 4GiB / 120GiB，购买价格 147 元/月。
- PostgreSQL 和 Redis 仅发布到新机私网 `172.18.29.103:5432/6379`，均 healthy。PostgreSQL 为主库，Redis 为 master。
- `yapi.asia`（`172.18.29.102`）先切换并验证成功，随后切换 `catbee.online`（`172.18.29.45`）。两边 `DATABASE_HOST`、`REDIS_HOST` 均为 `172.18.29.103`。
- 应用镜像保持 `ghcr.io/nankeonlydream/sub2api@sha256:e3084e62f6994aa11e8d6500d10c1ff9c4e209ab32402ebeea2c65aa72cf85f9`。验证环境变量仅两个主机地址变化，挂载和端口保持一致。
- 旧数据库实例 `7cb522f9bb804ed29c39d99cb38a24da`（`172.18.28.235`）的 PostgreSQL、Redis 容器已停止；实例及原数据未删除，也未退订。

## 同步与切换

用户确认以数据完整为优先，允许在线复制后短暂暂停两边应用及后台写入、追平后依次切换；另外明确批准仅向新机 `/32` 地址开放现有账号的临时 SCRAM 复制规则。

通过 PostgreSQL 18 的 `pg_basebackup` 建立在线物理副本，然后持续接收 WAL；Redis 使用主从复制。此次物理全量传输用于建立迁移从库，没有另行生成数据库 dump。

首次全量复制因保存的 HBA 配置副本位于 PGDATA 内且数据库用户不可读而失败。副本移到 PGDATA 外，逐文件验证可读性后重新复制成功；失败期间未切换应用，原库持续提供服务。

正式切换前两台应用的现有账号均只读连接新从库成功。暂停应用后确认旧 PostgreSQL 无其他客户端连接，并阻止两台应用重新连接旧 PostgreSQL；Redis 写入暂停。最终核对位置：

- PostgreSQL WAL：`74/EE8358B8`。
- Redis offset：`32721013`；replid：`33086abe7ae9d6cd65ab79a309235fabc3720915`。

确认新库达到上述位置后提升 PostgreSQL 和 Redis。旧库临时复制规则、复制槽和 WAL 保留上限已撤销，旧数据库容器随后停止。新库不再保留临时 primary_conninfo、primary_slot_name、WAL 保留上限和临时 HBA 复制规则。

## 验收

- 两边容器 healthy，公网 `/health` 返回 `{"status":"ok"}`，`/creator` 返回 HTTP 200。
- 两边可读取 395 条 `schema_migrations`。
- Creator 资源校验通过，保留真实 1K 尺寸。资源 SHA256：`9ebbbae488062947db6ec272f2e2503789daac80b66b0f0744f61cfd8e153968`。
- 新 PostgreSQL 中可见 `172.18.29.45` 和 `172.18.29.102` 的业务连接。
- Redis 返回 PONG，角色为 master。
- 没有进行付费生成或扣费业务测试。

## 保留文件与后续维护

- 新机当前 `/root/sub2api-deploy/postgres_data` 为同步后的正式数据目录。
- 新机原镜像数据目录 `/root/sub2api-deploy/postgres_data_image_20261103` 在迁移验收时保留，占约 32G。随后用户明确要求清理并确认永久删除；核对所有容器挂载均未使用该目录后已删除，释放 31.12GiB。清理后文件系统 118G、已用 41G、可用 73G、使用率 36%；PostgreSQL、Redis 均 healthy，两台应用连接正常。正式目录 `postgres_data` 未删除。
- 两台应用的原配置与校验记录位于 `/root/sub2api-db-cutover-20261103/`；辅助脚本 `/root/catbee-db-cutover-helper.py`。记录包含私有配置，仅保存在各服务器，不应公开或提交仓库。
- 旧 PostgreSQL 的 HBA 保留 `catbee-retired-db` 标记规则，拒绝两台应用连接，避免误接旧库。
- 切换后新库已有独立新写入，旧库不能通过简单改回 IP 安全回滚；需要先处理切换后的数据差异。
- 旧服务器仍可能继续计费，后续退订/释放需另行决定。新机原镜像数据目录已按用户确认清理；旧服务器数据保留，旧服务器释放未执行。
