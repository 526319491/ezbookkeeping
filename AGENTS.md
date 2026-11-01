# AGENTS.md

## 项目概览

ezBookkeeping 是自托管个人记账应用，仓库同时包含 Go 后端和 Vue 3 前端：

- 后端：Go + Gin + xorm，模块名 `github.com/mayswind/ezbookkeeping`
- 前端：Vue 3 + TypeScript + Vite，桌面端用 Vuetify，移动端用 Framework7
- 数据库：SQLite（默认）、MySQL、PostgreSQL
- 仓库：`mayswind/ezbookkeeping`（MIT）

## 环境要求

- Go `1.27.1`（与 `go.mod`、Dockerfile、CI 一致）
- Node.js `26.x`（Docker/CI 使用 `26.10.0`）、npm
- GCC/MinGW：后端使用 `mattn/go-sqlite3`，构建和测试需要 CGO，不能只用纯 Go 工具链
- Git：前端构建通过 `git-rev-sync` 注入 commit hash，不能在无 `.git` 的源码压缩包里构建
- Windows 打包额外需要 `7z`

## 常用命令

本地开发（两个终端）：

```bash
go run . server run   # 后端 :8080，默认读取 ./conf/ezbookkeeping.ini
npm run serve         # 前端 :8081，Vite 代理 API 到 127.0.0.1:8080
```

测试与检查：

```bash
go vet ./...
go test ./... -v
go test ./pkg/services -run TestGetAccountMapByList -v   # 单个 Go 测试
npm run test                                             # vitest run
npx vitest run src/lib/__tests__/datetime.test.ts        # 单个前端测试
npm run lint                                             # vue-tsc --noEmit && eslint . --fix
```

`npm run lint` 会执行 `eslint --fix`，可能直接修改文件；提交前需重新检查 diff。

构建（脚本会先 lint + test）：

```bash
./build.sh backend|frontend|package|docker      # Linux / macOS / FreeBSD
.\build.ps1 backend|frontend|package            # Windows PowerShell
.\build.bat backend|frontend|package            # Windows CMD
```

- `--no-lint` / `--no-test`（PowerShell 为 `-NoLint` / `-NoTest`）可跳过检查。
- 后端会执行 `go clean -cache` 后跑全部测试；日常迭代直接跑上面的单测命令更快。
- 版本号来自 `package.json`；后端构建参数通过 `-ldflags -X main.*` 注入。

## 代码结构与约定

- 后端入口：`ezbookkeeping.go`；CLI 子命令在 `cmd/`（`server run`、`database update` 等）。
- 后端分层：`pkg/api`（HTTP handler）→ `pkg/services`（业务）→ `pkg/models` / `pkg/datastore`（xorm 模型与存储）。
- 数据库结构由 xorm `SyncStructs` 自动同步：新增数据表时，除了新增 `pkg/models` 结构体，还必须把该结构体加入 `cmd/database.go` 的 `updateAllDatabaseTablesStructure`。
- 前端根目录是 `src/`（Vite `root`），`@` 指向 `src/`。
- 前端有三套入口：`src/index.html` 按 User-Agent 跳转，桌面端 `desktop.html`/`desktop-main.ts`，移动端 `mobile.html`/`mobile-main.ts`；同一个功能通常需要同时改 `src/views/desktop` 与 `src/views/mobile`，通用逻辑放 `src/components/base|common`、`src/lib`、`src/core`、`src/stores`。
- 国际化在 `src/locales/*.json`，默认语言为 `en`；新增语言还需改 `src/locales/index.ts` 的 `ALL_LANGUAGES`。
- 前端测试放在对应目录的 `__tests__/*.test.ts`（不是与源码同名的 `.test.ts`）。
- 代码格式：`.editorconfig` 规定 Go 用 tab，其余默认 4 空格，`package.json` 用 2 空格。

## 注意事项

- `npm run serve` 只启动前端；不启动后端时 API 请求会失败。
- 配置默认从当前工作目录的 `conf/ezbookkeeping.ini` 读取；可用 `--conf-path` 指定，或设置 `EBK_WORK_DIR` 改变工作目录。
- `conf/ezbookkeeping.ini` 中 `secret_key` 为空会启动警告；SQLite 默认数据文件为 `data/ezbookkeeping.db`，`auto_update_database = true` 会在启动时自动同步表结构。
- 首次从源码运行前需手动创建 `data/`、`storage/`、`log/` 目录（均被 `.gitignore` 忽略），否则会报 `invalid local file system storage path` 或无法创建数据库/日志文件。
- 汇率数据源测试会访问第三方 API；CI 通过 `BUILD_PIPELINE=1` 且 `CHECK_3RD_API != 1` 跳过，本地离线环境可能失败。
- `dist/`、`data/`、`storage/`、`log/`、`package/`、后端二进制均被 `.gitignore` 忽略，不要提交构建产物。
- 不要在未明确要求时执行 commit、push 或创建 PR。

## 验证顺序

提交前至少按此顺序验证：

1. `go vet ./...`
2. `go test ./...`
3. `npm run lint`
4. `npm run test`

需要完整构建产物时用 `build.sh` / `build.ps1`，不要在 CI 之外手动拼装 `dist` 或二进制。
