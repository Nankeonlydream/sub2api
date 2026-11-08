package keyrisk

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

func TestUserNoticeVisibilityPersistsAndReloads(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()
	s := &Service{DB: db}
	for _, enabled := range []bool{false, true} {
		cfg := DefaultConfig()
		cfg.UserNoticeEnabled = enabled
		raw, err := json.Marshal(cfg)
		require.NoError(t, err)
		mock.ExpectExec("UPDATE key_risk_control SET config").WithArgs(string(raw)).WillReturnResult(sqlmock.NewResult(0, 1))
		require.NoError(t, s.Save(context.Background(), cfg))
		mock.ExpectQuery("SELECT config FROM key_risk_control").WillReturnRows(sqlmock.NewRows([]string{"config"}).AddRow(raw))
		loaded, err := (&Service{DB: db}).Config(context.Background())
		require.NoError(t, err)
		require.Equal(t, cfg, loaded)
	}
	require.NoError(t, mock.ExpectationsWereMet())
}
