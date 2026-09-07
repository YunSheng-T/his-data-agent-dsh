# HIS 迁移到标准 dsh web 方案（分支 feature/dsh-web-migration）

> 目标：把 HIS 的自建三栏前端（his-studio-ui）迁移到标准 dsh web，保留全部定制界面（拆成组件），一次性全切，审计流水后补。
> 分支：feature/dsh-web-migration（不合并回 main，独立演进）。
> 收益：官方 ui-trajectory 轨迹、dsh 插件生态（如 dsh-trajectory-debug）、React slot 体系。

## 一、现状（源码事实）

HIS = 领域插件（标准 Cordis，可零改动挂 dsh web）+ 自建 UI（his-studio-ui，唯一要拆的）。

领域插件（零改动）：
- domain-tools-dev（19 工具）/ domain-tools-modeling（12）/ domain-tools-ontology（25）/ domain-tools-ops（7）
- workspace-anchor / workspace-repo / approval-policy（服务插件）

自建 UI 三栏 6 组界面件（要拆成 React 组件）：
| 栏 | 界面件 | 现元素 |
|---|---|---|
| 左栏 | 模型目录 | model-tree |
| 左栏 | 作业目录（仓树+新建SQL+分支切换） | repo-tree/btn-new-sql/branch-sel |
| 左栏 | 审计流水（后补） | audit |
| 中栏 | 工作区（模型设计/ER/DDL/发布、代码/扫描/血缘/测试） | ws-* |
| 中栏 | 扫描结论卡 + 推理链 X6 图 | sv-card / onto-x6 |
| 右栏 | Agent 会话流（对话/轨迹）+ 锚定条 + composer | chat/trajectory/anchor-bar |

## 二、拆组件映射（HIS 界面件 -> dsh web slot）

| HIS 界面件 | 迁移成 | 挂载槽 | 依赖 |
|---|---|---|---|
| 代码仓树+分支+新建SQL | ui-his-repo-panel | sidebar slot | ui-slots + hisRepo 服务 |
| 模型目录 | ui-his-model-panel | sidebar slot | ui-slots + hisModeling 服务 |
| 工作区编辑+X6图 | ui-his-workspace | 主区/自定义 panel | ui-slots + X6(React封装) + hisDevAst |
| 扫描结论卡+推理链X6 | ui-his-scan-verdict | details panel slot | ui-slots + hisOntology |
| 锚定条+模型切换 | ui-his-anchor | conversation header slot | ui-slots + hisAnchor |
| 会话流(对话+轨迹) | 官方 ui-chat + ui-trajectory | conversation 内置 | 零开发 |
| 审计流水 | ui-his-audit（后补） | sidebar/details slot | ui-slots |

## 三、分阶段实施

1. 阶段1：领域插件挂进标准 dsh web profile（cordis patch 加 his-* 插件，零改动）。
2. 阶段2：启用官方 ui-chat + ui-trajectory，删自建会话流。
3. 阶段3：左栏拆组件（模型目录/代码仓树 React 组件挂 sidebar）。
4. 阶段4：中栏拆组件（工作区编辑+X6 图、扫描结论卡挂 details）。
5. 阶段5：锚定条/审批卡 React 组件挂 conversation slot。
6. 阶段6：审计流水（后补）。

## 四、关键依赖（需引入 React + dsh client 框架）

- @deepseek-ai/dsh-client-ui-slots（slot 注入）
- @deepseek-ai/dsh-client-ui-conversation（conversation 基础设施）
- @deepseek-ai/dsh-client-store（SnapshotStore）
- @deepseek-ai/dsh-client-ui-layout（sidebar/details 面板）
- @deepseek-ai/dsh-web-frontend（标准 web 前端 SPA，Vite 构建，dist 已在 node_modules，`dsh web` 伺服）
- @deepseek-ai/dsh-client-ui-trajectory（官方轨迹组件，已在 node_modules）
- @deepseek-ai/dsh-web（注意：这是 search/fetch provider 注册器，不是前端界面）
- AntV X6（React 封装，ER 图/推理链）

> 关键认知修正：标准 dsh web 前端 = `dsh-web-frontend`（独立 React SPA），由 `dsh web`（= --profile web）伺服；`dsh-base` 里挂的 `id: web` 只是 search/fetch provider，不是前端。`dsh-web-frontend` 和 `dsh-client-ui-trajectory` 都已在当前 node_modules/.pnpm，无需重新引入，只需启用。

## 五、标准 web profile 组成（实测 dsh web --dump-config）

`dsh web`（= --profile web）由 @deepseek-ai/dsh-base + @deepseek-ai/dsh-web-app 组成，含完整前端栈：
- 宿主：dsh-web-app（startup/app）+ client-hmr + client-connection + client-runtime + cordis-client-runner
- UI：ui-layout / ui-sidebar / ui-renderer / ui-settings / ui-chat / ui-trajectory / ui-conversation / ui-slots 等
- 领域能力（HIS 要挂进去的）：agent / agent-default-model / llm-pi-ai / session / typert 等

HIS 领域插件（domain-tools-*/workspace-*/approval-policy）是标准 Cordis 插件，挂进 web profile 的 cordis.patch.yml（或 --patch overlay）即可被 Agent 使用。

## 六、dsh client slot 插件开发范式（阶段3-5 依据，已研究）

一个 dsh client UI 插件的标准结构（以 ui-sidebar 为范本）：

```ts
// packages/ui-his-xxx/src/index.ts（host 入口，可为空）
export function apply(): void {}

// packages/ui-his-xxx/src/client/index.ts（浏览器端，注册 slot）
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
export const inject = ['slots', ...]
export function apply(ctx: ClientContext): void {
  ctx.slots.register({
    name: 'his-repo',
    children: { 'sidebar.xxx': { kind: 'single', scope: 'root' } },  // 槽定义
    inject: () => ({ ...props }),                                     // 注入数据
  }, HisRepoComponent)                                                 // React 组件
}
```

关键依赖（client 插件需引入）：
- @deepseek-ai/dsh-client-ui-slots（SlotRegistry / ctx.slots）
- @deepseek-ai/dsh-client-ui-renderer
- @deepseek-ai/dsh-client-ui-session
- @deepseek-ai/dsh-client-store（SnapshotStore）
- @deepseek-ai/dsh-client-ui-layout（sidebar/details 面板）

已有 sidebar 子槽：sidebar.brand.mark / sidebar.brand.name / sidebar.workspaces / sidebar.settings / sidebar.footer.action。HIS 的模型目录/代码仓树需挂到 sidebar 的自定义槽（用 ctx.slots.register 的 children 声明新槽，或复用 sidebar 现有子槽）。

构建：每个 client 插件是独立 npm 包（package.json + tsdown.config.ts + src/client + src/index），通过 profile 的 bundle/patch 注册。

## 七、阶段3 代码仓树组件（ui-his-repo）精确落地清单

目标：把 HIS 代码仓树（branches + treeWithState + 新建 SQL）做成 React slot 插件挂 sidebar。

### 组件包结构（packages/ui-his-repo/）
```
packages/ui-his-repo/
├── package.json          # dsh.client 声明 + exports[./client] + tsdown
├── tsconfig.json
├── tsdown.config.ts
├── src/index.ts          # host 端 apply()（空）
└── src/client/
    ├── index.ts          # ctx.slots.register('his-repo', ...) 挂 sidebar 子槽
    ├── RepoPanel.tsx     # 代码仓树 React 组件（branches 下拉 + treeWithState 列表 + 新建 SQL）
    └── ...
```

### 数据流（关键，已研究 Typert RPC 范式）
host 端经 Typert RPC 暴露服务（以 workspace-controller 为范本）：

```ts
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
export class HisRepoController extends TypertRemoteService {
  static inject = ['typert', 'hisRepo']   // hisRepo 是 workspace-repo 注册的服务
  constructor(ctx) { super(ctx, 'hisRepoController', { namespace: 'hisRepo' }) }
  @Remote('branches')  branches(req) { return ctx.hisRepo.branches() }
  @Remote('tree')      tree(req)      { return ctx.hisRepo.treeWithState(req.branch) }
}
```

client 端经 `ctx.remote.hisRepo` 调用，React 组件订阅。

关键依赖：@deepseek-ai/dsh-typert-protocol（Remote/TypertRemoteService 装饰器）+ @deepseek-ai/dsh-api-remotes（client 端 remote 命名空间）。

### 挂载 slot
- 复用 sidebar 现有子槽或声明新槽（ctx.slots.register 的 children）。

### 依赖（peerDependencies）
- @deepseek-ai/dsh-client-ui-slots / ui-renderer / ui-session / ui-sidebar / client-connection / client-store
- @deepseek-ai/dsh-api-remotes + 自建 his-repo-controller
- react ^18、@deepseek-ai/cordis

### 构建
- 每个 client 插件独立 npm 包，tsdown 构建出 lib/index.js + lib/client.js。
- 注册进 his-web profile 的 bundle/patch（client 插件经 dsh.client 声明自动发现）。

## 七·实测修正（阶段3 落地后校准，先于阶段4 组件的范式）

> 按真实 dsh 0.1.1-rc.2 slot 拓扑与构建链校准早期设计假设。阶段 4-5 各组件沿用本范式，不再逐包研究。

### 1) host 数据面：webServer JSON 路由，不用 Typert codegen
- dsh 的 Typert client 通道（ctx.remote）是 **codegen 生态**：host 贡献 + client contribution（`@deepseek-ai/dsh-typert-generator` 产 `typert.remote-client.d.ts/js`），client 侧还要被 dsh-api-remotes 装配。独立业务包手写这链条不划算。
- **实测可用路径**：host 进程自带 `dsh-host-webserver`（7400），提供 `ctx.webServer.register({kind:'exact'|'prefix', path, handler})`（node:http 原生 req/res）。host 插件注入 `['webServer','hisRepo']`，apply 里注册 `/his-repo/branches`、`/his-repo/current-branch`、`/his-repo/tree?branch=x` JSON 端点；client 同源 fetch。已实测：branch/tree 数据正确返回。
- 命名避开 dsh 已占前缀（勿用 /api/ 开头的 duplicate）；本项目用 `/his-repo/*`。
- 类型合并：`import type {} from '@deepseek-ai/dsh-host-webserver'` 引入 ctx.webServer；handler 参数 `IncomingMessage/ServerResponse`（devDep `@types/node`）。

### 2) 挂载位：conversation.view 会话视图 tab（sidebar 无第三方 big-panel 位）
- `sidebar` 是 single/root，被 ui-sidebar 独占（再注册 = 整体替换导航列，且其声明的子槽随之消失）。sidebar 内可叠加的只有 `sidebar.footer.action`（list，脚部小动作行）。
- **官方扩展面板先例 = ui-trajectory**：注册进 `conversation.view`（list/session）会话视图 tab 环（chat=order 0，trajectory=order 10）。业务面板照此 `order: 20` 起排。
- 注册写法（client apply 内）：
  ```ts
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'his-repo', order: 20, label: '代码仓',
  }, () => HisRepoPanel()))
  ```
- `ctx.slots.inject(key, cb)` = 声明生命周期注入：cb 在槽声明后同步执行（ui-conversation 声明 conversation.view），卸载时逆序释放。

### 3) 构建：host 由 tsc 发射（装饰器降级），tsdown 只产 client 闭包
- tsdown 输出**保留标准装饰器原文**（Node 22 原生 ESM 不认 → loader 报 `Invalid or unexpected token`）。官方包（dsh-commands 等）是 tsc 发射：标准装饰器自动降级为 `__esDecorate` 助手。
- **ui-his-repo 构建链**（build script）：
  `rm -rf lib && tsc -p tsconfig.build.json && tsc -p tsconfig.host.json && tsdown --config-loader tsx`
  - tsconfig.build.json：emitDeclarationOnly → lib/*.d.ts（含 src/client 类型）
  - tsconfig.host.json：include 仅 src/index.ts，发 JS → lib/index.js（main/exports 指向它，非 .mjs）
  - tsdown.config.ts：仅 clientBundle（CJS module-loader 闭包 → lib/client.js）
- package.json 需导出 `name` + `inject` + `apply`（与 his 域插件一致；loader entry 按 name 识别）。
- **client 插件被发现 = 成为 host Loader entry**：cordis.patch.yml insert 加 `- id: ui-his-repo name: '@his/ui-his-repo'` + profile package.json 依赖 link。`dsh-client-modules` 扫描 entry 的 dsh.client 声明 → 伺服 `/plugins/<id>/client.js` → 写进 boot manifest（实测 manifest 含该行）。
- pnpm：node_modules 由 pnpm 11 装（store v11），须用 `~/Library/Application Support/DSH Desktop/runtime-commands/bin/pnpm`（v11.8.0），brew pnpm(10) 会因 store 版本拒绝。profile 内 install 用 `CI=true pnpm install --no-frozen-lockfile`。
- lib/ 构建产物入库（profile 是 link: 依赖，运行时直接读 lib）。

### 4) 验证
- `curl http://127.0.0.1:7400/` → boot manifest（window.__DSH_BOOT__）含 `"id":"@his/ui-his-repo"` + url `/plugins/@his/ui-his-repo/client.js?rev=...`。
- `curl http://127.0.0.1:7400/his-repo/branches` / `/his-repo/tree?branch=main` → 真实数据。
- UI 出现：会话顶部视图环出现「代码仓」tab（chat/trajectory 之后），点开见分支下拉 + 文件树（未提交/已修改标注）。


## 八、风险与不变量

- 领域工具契约不变（ontology.*/scan.*/repo.* 调用契约不动）。
- gated 写操作确认（aVerdict）语义不变，只改呈现。
- 审计流水后补（本轮不做，但 slot 预留）。
- 分支不合并回 main。