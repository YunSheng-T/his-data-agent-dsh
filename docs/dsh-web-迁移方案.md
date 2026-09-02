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
- @deepseek-ai/dsh-web（标准 web 宿主，dsh-base 已含）
- AntV X6（React 封装，ER 图/推理链）

## 五、风险与不变量

- 领域工具契约不变（ontology.*/scan.*/repo.* 调用契约不动）。
- gated 写操作确认（aVerdict）语义不变，只改呈现。
- 审计流水后补（本轮不做，但 slot 预留）。
- 分支不合并回 main。
