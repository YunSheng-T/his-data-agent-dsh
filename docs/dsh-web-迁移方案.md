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

### 数据流（关键）
- host 端：新增 `dsh-api-his-repo-controller`（把 hisRepo.branches()/treeWithState()/status() 暴露成 RPC）。
- client 端：经 @deepseek-ai/dsh-api-remotes + controller 拿树数据，React 组件订阅渲染。

### 挂载 slot
- 复用 sidebar 现有子槽或声明新槽（ctx.slots.register 的 children）。

### 依赖（peerDependencies）
- @deepseek-ai/dsh-client-ui-slots / ui-renderer / ui-session / ui-sidebar / client-connection / client-store
- @deepseek-ai/dsh-api-remotes + 自建 his-repo-controller
- react ^18、@deepseek-ai/cordis

### 构建
- 每个 client 插件独立 npm 包，tsdown 构建出 lib/index.js + lib/client.js。
- 注册进 his-web profile 的 bundle/patch（client 插件经 dsh.client 声明自动发现）。

## 八、风险与不变量

- 领域工具契约不变（ontology.*/scan.*/repo.* 调用契约不动）。
- gated 写操作确认（aVerdict）语义不变，只改呈现。
- 审计流水后补（本轮不做，但 slot 预留）。
- 分支不合并回 main。
