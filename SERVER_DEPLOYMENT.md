# 服务器部署与公开内容数据库初始化

本文用于把公开源码和不含私人凭据的内容数据库部署到接收者自己的服务器。当前为**前后端分离**结构：

- `apps/web`：Next.js 前端，监听 3000；
- `apps/api`：后端接口与上传文件，监听 3001；
- Nginx：同源入口，把 `/` 转发到 3000、`/api/v1` 与 `/uploads` 转发到 3001。

本文也适用于解决以下问题：

- 随机文章跳转到了服务器内部的 `localhost:3000`；
- 后台无法登录或提示尚未初始化后台账号；
- 前端页面能打开但数据请求 502。

下列命令均应在项目根目录执行。真实密码、`.env.local`、数据库和服务器地址不要提交到 Git，也不要发到公开聊天、Issue 或日志中。

## 1. 更新代码并安装依赖

更新前先停止前端与后端进程，并备份服务器现有的：

```text
apps/api/data/poxiao.db
apps/api/public/uploads/
apps/api/.env.local
apps/web/.env.local
```

不要使用 `git clean -fdx`，它可能删除这些被 Git 忽略的部署数据。

```bash
git pull
pnpm install --frozen-lockfile
```

如果是第一次部署公开内容数据库，将收到的数据库文件复制为：

```text
apps/api/data/poxiao.db
```

仅替换数据库不能带回正文图片和活动附件；需要这些文件时，还应由原维护者另行提供对应的
`apps/api/public/uploads/`。已经有内容的服务器不需要再次覆盖数据库。

## 2. 配置服务器环境变量

首次部署时从示例文件创建配置，并限制权限：

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
chmod 600 apps/api/.env.local apps/web/.env.local
```

### 2.1 后端 `apps/api/.env.local`

至少替换：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-at-least-32-random-characters
DATABASE_PATH=data/poxiao.db
TRUST_PROXY_HEADERS=1
```

可以用 `openssl rand -hex 32` 生成会话密钥。不要继续使用
`replace-with-a-strong-password` 等示例占位值。只有当后端位于自己控制的 Nginx 等可信反向代理之后时，才把 `TRUST_PROXY_HEADERS` 设为 `1`。

### 2.2 前端 `apps/web/.env.local`

```env
API_INTERNAL_URL=http://127.0.0.1:3001
API_PROXY_TARGET=
NEXT_PUBLIC_SITE_URL=https://example.com
```

- `API_INTERNAL_URL`：前端 Server Component 直接访问后端的内部地址。
- `API_PROXY_TARGET`：浏览器 `/api/v1`、`/uploads` 的转发目标。**生产由 Nginx 反代时设为空字符串**，避免 Next 再转发一层。若不用 Nginx、只让 Next 做网关，可设为 `http://127.0.0.1:3001`（需在构建前设置，rewrites 会写入构建产物）。
- `NEXT_PUBLIC_SITE_URL`：公开站点地址，用于 metadata/canonical 等。

## 3. 初始化或重置后台管理员

公开内容数据库会主动移除原站管理员凭据。配置好 `apps/api/.env.local` 后执行：

```bash
pnpm --filter @powlshaw/api admin:reset
```

该命令会：

1. 按 `apps/api/.env.local` 或环境变量中的 `DATABASE_PATH` 打开数据库；
2. 在数据库同级的 `backups/` 目录创建重置前备份；
3. 写入接收者自己的管理员用户名和密码哈希；
4. 使已有后台会话失效。

密码不会显示在命令输出中，也不应作为命令行参数传入。如果命令提示
`admin_credentials table is missing`，先启动一次当前版本 API 并访问一个接口（例如 `/api/v1/health`），让应用完成旧库迁移，停止应用后再重新运行该命令。

## 4. 构建并启动

```bash
pnpm build
```

分别启动两个进程（**顺序无所谓，但两个都要在**）：

```bash
pnpm --filter @powlshaw/api start   # 127.0.0.1:3001
pnpm --filter @powlshaw/web start   # 127.0.0.1:3000
```

使用 systemd 时，建立两个服务单元（示例）：

```ini
# /etc/systemd/system/powlshaw-api.service
[Service]
WorkingDirectory=/srv/powlshaw
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm --filter @powlshaw/api start
Restart=always
```

```ini
# /etc/systemd/system/powlshaw-web.service
[Service]
WorkingDirectory=/srv/powlshaw
Environment=NODE_ENV=production
Environment=API_INTERNAL_URL=http://127.0.0.1:3001
Environment=API_PROXY_TARGET=
ExecStart=/usr/bin/pnpm --filter @powlshaw/web start
Restart=always
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now powlshaw-api powlshaw-web
sudo systemctl status powlshaw-api powlshaw-web
```

使用 PM2 时同理启动两个进程。**不要同时启动多份指向同一个 SQLite 数据库的不同版本 API。**

## 5. Nginx 同源反代

参考 [`infra/nginx.conf.example`](infra/nginx.conf.example)。最小配置：

```nginx
location /api/v1/ { proxy_pass http://127.0.0.1:3001; }
location /uploads/ { proxy_pass http://127.0.0.1:3001; }
location /        { proxy_pass http://127.0.0.1:3000; }
```

三个 location 都要保留：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
```

`client_max_body_size` 建议 25m（活动资料 20MB、图片 5MB，并留出 multipart 开销）。修改后执行 `nginx -t` 并重载。

## 6. 上线验证

### 6.1 健康检查

```bash
curl -sS https://example.com/api/v1/health
```

应返回：

```json
{ "data": { "status": "ok", "service": "powlshaw-api" } }
```

### 6.2 随机文章

```bash
curl -sSI --max-redirs 0 https://example.com/random
```

响应应为 `307`，并包含类似以下相对地址：

```text
location: /articles/example-slug
```

不能出现 `location: http://localhost:3000/...`。

### 6.3 公开页面与数据

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://example.com/
curl -sS "https://example.com/api/v1/site" | head -c 200
curl -sS -o /dev/null -w "%{http_code}\n" https://example.com/uploads/events/documents/...
```

若页面 200 但内容为空或 500，先检查：

1. 前端进程是否设置了正确的 `API_INTERNAL_URL`；
2. 后端进程是否在 3001 监听；
3. 前端日志中是否有 `fetch failed` 或 `ECONNREFUSED`。

### 6.4 后台登录

打开：

```text
https://example.com/admin/login
```

使用 `apps/api/.env.local` 中配置并经 `pnpm --filter @powlshaw/api admin:reset` 写入数据库的新账号登录。若页面提示服务器尚未初始化后台账号，检查：

1. `apps/api/.env.local` 中没有继续使用示例占位密码；
2. `DATABASE_PATH` 指向正在运行的 API 使用的同一个数据库；
3. `admin:reset` 已成功输出备份位置；
4. 重置后已经重启 API 进程。

确认后台可以登录后，可在“后台安全”页面再次修改密码；数据库只保存密码哈希。

若登录成功但点到后台其他页面又跳回登录页，通常是 Nginx 没有转发 Cookie，或前端与接口不同源；请确认 `/` 与 `/api/v1` 使用同一个域名。

## 7. 备份与回滚

需要一起备份：

```text
apps/api/data/poxiao.db
apps/api/public/uploads/
```

媒体文件若已迁移到对象存储，则按对象存储策略备份。

回滚本次前端剥离：

- Git 切回 `main` 并重新 `pnpm install && pnpm build`，恢复单应用；
- 或只把 Nginx 的 `/` 指回旧前端进程，`/api/v1` 暂时保留新后端；
- 数据库未被本分支改写结构，可直接被旧版本读取。
