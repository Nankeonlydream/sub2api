package service

// resolveBillableImageCount 决定一次图片请求按几张计费。
//
// 官方多图响应没有 n 字段，以响应体 data/output 中实际返回的图片为准，
// 但最多按请求的 n 张计费：上游偶尔多返回图片，多出的部分客户没有要，不能多扣。
// 解析不到张数时：
//   - 分组开启按张计费：按 1 张兜底，避免已成功出图的请求完全漏计；
//   - 未开启：保持原口径（流式 0 张、非流式回退请求 n），不能因为开关之外的原因多扣。
func resolveBillableImageCount(reported, requested int, fallbackToOne bool) int {
	if reported > 0 {
		return capImageCountToRequested(reported, requested)
	}
	if fallbackToOne {
		return 1
	}
	if requested > 0 {
		return requested
	}
	return 0
}

// capImageCountToRequested 把计费张数限制在请求的 n 以内；requested 未知（<=0）时不限制。
func capImageCountToRequested(count, requested int) int {
	if requested > 0 && count > requested {
		return requested
	}
	return count
}
