# GitHub Actions 自动部署指南

使用 GitHub Actions 全自动部署到 Cloudflare，D1 数据库和 KV 自动创建。

## 一次性配置步骤（只需 4 步）

### 1. 获取 Cloudflare 凭证

#### 获取 API Token

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 点击右上角头像 → **My Profile**
3. 左侧选择 **API Tokens**
4. 点击 **Create Token**
5. 使用 **Edit Cloudflare Workers** 模板
6. 权限设置：
   - Account → D1 → Edit
   - Account → Workers Scripts → Edit
   - Account → Workers KV Storage → Edit
   - Zone → Workers Routes → Edit
7. 点击 **Continue to summary** → **Create Token**
8. **复制并保存** Token（只显示一次）

#### 获取 Account ID

1. 在 Cloudflare Dashboard 首页
2. 右侧可以看到 **Account ID**
3. 点击复制

### 2. 配置 GitHub Secrets

1. 进入 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，添加以下密钥：

| 名称 | 值 | 说明 |
|------|-----|------|
| `CLOUDFLARE_API_TOKEN` | 步骤 1 获取的 API Token | Cloudflare API 访问令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 1 获取的 Account ID | Cloudflare 账户 ID |
| `WORKER_URL` | 留空或填 `https://website-monitor.你的账号.workers.dev` | Worker URL（部署后更新） |

### 3. 更新 wrangler.toml

在 `wrangler.toml` 文件中需要填入资源 ID：

#### 获取 D1 Database ID

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **D1**
2. 找到 `website-monitor` 数据库（首次部署会自动创建）
3. 点击进入，复制 **Database ID**

#### 获取 KV Namespace ID

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **KV**
2. 找到 `MONITOR_KV` 命名空间（首次部署会自动创建）
3. 复制 **Namespace ID**

#### 更新配置文件

编辑 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "MONITOR_KV"
id = "你的_kv_namespace_id"  # 替换为实际值

[[d1_databases]]
binding = "DB"
database_name = "website-monitor"
database_id = "你的_d1_database_id"  # 替换为实际值
```

提交并推送：

```bash
git add wrangler.toml
git commit -m "Update Cloudflare resource IDs"
git push
```

### 4. 配置 Worker Cron 触发器

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **Workers & Pages** → 找到 `website-monitor`
3. 点击 **Triggers** 标签
4. 滚动到 **Cron Triggers**
5. 点击 **Add Cron Trigger**
6. 输入：`*/5 * * * *`（每 5 分钟）
7. 点击 **Add Trigger**

### 可选：更新 Worker URL Secret

如果需要精确的 Worker URL：

1. 在 Cloudflare Dashboard 的 Worker 页面，复制完整 Worker URL
2. 返回 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
3. 编辑 `WORKER_URL` Secret，填入实际的 Worker URL
4. 保存

---

## 日常使用

### 自动部署

每次推送代码到 `main` 分支，GitHub Actions 会自动：
1. 检查并创建 D1 数据库（如不存在）
2. 应用数据库 Schema
3. 检查并创建 KV 命名空间（如不存在）
4. 构建前端
5. 部署 Worker
6. 部署到 Pages

查看部署状态：
- GitHub 仓库 → **Actions** 标签
- 查看最新的 workflow 运行状态

### 手动触发部署

1. GitHub 仓库 → **Actions** 标签
2. 左侧选择 **Deploy to Cloudflare**
3. 点击 **Run workflow** → **Run workflow**

---

## 工作流程说明

### deploy.yml（主部署流程）

自动执行以下操作：

1. **Setup D1 Database**: 尝试创建 D1 数据库（如已存在则跳过）
2. **Apply Database Schema**: 执行数据库迁移脚本
3. **Setup KV Namespace**: 尝试创建 KV 命名空间（如已存在则跳过）
4. **Build & Deploy**: 构建前端并部署 Worker 和 Pages

所有资源创建步骤都使用 `continue-on-error: true`，确保即使资源已存在也不会中断部署流程。

### setup-database.yml（已废弃）

此 workflow 现已不需要手动运行，所有初始化操作已集成到 `deploy.yml` 中。

---

## 常见问题

### Q: Database ID 或 KV ID 在哪里查看？

**D1 Database ID**:
1. Cloudflare Dashboard → **Workers & Pages** → **D1**
2. 点击 `website-monitor` 数据库
3. 右侧显示 **Database ID**

**KV Namespace ID**:
1. Cloudflare Dashboard → **Workers & Pages** → **KV**
2. 找到 `MONITOR_KV` 命名空间
3. 右侧显示 **Namespace ID**

### Q: Actions 执行失败怎么办？

1. 检查 GitHub Secrets 是否正确配置
2. 确认 API Token 权限是否足够
3. 查看 Actions 日志中的具体错误信息

### Q: 如何查看部署后的网站？

**Pages URL**:
1. Cloudflare Dashboard → **Workers & Pages**
2. 找到 `website-monitor` Pages 项目
3. 点击进入，查看部署的 URL

**Worker URL**:
1. Cloudflare Dashboard → **Workers & Pages**
2. 找到 `website-monitor` Worker
3. 点击进入，在 **Triggers** 标签查看 URL

### Q: 需要更新数据库表结构？

```bash
# 本地执行（需要安装 wrangler）
wrangler d1 execute website-monitor --file=./schema.sql
```

或在 Cloudflare Dashboard 的 D1 Console 中直接执行 SQL。

---

## Workflow 文件说明

### deploy.yml
- 自动触发：推送到 `main` 分支
- 手动触发：Actions 页面手动运行
- 功能：构建并部署 Worker 和 Pages

### setup-database.yml
- 仅手动触发
- 功能：创建 D1 数据库和 KV 命名空间
- 用途：初始化环境（只需运行一次）

---

## 总结

完成上述 6 个步骤后，你的部署流程如下：

```
修改代码 → git push → GitHub Actions 自动部署 → 完成！
```

无需任何手动操作，完全自动化。
