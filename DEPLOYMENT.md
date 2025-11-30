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

## 方式一：网页界面部署（推荐）

### D1 数据库变量配置

根据 `wrangler.toml` 配置，需要设置的变量名为：
- **Binding 名称**: `DB`
- **数据库名称**: `website-monitor`

### 完整部署步骤

#### 1. 创建 D1 数据库

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单选择 **Workers & Pages** → **D1**
3. 点击 **Create database**
4. 数据库名称输入: `website-monitor`
5. 点击创建，**记录生成的 Database ID**

#### 2. 初始化数据库表

1. 进入刚创建的 `website-monitor` 数据库
2. 点击 **Console** 标签
3. 复制项目根目录 `schema.sql` 文件的所有内容粘贴到控制台
4. 点击 **Execute** 执行

#### 3. 创建 KV 命名空间

1. 左侧菜单选择 **Workers & Pages** → **KV**
2. 点击 **Create namespace**
3. 命名空间名称输入: `MONITOR_KV`
4. 点击添加，**记录生成的 Namespace ID**

#### 4. 部署 Worker

1. 左侧菜单选择 **Workers & Pages** → **Overview**
2. 点击 **Create application** → **Create Worker**
3. Worker 名称输入: `website-monitor`
4. 点击 **Deploy**
5. 部署后点击 **Edit code**
6. 删除默认代码，粘贴 `workers/monitor.ts` 的全部内容
7. 点击 **Save and Deploy**

#### 5. 绑定资源到 Worker

在 Worker 设置页面：

**绑定 D1 数据库：**
1. 点击 **Settings** → **Variables**
2. 滚动到 **D1 Database Bindings**
3. 点击 **Add binding**
4. Variable name: `DB`
5. D1 database: 选择 `website-monitor`
6. 点击 **Save**

**绑定 KV 命名空间：**
1. 在同一页面滚动到 **KV Namespace Bindings**
2. 点击 **Add binding**
3. Variable name: `MONITOR_KV`
4. KV namespace: 选择 `MONITOR_KV`
5. 点击 **Save**

#### 6. 设置 Cron 触发器

1. Worker 设置页面点击 **Triggers** 标签
2. 滚动到 **Cron Triggers**
3. 点击 **Add Cron Trigger**
4. Cron 表达式输入: `*/5 * * * *` (每 5 分钟执行一次)
5. 点击 **Add Trigger**

#### 7. 部署前端到 Pages

1. 左侧菜单选择 **Workers & Pages** → **Create application**
2. 选择 **Pages** → **Connect to Git**
3. 授权并选择 GitHub 仓库 `uptime-monitor`
4. 配置构建设置：
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. 添加环境变量：
   - Variable name: `VITE_WORKER_URL`
   - Value: `https://website-monitor.你的账号.workers.dev` (填入步骤 4 中 Worker 的实际 URL)
6. 点击 **Save and Deploy**

**重要提示**：所有变量名必须完全匹配：
- D1 Binding: `DB`
- KV Binding: `MONITOR_KV`
- 环境变量: `VITE_WORKER_URL`

---

## 方式二：命令行部署

### 前置准备

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

### 部署步骤

#### 1. 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create website-monitor

# 记录输出的 database_id，更新到 wrangler.toml
```

#### 2. 执行数据库迁移

```bash
wrangler d1 execute website-monitor --file=./schema.sql
```

#### 3. 创建 KV 命名空间

```bash
# 创建 KV
wrangler kv:namespace create "MONITOR_KV"

# 记录输出的 id，更新到 wrangler.toml
```

#### 4. 更新 wrangler.toml

```toml
[[kv_namespaces]]
binding = "MONITOR_KV"
id = "your_actual_kv_id"  # 替换

[[d1_databases]]
binding = "DB"
database_name = "website-monitor"
database_id = "your_actual_d1_id"  # 替换
```

#### 5. 部署 Worker

```bash
wrangler deploy
```

记录输出的 Worker URL。

#### 6. 部署前端

```bash
# 配置环境变量
echo "VITE_WORKER_URL=https://your-worker.workers.dev" > .env

# 构建
npm install
npm run build

# 部署到 Pages
wrangler pages deploy dist --project-name=website-monitor
```

---

## GitHub Actions Webhook 集成

系统的 webhook 功能支持触发 GitHub Actions。配置示例：

### 方式 1: Repository Dispatch Events

在添加监控时配置：

**Webhook URL**:
```
https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches
```

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_GITHUB_TOKEN",
  "Accept": "application/vnd.github.v3+json"
}
```

**Body**:
```json
{
  "event_type": "monitor_alert",
  "client_payload": {
    "monitor": "{{monitor_name}}",
    "url": "{{monitor_url}}",
    "status": "{{status}}",
    "error": "{{error}}",
    "timestamp": "{{timestamp}}"
  }
}
```

### 方式 2: Workflow Dispatch

**Webhook URL**:
```
https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/actions/workflows/WORKFLOW_ID/dispatches
```

**Headers**: 同上

**Body**:
```json
{
  "ref": "main",
  "inputs": {
    "monitor_name": "{{monitor_name}}",
    "monitor_status": "{{status}}"
  }
}
```

### 支持的变量

- `{{monitor_name}}` - 监控名称
- `{{monitor_url}}` - 监控 URL
- `{{status}}` - down 或 recovered
- `{{error}}` - 错误信息
- `{{timestamp}}` - 时间戳
- `{{response_time}}` - 响应时间
- `{{status_code}}` - HTTP 状态码

---

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
