# GitHub Actions 自动部署指南

使用 GitHub Actions 全自动部署到 Cloudflare，所有配置通过 GitHub Secrets 管理。

## 一次性配置步骤（2 步完成）

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
   - Account → Cloudflare Pages → Edit
7. 点击 **Continue to summary** → **Create Token**
8. **复制并保存** Token（只显示一次）

#### 获取 Account ID

1. 在 Cloudflare Dashboard 首页
2. 右侧可以看到 **Account ID**
3. 点击复制

### 2. 配置 GitHub Secrets（一次性设置）

#### 步骤 2.1：首次配置基础 Secrets

1. 进入 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，添加以下 2 个密钥：

| 名称 | 值 | 说明 |
|------|-----|------|
| `CLOUDFLARE_API_TOKEN` | 步骤 1 获取的 API Token | Cloudflare API 访问令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 1 获取的 Account ID | Cloudflare 账户 ID |

3. 推送代码到 `main` 分支触发首次部署
4. GitHub Actions 会自动创建 D1 数据库和 KV 命名空间
5. **首次部署会使用仓库中的 wrangler.toml**（ID 为占位符），这是正常的

#### 步骤 2.2：获取资源 ID 并添加到 Secrets

首次部署完成后，获取自动创建的资源 ID：

**获取 D1 Database ID：**
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **D1**
2. 找到 `website-monitor` 数据库
3. 点击进入，复制 **Database ID**

**获取 KV Namespace ID：**
1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **KV**
2. 找到 `MONITOR_KV` 命名空间
3. 复制 **Namespace ID**

**添加资源 ID 到 GitHub Secrets：**

返回 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**，添加以下密钥：

| 名称 | 值 | 说明 |
|------|-----|------|
| `D1_DATABASE_ID` | 刚才复制的 D1 Database ID | D1 数据库 ID |
| `KV_NAMESPACE_ID` | 刚才复制的 KV Namespace ID | KV 命名空间 ID |
| `WORKER_URL` | `https://website-monitor.你的账号.workers.dev` | Worker URL（可选） |

**触发重新部署：**

配置完成后，推送任意更改或手动触发 GitHub Actions（Actions 标签 → Deploy to Cloudflare → Run workflow），这次部署会使用 Secrets 中的 ID 动态生成正确的 `wrangler.toml`。

#### 步骤 2.3：配置 Cron 触发器（仅一次）

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **Workers & Pages** → 找到 `website-monitor` Worker
3. 点击 **Triggers** 标签
4. 滚动到 **Cron Triggers** 部分
5. 点击 **Add Cron Trigger**
6. 输入：`*/5 * * * *`（每 5 分钟执行一次）
7. 点击 **Add Trigger**

完成！现在推送代码会自动部署，无需手动修改 `wrangler.toml`。

---

## 日常使用

### 自动部署

每次推送代码到 `main` 分支，GitHub Actions 会自动：
1. 检查并创建 D1 数据库（如不存在）
2. 应用数据库 Schema
3. 检查并创建 KV 命名空间（如不存在）
4. 从 GitHub Secrets 动态生成 `wrangler.toml`
5. 构建前端
6. 部署 Worker
7. 部署到 Pages

查看部署状态：
- GitHub 仓库 → **Actions** 标签
- 查看最新的 workflow 运行状态

### 手动触发部署

1. GitHub 仓库 → **Actions** 标签
2. 左侧选择 **Deploy to Cloudflare**
3. 点击 **Run workflow** → **Run workflow**

---

## GitHub Secrets 总览

完整配置需要以下 5 个 Secrets：

| 名称 | 必需 | 何时添加 | 说明 |
|------|------|---------|------|
| `CLOUDFLARE_API_TOKEN` | 是 | 首次配置 | Cloudflare API 访问令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | 首次配置 | Cloudflare 账户 ID |
| `D1_DATABASE_ID` | 是 | 首次部署后 | D1 数据库 ID |
| `KV_NAMESPACE_ID` | 是 | 首次部署后 | KV 命名空间 ID |
| `WORKER_URL` | 否 | 首次部署后 | Worker URL（用于前端 API 调用） |

---

## 工作流程说明

### deploy.yml（主部署流程）

自动执行以下操作：

1. **Setup D1 Database**: 尝试创建 D1 数据库（如已存在则跳过）
2. **Apply Database Schema**: 执行数据库迁移脚本
3. **Setup KV Namespace**: 尝试创建 KV 命名空间（如已存在则跳过）
4. **Generate wrangler.toml**: 从 GitHub Secrets 动态生成配置文件
5. **Build & Deploy**: 构建前端并部署 Worker 和 Pages

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

### Q: 为什么要在 Secrets 中配置 ID 而不是 wrangler.toml？

- **安全性**: ID 不会暴露在代码仓库中
- **灵活性**: 不同环境可以使用不同的资源 ID
- **自动化**: 无需手动编辑文件，避免提交冲突

### Q: Actions 执行失败怎么办？

1. 检查 GitHub Secrets 是否正确配置（特别是 D1_DATABASE_ID 和 KV_NAMESPACE_ID）
2. 确认 API Token 权限是否足够
3. 查看 Actions 日志中的具体错误信息
4. 如果是首次部署，确保先配置基础 Secrets 后再添加资源 ID

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

修改 `schema.sql` 文件后推送到 `main` 分支，GitHub Actions 会自动应用更新。

或在 Cloudflare Dashboard 的 D1 Console 中直接执行 SQL。

---

## 总结

完成上述 2 个步骤后，你的部署流程如下：

```
修改代码 → git push → GitHub Actions 自动部署 → 完成！
```

无需手动修改 `wrangler.toml`，所有配置通过 GitHub Secrets 管理，完全自动化。
