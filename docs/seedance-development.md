# catbee.online Seedance API 接入指南

本文面向使用 `catbee.online` 和平台 API Key 的开发者：先读取当前 Key 可调用的模型，选择 Seedance，再提交视频任务、轮询状态并下载成品。API Key 由网站账号创建；请勿把 Key 写进网页前端、公开代码或日志。

## 快速流程

```text
API Key -> GET /v1/models -> 选 Seedance model ID
         -> POST /v1/videos -> 保存 task_id
         -> GET /v1/videos/{task_id} -> succeeded
         -> GET /v1/videos/{task_id}/content -> 视频文件
```

API Base URL：

```text
https://catbee.online/v1
```

客户端如果会自动拼接 `/v1`，Base URL 填 `https://catbee.online`；如果要求填写含版本的地址，填 `https://catbee.online/v1`。最终请求路径应只有一个 `/v1`，例如 `https://catbee.online/v1/videos`。

所有接口都使用同一个 Bearer Key：

```http
Authorization: Bearer sk-你的API-Key
Content-Type: application/json
```

API Key 所属分组需要授权视频能力和 Seedance 模型。接口只会返回该 Key 当前可访问的模型。

## 1. 获取 Seedance 模型

请求模型列表，不要把模型 ID 写死在程序里：

```bash
export CATBEE_BASE_URL="https://catbee.online/v1"
export CATBEE_API_KEY="sk-你的API-Key"

curl "$CATBEE_BASE_URL/models" \
  -H "Authorization: Bearer $CATBEE_API_KEY"
```

响应是标准模型列表，使用 `data[].id` 作为后续请求的 `model`。模型必须同时出现在当前 API Key 的列表中，且确认为 Seedance 型号：

```json
{
  "object": "list",
  "data": [
    {
      "id": "xseadanco2.0"
    }
  ]
}
```

示例模型 ID 仅用于说明格式。每个 Key 实际返回的模型可能不同；请求必须使用返回的完整 ID。你提供的在线文档说明可用 `include_capabilities=1` 获取视频参数，但当前仓库的 `/v1/models` handler 没有实现该查询参数，不能假定模型响应一定带 `capabilities`。更换 Key 后重新获取列表。

也可读取 Creator Studio 的 Seedance 展示目录和价格预览：

```bash
curl "$CATBEE_BASE_URL/sub2api/seedance-catalog" \
  -H "Authorization: Bearer $CATBEE_API_KEY"

curl "$CATBEE_BASE_URL/sub2api/video-pricing?model=xseadanco2.0" \
  -H "Authorization: Bearer $CATBEE_API_KEY"
```

管理员保存了自定义目录时，Seedance 目录包含型号名称、时长范围、分辨率、计费单位和参考图数量；若 `customized` 为 `false` 或 `entries` 为空，该接口没有返回前端内置目录。价格响应中的 `prices[resolution][n - 1]` 对应该分辨率下 `n` 秒视频的价格，`null` 表示该时长不可用。实际能否调用仍以 `/v1/models` 返回列表为准；请求参数按当前展示的型号说明填写。

## 2. 创建视频任务

对已返回的 Seedance 模型 ID 发起 `POST /videos`：

```bash
curl -X POST "$CATBEE_BASE_URL/videos" \
  -H "Authorization: Bearer $CATBEE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "xseadanco2.0",
    "prompt": "海浪轻轻拍打沙滩，镜头缓慢向前推进",
    "duration": 5,
    "ratio": "16:9",
    "resolution": "720p"
  }'
```

字段说明：

- `model`：必填，使用模型列表返回的公开 ID。
- `prompt`：必填，描述要生成的视频。
- `duration`：视频时长，整数秒，必须在该型号支持范围内。中继也接受 `seconds`；两者同时传入时必须相同。
- `ratio`：画幅比例，例如 `16:9`、`9:16`；也接受 `aspect_ratio`。
- `resolution`：分辨率，例如 `720p`。Seedance 中继型号固定分辨率，需与模型能力一致。
- `images`：可选，公网可读取的 HTTPS 图片 URL 数组；只有支持参考图的型号才能使用。
- `start_frame` / `end_frame`、`reference_videos`、`reference_audios`、`generate_audio`：仅在模型能力明确支持时传入。当前 Creator Studio 使用的 Seedance 中继不支持参考视频。

一次请求创建一个视频；不要传 `n`，或将其设为 `1`。创建响应中的 `task_id`、`request_id` 或 `id` 是后续查询任务所需的标识，请立即保存。

如果是本地参考图片，在线文档定义了 `POST /v1/media` 上传方式；当前仓库的视频网关没有注册该路由。直接接入此仓库时，使用公网图片 URL，或确认部署端支持的素材上传方式后再接入。

## 3. 查询生成状态

使用创建响应里的任务 ID 查询同一个任务：

```bash
export TASK_ID="创建响应里的任务ID"

curl "$CATBEE_BASE_URL/videos/$TASK_ID" \
  -H "Authorization: Bearer $CATBEE_API_KEY"
```

生成中时通常返回 `processing`、`queued` 或 `running`；按响应中的 `next_poll_seconds` 再查询。若没有该字段，可从数秒间隔开始并在限流或服务错误时退避。`failed` 时读取错误信息；`succeeded`、`completed` 或 `success` 表示任务完成。

在线 API 文档列出的标准查询路径是 `GET /v1/tasks/{task_id}`，并说明兼容 `GET /v1/videos/{task_id}`。当前仓库实现的是后者；以下示例因此使用 `/videos/{task_id}`。如果生产网关另外提供 `/tasks` 路径，也可按该网关文档调用。

## 4. 获取视频文件

状态响应可能包含 `video_url`、`url`、`result_url` 或 `download_url`。若响应提供有效的成品地址，可按其说明直接下载。当前仓库还提供带 API Key 鉴权的视频内容接口：

```bash
curl "$CATBEE_BASE_URL/videos/$TASK_ID/content" \
  -H "Authorization: Bearer $CATBEE_API_KEY" \
  --output seedance.mp4
```

查询或下载暂时失败时，继续使用同一任务 ID 重试，不要重新创建视频任务。创建请求超时且没有收到任务 ID 时，先检查任务/调用记录；当前仓库没有实现客户端 `Idempotency-Key` 去重，不能只靠重复提交来保证不会生成重复任务。

## 5. 计费

创建任务时平台会检查余额并预留在途额度；任务成功后按该模型的计费配置结算，失败任务不收取视频生成费用。Seedance 型号配置为按条计费时，每个视频收一次价格；按秒计费时，价格乘请求的输出时长。查询状态不会重复收费，任务状态查询和后台结算使用任务 ID 做去重。

客户端无需自行扣费或根据实际 MP4 时长估算金额。提交前可调用上面的 `video-pricing` 接口展示价格，最终以平台的用量记录为准。

## 最小 Python 示例

安装依赖：`python -m pip install requests`。先在环境变量中设置 `CATBEE_API_KEY` 和 `SEEDANCE_MODEL`，后者应是模型列表实际返回的 ID。

```python
import os
import time
import requests

base = "https://catbee.online/v1"
key = os.environ["CATBEE_API_KEY"]
model = os.environ["SEEDANCE_MODEL"]
headers = {"Authorization": f"Bearer {key}"}

# 先检查 Key 是否能看到该模型。
model_response = requests.get(f"{base}/models", headers=headers, timeout=30)
model_response.raise_for_status()
models = model_response.json()["data"]
model_info = next((item for item in models if item["id"] == model), None)
if model_info is None:
    raise RuntimeError(f"该 API Key 未开放模型：{model}")
print("Using model:", model_info["id"])

# 新建任务。参数必须符合所选模型的 capabilities。
create_response = requests.post(
    f"{base}/videos",
    headers={**headers, "Content-Type": "application/json"},
    json={
        "model": model,
        "prompt": "海浪轻轻拍打沙滩，镜头缓慢向前推进",
        "duration": 5,
        "ratio": "16:9",
        "resolution": "720p",
    },
    timeout=60,
)
create_response.raise_for_status()
created = create_response.json()
task_id = created.get("task_id") or created.get("request_id") or created.get("id")
if not task_id:
    raise RuntimeError(f"创建接口未返回任务 ID：{created}")

# 同一个 task_id 轮询，直到完成或失败。
while True:
    status_response = requests.get(f"{base}/videos/{task_id}", headers=headers, timeout=30)
    status_response.raise_for_status()
    state = status_response.json()
    status = str(state.get("status", "")).lower()
    if status in {"succeeded", "completed", "success", "done"}:
        break
    if status in {"failed", "error", "cancelled", "canceled", "expired"}:
        raise RuntimeError(state.get("error_detail") or state.get("error") or state)
    time.sleep(max(2, int(state.get("next_poll_seconds", 5))))

# 通过网关内容接口下载，API Key 不会发给视频 URL 的其他主机。
video = requests.get(
    f"{base}/videos/{task_id}/content", headers=headers, timeout=300
)
video.raise_for_status()
with open("seedance.mp4", "wb") as output:
    output.write(video.content)
print("Saved seedance.mp4")
```

## 本仓库实现位置

- `frontend/src/api/creator.ts`：模型、价格、创建、状态查询和视频下载请求。
- `backend/internal/server/routes/gateway.go`：视频接口路由和分组平台分派。
- `backend/internal/service/seedance_video.go`：Seedance 视频参数校验、型号目录、计价和上游转发。
- `backend/internal/service/relay_video_settlement.go`：异步任务结算与去重。
- `docs/seedance-api.md`：火山方舟 Ark 原生 `content[]` 协议，和本文的视频中继不是同一接口。
