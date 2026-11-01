package service

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/iprisk"
	"github.com/stretchr/testify/require"
)

type ipRiskAlertEmailStub struct {
	mu   sync.Mutex
	sent []string
}

func (s *ipRiskAlertEmailStub) SendEmail(_ context.Context, to, subject, body string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent = append(s.sent, to+"|"+subject+"|"+body)
	return nil
}

func TestIPRiskAlertUsesAccountOpsEmailChannel(t *testing.T) {
	email := &ipRiskAlertEmailStub{}
	ops := NewAccountOpsService(nil, nil, email)
	alert := iprisk.MultiAccountAlert{At: time.Unix(1792000000, 0), IP: "104.28.237.252", Network: "104.28.237.252/32", Subnet: "104.28.237.0/24",
		Reason: "multi_account_subnet", UserIDs: []int64{1, 2, 3}, Revoked: []int64{1, 2, 3}}

	notify := NewIPRiskAlertNotifier(ops, nil, nil)
	notify(context.Background(), alert)
	require.Empty(t, email.sent, "no recipient configured in the notification channel")

	ops.config.Store(AccountOpsConfig{Recipient: "admin@example.com"})
	notify(context.Background(), alert)
	require.Len(t, email.sent, 1)
	parts := strings.SplitN(email.sent[0], "|", 3)
	require.Equal(t, "admin@example.com", parts[0])
	require.Equal(t, "[Sub2API] 安全告警：同一网段登录多个账户", parts[1])
	require.Contains(t, parts[2], "104.28.237.0/24")
	require.Contains(t, parts[2], "已撤销 3 个账户的会话")
	require.Contains(t, parts[2], "#1，#2，#3")
}

func TestIPRiskAlertMessageEscapesAndMarksObservation(t *testing.T) {
	alert := iprisk.MultiAccountAlert{At: time.Unix(1792000000, 0), IP: "8.8.8.8", Network: "8.8.8.8/32", Subnet: "8.8.8.0/24",
		Reason: "multi_account_ip", Observed: true, UserIDs: []int64{7}}
	subject, body := ipRiskAlertMessage("<Site>", "https://example.com/admin/settings?tab=security#ip-risk-settings", nil, alert, map[int64]string{7: "<x>@example.com"})
	require.Equal(t, "[<Site>] 安全告警：同一 IP 登录多个账户（观察模式）", subject)
	require.Contains(t, body, "仅观察")
	require.Contains(t, body, "#7 &lt;x&gt;@example.com")
	require.NotContains(t, body, "<x>")
	require.Contains(t, body, "tab=security#ip-risk-settings")
}
