# `src` 文件说明

> 更新日期：2026-09-21  
> 本文逐一说明当前 `src/` 下的 140 个文件。文件增删后应同步更新本文。

## 1. 先理解 Next.js 文件名

- `page.tsx`：一个可访问的网页。
- `layout.tsx`：包裹某一组页面的公共布局。
- `route.ts`：后端接口或特殊请求处理器，不直接显示网页。
- `(site)`：路由分组，只用于整理代码，不会出现在网址中。
- `[slug]`、`[id]`：动态网址参数，例如文章别名或数据库编号。
- `[...segments]`：接收多段路径的动态参数。
- 文件开头有 `"use client"`：代码会在浏览器执行，可使用状态、点击和拖放。
- 没有 `"use client"` 的页面和组件默认在服务器执行，可以直接读取 SQLite。

---

## 2. `src/app`：页面和后端接口

### 2.1 全站入口

| 文件                                                      | 作用                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`                                      | 全站最外层布局，设置中文语言、默认网页标题、标题模板和站点描述，并加载全局 CSS。             |
| `src/app/globals.css`                                     | 全站 CSS 入口；按基础、前台、内容、社区、后台、响应式的顺序引入样式文件。                    |
| `src/app/uploads/events/documents/[...segments]/route.ts` | 安全下载活动评议资料：核对路径、数据库记录和真实文件，再设置正确文件名与 MIME 类型返回附件。 |

### 2.2 公开页面 `src/app/(site)`

| 文件                                                      | 对应网址与作用                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/app/(site)/layout.tsx`                               | 所有公开页面的共同布局，强制动态渲染并套用 `SiteShell` 的侧栏、状态栏和页脚。         |
| `src/app/(site)/page.tsx`                                 | `/` 首页；组合欢迎区、站内公告、首页展示活动和最近更新文章。                          |
| `src/app/(site)/not-found.tsx`                            | 公开站点的 404 页面。                                                                 |
| `src/app/(site)/about/page.tsx`                           | `/about` 关于破晓及其页面内容。                                                       |
| `src/app/(site)/changelog/page.tsx`                       | `/changelog` 更新记录及其固定内容。                                                   |
| `src/app/(site)/articles/page.tsx`                        | `/articles` 全部已发布文章列表，每页 30 篇。                                          |
| `src/app/(site)/articles/[slug]/page.tsx`                 | `/articles/文章别名` 文章详情；处理旧网址跳转、正文、所属活动、前后文章和评论分页。   |
| `src/app/(site)/events/page.tsx`                          | `/events` 活动专题总目录；按“破晓 / 其他”分组显示活动卡片。                           |
| `src/app/(site)/events/[slug]/page.tsx`                   | `/events/活动别名` 活动详情；显示正文、附件和作品目录；有专题地图设置时改用专属模板。 |
| `src/app/(site)/events/[slug]/map/page.tsx`               | `/events/活动别名/map` 专题活动的独立大图浏览页；读取后台地图设置并在隐藏时返回 404。 |
| `src/app/(site)/events/the-legends-of-countries/page.tsx` | “列国纪”专属专题页；组合活动资料、可缩放世界地图、正文、附件和嵌套作品目录。          |
| `src/app/(site)/search/page.tsx`                          | `/search` 文章搜索和年份档案结果页，支持分页。                                        |
| `src/app/(site)/random/route.ts`                          | `/random` 随机选择一篇已发布文章并重定向；无文章时回到文章列表。                      |
| `src/app/(site)/login/page.tsx`                           | `/login` 受邀评论账号登录页；不提供注册，并防止用户名、密码误入 URL。                 |
| `src/app/(site)/account/page.tsx`                         | `/account` 账号中心；显示当前账号、修改密码以及回复/@提及通知。                       |

### 2.3 后台页面 `src/app/admin`

| 文件                                   | 对应网址与作用                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/admin/layout.tsx`             | 后台页面的最外层容器，强制动态渲染并挂载后台专用根类名。                                      |
| `src/app/admin/login/page.tsx`         | `/admin/login` 管理员登录页；已登录时跳到后台首页，也防止密码出现在 URL。                     |
| `src/app/admin/page.tsx`               | `/admin` 后台概览；显示文章、活动、评论、用户数量和最近编辑的文章。                           |
| `src/app/admin/articles/page.tsx`      | `/admin/articles` 文章管理；按活动折叠分组，可搜索、筛选、分页、编辑、查看和删除。            |
| `src/app/admin/articles/new/page.tsx`  | `/admin/articles/new` 新建文章；可通过 `event` 参数预选活动并在保存后返回该活动。             |
| `src/app/admin/articles/[id]/page.tsx` | `/admin/articles/编号` 编辑文章；读取文章及所属活动后交给 `ArticleForm`。                     |
| `src/app/admin/events/page.tsx`        | `/admin/events` 活动管理；加载所有活动并交给可视化排序组件。                                  |
| `src/app/admin/events/new/page.tsx`    | `/admin/events/new` 新建活动页面。                                                            |
| `src/app/admin/events/[id]/page.tsx`   | `/admin/events/编号` 编辑活动；同时加载活动表单、专题地图设置、评议附件、嵌套分组和参与文章。 |
| `src/app/admin/comments/page.tsx`      | `/admin/comments` 评论管理；支持内容、文章、用户、状态、日期筛选，分页及 CSV/JSON 导出。      |
| `src/app/admin/users/page.tsx`         | `/admin/users` 受邀账号管理；同时查询评论数量、管理员备注、禁言和个人点心统计。               |
| `src/app/admin/settings/page.tsx`      | `/admin/settings` 首页欢迎语与站内公告设置页面。                                              |
| `src/app/admin/security/page.tsx`      | `/admin/security` 管理员密码修改页面。                                                        |
| `src/app/admin/audit/page.tsx`         | `/admin/audit` 最近管理操作与文章/活动内容快照列表。                                          |

### 2.4 普通账号接口 `src/app/api/account`

| 文件                                              | 请求与作用                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/api/account/login/route.ts`              | `POST /api/account/login`；校验受邀账号、登录限流、写入登录时间并设置用户会话 Cookie。 |
| `src/app/api/account/logout/route.ts`             | `POST /api/account/logout`；删除用户会话 Cookie。                                      |
| `src/app/api/account/password/route.ts`           | `POST /api/account/password`；核对旧密码、修改密码、解除首次改密要求并使旧会话失效。   |
| `src/app/api/account/notifications/read/route.ts` | `POST /api/account/notifications/read`；把当前用户的通知全部标记为已读。               |

### 2.5 管理员文章接口

| 文件                                              | 请求与作用                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/app/api/admin/articles/route.ts`             | `POST /api/admin/articles`；创建文章、生成“活动别名 + 编号”网址、关联活动、清理正文并记录快照和审计。     |
| `src/app/api/admin/articles/[id]/route.ts`        | `PUT/DELETE /api/admin/articles/编号`；更新或删除文章，保留活动目录信息、旧网址跳转、内容快照和操作记录。 |
| `src/app/api/admin/articles/import-docx/route.ts` | `POST /api/admin/articles/import-docx`；用 Mammoth 解析最大 20MB 的 DOCX，将正文和支持的图片放入编辑器。  |
| `src/app/api/admin/articles/preview/route.ts`     | `POST /api/admin/articles/preview`；清理后台传来的 HTML，返回安全的发布前预览内容。                       |

### 2.6 管理员活动接口

| 文件                                                            | 请求与作用                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/app/api/admin/events/route.ts`                             | `POST /api/admin/events`；创建活动，校验活动类型、月份、别名和正文，并记录内容快照。        |
| `src/app/api/admin/events/[id]/route.ts`                        | `PUT/DELETE /api/admin/events/编号`；更新或删除活动，保存旧网址跳转、内容快照和审计记录。   |
| `src/app/api/admin/events/[id]/map/route.ts`                    | `PUT /api/admin/events/编号/map`；校验并保存专题地图、显示状态和专题页标题，登记上传图片。  |
| `src/app/api/admin/events/order/route.ts`                       | `PUT /api/admin/events/order`；保存活动在各自类型中的排列顺序。                             |
| `src/app/api/admin/events/featured/route.ts`                    | `PUT /api/admin/events/featured`；把指定已有活动设为首页唯一展示活动。                      |
| `src/app/api/admin/events/[id]/articles/route.ts`               | `PUT /api/admin/events/编号/articles`；一次性保存空分组、嵌套路径、分组顺序及文章拖放顺序。 |
| `src/app/api/admin/events/[id]/documents/route.ts`              | `POST /api/admin/events/编号/documents`；校验并上传活动评议资料，同时建立数据库记录。       |
| `src/app/api/admin/events/[id]/documents/[documentId]/route.ts` | `PUT/DELETE` 单个评议资料；修改显示名称/栏目说明，或删除数据库记录和对应文件。              |
| `src/app/api/admin/events/[id]/documents/order/route.ts`        | `PUT` 评议资料顺序；校验编号归属后保存排列。                                                |

### 2.7 其他管理员接口

| 文件                                         | 请求与作用                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/app/api/admin/login/route.ts`           | `POST /api/admin/login`；管理员凭据验证、登录限流及后台会话 Cookie 设置。             |
| `src/app/api/admin/logout/route.ts`          | `POST /api/admin/logout`；删除管理员会话 Cookie。                                     |
| `src/app/api/admin/password/route.ts`        | `PUT /api/admin/password`；修改管理员密码并使其他设备上的旧后台会话失效。             |
| `src/app/api/admin/comments/[id]/route.ts`   | `PUT/DELETE` 评论管理；公开、隐藏、置顶、恢复、软删除或永久删除评论，并写入审计记录。 |
| `src/app/api/admin/comments/export/route.ts` | `GET /api/admin/comments/export`；按后台当前筛选条件导出评论 CSV 或 JSON。            |
| `src/app/api/admin/settings/route.ts`        | `PUT /api/admin/settings`；校验并保存首页欢迎区和公告设置。                           |
| `src/app/api/admin/upload/route.ts`          | `POST /api/admin/upload`；校验图片 MIME、文件头和 5MB 限制后保存 JPG/PNG/GIF/WebP。   |
| `src/app/api/admin/users/route.ts`           | `POST /api/admin/users`；由管理员创建受邀评论账号，保存密码哈希并要求首次登录改密。   |
| `src/app/api/admin/users/[id]/route.ts`      | `PUT/DELETE /api/admin/users/编号`；修改备注、显示名、密码、状态和禁言，或删除账号。  |

### 2.8 评论、点心与访问统计接口

| 文件                                 | 请求与作用                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/app/api/comments/route.ts`      | `POST /api/comments`；发表或回复评论，检查登录、首次改密、禁言、长度、冷却时间和文章评论状态。   |
| `src/app/api/comments/[id]/route.ts` | `PUT/DELETE /api/comments/编号`；用户在 30 分钟内编辑自己的评论，或将自己的评论软删除。          |
| `src/app/api/treat/route.ts`         | `GET/POST /api/treat`；读取或增加饼干/红茶统计，以千分之一概率判定摔碎，并记录登录用户个人数量。 |
| `src/app/api/visit/route.ts`         | `POST /api/visit`；用 12 小时 Cookie 和服务端限流增加首页访问次数。                              |

---

## 3. `src/components`：可复用界面组件

### 3.1 前台公共组件

| 文件                                            | 作用                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/components/SiteShell.tsx`                  | 公开站点总框架；生成左侧导航、年份档案、顶部时间与登录状态、主内容和页脚建站日期。     |
| `src/components/SectionLogo.tsx`                | 根据当前路径切换左上角“首页 / 作品 / 活动 / 搜索 / 账号”等不同标识文案与配色。         |
| `src/components/SiteClock.tsx`                  | 浏览器端每秒更新顶部本地日期和时间。                                                   |
| `src/components/Breadcrumbs.tsx`                | 生成从首页开始的面包屑导航。                                                           |
| `src/components/AnnouncementPanel.tsx`          | 首页公告面板；过滤危险链接，只接受站内路径或 HTTP/HTTPS 地址。                         |
| `src/components/WelcomePanel.tsx`               | 首页欢迎区；记录访问、处理饼干/红茶点击、显示统计以及正常/摔碎动画。                   |
| `src/components/ArticleList.tsx`                | 通用文章列表；显示置顶标记、标题链接和发布日期。                                       |
| `src/components/EventPanel.tsx`                 | 首页展示活动面板；显示活动状态、简介、月份和入口。                                     |
| `src/components/EventDirectoryCard.tsx`         | 活动专题页及后台预览共用的活动卡片。                                                   |
| `src/components/EventArticleDirectory.tsx`      | 把文章的 `section_path` 转成任意层级的树，在活动前台按分组嵌套展示。                   |
| `src/components/maps/ImageMapViewer.tsx`        | 可缩放、拖动及复位的大图查看器；供专题页和独立地图页复用。                             |
| `src/components/events/EventMapSpecialView.tsx` | 地图型活动的专属专题模板；组合活动资料、地图、正文、附件和作品目录，并兼容活动改网址。 |

### 3.2 普通账号组件

| 文件                                                | 作用                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `src/components/account/UserLoginForm.tsx`          | 用户登录表单；通过 JSON 接口登录，并安全返回原页面或首次改密页面。 |
| `src/components/account/UserLogoutButton.tsx`       | 普通用户退出登录按钮。                                             |
| `src/components/account/PasswordChangeForm.tsx`     | 用户修改密码表单；显示错误/成功状态并处理首次改密后的返回。        |
| `src/components/account/NotificationReadButton.tsx` | 将当前账号的全部通知标为已读并刷新页面。                           |

### 3.3 评论组件

| 文件                                              | 作用                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/comments/CommentSection.tsx`      | 完整评论区；渲染评论树、置顶、分页、排序、登录提示、禁言提示和发布表单。    |
| `src/components/comments/CommentForm.tsx`         | 新评论和回复共用的提交表单。                                                |
| `src/components/comments/CommentActions.tsx`      | 单条评论的回复、限时编辑和用户软删除操作。                                  |
| `src/components/comments/CommentDeleteButton.tsx` | 独立的用户评论删除按钮；功能已由部分更完整组件复用或替代。                  |
| `src/components/comments/CommentText.tsx`         | 安全地把评论中的 HTTP 链接和 `@用户名` 转为可点击内容，其余文字保持纯文本。 |

### 3.4 后台框架与通用控件

| 文件                                           | 作用                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/admin/AdminShell.tsx`          | 后台共同框架；包含复古标识、左侧菜单、顶部“查看网站/退出”及后台页脚。 |
| `src/components/admin/AdminNavigation.tsx`     | 后台分组导航；根据当前路径高亮对应栏目。                              |
| `src/components/admin/LoginForm.tsx`           | 管理员登录表单。                                                      |
| `src/components/admin/LogoutButton.tsx`        | 管理员退出按钮，退出后返回后台登录页。                                |
| `src/components/admin/AdminPasswordForm.tsx`   | 管理员密码修改表单，要求至少 8 位并显示操作结果。                     |
| `src/components/admin/DeleteButton.tsx`        | 后台通用删除按钮；确认后向指定接口发出 `DELETE` 并刷新页面。          |
| `src/components/admin/ImageUpload.tsx`         | 后台通用图片上传控件，上传成功后把图片 URL 交给父表单。               |
| `src/components/admin/CommentAdminActions.tsx` | 管理员对评论执行置顶、隐藏、公开、恢复、软删除和永久删除。            |

### 3.5 文章编辑组件

| 文件                                            | 作用                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/components/admin/article-draft.ts`         | 定义文章表单和本地草稿的数据类型，生成默认表单值，并验证 localStorage 草稿是否完整。                  |
| `src/components/admin/useArticleAutoSave.ts`    | 文章编辑时延迟 800ms 自动保存本机草稿，提供恢复、丢弃和保存失败状态。                                 |
| `src/components/admin/ArticleForm.tsx`          | 新建/编辑文章的总表单；管理标题、自动网址、发布日、状态、封面、评论模式、活动、正文、预览和离开提醒。 |
| `src/components/admin/RichTextEditor.tsx`       | 富文本/Markdown 双模式编辑器；支持基本格式、链接、`.md` 导入、模式转换和浏览器端内容清理。            |
| `src/components/admin/DocxImport.tsx`           | DOCX 文件选择和导入状态组件，把服务端转换出的标题、正文与图片应用到文章表单。                         |
| `src/components/admin/ArticlePreviewDialog.tsx` | 文章发布前的模态预览窗口，支持按 Escape 或按钮关闭。                                                  |

### 3.6 活动和站点管理组件

| 文件                                            | 作用                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/components/admin/EventForm.tsx`            | 活动基础资料表单；编辑名称、网址、类型、简介、起止月份、状态、横幅和富文本/Markdown 介绍。   |
| `src/components/admin/EventOrderManager.tsx`    | 活动管理的所见即所得卡片；按“破晓 / 其他”单组拖动或选择位置排序，并设置首页展示活动。        |
| `src/components/admin/EventArticleManager.tsx`  | 活动作品的单列嵌套编辑器；创建、重命名、删除、拖动同级分组，并把文章拖入任意层级后批量保存。 |
| `src/components/admin/EventDocumentManager.tsx` | 活动评议资料管理；上传、改名、填写栏目说明、调整顺序和删除文件。                             |
| `src/components/admin/EventMapSettingsForm.tsx` | “列国纪”专题设置；上传/隐藏地图并编辑独立地图页与专题各区标题。                              |
| `src/components/admin/SiteSettingsForm.tsx`     | 编辑首页欢迎语各行文字、点心按钮文案、访问次数前后文字及站内公告。                           |
| `src/components/admin/UserManager.tsx`          | 创建和维护受邀账号；编辑显示名、私密备注、密码、启停、禁言，并显示评论及点心统计。           |

---

## 4. `src/config`：专题默认配置

| 文件                       | 作用                                                   |
| -------------------------- | ------------------------------------------------------ |
| `src/config/event-maps.ts` | 专题地图的首次建库默认值；日常内容由后台和数据库维护。 |

---

## 5. `src/lib`：数据库、业务逻辑和安全工具

| 文件                              | 作用                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/db.ts`                   | 打开并复用 SQLite 连接，设置 WAL/外键，按 `DATABASE_PATH` 或默认路径选择数据库，并执行迁移。 |
| `src/lib/db-schema.ts`            | 创建全部数据表、索引、默认设置和向后兼容字段；保留旧作者/分类表但当前站点不提供对应功能。    |
| `src/lib/queries.ts`              | 公开页面的集中查询层：文章、前后篇、活动、首页活动、评议资料、搜索、年份档案和分页。         |
| `src/lib/admin.ts`                | 后台通用工具：JSON 错误、唯一别名、文章顺序编号、ID 数组、活动月份和文章日期校验。           |
| `src/lib/audit.ts`                | 写入管理员操作记录和文章/活动 JSON 内容快照。                                                |
| `src/lib/auth.ts`                 | 管理员认证：凭据初始化、HMAC 会话、Cookie、页面/API 权限检查及管理员改密。                   |
| `src/lib/user-auth.ts`            | 受邀用户认证：scrypt 密码、HMAC 会话、Cookie、输入校验、账号读取和登录失败封禁。             |
| `src/lib/request-security.ts`     | 请求安全工具：判断 HTTPS、对来源信息生成不可逆指纹，并在 SQLite 中实行固定窗口限流。         |
| `src/lib/safe-path.ts`            | 只允许站内根相对路径，防止登录返回地址造成开放重定向。                                       |
| `src/lib/client-fetch.ts`         | 浏览器端通用 JSON 请求包装，统一处理正常响应、非 JSON 响应和断网。                           |
| `src/lib/content.ts`              | 清理 HTML、Markdown 转 HTML、生成摘要、生成网址别名以及格式化日期/月。                       |
| `src/lib/content-limits.ts`       | 文章标题、摘要、HTML 和 Markdown 的统一大小上限。                                            |
| `src/lib/uploaded-assets.ts`      | 登记后台上传图片、标记已被正文引用的图片，并回收超过一天仍未引用的临时文件。                 |
| `src/lib/event-documents.ts`      | 评议资料的扩展名、文件名、大小和文件头校验，以及哈希存储路径和文件增删。                     |
| `src/lib/event-map-settings.ts`   | 查询活动专题地图设置，并在旧数据库尚无记录时提供默认配置。                                   |
| `src/lib/event-map-validation.ts` | 后台专题地图表单的纯数据校验：图片地址、尺寸、必填标题及文本长度。                           |
| `src/lib/event-groups.ts`         | 定义活动类型“破晓 / 其他”、标签、配色和类型校验。                                            |
| `src/lib/event-order.ts`          | 只在同一活动类型内部移动活动，防止“破晓 / 其他”相互穿插。                                    |
| `src/lib/event-status.ts`         | 根据起止时间或人工覆盖值判断活动为即将开始、进行中或已经结束。                               |
| `src/lib/comments.ts`             | 评论查询、根评论分页、回复树、评论定位、编辑期限以及回复/@提及通知生成。                     |
| `src/lib/comment-rules.ts`        | 浏览器和服务端共用的评论最大长度与发言冷却时间。                                             |
| `src/lib/treats.ts`               | 定义饼干/红茶类型并读取全站点心统计。                                                        |
| `src/lib/site-settings.ts`        | 定义首页设置默认值，从数据库合并读取设置，并提供最近公开内容更新时间查询。                   |
| `src/lib/slug-redirects.ts`       | 查询和记录文章/活动旧网址，合并重定向链并避免有效新网址被历史记录覆盖。                      |
| `src/lib/db-search.ts`            | 转义 SQLite `LIKE` 中的 `%`、`_` 和反斜杠，防止搜索词被当作通配符。                          |
| `src/lib/date-filter.ts`          | 解析后台评论筛选中的“年/月/日”文本，拒绝不完整或不存在的日期。                               |
| `src/lib/date-time.ts`            | 在 SQLite UTC 时间与上海时区显示/筛选时间之间转换，并校验禁言截止时间。                      |

---

## 6. `src/styles`：样式文件

| 文件                           | 作用                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `src/styles/base.css`          | CSS 变量、全局盒模型、宋体/衬线字体、横线纸背景、基础链接和图片规则。         |
| `src/styles/site.css`          | 前台整体布局、侧栏、分区标识、状态栏、面板、首页欢迎区、公告及饼干/红茶动画。 |
| `src/styles/content.css`       | 文章列表、活动卡片、活动嵌套目录、评议资料、文章正文、封面及前后篇导航。      |
| `src/styles/community.css`     | 评论、账号、通知、登录、搜索、分页和前后台共用复古按钮/表单控件。             |
| `src/styles/admin-shell.css`   | 后台页面框架、侧栏导航、顶部栏、页脚和内容概览首页。                          |
| `src/styles/admin-content.css` | 后台表格、表单、文章编辑器、活动排序、嵌套分组拖放、评议资料和用户管理。      |
| `src/styles/responsive.css`    | 1020px 和 720px 以下的前后台窄屏、单列和移动端适配。                          |

## 7. 修改时如何定位

- 改固定文字：直接搜索原文并编辑对应的页面或组件。
- 改首页欢迎语或公告：使用后台 `/admin/settings`，不要改代码默认值。
- 改某个页面内容：从相应的 `page.tsx` 开始。
- 改按钮点击后的行为：找对应的客户端组件，再找它请求的 `route.ts`。
- 改数据库结构：只在 `src/lib/db-schema.ts` 中添加可重复执行的增量迁移，并先备份数据库。
- 改前台外观：优先看 `site.css`、`content.css`、`community.css`。
- 改后台外观：优先看 `admin-shell.css`、`admin-content.css`。
- 修改完成后运行 `pnpm check` 和 `pnpm build`。
