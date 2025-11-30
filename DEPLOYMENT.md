# 网站监控系统 - Cloudflare 完整部署指南

纯 Cloudflare 技术栈：**D1 数据库 + Workers API + KV 缓存 + Pages 前端**

## 技术架构

```
前端 (React + Vite)
     ↓
Cloudflare Pages
     ↓
Cloudflare Workers (API)
     ↓
Cloudflare D1 (SQLite) + KV (缓存)
```

## 前置准备

### 需要的工具

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

## 部署步骤

### 1. 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create website-monitor

# 记录输出的 database_id，更新到 wrangler.toml
```

### 2. 执行数据库迁移

```bash
wrangler d1 execute website-monitor --file=./schema.sql
```

### 3. 创建 KV 命名空间

```bash
# 创建 KV
wrangler kv:namespace create "MONITOR_KV"

# 记录输出的 id，更新到 wrangler.toml
```

### 4. 更新 wrangler.toml

```toml
[[kv_namespaces]]
binding = "MONITOR_KV"
id = "your_actual_kv_id"  # 替换

[[d1_databases]]
binding = "DB"
database_name = "website-monitor"
database_id = "your_actual_d1_id"  # 替换
```

### 5. 部署 Worker

```bash
wrangler deploy
```

记录输出的 Worker URL。

### 6. 部署前端

```bash
# 配置环境变量
echo "VITE_WORKER_URL=https://your-worker.workers.dev" > .env

# 构建
npm install
npm run build

# 部署到 Pages
wrangler pages deploy dist --project-name=website-monitor
```

## 验证部署

1. 访问前端 URL
2. 使用默认密码 `admin123` 登录
3. 添加第一个监控测试

## 常见问题

### D1 数据库连接失败

```bash
# 验证数据库
wrangler d1 list
wrangler d1 execute website-monitor --command="SELECT * FROM monitors"
```

### Worker 部署失败

检查 `wrangler.toml` 中的 KV ID 和 D1 ID 是否正确。

### 密码验证失败

重置默认密码：

```bash
wrangler d1 execute website-monitor --command="UPDATE admin_credentials SET password_hash = 'jGl25bVBBBW96Qi9Te4V37Fnqchz/Eu4qB9vKrRIqRg=' WHERE id = 1"
```

## 监控和维护

```bash
# 查看实时日志
wrangler tail

# 清理旧数据
wrangler d1 execute website-monitor --command="DELETE FROM monitor_checks WHERE checked_at < datetime('now', '-30 days')"
```

## 费用说明

Cloudflare 免费版足够使用：
- D1: 5GB 存储，每天 500 万次读取
- Workers: 每天 100,000 次请求
- KV: 每天 100,000 次读取，1,000 次写入
- Pages: 无限部署和带宽

对于 50 个以下的监控目标，完全免费！
