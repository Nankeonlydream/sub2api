package admin

import (
	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// GetSeedanceCatalog returns the saved Seedance model catalog. Customized is
// false while the built-in catalog applies.
func (h *SettingHandler) GetSeedanceCatalog(c *gin.Context) {
	state, err := h.settingService.GetSeedanceCatalog(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, state)
}

// UpdateSeedanceCatalog replaces the whole catalog.
func (h *SettingHandler) UpdateSeedanceCatalog(c *gin.Context) {
	var req struct {
		Entries []service.SeedanceCatalogEntry `json:"entries"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid Seedance catalog")
		return
	}
	state, err := h.settingService.SetSeedanceCatalog(c.Request.Context(), req.Entries)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, state)
}

// ResetSeedanceCatalog drops the saved catalog and restores the built-in one.
func (h *SettingHandler) ResetSeedanceCatalog(c *gin.Context) {
	state, err := h.settingService.ResetSeedanceCatalog(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, state)
}

// GetMiniMaxCatalog returns the saved MiniMax-H3 model catalog. Customized is
// false while the built-in catalog applies.
func (h *SettingHandler) GetMiniMaxCatalog(c *gin.Context) {
	state, err := h.settingService.GetMiniMaxCatalog(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, state)
}

// UpdateMiniMaxCatalog replaces the whole MiniMax-H3 catalog.
func (h *SettingHandler) UpdateMiniMaxCatalog(c *gin.Context) {
	var req struct {
		Entries []service.MiniMaxCatalogEntry `json:"entries"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid MiniMax catalog")
		return
	}
	state, err := h.settingService.SetMiniMaxCatalog(c.Request.Context(), req.Entries)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, state)
}

// ResetMiniMaxCatalog drops the saved catalog and restores the built-in one.
func (h *SettingHandler) ResetMiniMaxCatalog(c *gin.Context) {
	state, err := h.settingService.ResetMiniMaxCatalog(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, state)
}
