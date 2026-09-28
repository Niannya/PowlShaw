# 服务器部署与公开内容数据库初始化

本文用于把公开源码和不含私人凭据的内容数据库部署到接收者自己的服务器，也适用于解决以下问题：

- 随机文章跳转到了服务器内部的 `localhost:3000`；
- 公开内容数据库不含管理员凭据，导致后台无法登录。

下列命令均应在项目根目录执行。真实密码、`.env.local`、数据库和服务器地址不要提交到 Git，
也不要发到公开聊天、Issue 或日志中。

## 1. 更新代码并安装依赖

更新前先停止网站进程，并备份服务器现有的 `data/poxiao.db`、`public/uploads/` 和
`.env.local`。不要使用 `git clean -fdx`，它可能删除这些被 Git 忽略的部署数据。

```bash
git pull
pnpm install --frozen-lockfile
```

如果是第一次部署公开内容数据库，将收到的数据库文件复制为：

```text
data/poxiao.db
```

仅替换数据库不能带回正文图片和活动附件；需要这些文件时，还应由原维护者另行提供对应的
`public/uploads/`。已经有内容的服务器不需要再次覆盖数据库。

## 2. 配置服务器环境变量

首次部署时从示例文件创建配置：

```bash
cp .env.example .env.local
chmod 600 .env.local
```

编辑 `.env.local`，至少替换以下内容：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-at-least-32-random-characters
DATABASE_PATH=data/poxiao.db
NEXT_PUBLIC_SITE_URL=https://example.com
TRUST_PROXY_HEADERS=1
```

可以用 `openssl rand -hex 32` 生成会话密钥。不要继续使用
`replace-with-a-strong-password` 等示例占位值。只有当 Next.js 位于自己控制的 Nginx 等可信
反向代理之后时，才把 `TRUST_PROXY_HEADERS` 设为 `1`。

## 3. 初始化或重置后台管理员

公开内容数据库会主动移除原站管理员凭据。配置好 `.env.local` 后执行：

```bash
pnpm admin:reset
```

该命令会：

1. 按 `DATABASE_PATH` 打开数据库；
2. 在数据库同级的 `backups/` 目录创建重置前备份；
3. 写入接收者自己的管理员用户名和密码哈希；
4. 使已有后台会话失效。

密码不会显示在命令输出中，也不应作为命令行参数传入。如果命令提示
`admin_credentials table is missing`，先启动一次当前版本应用并访问一个页面，让应用完成旧库迁移，
停止应用后再重新运行该命令。

## 4. 构建并重启网站

```bash
pnpm build
```

然后按服务器实际使用的进程管理方式重启。例如，使用 systemd 时：

```bash
SERVICE_NAME=poxiao # 改成服务器上的实际服务名
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME"
```

使用 PM2 时：

```bash
APP_NAME=poxiao # 改成 PM2 中的实际进程名
pm2 restart "$APP_NAME"
pm2 status
```

不要同时启动多份指向同一个 SQLite 数据库的不同版本应用。

## 5. Nginx 代理头

Nginx 的 `location` 中建议保留以下代理头，然后执行 `nginx -t` 并重载配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
}
```

随机文章路由已经改用站内相对跳转，不会再把反向代理内部的 `localhost:3000` 暴露给访客。

## 6. 上线验证

### 随机文章

```bash
curl -sSI --max-redirs 0 https://example.com/random
```

响应应为 `307`，并包含类似以下相对地址：

```text
location: /articles/example-slug
```

不能出现 `location: http://localhost:3000/...`。

### 后台登录

打开：

```text
https://example.com/admin/login
```

使用 `.env.local` 中配置并经 `pnpm admin:reset` 写入数据库的新账号登录。若页面提示服务器尚未
初始化后台账号，检查以下项目：

1. `.env.local` 中没有继续使用示例占位密码；
2. `DATABASE_PATH` 指向正在运行的网站使用的同一个数据库；
3. `pnpm admin:reset` 已成功输出备份位置；
4. 重置后已经重启网站进程。

确认后台可以登录后，可在“后台安全”页面再次修改密码；数据库只保存密码哈希。
