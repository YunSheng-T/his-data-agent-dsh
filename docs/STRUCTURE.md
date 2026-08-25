# 代码仓结构说明

> 读代码的第一站：每个包/文件负责什么、边界在哪、扩展时改哪里。
> 配套阅读：`docs/技术架构.md`（为什么这么分层）、`docs/功能架构.md`（产品视角）。
> 本文件随结构演进同步更新；最后更新对应提交：审批卡 approvalNote 修复（b19209d）之后。

## 总览：一条消息怎么流过这个仓

```
用户指令（studio 右栏 / headless CLI）
  → dsh agent loop（@deepseek-ai/dsh，node_modules 里的底座）
  → AGENTS.md 工作约定注入（仓库根，按会话 cwd 解析）
  → 工具调用 → packages/* 的 Definition（契约 + risk 标注）
  → approval-policy 按 risk 拦截（审批卡 / 放行 / 高危硬阻断）
  → Provider 层执行（演示态 mock：内存/git 本地；正式版换平台 API）
  → 事件落 Session Log（dsh-home/sessions/，审计与旅程断言的事实源）
  → studio-ui 轮询事件流渲染（纯渲染，不维护第二份状态）
```

两条铁律贯穿全仓：

1. **Seam 三层**：每个领域包 = `definitions.js`（工具契约/执行器）+ `provider-*.js`（可替换适配层，演示态为 mock）+ `index.js`（装配：注册工具、透出 Cordis 服务）。扩展新能力 = 加 Definition；接真实平台 = 换 Provider，**契约与 UI 不动**。
2. **插件间不 import 对方文件**：跨包能力走 Cordis 服务（`ctx.provide` / `inject`），如 `hisRepo`、`hisModeling`、`hisDevAst`、`hisOps`、`hisCicd`。

## 根目录

| 文件 | 职责 |
| --- | --- |
| `AGENTS.md` | 模型的「作业手册」：动手优先、开发空间约定、运维编排三道门话术。按会话 cwd 解析（dsh-run.mjs 启动前会 chdir 到仓库根，防丢约定） |
| `README.md` | 安装/运行/内网运行/进度/采坑记录 |
| `package.json` | 只声明 `@deepseek-ai/dsh`（钉版本）+ 四个脚本（setup / studio / agent / agent:internal） |

## packages/ — 七个插件包（Cordis 插件，profile 按需挂载）

### `workspace-repo/` — 代码仓工作区（一切文件读写的唯一入口）

| 文件 | 职责 |
| --- | --- |
| `provider-git.js` | 单仓 git Provider：已提交视图/工作区严格分离、分支切换、提交、`fileKind` 文件类型契约（.etl/.dag/.ops，其余拒写）、分包目录约束 |
| `provider-tenants.js` | 多租户门面 `TenantRepoProvider`：tenant→仓映射、四级地址 `tenant://{tenant}/{repo}@{branch}/{path}`、分包注册表（etl→主力 ETL 平台 / dag→调度平台 / ops→制品包通道 / etl_legacy→未接入只读）、守卫硬执行（非数据租户禁新建、未接入分包只读） |
| `seed-repo.js` | 种子仓内容（财税域 ETL 工程），首次启动自动重建 `runtime/repos/` |
| `index.js` | 装配：持仓、注册 `hisRepo` 服务 |

### `domain-tools-modeling/` — 建模域工具（设计态）

| 文件 | 职责 |
| --- | --- |
| `definitions.js` | 12 个工具契约：model_create / model_read_fields / model_lint / std_search / std_create_draft / model_bind_std / model_alter_field / model_commit / ddl_gen / asset_register / lineage_attach / std_ref_scan（risk 标注在定义上） |
| `provider-mock.js` | 建模空间内存替身：模型/字段/标准库/版本/发布状态机 + `anchorSummary`（锚定摘要）+ `attachJobRef`（血缘回写） |
| `seed-data.js` | 种子模型与标准库 |
| `index.js` | 装配：透出 `hisModeling` 服务 |

### `domain-tools-dev/` — 开发域工具（代码态）

| 文件 | 职责 |
| --- | --- |
| `definitions.js` | 16 个工具契约（job_read / ast_locate / lineage_* / impact_check / code_lint / partition_check / danger_scan / test_dryrun / etl_codegen / dag_gen / etl_patch / repo_commit / sched_publish / asset_sync / cicd_scan_report）+ `scanEtlJob`/`scanOpsFile`（CICD 扫描规则的本地计算） |
| `ast.js` | .etl/.dag 解析器（注解头、列映射、转换函数、标准引用） |
| `lint.js` | 规范检查（error/warn 结构化清单） |
| `codegen.js` | 从模型版本生成 .etl（逐列注释带标准引用）、生成 .dag、列级 patch |
| `lineage.js` | 血缘索引：upstream/downstream/jobsForModel（@model 埋点优先，targetTable 兜底） |
| `provider-cicd.js` | CICD 适配器 mock：流水线登记、报告查询、`scanVerdict` 汇总判定 |
| `provider-dryrun.js` | dry-run 沙箱 mock（只读/行数上限/超时约束固化在这层） |
| `provider-sched.js` | 调度系统适配器 mock（上线登记） |
| `index.js` | 装配 + 启动补登首条流水线（扫描点的权威来源）；透出 `hisDevAst` / `hisDryrun` / `hisCicd` |

### `domain-tools-ops/` — 运维编排域工具（运行态，V13）

| 文件 | 职责 |
| --- | --- |
| `definitions.js` | 6 个工具契约：ops_screen / ops_topo / ops_gen（commit 级=第一道门）/ ops_check / ops_deploy（publish 级=第三道门）/ ops_callback；approvalNote 必填（审批卡话术） |
| `provider-mock.js` | 编排 Provider mock：作业目录筛选、血缘拓扑分层（暂停逆序/恢复正序/环检测）、镜像 DSL 生成、自检三件套、制品库 + 回调模拟；`parseOps`（.ops → 结构化，studio 三页签的解析源） |
| `seed-data.js` | 财税域 8 作业元数据目录（6 目标三层血缘 + 2 豁免） |
| `index.js` | 装配：透出 `hisOps` 服务（parseOps + provider） |

### `approval-policy/` — 人机边界策略（审批闸门的唯一实现）

| 文件 | 职责 |
| --- | --- |
| `index.js` | risk 标注驱动：read/workspace-write 自动放行，commit/publish/knowledge-write 抛审批点，未标注 fail-closed；高危词（DROP/TRUNCATE/无分区覆盖）双层硬阻断（pre-execute + tools.guard）；`approvalNote` 约定（审批卡说人话） |
| `answerer.js` | headless 模拟应答器（HIS_ANSWER / HIS_REJECT_TOOL 环境变量驱动）；真实部署由 studio-ui 审批按钮替代 |

### `workspace-anchor/` — 锚定与上下文注入

| 文件 | 职责 |
| --- | --- |
| `index.js` | `workspace_anchor` 工具（锚定模型 / 仓三级定位）；`agent/pre-step` 挂钩：锚定变化时注入结构化摘要（带 source 的合成 user 消息，落 Session Log）；模型升版 stale 作业点名提醒 |

### `studio-ui/` — 三栏工作台表层（node:http 自建）

| 文件 | 职责 |
| --- | --- |
| `index.js` | HTTP 服务：会话事件流轮询、审批决策回写（UI 应答器）、文件/模型/血缘/dry-run/配对校验端点、发消息建会话。UI 纯渲染原则：状态全部来自 Provider 或 Session Log 投影 |
| `public/index.html` | 单文件前端：模型目录/仓树（租户下拉、分包徽标、扫描点）、工作区页签（模型四页签 / ETL 四页签 / dag 两页签 / ops 三页签）、X6 ER 图、右栏 Agent 会话流（轻量 Markdown 渲染 + 审批卡 + chips 快捷指令） |
| `public/vendor/x6.js` | AntV X6 本地引入（锁 2.18.1，不依赖 CDN，内网可跑） |

## dsh-home/profiles/ — 四个运行形态（patch 层装配）

| Profile | 用途 | 与其他差异 |
| --- | --- | --- |
| `his-data-agent` | headless CLI（CI/单任务） | 挂 answerer（模拟审批应答） |
| `his-studio` | 三栏工作台 | 挂 studio-ui 代替 answerer |
| `his-agent-internal` | 内网形态 | 模型路由切 `llm-pi-ai`（OpenAI 兼容内网网关），凭据走 `INTERNAL_LLM_API_KEY` |
| `headless` | dsh 原生最小形态 | 基线对照用，一般不动 |

每个 profile：`cordis.patch.yml`（禁用 dsh 内置工具 + insert his-* 插件 + 插件 config）+ `package.json`（`link:` 依赖，**改了 packages/ 要重跑 `pnpm run setup`**）。

## scripts/

| 文件 | 职责 |
| --- | --- |
| `dsh-run.mjs` | 统一启动器：DSH_HOME 指向仓内、chdir 仓库根（AGENTS.md 按 cwd 解析）、按 profile 校验凭据（internal→INTERNAL_LLM_API_KEY，其余→DEEPSEEK_API_KEY）、Windows 下解析 dsh.cmd |
| `mock-openai.mjs` | M2 穿刺用的 OpenAI 兼容假网关（:8300），返回带标记的应答供 wire 级断言 |

## tests/regression/ — 14 套断言 + 2 个 e2e 驱动器

| 分层 | 文件 | 覆盖 |
| --- | --- | --- |
| Provider/工具单测（无模型） | assert-repo / assert-codegen / assert-dev-tools / assert-gates / assert-impact / assert-model-create / assert-platform / assert-ops | 直调 Provider 与 Definition，秒级 |
| 旅程日志分析 | assert-journey / assert-patch-journey / assert-dev-journey / assert-anchor / assert-ops-journey | 解析 Session Log（zstd）做结构化断言：审批次数与顺序、工具链、产物语义。**依赖本机已驱动的会话**（换新机器先跑 e2e 驱动器） |
| studio 端点 | assert-studio-repo | 打 :7300 的 HTTP 端点 + 前端静态断言（studio 没起会自动跳过） |
| e2e 驱动器（不是断言） | e2e-studio / e2e-ops | 经 studio HTTP 驱动真实模型跑旅程，自动应答审批卡/对话门 |
| 总入口 | run-all.mjs | 逐个跑 assert-*，DSH_HOME 自动就位，studio 依赖型排最前 |

## docs/

| 文件 | 职责 |
| --- | --- |
| `P1-实施方案.md` / `P2-实施方案.md` | 阶段实施任务书 |
| `功能架构.md` / `技术架构.md` | 汇报用架构文档（4+1 视角） |
| `STRUCTURE.md`（本文件） | 代码导读 |

## 扩展指引（最常问的三件事）

1. **加一个新工具**（如 ETL 修改能力的增强）：进对应域包的 `definitions.js` 加定义（标 risk）→ Provider 层加实现 → 写一套 `assert-*.mjs`（run-all 自动发现）→ 若模型需要知道使用时机，在 `AGENTS.md` 补约定。
2. **加一个新文件类型**（如 `.yaml` 数据标准文件）：`provider-git.js` 的 `fileKind` 放行 → `provider-tenants.js` 分包注册表挂平台归属 → CICD 扫描函数 → studio 页签与徽标 → 断言。参照 P4-1/P4-3 四个提交的 diff 就是完整范例。
3. **接真实平台**（调度/CICD/制品库/LLM 网关）：只换对应 `provider-*.js` 或 profile 的 patch config，工具契约、审批策略、UI 一律不动——这是 Seam 三层存在的意义。
