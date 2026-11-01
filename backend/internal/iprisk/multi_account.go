package iprisk

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/netip"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const (
	loginContextKey = "sub2api.ip_risk_login"
	loginResultKey  = "sub2api.ip_risk_login_result"
	maxEventUserIDs = 100
	// Bounds alert mail when an attacker rotates through many IPs.
	maxMultiAccountAlertsPerHour = 10
)

// loginContext is bound by the middleware for login requests that passed every
// pre-authentication rule; handlers consume it once the password is verified.
type loginContext struct {
	manager *Manager
	config  Config
	address netip.Addr
	network string
}

type loginResult struct {
	reason   string
	observed bool
	userIDs  []int64
}

// LoginAdmission tells a credential handler whether to issue a session.
type LoginAdmission struct {
	Blocked bool
	Revoke  []int64 // Accounts whose existing sessions must be revoked.
}

// subnetNetwork aggregates neighbours an attacker can rotate through cheaply.
func subnetNetwork(ip netip.Addr) string {
	ip = ip.Unmap()
	bits := 24
	if ip.Is6() {
		bits = 48
	}
	return netip.PrefixFrom(ip, bits).Masked().String()
}

func multiAccountObserve(c Config) bool { return c.ObserveOnly || c.MultiAccount.ObserveOnly }

// Scores are milliseconds. A member is revoked again only if it logged in after
// its last revocation, so repeated triggers never re-kick already handled users
// but still catch sessions created since then.
var multiAccountScript = redis.NewScript(`
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local cutoff = now - window * 1000
local function track(key)
  redis.call('ZADD', key, now, ARGV[3])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
  redis.call('ZREMRANGEBYRANK', key, 0, -1001)
  redis.call('EXPIRE', key, window)
  return redis.call('ZCARD', key)
end
local ipCount = track(KEYS[1])
local subnetCount = track(KEYS[2])
local hit, hitKey, payload = '', nil, nil
if tonumber(ARGV[5]) > 0 and subnetCount >= tonumber(ARGV[5]) then
  hit, hitKey, payload = 'multi_account_subnet', KEYS[2], ARGV[7]
elseif tonumber(ARGV[4]) > 0 and ipCount >= tonumber(ARGV[4]) then
  hit, hitKey, payload = 'multi_account_ip', KEYS[1], ARGV[6]
end
if hit == '' then return {'', {}, {}, 0} end
local members = redis.call('ZRANGE', hitKey, 0, -1, 'WITHSCORES')
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', cutoff)
local ids, revoke = {}, {}
for i = 1, #members, 2 do
  local member, at = members[i], tonumber(members[i + 1])
  table.insert(ids, member)
  local revokedAt = redis.call('ZSCORE', KEYS[3], member)
  if not revokedAt or tonumber(revokedAt) < at then
    table.insert(revoke, member)
    redis.call('ZADD', KEYS[3], now, member)
  end
end
redis.call('ZREMRANGEBYRANK', KEYS[3], 0, -10001)
redis.call('EXPIRE', KEYS[3], window)
-- Notify once per fresh ban, with a site-wide hourly cap shared by all nodes.
local notify = 0
if not redis.call('GET', KEYS[4]) then
  redis.call('SET', KEYS[4], payload, 'EX', ARGV[8])
  redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', ARGV[9])
  redis.call('ZADD', KEYS[5], ARGV[10], ARGV[11])
  redis.call('EXPIRE', KEYS[5], 604800)
  if ARGV[12] == '1' then
    local sent = redis.call('INCR', KEYS[6])
    if sent == 1 then redis.call('EXPIRE', KEYS[6], 3600) end
    if sent <= tonumber(ARGV[13]) then notify = 1 end
  end
end
return {hit, ids, revoke, notify}
`)

func multiAccountKeys(prefix, network, subnet string) []string {
	return []string{
		prefix + hashNetwork(network) + ":multi_account_ip",
		prefix + hashNetwork(subnet) + ":multi_account_subnet",
		prefix + "multi_account:revoked",
		prefix + hashNetwork(network) + ":ban",
		prefix + "bans",
		prefix + "multi_account:alerts",
	}
}

type multiAccountHit struct {
	reason  string
	members []int64
	revoke  []int64
	notify  bool
}

func (m *Manager) countLoginAccount(ctx context.Context, c Config, address netip.Addr, network string, userID int64, observe bool) (multiAccountHit, error) {
	if m.redis == nil {
		return multiAccountHit{}, errors.New("redis unavailable")
	}
	prefix := modePrefix(observe)
	now := time.Now()
	expires := now.Unix() + int64(c.BanSeconds)
	payload := func(reason string) string {
		encoded, _ := json.Marshal(struct {
			Ban
			Generation string `json:"generation"`
		}{Ban: Ban{Network: network, Reason: reason, CreatedAt: now.Unix(), ExpiresAt: expires, ObserveOnly: observe}, Generation: uuid.NewString()})
		return string(encoded)
	}
	ma := c.MultiAccount
	notify := "0"
	if ma.NotifyAdmin {
		notify = "1"
	}
	var raw []any
	err := m.riskRedis(ctx, func(budget context.Context) error {
		var runErr error
		raw, runErr = multiAccountScript.Run(budget, m.redis, multiAccountKeys(prefix, network, subnetNetwork(address)),
			now.UnixMilli(), ma.WindowSeconds, userID, ma.IPLimit, ma.SubnetLimit,
			payload("multi_account_ip"), payload("multi_account_subnet"), c.BanSeconds, now.Unix(), expires, network,
			notify, maxMultiAccountAlertsPerHour).Slice()
		return runErr
	})
	if err != nil {
		return multiAccountHit{}, err
	}
	if len(raw) != 4 {
		return multiAccountHit{}, errors.New("unexpected multi-account result")
	}
	reason, _ := raw[0].(string)
	sent, _ := raw[3].(int64)
	return multiAccountHit{reason: reason, members: parseUserIDs(raw[1]), revoke: parseUserIDs(raw[2]), notify: sent == 1}, nil
}

// MultiAccountAlert describes a fresh multi-account trigger for administrators.
type MultiAccountAlert struct {
	At       time.Time
	IP       string
	Network  string // Exact counting network of the client.
	Subnet   string // IPv4 /24 or IPv6 /48 aggregate.
	Reason   string // multi_account_ip or multi_account_subnet.
	Observed bool   // True when only recorded, not blocked.
	UserIDs  []int64
	Revoked  []int64
}

// SetMultiAccountNotifier installs the delivery used for administrator alerts.
// It runs asynchronously and never affects the login outcome.
func (m *Manager) SetMultiAccountNotifier(notify func(context.Context, MultiAccountAlert)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.multiAccountAlert = notify
}

func (m *Manager) dispatchMultiAccountAlert(alert MultiAccountAlert) {
	m.mu.Lock()
	notify := m.multiAccountAlert
	m.mu.Unlock()
	if notify == nil {
		slog.Warn("IP risk multi-account alert has no notifier configured")
		return
	}
	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("IP risk multi-account alert panicked", "panic", recovered)
			}
		}()
		ctx, cancel := context.WithTimeout(m.ctx, 30*time.Second)
		defer cancel()
		notify(ctx, alert)
	}()
}

func parseUserIDs(value any) []int64 {
	items, _ := value.([]any)
	ids := make([]int64, 0, len(items))
	for _, item := range items {
		raw, _ := item.(string)
		if id, err := strconv.ParseInt(raw, 10, 64); err == nil && id > 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

// AdmitLogin is called by credential handlers after the password is verified
// and before a session is issued. It is silent below the threshold and fails
// open when Redis is unavailable, so ordinary users never notice it.
func AdmitLogin(c *gin.Context, userID int64) LoginAdmission {
	value, _ := c.Get(loginContextKey)
	lc, ok := value.(*loginContext)
	if !ok || userID <= 0 {
		return LoginAdmission{}
	}
	ma := lc.config.MultiAccount
	if !ma.Enabled || (ma.IPLimit == 0 && ma.SubnetLimit == 0) {
		return LoginAdmission{}
	}
	observe := multiAccountObserve(lc.config)
	ctx, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 500*time.Millisecond)
	defer cancel()
	hit, err := lc.manager.countLoginAccount(ctx, lc.config, lc.address, lc.network, userID, observe)
	if err != nil {
		slog.Warn("IP risk multi-account check unavailable; login allowed")
		return LoginAdmission{}
	}
	if hit.reason == "" {
		return LoginAdmission{}
	}
	members := hit.members
	if len(members) > maxEventUserIDs {
		members = members[:maxEventUserIDs]
	}
	c.Set(loginResultKey, &loginResult{reason: hit.reason, observed: observe, userIDs: members})
	admission := LoginAdmission{Blocked: !observe}
	if !observe && ma.RevokeSessions {
		admission.Revoke = hit.revoke
	}
	if hit.notify {
		lc.manager.dispatchMultiAccountAlert(MultiAccountAlert{At: time.Now(), IP: lc.address.String(), Network: lc.network,
			Subnet: subnetNetwork(lc.address), Reason: hit.reason, Observed: observe, UserIDs: members, Revoked: admission.Revoke})
	}
	return admission
}

// RejectLogin writes the same response as other IP risk denials.
func RejectLogin(c *gin.Context) { reject(c, 403, 0) }

func multiAccountLoginResult(c *gin.Context) *loginResult {
	value, _ := c.Get(loginResultKey)
	result, _ := value.(*loginResult)
	return result
}
