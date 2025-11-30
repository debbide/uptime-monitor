# GitHub Actions 自动部署指南

使用 GitHub Actions 自动部署到 Cloudflare，无需手动操作。

## 一次性配置步骤

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
2. 点击 **New repository secret**，添加以下 3 个密钥：

| 名称 | 值 | 说明 |
|------|-----|------|
| `CLOUDFLARE_API_TOKEN` | 步骤 1 获取的 API Token | Cloudflare API 访问令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 1 获取的 Account ID | Cloudflare 账户 ID |
| `WORKER_URL` | `https://website-monitor.你的账号.workers.dev` | Worker URL（首次留空，稍后更新） |

### 3. 初始化数据库（仅运行一次）

1. 进入 GitHub 仓库 → **Actions** 标签
2. 左侧选择 **Setup Database (Run Once)**
3. 点击 **Run workflow** → **Run workflow**
4. 等待执行完成
5. 查看日志，记录输出的：
   - D1 Database ID
   - KV Namespace ID

### 4. 更新 wrangler.toml

在 `wrangler.toml` 文件中更新步骤 3 获取的 ID：

```toml
[[kv_namespaces]]
binding = "MONITOR_KV"
id = "你的_kv_namespace_id"  # 替换为实际值

[[d1_databases]]
binding = "DB"
database_name = "website-monitor"
database_id = "你的_d1_database_id"  # 替换为实际值
```

提交并推送更改：

```bash
git add wrangler.toml
git commit -m "Update Cloudflare resource IDs"
git push
```

### 5. 配置 Worker Cron 触发器（仅设置一次）

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **Workers & Pages** → 找到 `website-monitor`
3. 点击 **Triggers** 标签
4. 滚动到 **Cron Triggers**
5. 点击 **Add Cron Trigger**
6. 输入：`*/5 * * * *`（每 5 分钟）
7. 点击 **Add Trigger**

### 6. 更新 Worker URL Secret

1. 在 Cloudflare Dashboard 的 Worker 页面，复制 Worker URL
2. 返回 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
3. 编辑 `WORKER_URL` Secret，填入实际的 Worker URL
4. 保存

---

## 日常使用

### 自动部署

现在每次推送代码到 `main` 分支，GitHub Actions 会自动：
1. 构建前端
2. 部署 Worker
3. 部署到 Pages

查看部署状态：
- GitHub 仓库 → **Actions** 标签
- 查看最新的 workflow 运行状态

### 手动触发部署

1. GitHub 仓库 → **Actions** 标签
2. 左侧选择 **Deploy to Cloudflare**
3. 点击 **Run workflow** → **Run workflow**

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
