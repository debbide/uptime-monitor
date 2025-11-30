# 网站监控系统

纯 Cloudflare 技术栈的网站监控系统，支持定时检查、故障通知和实时状态追踪。

## 功能特性

- 实时网站状态监控
- 可自定义检查间隔（1-60分钟）
- 响应时间和可用率统计
- 故障自动检测和恢复通知
- Webhook通知支持（支持Slack、Discord等）
- 自定义Webhook模板和变量替换
- Webhook测试功能
- Cloudflare KV缓存，提升性能
- 管理员密码保护
- 响应式设计，支持移动端

## 技术栈

- **前端**: React + TypeScript + Vite
- **数据库**: Cloudflare D1 (SQLite)
- **缓存**: Cloudflare KV
- **API**: Cloudflare Workers
- **监控**: Cloudflare Workers Cron Triggers
- **部署**: Cloudflare Pages + Workers

## 快速开始

### 推荐：GitHub Actions 自动部署

最简单的部署方式，D1 和 KV 自动创建，一次配置，永久自动部署。

**查看指南**: [GITHUB_ACTIONS_DEPLOY.md](./GITHUB_ACTIONS_DEPLOY.md)

只需 3 个步骤：
1. 获取 Cloudflare API Token 和 Account ID，配置 GitHub Secrets
2. 首次 push 触发部署，自动创建 D1 和 KV 资源
3. 获取资源 ID，更新 `wrangler.toml` 并配置 Cron 触发器

完成后，每次 push 自动部署，D1 和 KV 自动管理！

### 其他部署方式

**网页界面部署**: [DEPLOYMENT.md](./DEPLOYMENT.md) - 方式一
**命令行部署**: [DEPLOYMENT.md](./DEPLOYMENT.md) - 方式二

## 本地开发

```bash
# 前端
npm install
npm run dev

# Worker (需要先配置 wrangler.toml)
wrangler dev
```

## 默认密码

- 用户名: admin
- 密码: `admin123`

**重要**: 首次登录后立即修改密码！

## 架构说明

```
Cloudflare Pages (前端)
         ↓
Cloudflare Workers (API + 定时任务)
         ↓
    ┌────┴────┐
    ↓         ↓
D1 数据库   KV 缓存
```

### Worker API 端点

- `GET /api/monitors` - 获取所有监控
- `POST /api/monitors` - 创建监控
- `DELETE /api/monitors/:id` - 删除监控
- `GET /api/checks?monitor_id=xxx` - 获取检查记录
- `GET /api/stats?monitor_id=xxx` - 获取统计数据
- `POST /api/test-webhook` - 测试 Webhook
- `POST /api/auth/verify` - 验证密码
- `POST /api/auth/change-password` - 修改密码
- `GET /trigger` - 手动触发监控检查

### Cron 任务

Worker 每 5 分钟自动执行一次监控检查。

## Webhook 配置

系统支持自定义 Webhook 通知，可配置：

- 请求头（Headers）
- 请求体（Body）
- Content-Type
- Basic 认证

### 可用变量

在 Webhook Body 中可使用以下变量：

- `{{monitor_name}}` - 监控名称
- `{{monitor_url}}` - 监控 URL
- `{{status}}` - 状态（down/recovered）
- `{{error}}` - 错误信息
- `{{timestamp}}` - 时间戳
- `{{response_time}}` - 响应时间
- `{{status_code}}` - HTTP 状态码

### Webhook 示例

**Slack**:
```json
{
  "text": "监控告警: {{monitor_name}} 状态变更为 {{status}}"
}
```

**Discord**:
```json
{
  "content": "🚨 {{monitor_name}} is {{status}}! Error: {{error}}"
}
```

## 数据库结构

### monitors 表
存储监控任务配置

### monitor_checks 表
存储每次检查的结果

### incidents 表
记录故障事件

### admin_credentials 表
管理员凭证

## 费用说明

Cloudflare 免费版额度：

- **D1**: 5GB 存储，每天 500 万次读取，10 万次写入
- **Workers**: 每天 100,000 次请求
- **KV**: 每天 100,000 次读取，1,000 次写入
- **Pages**: 无限部署和带宽

**对于 50 个以下的监控目标，完全免费！**

## 注意事项

- Worker Cron 每 5 分钟执行一次，免费版可能有轻微延迟
- D1 是 SQLite 数据库，适合中小规模应用
- KV 写入有每天 1,000 次限制，当前设计会接近但不超过此限制
- 建议定期清理 30 天前的检查记录

## 故障排查

查看 Worker 日志：
```bash
wrangler tail
```

查看数据库：
```bash
wrangler d1 execute website-monitor --command="SELECT * FROM monitors"
```

重置密码：
```bash
wrangler d1 execute website-monitor --command="UPDATE admin_credentials SET password_hash = 'jGl25bVBBBW96Qi9Te4V37Fnqchz/Eu4qB9vKrRIqRg=' WHERE id = 1"
```

## License

MIT
