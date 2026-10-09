package service

import (
	"context"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCreatorBuildRejectsUpstreamReplacement(t *testing.T) {
	// Nil clients ensure every entry point refuses replacement before any network or filesystem access.
	s := NewUpdateService(nil, nil, "2.10.2-creator.1", "release")
	ctx := context.Background()
	info, err := s.CheckUpdate(ctx, true)
	require.NoError(t, err)
	require.Equal(t, "2.10.2-creator.1", info.CurrentVersion)
	require.False(t, info.HasUpdate)
	require.ErrorIs(t, s.PerformUpdate(ctx), ErrCreatorBuildUpdate)
	require.ErrorIs(t, s.applyReleaseAssets(ctx, nil), ErrCreatorBuildUpdate)
	require.ErrorIs(t, s.Rollback(), ErrCreatorBuildUpdate)
	require.ErrorIs(t, s.RollbackToVersion(ctx, "2.10.1"), ErrCreatorBuildUpdate)
	versions, err := s.ListRollbackVersions(ctx)
	require.NoError(t, err)
	require.Empty(t, versions)
}
