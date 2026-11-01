package iprisk

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type revokeLog struct {
	mu      sync.Mutex
	calls   [][]int64
	handled int
}

func (l *revokeLog) last() []int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.calls) == 0 {
		return nil
	}
	return l.calls[len(l.calls)-1]
}

// multiAccountRouter mirrors the password login handler: admission runs after
// the password is verified and before a session would be issued.
func multiAccountRouter(t *testing.T, m *Manager) (*gin.Engine, *revokeLog) {
	t.Helper()
	log := &revokeLog{}
	r := gin.New()
	require.NoError(t, r.SetTrustedProxies(nil))
	r.Use(m.Middleware())
	r.POST("/api/v1/auth/login", func(c *gin.Context) {
		log.mu.Lock()
		log.handled++
		log.mu.Unlock()
		userID, _ := strconv.ParseInt(c.GetHeader("Test-User"), 10, 64)
		if admission := AdmitLogin(c, userID); admission.Blocked {
			log.mu.Lock()
			log.calls = append(log.calls, admission.Revoke)
			log.mu.Unlock()
			RejectLogin(c)
			return
		}
		c.Status(200)
	})
	return r, log
}

func loginAs(r http.Handler, ip string, userID int64) int {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	req.RemoteAddr = netip.AddrPortFrom(netip.MustParseAddr(ip), 1234).String()
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Test-User", strconv.FormatInt(userID, 10))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func enableMultiAccount(observe bool, ipLimit, subnetLimit int) func(*Config) {
	return func(c *Config) {
		c.MultiAccount = MultiAccountConfig{Enabled: true, ObserveOnly: observe, IPLimit: ipLimit, SubnetLimit: subnetLimit, WindowSeconds: 3600, RevokeSessions: true}
	}
}

func TestMultiAccountDisabledByDefault(t *testing.T) {
	m, _, _ := testManager(t, nil)
	require.False(t, m.cached.config.MultiAccount.Enabled)
	r, log := multiAccountRouter(t, m)
	for id := int64(1); id <= 5; id++ {
		require.Equal(t, 200, loginAs(r, "8.8.8.8", id))
	}
	require.Empty(t, log.calls)
}

func TestMultiAccountObserveRecordsWithoutBlocking(t *testing.T) {
	m, _, _ := testManager(t, enableMultiAccount(true, 3, 0))
	r, log := multiAccountRouter(t, m)
	for id := int64(1); id <= 4; id++ {
		require.Equal(t, 200, loginAs(r, "8.8.8.8", id))
	}
	require.Empty(t, log.calls)
	events, err := m.Events(context.Background(), "8.8.8.8", "multi_account_ip", "")
	require.NoError(t, err)
	require.Len(t, events, 2) // Third and fourth accounts.
	require.Equal(t, "would_ban", events[0].Decision)
	require.ElementsMatch(t, []int64{1, 2, 3, 4}, events[0].UserIDs)
	// Observation never writes an enforcing ban.
	bans, err := m.Bans(context.Background())
	require.NoError(t, err)
	require.Len(t, bans, 1)
	require.True(t, bans[0].ObserveOnly)
}

func TestMultiAccountEnforceBlocksBansAndRevokes(t *testing.T) {
	m, _, _ := testManager(t, enableMultiAccount(false, 3, 0))
	r, log := multiAccountRouter(t, m)
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 2))
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 2)) // Same account again is not a new account.
	require.Equal(t, 403, loginAs(r, "8.8.8.8", 3))
	require.ElementsMatch(t, []int64{1, 2, 3}, log.last())

	// The IP is now banned before password verification, so it is no oracle.
	handled := log.handled
	require.Equal(t, 429, loginAs(r, "8.8.8.8", 4))
	require.Equal(t, handled, log.handled)
	// Other clients are unaffected.
	require.Equal(t, 200, loginAs(r, "1.1.1.1", 1))

	events, err := m.Events(context.Background(), "8.8.8.8", "multi_account_ip", "")
	require.NoError(t, err)
	require.Len(t, events, 2) // Trigger, then the pre-authentication ban hit.
	require.Equal(t, "blocked", events[0].Decision)
	require.Equal(t, "auto_banned", events[1].Decision)
	require.Equal(t, 403, events[1].Status)
	require.ElementsMatch(t, []int64{1, 2, 3}, events[1].UserIDs)
}

func TestMultiAccountSubnetAggregationAndRevocationDedup(t *testing.T) {
	m, _, _ := testManager(t, enableMultiAccount(false, 0, 3))
	r, log := multiAccountRouter(t, m)
	require.Equal(t, 200, loginAs(r, "104.28.237.250", 1))
	require.Equal(t, 200, loginAs(r, "104.28.237.251", 2))
	require.Equal(t, 200, loginAs(r, "104.28.205.250", 9)) // Different /24.
	require.Equal(t, 403, loginAs(r, "104.28.237.252", 3))
	require.ElementsMatch(t, []int64{1, 2, 3}, log.last())

	// A further neighbour is rejected; already handled accounts are not re-kicked.
	require.Equal(t, 403, loginAs(r, "104.28.237.253", 4))
	require.Equal(t, []int64{4}, log.last())
	require.Equal(t, 200, loginAs(r, "104.28.205.251", 10))
}

func TestMultiAccountRulePrecedence(t *testing.T) {
	t.Run("global observation wins", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(false, 2, 0)(c); c.ObserveOnly = true })
		r, log := multiAccountRouter(t, m)
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 2))
		require.Empty(t, log.calls)
	})
	t.Run("whitelist is exempt", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(false, 2, 2)(c); c.Whitelist = []string{"8.8.8.0/24"} })
		r, log := multiAccountRouter(t, m)
		for id := int64(1); id <= 4; id++ {
			require.Equal(t, 200, loginAs(r, "8.8.8.8", id))
		}
		require.Empty(t, log.calls)
	})
	t.Run("revocation can be disabled", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(false, 2, 0)(c); c.MultiAccount.RevokeSessions = false })
		r, log := multiAccountRouter(t, m)
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
		require.Equal(t, 403, loginAs(r, "8.8.8.8", 2))
		require.Empty(t, log.last())
	})
	t.Run("global switch off disables the rule", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(false, 2, 0)(c); c.Enabled = false })
		r, log := multiAccountRouter(t, m)
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 2))
		require.Empty(t, log.calls)
	})
}

func TestMultiAccountUnbanAndWindowExpiry(t *testing.T) {
	m, server, _ := testManager(t, func(c *Config) {
		enableMultiAccount(false, 2, 3)(c)
		c.MultiAccount.WindowSeconds = 60
		c.BanSeconds = 60
	})
	r, _ := multiAccountRouter(t, m)
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
	require.Equal(t, 403, loginAs(r, "8.8.8.8", 2))
	require.NoError(t, m.Unban(context.Background(), "8.8.8.8"))
	// History for the IP and its /24 is forgotten with the ban.
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 5))

	require.Equal(t, 403, loginAs(r, "8.8.8.8", 6))
	server.FastForward(61 * time.Second)
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 7))
}

func alertSink(m *Manager) chan MultiAccountAlert {
	alerts := make(chan MultiAccountAlert, 64)
	m.SetMultiAccountNotifier(func(_ context.Context, alert MultiAccountAlert) { alerts <- alert })
	return alerts
}

func drainAlerts(alerts chan MultiAccountAlert, wait time.Duration) []MultiAccountAlert {
	var got []MultiAccountAlert
	deadline := time.After(wait)
	for {
		select {
		case alert := <-alerts:
			got = append(got, alert)
		case <-deadline:
			return got
		}
	}
}

func TestMultiAccountNotifiesOncePerBan(t *testing.T) {
	t.Run("observation", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(true, 3, 0)(c); c.MultiAccount.NotifyAdmin = true })
		alerts := alertSink(m)
		r, _ := multiAccountRouter(t, m)
		for id := int64(1); id <= 5; id++ {
			require.Equal(t, 200, loginAs(r, "8.8.8.8", id))
		}
		got := drainAlerts(alerts, 300*time.Millisecond)
		require.Len(t, got, 1)
		require.True(t, got[0].Observed)
		require.Equal(t, "multi_account_ip", got[0].Reason)
		require.Equal(t, "8.8.8.8", got[0].IP)
		require.Equal(t, "8.8.8.0/24", got[0].Subnet)
		require.ElementsMatch(t, []int64{1, 2, 3}, got[0].UserIDs)
		require.Empty(t, got[0].Revoked)
	})
	t.Run("enforcement", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(false, 0, 3)(c); c.MultiAccount.NotifyAdmin = true })
		alerts := alertSink(m)
		r, _ := multiAccountRouter(t, m)
		require.Equal(t, 200, loginAs(r, "104.28.237.250", 1))
		require.Equal(t, 200, loginAs(r, "104.28.237.251", 2))
		require.Equal(t, 403, loginAs(r, "104.28.237.252", 3))
		require.Equal(t, 429, loginAs(r, "104.28.237.252", 4)) // Banned before verification; no new alert.
		require.Equal(t, 403, loginAs(r, "104.28.237.253", 5)) // A new IP is a new ban, so one more alert.
		got := drainAlerts(alerts, 300*time.Millisecond)
		require.Len(t, got, 2)
		byIP := map[string]MultiAccountAlert{} // Delivery is asynchronous; order is not guaranteed.
		for _, alert := range got {
			byIP[alert.IP] = alert
		}
		first := byIP["104.28.237.252"]
		require.False(t, first.Observed)
		require.Equal(t, "multi_account_subnet", first.Reason)
		require.Equal(t, "104.28.237.0/24", first.Subnet)
		require.ElementsMatch(t, []int64{1, 2, 3}, first.Revoked)
		require.Equal(t, []int64{5}, byIP["104.28.237.253"].Revoked)
	})
	t.Run("switch off", func(t *testing.T) {
		m, server, _ := testManager(t, func(c *Config) { enableMultiAccount(true, 2, 0)(c); c.MultiAccount.NotifyAdmin = false })
		alerts := alertSink(m)
		r, _ := multiAccountRouter(t, m)
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
		require.Equal(t, 200, loginAs(r, "8.8.8.8", 2))
		require.Empty(t, drainAlerts(alerts, 200*time.Millisecond))
		require.False(t, server.Exists(modePrefix(true)+"multi_account:alerts"))
	})
	t.Run("hourly cap", func(t *testing.T) {
		m, _, _ := testManager(t, func(c *Config) { enableMultiAccount(true, 2, 0)(c); c.MultiAccount.NotifyAdmin = true })
		alerts := alertSink(m)
		r, _ := multiAccountRouter(t, m)
		for i := 1; i <= maxMultiAccountAlertsPerHour+3; i++ {
			ip := "8.8." + strconv.Itoa(i) + ".1"
			require.Equal(t, 200, loginAs(r, ip, int64(i*10)))
			require.Equal(t, 200, loginAs(r, ip, int64(i*10+1)))
		}
		require.Len(t, drainAlerts(alerts, 300*time.Millisecond), maxMultiAccountAlertsPerHour)
	})
}

func TestMultiAccountRedisOutageFailsOpen(t *testing.T) {
	m, server, _ := testManager(t, func(c *Config) { enableMultiAccount(false, 2, 0)(c); c.ObserveOnly = true })
	r, _ := multiAccountRouter(t, m)
	server.Close()
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 1))
	require.Equal(t, 200, loginAs(r, "8.8.8.8", 2))
}

func TestMultiAccountConfigValidationAndOldSavedPolicy(t *testing.T) {
	c := DefaultConfig()
	c.MultiAccount = MultiAccountConfig{}
	normalized, err := NormalizeConfig(c)
	require.NoError(t, err)
	require.Equal(t, defaultMultiAccountConfig(), normalized.MultiAccount)
	require.False(t, normalized.MultiAccount.Enabled)
	require.True(t, normalized.MultiAccount.ObserveOnly)
	require.True(t, normalized.MultiAccount.NotifyAdmin)
	for _, change := range []func(*MultiAccountConfig){
		func(c *MultiAccountConfig) { c.IPLimit = 1 }, func(c *MultiAccountConfig) { c.SubnetLimit = 1001 },
		func(c *MultiAccountConfig) { c.WindowSeconds = 59 }, func(c *MultiAccountConfig) { c.WindowSeconds = 604801 },
	} {
		c := DefaultConfig()
		change(&c.MultiAccount)
		_, err := NormalizeConfig(c)
		require.Error(t, err)
	}
	require.Equal(t, "104.28.237.0/24", subnetNetwork(netip.MustParseAddr("104.28.237.250")))
	require.Equal(t, "2001:db8:abcd::/48", subnetNetwork(netip.MustParseAddr("2001:db8:abcd:12::1")))
}
