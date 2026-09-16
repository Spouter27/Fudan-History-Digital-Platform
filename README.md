# 校史数字化共创平台：协作分享版

解压整个项目，在本目录打开终端。可放在任意盘符、中文或带空格的目录中，不需要原作者的目录或 Codex 环境。

## 环境

每位协作者自行安装 Node.js 24.x 与 pnpm 11.19.0，并确保它们在自己的 PATH 中。项目无法携带或继承原作者电脑的 PATH。

~~~powershell
node --version
pnpm --version
~~~

已安装 Node.js 而没有 pnpm 时，可执行 npm install -g pnpm@11.19.0，然后重新打开终端。首次安装依赖需要联网。

## 初始化和启动

以下命令都在解压后的项目根目录执行：

~~~powershell
pnpm run setup
~~~

初始化会分别按锁文件安装前后端依赖，复制 backend/.env.example 到 backend/.env、frontend/.env.example 到 frontend/.env.local。已有配置不会被覆盖。默认使用真实本地后端的 api 模式。

打开两个终端，均位于项目根目录：

~~~powershell
# 终端一
pnpm dev:backend
~~~

~~~powershell
# 终端二
pnpm dev:frontend
~~~

打开 http://127.0.0.1:5173/#/login 。每个终端按 Ctrl+C 停止对应服务。
首次启动会在 backend/data/dev-accounts.txt 生成该协作者自己的开发账号和随机密码，数据库也在本机新建。分享包没有原作者账号、投稿、会话或数据库。

## 检查与再次分享

~~~powershell
pnpm check
pnpm share
~~~

check 运行两端测试和构建；后端 build 目前是类型检查。
share 使用 Windows PowerShell 将源码打包到 release/，输出 SHA256。其他系统可按 scripts/share.ps1 的文件范围手动打包，安装和运行命令跨平台。

打包排除 node_modules、dist、.git、.qa、本地 data、.env（保留 .env.example）、日志和旧分享包。新增文件如含私人信息，分享前仍须自行复核。不要直接将整个工作目录压缩给他人。

目前保留两个独立子项目和各自锁文件。根 package.json 仅提供统一入口，不是已完成的 pnpm workspace；请使用 pnpm run setup，不要用根目录 pnpm install 代替。

## 路径约定

- 源码路径相对于当前文件或项目根目录解析，不依赖启动终端的原作者路径。
- DB_PATH=./data/platform.sqlite 相对于 backend 目录。
- 前端 /api 是同源 HTTP 路径，不是本机磁盘绝对路径；127.0.0.1 是每位协作者自己的电脑。
- 不复制他人的 .env.local；修改 .env.example 后，已有本机配置需要手动同步。
- 默认前端5173、后端3000。端口占用时先关闭对应服务；自定义端口需同步代理和 ALLOWED_ORIGINS。
- 原有 .qa 是本机历史浏览器验证产物，不随分享包发布，不属于 pnpm check。

## 进一步说明

[当前运行说明](运行说明.md) · [详细工程规划](docs/工程结构与技术实施说明.md) · [后端说明](backend/README.md)

资料和账号均用于演示。该版本可用于协作者本地开发，尚不是公网生产部署版本。

