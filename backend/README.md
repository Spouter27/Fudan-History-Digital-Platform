> 分享版：先在项目根目录执行 pnpm run setup；本文的 cd ./backend、cd ./frontend 均以项目根目录为起点。详见根目录 README.md。

# 校史平台最小后端

本地可运行的 Express + TypeScript + SQLite 后端，已接入现有前端。使用 Node.js 24 的 node:sqlite，无需安装 PostgreSQL 或 Docker。适用于本机开发与演示，尚未部署公网。

## 启动与登录

需要 Node.js 24+ 和 pnpm。开两个PowerShell终端：

~~~powershell
# 终端一：后端
cd ./backend
pnpm install --frozen-lockfile
pnpm start
~~~

~~~powershell
# 终端二：前端
cd ./frontend
pnpm install --frozen-lockfile
pnpm dev
~~~

打开 http://127.0.0.1:5173/#/login 。

首次启动自动生成三个账号和随机密码，保存在 backend/data/dev-accounts.txt：

| 账号 | 角色 | 用途 |
| --- | --- | --- |
| student-a@local.test | 成员 | 投稿、撤回、删除自己的记录 |
| student-b@local.test | 成员 | 验证不同用户的数据隔离 |
| reviewer@local.test | 审核员 | 通过、退回投稿 |

从文件复制密码到登录页。它们不是复旦真实邮箱，不会发送邮件。密码清单和数据库在.gitignore中排除，请勿上传或分享。数据库中保存的是盐化scrypt密码摘要；会话令牌也以摘要落库。重启不重置账号或投稿。

服务只绑定127.0.0.1。NODE_ENV=production会拒绝启动，防止误把开发账号系统当作生产认证。Cookie当前为本地HTTP配置，正式HTTPS部署需要Secure=true。

## 前端配置

当前frontend/.env.local已设置：

~~~dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api
~~~

该文件不提交Git；新环境需要重建。Vite开发与preview服务器均把/api代理到127.0.0.1:3000。
不要混用localhost和127.0.0.1，它们的Cookie来源不同。

改为VITE_DATA_MODE=demo并重启前端，可以恢复原浏览器本地演示。旧localStorage投稿未删除，也未自动导入数据库。

## 接口

成功统一返回 {"code":0,"message":"ok","data":...}。删除和审核成功返回data:null，不返回204。错误使用相应HTTP状态。

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | /api/health | 健康状态及模型配置状态 |
| GET | /api/catalog | 允许展示的事件、人物、关系、来源 |
| GET | /api/search?q=校园 | 中文关键词检索 |
| POST | /api/auth/login | email/password登录 |
| GET | /api/auth/me | 当前用户；未登录401 |
| POST | /api/auth/logout | 注销会话 |
| GET | /api/submissions?scope=mine | 当前用户自己的投稿 |
| GET | /api/submissions?scope=review | 审核员队列；成员403 |
| GET | /api/submissions?scope=public | 仅已通过内容，不返回内部审核意见 |
| POST | /api/submissions | 登录用户投稿，服务端固定pending和owner |
| POST | /api/submissions/:id/approve | 审核员通过，仅pending可操作 |
| POST | /api/submissions/:id/reject | 审核员退回，note必填 |
| POST | /api/submissions/:id/withdraw | 仅所有者撤回 |
| DELETE | /api/submissions/:id | 仅所有者删除 |
| POST | /api/qa/retrieve | 返回关键词检索线索与出处，不生成答案 |

投稿字段沿用前端docs/API约定.md。审核请求体为 {"note":"审核意见"}。
退回后暂不支持原条目编辑重送审，可重新投稿。
public接口允许游客访问，当前前端记忆共创页面整体要求登录，可在后续拆出游客阅读页。

所有写请求须携带：
- Origin：精确匹配ALLOWED_ORIGINS；
- X-App-Request: fudan-history；
- Content-Type: application/json（DELETE可无正文）。

前端已发送相应标记；浏览器会自动发送Origin。命令行测试需自行设置Origin。
自定义请求头和来源校验用于阻止跨站请求，不代替身份验证。权限仍以HttpOnly会话Cookie判断。CORS不允许任意来源。

登录限流默认为每IP每分钟10次尝试；其他写请求每IP每分钟120次。JSON正文上限24KB。会话有效期8小时，退出或过期后不可继续使用。

## 存储与恢复

默认数据库在data/platform.sqlite，包含users、sessions、catalog_items、submissions和review_logs。
使用外键、WAL、参数化SQL、事务及条件状态更新；撤回后旧页面不能再次审核通过。

catalog_items是简化JSON记录表。仅空目录在首次启动时导入fixtures/catalog.json；后续重启不会覆盖数据或重新发布被隐藏的资料。改fixtures不会更新已有数据库。下一阶段应补管理后台/导入命令和数据库迁移；本版没有这些管理接口。

公开目录过滤published=0的记录，并检查来源可见性；检索只查询公开目录，不查待审投稿。
内置目录仍为虚构演示数据。

在线备份：

~~~powershell
cd ./backend
pnpm backup
~~~

结果写入data/backups/。使用SQLite在线backup API，可在服务运行时执行。不要在数据库活动时只复制.sqlite而漏掉WAL。

恢复时先停止后端，保留现有data副本，将选定备份复制到新路径，在.env中设置DB_PATH指向新数据库，再启动验证。备份含账号摘要和会话，需限制访问；正式恢复后建议清空sessions让用户重新登录。

若要重置演示环境，请先停服务并备份，再将整个data目录改名保留。不要只删数据库、留下dev-accounts.txt，首次初始化使用排他创建，避免覆盖旧密码清单。

删除投稿会删除正文，同时清空关联审核日志的submission_id、actor_id和note，仅留动作、时间。历史备份中的内容须另按保留周期清理，不能把数据库删除视为物理介质即时擦除。

## RAG与Agent的接入点

请求：

~~~json
POST /api/qa/retrieve
{"question":"校园"}
~~~

返回mode=retrieval-only、answer=null、citations、matches和insufficientEvidence=true。它只提供关键词相关线索，不表示证据足够回答。没有调用大模型、没有向量检索、没有模型费用。

下一步：
1. 用已考证且允许用于问答的资料替换演示内容。
2. 建chunk表，保留sourceId、页码、正文和访问范围。
3. 迁移PostgreSQL并启用pgvector，增加Embedding与向量检索。
4. 合并关键词、向量召回，筛选证据，再增加/api/qa生成与引用校验。
5. Agent只调用人物、事件、关系和资料检索等白名单只读工具。
6. 模型密钥只存后端环境变量，不放进VITE_*。

## 检查与后续工作

~~~powershell
pnpm run build
pnpm test
~~~

4组接口集成测试覆盖：目录过滤与检索、登录/退出/过期、所有权隔离、角色权限、审核状态冲突、撤回删除、审计匿名化、数据库重开后的持久化、来源校验、输入校验和限流。测试不修改实际项目数据。

前端另有8项逻辑测试和生产构建检查。src/model.ts目前是前端协议快照，修改字段时须同步两边；后续可抽成共享包。

正式上线还需要学校邮箱验证或SSO、账号管理/恢复、HTTPS与安全Cookie、数据库迁移、分页、并发评估、日志告警和维护责任人。本版本不应直接用于真实用户公网服务。

参考：[Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[Express路由](https://expressjs.com/en/guide/routing/)。
