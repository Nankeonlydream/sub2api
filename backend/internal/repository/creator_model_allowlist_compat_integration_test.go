//go:build integration

package repository

import (
	"context"
	"testing"

	dbmigrations "github.com/Wei-Shaw/sub2api/migrations"
	"github.com/stretchr/testify/require"
)

func TestCreatorModelAllowlistRollingWrites(t *testing.T) {
	tx := testTx(t)
	ctx := context.Background()
	var id int64
	require.NoError(t, tx.QueryRowContext(ctx, `
INSERT INTO groups (name, platform, rate_multiplier, status, models_list_config)
VALUES ('creator-rolling-legacy', 'openai', 1, 'active', '{"enabled":true,"models":["legacy"]}')
RETURNING id`).Scan(&id))
	assertColumns := func(expected string) {
		t.Helper()
		var legacy, current string
		require.NoError(t, tx.QueryRowContext(ctx,
			"SELECT models_list_config::text, model_allowlist::text FROM groups WHERE id = $1", id).Scan(&legacy, &current))
		require.JSONEq(t, expected, legacy)
		require.JSONEq(t, expected, current)
	}
	assertColumns(`{"enabled":true,"models":["legacy"]}`)
	_, err := tx.ExecContext(ctx, "UPDATE groups SET model_allowlist = $1 WHERE id = $2", `{"enabled":true,"models":["new"]}`, id)
	require.NoError(t, err)
	assertColumns(`{"enabled":true,"models":["new"]}`)
	_, err = tx.ExecContext(ctx, "UPDATE groups SET models_list_config = '{}' WHERE id = $1", id)
	require.NoError(t, err)
	assertColumns(`{}`)

	_, err = tx.ExecContext(ctx, "SAVEPOINT conflicting_allowlists")
	require.NoError(t, err)
	_, err = tx.ExecContext(ctx, `UPDATE groups SET models_list_config = '{"enabled":true}', model_allowlist = '{"enabled":false}' WHERE id = $1`, id)
	require.ErrorContains(t, err, "Conflicting legacy and current")
	_, err = tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT conflicting_allowlists")
	require.NoError(t, err)
	assertColumns(`{}`)
}

func TestCreatorModelAllowlistMigrationPreservesLegacySchema(t *testing.T) {
	tx := testTx(t)
	ctx := context.Background()
	withoutCreatorModelAllowlistCompatibility(ctx, t, tx)
	_, err := tx.ExecContext(ctx, "ALTER TABLE groups RENAME COLUMN model_allowlist TO models_list_config")
	require.NoError(t, err)
	var id int64
	require.NoError(t, tx.QueryRowContext(ctx, `
INSERT INTO groups (name, platform, rate_multiplier, status, models_list_config)
VALUES ('creator-rolling-upgrade', 'openai', 1, 'active', '{"enabled":true,"models":["preserved"]}')
RETURNING id`).Scan(&id))
	for _, name := range []string{
		"235_creator_model_allowlist_compat.sql",
		"235_group_model_allowlist.sql",
		"236_group_model_allowlist_repair.sql",
		"235_creator_model_allowlist_compat.sql",
	} {
		migration, err := dbmigrations.FS.ReadFile(name)
		require.NoError(t, err)
		_, err = tx.ExecContext(ctx, string(migration))
		require.NoError(t, err, name)
	}
	var legacy, current string
	require.NoError(t, tx.QueryRowContext(ctx,
		"SELECT models_list_config::text, model_allowlist::text FROM groups WHERE id = $1", id).Scan(&legacy, &current))
	require.JSONEq(t, `{"enabled":true,"models":["preserved"]}`, legacy)
	require.JSONEq(t, legacy, current)
}
