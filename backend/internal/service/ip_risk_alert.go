package service

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/iprisk"
)

const ipRiskAlertMaxListedUsers = 30

// NewIPRiskAlertNotifier delivers multi-account login alerts through the email
// address configured in 智能运维 → 账号运维 → 通知通道.
func NewIPRiskAlertNotifier(ops *AccountOpsService, keys *APIKeyService, settings *SettingService) func(context.Context, iprisk.MultiAccountAlert) {
	return func(ctx context.Context, alert iprisk.MultiAccountAlert) {
		if ops == nil || ops.email == nil {
			slog.Warn("ip_risk_alert_email_unavailable")
			return
		}
		recipient := ops.currentConfig().Recipient
		if recipient == "" {
			slog.Warn("ip_risk_alert_no_recipient", "hint", "configure the account-ops email notification channel")
			return
		}
		emails := map[int64]string{}
		if keys != nil && keys.userRepo != nil {
			for i, id := range alert.UserIDs {
				if i >= ipRiskAlertMaxListedUsers {
					break
				}
				if user, err := keys.userRepo.GetByID(ctx, id); err == nil && user != nil {
					emails[id] = user.Email
				}
			}
		}
		siteName, link := "Sub2API", ""
		if settings != nil {
			siteName = settings.GetSiteName(ctx)
			if base := strings.TrimRight(settings.GetFrontendURL(ctx), "/"); base != "" {
				link = base + "/admin/settings?tab=security#ip-risk-settings"
			}
		}
		subject, body := ipRiskAlertMessage(siteName, link, ops.timezone, alert, emails)
		if err := ops.email.SendEmail(ctx, recipient, subject, body); err != nil {
			slog.Warn("ip_risk_alert_send_failed", "network", alert.Network, "error", err)
			return
		}
		slog.Info("ip_risk_alert_sent", "network", alert.Network, "reason", alert.Reason)
	}
}

func ipRiskAlertMessage(siteName, link string, loc *time.Location, alert iprisk.MultiAccountAlert, emails map[int64]string) (string, string) {
	if loc == nil {
		loc = time.FixedZone("Asia/Shanghai", 8*3600)
	}
	rule, network := "同一 IP 登录多个账户", alert.Network
	if alert.Reason == "multi_account_subnet" {
		rule, network = "同一网段登录多个账户", alert.Subnet
	}
	outcome := "仅观察：已记录事件，未拦截登录"
	if !alert.Observed {
		outcome = "已拦截：本次登录被拒绝，该 IP 已自动封禁"
		if len(alert.Revoked) > 0 {
			outcome += fmt.Sprintf("，已撤销 %d 个账户的会话", len(alert.Revoked))
		}
	}
	accounts := make([]string, 0, len(alert.UserIDs))
	for i, id := range alert.UserIDs {
		if i >= ipRiskAlertMaxListedUsers {
			accounts = append(accounts, fmt.Sprintf("等共 %d 个", len(alert.UserIDs)))
			break
		}
		if email := emails[id]; email != "" {
			accounts = append(accounts, fmt.Sprintf("#%d %s", id, email))
		} else {
			accounts = append(accounts, fmt.Sprintf("#%d", id))
		}
	}
	fields := [][2]string{
		{"触发规则", rule},
		{"处理结果", outcome},
		{"客户端 IP", alert.IP},
		{"统计网段", network},
		{"涉及账户", strings.Join(accounts, "，")},
		{"触发时间", alert.At.In(loc).Format("2006-01-02 15:04:05 MST")},
		{"建议操作", "在后台 IP 风控中核对事件；确认是攻击后，提醒相关用户修改密码并检查 API Key；误判可在「当前自动封禁」中解封。"},
	}
	title := "安全告警：" + rule
	if alert.Observed {
		title += "（观察模式）"
	}
	body := "<h2>" + html.EscapeString(title) + "</h2><table style=\"border-collapse:collapse\">"
	for _, f := range fields {
		body += "<tr><th style=\"text-align:left;padding:8px\">" + html.EscapeString(f[0]) + "</th><td style=\"padding:8px\">" + html.EscapeString(f[1]) + "</td></tr>"
	}
	body += "</table>"
	if link != "" {
		body += "<p><a href=\"" + html.EscapeString(link) + "\">打开 IP 风控</a></p>"
	}
	body += "<p>同一 IP 在一个封禁周期内只通知一次，全站每小时最多 10 封。</p>"
	return "[" + siteName + "] " + title, body
}
