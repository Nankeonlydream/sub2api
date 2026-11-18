package service

import "testing"

func TestResolveBillableImageCount(t *testing.T) {
	tests := []struct {
		name          string
		reported      int
		requested     int
		fallbackToOne bool
		want          int
	}{
		{name: "实际返回少于请求", reported: 3, requested: 5, want: 3},
		{name: "上游多返回按请求 n 封顶", reported: 2, requested: 1, want: 1},
		{name: "请求 n 未知不封顶", reported: 2, requested: 0, want: 2},
		{name: "开关开启兜底一张", reported: 0, requested: 3, fallbackToOne: true, want: 1},
		{name: "开关关闭保留请求 n", reported: 0, requested: 3, want: 3},
		{name: "流式开关关闭保持 0", reported: 0, requested: 0, want: 0},
		{name: "非法负数开关关闭保持 n", reported: -1, requested: 2, want: 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveBillableImageCount(tt.reported, tt.requested, tt.fallbackToOne); got != tt.want {
				t.Fatalf("resolveBillableImageCount(%d, %d, %v) = %d, want %d", tt.reported, tt.requested, tt.fallbackToOne, got, tt.want)
			}
		})
	}
}

func TestCountOpenAIImageOutputs_OfficialMultiImageResponse(t *testing.T) {
	body := []byte(`{
		"created": 1792815229,
		"data": [
			{"generation_id": "b235a66f-decc-444a-9689-4be8a322a6d0", "url": "https://images.example/a.png"},
			{"generation_id": "de2ccab0-ab61-46bb-9e7b-879af4837dee", "url": "https://images.example/b.png"},
			{"generation_id": "18817363-3449-4217-ba6f-9019ef7fd760", "url": "https://images.example/c.png"}
		],
		"usage": {"input_tokens": 54, "output_tokens": 586, "total_tokens": 640},
		"size": "1024x1024",
		"quality": "low"
	}`)

	if got := countOpenAIResponseImageOutputsFromJSONBytes(body); got != 3 {
		t.Fatalf("countOpenAIResponseImageOutputsFromJSONBytes() = %d, want 3", got)
	}
	if got := resolveBillableImageCount(countOpenAIResponseImageOutputsFromJSONBytes(body), 3, false); got != 3 {
		t.Fatalf("resolveBillableImageCount() = %d, want 3", got)
	}
	// 只请求 1 张时，上游多返回的图片不计费。
	if got := resolveBillableImageCount(countOpenAIResponseImageOutputsFromJSONBytes(body), 1, false); got != 1 {
		t.Fatalf("resolveBillableImageCount() with n=1 = %d, want 1", got)
	}
}

func TestCapImageCountToRequested(t *testing.T) {
	cases := []struct{ count, requested, want int }{
		{2, 1, 1}, {1, 1, 1}, {0, 1, 0}, {3, 0, 3}, {2, 4, 2},
	}
	for _, c := range cases {
		if got := capImageCountToRequested(c.count, c.requested); got != c.want {
			t.Fatalf("capImageCountToRequested(%d, %d) = %d, want %d", c.count, c.requested, got, c.want)
		}
	}
}
