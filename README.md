# HIS Data Agent · P0 工程

> 状态：P0–P4 完成 · 建模/开发/运维编排三条旅程均在真实模型（DeepSeek）+ 审批门禁下端到端跑通，
> 三栏工作台表层（his-studio）已可通过浏览器驱动完整旅程（审批卡片确认/打回、Session Log 落盘）
> 前置阅读：`HIS-Data-Agent-P0P1/his-data-agent/prompts/01-P0-建模空间实施.md`（含 M0 穿刺修正）
> 读代码导读：`docs/STRUCTURE.md`（每个包/文件负责什么、扩展改哪里）

## 布局

```
his-data-agent/
├── dsh-home/profiles/
│   ├── his-data-agent/               # headless Profile：bundles(dsh-base+headless)，跑完即退
│   ├── his-agent-internal/           # M2 穿刺 Profile：OpenAI 兼容内网 LLM 网关路由模板（改 baseURL 即用）
│   └── his-studio/                   # 工作台 Profile：bundles(仅 dsh-base)，进程常驻 + HTTP 表层
│       └── cordis.patch.yml          # 两个 profile 同步：禁用 shell/file-write/web/遥测/子代理/workflow
├── packages/
│   ├── approval-policy/              # @his/approval-policy：五级 risk 边界 + fail-closed + 双保险
│   ├── domain-tools-modeling/        # @his/domain-tools-modeling：建模域 12 个工具（definitions/provider-mock/seed-data）
│   ├── domain-tools-dev/             # @his/domain-tools-dev：开发域 17 个工具（ast/codegen/lint/lineage + cicd/sched/dryrun Provider）
│   ├── workspace-repo/               # @his/workspace-repo：多租户仓门面（provider-tenants 守卫）+ git Provider + 种子仓
│   ├── workspace-anchor/             # @his/workspace-anchor：锚定工具 + pre-step 摘要注入
│   └── studio-ui/                    # @his/studio-ui：node:http 三栏工作台（端口 7300）
│       ├── index.js                  #   会话/审批/模型/代码仓/租户五类端点 + UI 应答器
│       └── public/                   #   单文件前端 index.html + vendor/x6.js（ER 图，锁 2.18.1）
└── tests/regression/                 # 14 套断言 + e2e 驱动器：静态单测 + 旅程日志分析 + studio 端点/端到端
```

## 前置依赖（跨平台）

| 依赖 | 用途 | Windows 安装 |
|---|---|---|
| Node.js ≥ 20、pnpm | 运行时与依赖 | 官网安装包 / `winget install pnpm` |
| git | 代码仓 Provider 基于真实 git | Git for Windows（自带 Git Bash） |
| zstd（仅回归断言需要） | 解压会话日志 `session.jsonl.zstd` | `winget install facebook.zstd`；不装则旅程类断言跑不了，纯静态断言不受影响 |
| DeepSeek API Key | 模型接入 | 问项目维护者要，只走环境变量 |

> Windows 用户注意：下文所有命令给出 **bash（macOS/Linux/Git Bash）** 与 **PowerShell** 两种写法；cmd 不支持多行续行与内联环境变量，不建议用 cmd 执行。

## 克隆重建（GitHub）

仓库：`github.com/YunSheng-T/his-data-agent-dsh`（private）。会话日志、种子仓、node_modules 均不入库，克隆后按以下步骤重建：

```bash
git clone git@github.com:YunSheng-T/his-data-agent-dsh.git
cd his-data-agent-dsh

# 1. 一键装齐依赖：根目录（含 @deepseek-ai/dsh，钉死 0.1.1-rc.2）+ 两个 profile 的插件
pnpm run setup

# 2. 无需手工准备种子仓/会话目录：
#    runtime/repos/ 首次启动由 packages/workspace-repo/seed-repo.js 自动重建
#    dsh-home/sessions 随会话自动产生（本地日志，不入库）

# 3. 设密钥（只需一次；bash 用 export，PowerShell 用 $env:DEEPSEEK_API_KEY = "sk-xxx"）
export DEEPSEEK_API_KEY=sk-xxx

# 4. 启动（见下方「运行」节）
```

> 依赖说明：`@deepseek-ai/dsh` 已声明在根 `package.json`（`dsh-base` bundle 是它的传递依赖，profile 不用单独装）；启动统一走 `scripts/dsh-run.mjs` 启动器——自动把 `DSH_HOME` 指向仓库内 `dsh-home`、以 `node --expose-internals` 直起 dsh 入口（studio 的 HMR 插件要求该 flag，否则 plugin tree 加载失败；启动器已内置，无需手动加），bash / PowerShell / cmd 行为一致。

## 在另一台电脑跑起来（从零到 Studio）

**前提**：Node ≥ 20、pnpm、git 装好（见上方「前置依赖」）。

```bash
# 1. 克隆（HTTPS 或 SSH 均可；private 仓需有该仓权限）
git clone git@github.com:YunSheng-T/his-data-agent-dsh.git
cd his-data-agent-dsh

# 2. 一键装依赖：根目录 + 三个 profile（his-data-agent / his-studio / his-agent-internal）
pnpm run setup

# 3. 设模型密钥（只需一次，只走环境变量，不落文件）——二选一：
#    内部模型（推荐，用 OpenAI 兼容内网网关）：export INTERNAL_LLM_API_KEY=xxx
#    外网 DeepSeek：                          export DEEPSEEK_API_KEY=sk-xxx
export INTERNAL_LLM_API_KEY=xxx      # PowerShell: $env:INTERNAL_LLM_API_KEY = "xxx"（用内部模型）；外网则 export DEEPSEEK_API_KEY=sk-xxx

# 4. 启动三栏工作台（首启自动重建种子仓 runtime/repos、会话目录随用随建）
pnpm run studio
# 浏览器打开 http://localhost:7300/ 即进入工作台

# 5. （可选）跑一遍全量回归确认环境 OK
pnpm run test:regression
```

> 新电脑常见坑：
> - **Studio 起不来 / 报 `--expose-internals is required for HMR service`** → 用 `pnpm run studio`（启动器已带 flag），别直接 `node node_modules/.../bin.js`（会因 HMR 失败）。
> - **`pnpm run setup` 报 `ERR_PNPM_IGNORED_BUILDS`** → 忽略构建脚本告警即可，不影响运行；若确实要跑 node-pty/koffi 等原生依赖，`pnpm approve-builds`。
> - **启动报「未设置模型密钥」** → 内部模型用 `export INTERNAL_LLM_API_KEY=xxx`（并确认 his-studio/his-agent-internal 的 cordis.patch.yml 里 `llm-pi-ai` 的 `baseURL` 已指向内网网关）；外网用 `export DEEPSEEK_API_KEY=sk-xxx`。环境变量不跨终端，开新终端要重设。
> - Windows 用户：命令在 Git Bash / PowerShell 执行；`export` 换成 `$env:NAME = "..."`。

## 运行

以下命令全平台通用（在仓库根目录执行；密钥环境变量需提前设好，见上）：

```bash
# headless（CI / 单任务）
pnpm run agent -- "你的建模任务指令"

# 三栏工作台（浏览器交互，进程常驻）
pnpm run studio
# 然后浏览器打开 http://localhost:7300/

# 全量回归（17 套断言；studio 未启动时自动跳过 studio 依赖型套件并明示）
pnpm run test:regression
```

进阶（按需）：

```bash
# 打回路径回归：先设 HIS_REJECT_TOOL=std_create_draft，再单独跑断言
HIS_REJECT_TOOL=std_create_draft node tests/regression/assert-journey.mjs reject-draft   # bash
# PowerShell: $env:HIS_REJECT_TOOL = "std_create_draft"

# Code 模式旅程需额外设 DSH_TOOLS_MODE=code（bash 内联前缀 / PowerShell `$env:DSH_TOOLS_MODE = "code"`）

# 表层端到端（需 studio 已在跑）
node tests/regression/e2e-studio.mjs
```

> 若想绕开启动器直接调 dsh：bash 用 `node_modules/.bin/dsh`，PowerShell 用 `node_modules\.bin\dsh.cmd`，并自行设置 `DSH_HOME` 指向 `dsh-home`。

## 内网运行（his-agent-internal · OpenAI 兼容网关）

模型路由切到内网 LLM 网关（llm-pi-ai 桥，OpenAI 兼容协议），其余能力与外网 profile 完全一致：

```bash
# 0. 拉最新代码后必须补装依赖（link: 依赖变化不会自动同步，ops 等插件缺失就是没跑这步）
pnpm run setup

# 1. 改网关地址（一次性）：dsh-home/profiles/his-agent-internal/cordis.patch.yml
#    llm-pi-ai → providers.internal-openai.baseURL 改成你们网关地址；models[0].id 改成网关真实模型 id

# 2. 设内网网关凭据（不是 DEEPSEEK_API_KEY——启动器按 profile 校验对应 key）
export INTERNAL_LLM_API_KEY=xxx        # PowerShell: $env:INTERNAL_LLM_API_KEY = "xxx"

# 3. 启动 headless Agent
pnpm run agent:internal -- "你的任务指令"
```

排错要点：

- **启动报「未设置 DEEPSEEK_API_KEY」** → 你跑的是外网 profile（`pnpm run agent`）；内网用 `pnpm run agent:internal`，校验的是 `INTERNAL_LLM_API_KEY`。
- **ops_* 工具不存在 / 日志无 `[domain-tools-ops] registered`** → profile 依赖没装或代码不是最新：`git pull` 后重跑 `pnpm run setup`，启动日志应看到 `domain-tools-ops registered: ops_screen…ops_callback · 作业目录 8 个`。
- 内网无 zstd 时旅程类断言跑不了（纯静态断言不受影响），见「前置依赖」节。

## 关键约定

- **risk 标注是自有约定**（挂在 ToolDefinition 对象上），审批插件只认标注不认工具名；未标注 fail-closed。
- **工具命名用下划线不用点**（`model_read_fields`）：DeepSeek/OpenAI wire 格式不接受点号；域分组靠前缀表达。
- **高危模式在 pre-execute 先 deny**，guard 只做兜底（M0 穿刺结论）。
- **审批摘要走 reason 字段**：approval/request 不携带工具参数。
- **本地插件用 pnpm `link:` 不用 `file:`**（file: 是拷贝，改码不生效）。
- 遥测已在 patch 层禁用；密钥只走 `DEEPSEEK_API_KEY` 环境变量/凭据 seam，不落代码。

## P0 进度

- [x] Bundle/Profile 骨架 + 禁用通用写工具
- [x] 建模域工具 Definition 层（11 个）+ mock Provider（财税域三模型 + 标准库 v2.4）
- [x] 审批策略（三级 + fail-closed + 双保险 + 内置工具标注表）
- [x] 真实模型端到端：审批点恰好 3 次、绑定率 7/9、v1.1、DDL 7 处标准引用（11/11 断言通过）
- [x] 打回路径无副作用（4/4 断言通过）
- [x] 锚定与上下文注入：`workspace_anchor` 工具 + `agent/pre-step` 摘要注入（`source:{kind:'plugin',form:'notice'}` 通道，落 Session Log；同锚定只注入一次）
- [x] 审计投影：`tools/audit-projection.mjs` 从 Session Log 派生审计流水（审批决策+写入结果配对呈现）
- [x] 重放：日志可完整派生状态（断言/审计均纯日志驱动）；studio 表层历史会话从 Session Log 重放
- [x] 三栏 UI 骨架（studio-ui）：HTTP 表层跑通完整旅程（6 次审批卡片往返、58s 完成、日志落盘）

## P1 进度

- [x] 实施方案：`docs/P1-实施方案.md`（复用/改动/新建分解）
- [x] M1a 穿刺：git 分支隔离语义原生成立（零自研）
- [x] M1b 穿刺：PTC = dsh 原生 Code Mode（`DSH_TOOLS_MODE=code`），三级门禁穿透 run_code 子调度
- [x] P1-1 `@his/workspace-repo`：本地真实 git Provider（Provider 断言 17/17）+ 种子仓（财税域 2×.etl + 2×.dag）+ 两个 profile 挂载
- [x] P1-1b 锚定三级扩展：`workspace_anchor` 支持 `{branch, dir}` 代码仓定位（断言 5/5）
- [x] P1-2 `@his/domain-tools-dev` 只读工具组 9 个（断言 18/18；lint/dryrun 阻塞语义结构化返回；P0 回归复跑 11/11 无破坏）
- [x] P1-3 codegen 链路：`etl_codegen`/`dag_gen`/`etl_patch`（断言 17/17；条款 3"建模改绑定→重新生成注释即变"实证；dag_gen 内置 lint 双保险；真实模型冒烟通过）
- [x] P1-4 PTC 编排 + gated 闸门：`git_add`(workspace-write) / `git_commit`(commit) / `sched_publish`(publish，三重自检双保险) / `asset_sync`（血缘回写，模型可见作业引用）；调度系统 mock Provider seam 化；`run_code` 标 read
- [x] P1-4 新建链路真实模型验证（Code 模式，断言 9/9）：审批点恰好 2 次、dry-run 先于 commit 审批、产物两文件分离、血缘落日志；P0 回归 11/11 无破坏
- [x] P1-5 双可视化 + 代码仓树页签（断言 14/14）：左栏加代码仓区（分支 select 切换 + 目录树未提交/脏标徽）；中栏 .etl 三页签（代码/字段映射图 SVG/依赖 DAG 图）、.dag 两页签（配置/依赖图）；模型设计页展示 jobRefs 生产作业引用；血缘经 hisDevAst 服务透出（studio-ui 不跨包 import）；分支隔离 UI 路径实证（main 读 feature 文件 404）
- [x] P1-6 修改链路回归 + 验收总核（`assert-patch-journey.mjs` 三场景）：approve 13/13（lineage_downstream 先于 etl_patch、审批恰好 2 次、提交粒度 diff 只动 .etl 不动 .dag）、reject-commit 7/7（打回无副作用、工作区未提交态可继续）、blocked-publish 6/6（条款 4：lint error → 无 commit 审批点，publish 被工具层自检 blocked:true 拦截）；**回归揪出真缺陷**：etl_patch 非末列丢逗号 → 已修复 + 补 `sql.column-comma` lint error 兜底；条款 6 实况实证（改盘即变、脏标记实时）；任务书 8 条验收全部勾选
- [x] P1.5 界面对齐 V9 原型（`assert-studio-repo.mjs` 18/18）：顶栏 + 左栏双空间菜单（模型/开发切换）+ 文件多开页签（dirty 点/✕）+ 模型四页签（设计含规范性检查/ER 图/DDL/资产发布四卡含版本历史）+ ETL 四页签（V9 曲线字段映射/代码/测试运行 dry-run 面板/血缘影响）+ DAG 两页签（横向依赖图+运行策略卡/配置）+ 锚定条 + 快捷指令 chips + toast；新端点 `/api/models/:file/lint`、`/api/repo/test`（hisDryrun 服务透出）；顺手修复 parseDag 行内注释污染 cron

### P2 · 多空间联动 / 子 Agent / 资产运营（方案：`docs/P2-实施方案.md`）

- [x] P2-1 反向联动 · 模型变更 → ETL 过期提醒（`assert-impact.mjs` unit 10/10 + log 4/4 + studio 实证）：`parseEtl` 解析 @model 埋点（modelFile/modelVersion）；`lineage.jobsForModel` 反查（注解优先、targetTable 尾名兜底）；新 read 工具 `impact_check`（stale 三态：true/false/null 未知不误报）；repo 锚定注入 ⚠ 过期提醒（落 Session Log）；studio 目录树「模型已更新」徽标 + 版本胶囊；无埋点手写作业标 null 引导人工确认

### P3 · 界面迭代 V10–V12（提示词 04：租户制代码仓 + 扫描体系 + X6 ER 图）

- [x] P3-1 基建（`assert-platform.mjs` 22/22）：租户层 `TenantRepoProvider` 门面（finance→finance-dw 全量 / risk→risk-mart 空仓；四级地址 `tenant://{tenant}/{repo}@{branch}/{path}`；单仓自动迁移多租户布局）；分包注册表（etl→主力 ETL 平台 / dag→调度平台 / etl_legacy→未接入只读演示）+ 守卫在 Provider 层硬执行（非数据租户新建、未接入分包写入一律抛错）；**`git_add`/`git_commit` 合并更名为 `repo_commit`**（暂存+提交一体，提交即自动触发 CICD 流水线）；新增 `LocalCicdProvider`（mock 适配器，流水线号 4821 起、规则集 v1.2）+ 只读工具 `cicd_scan_report`（三类扫描：设计质量=lint / SQL=分区+危险模式 / 一致性=模型绑定↔代码引用实时比对，差异可修复复扫清零）；启动补登首条流水线让扫描点有权威来源
- [x] P3-2 界面 V10/V11：顶栏租户下拉（切换全链路跟随：面包屑/仓树/工作区/快捷指令）；空租户占位视图 + 「切回 finance 租户继续」引导 chip；左栏仓树按分包分组 + 归属徽标 + etl_legacy 半透只读（点击 toast 提示不锚定）；文件行扫描状态点（✓ PASS / ⚠差异；未提交不显示）；「扫描这个作业」chip 直达 Agent 扫描流程；工作区头部挂 `tenant://` 全地址
- [x] P3-3 ER 图换 AntV X6（vendor 本地引入不依赖 CDN）：`Shape.HTML` 注册 er-table 节点（表头+字段行，内容全部实时取自模型服务）；manhattan 路由 + rounded 连接 + 1:n 边标签；**属性行真 DOM 事件委托**：点行锚定「模型 · 字段」粒度并行高亮、点实体头锚定整模型、未绑行内「＋ 补全标准」一键直达 bindfield 流程；`graph.dispose()` + shape 单次注册纪律
- [x] 配套：AGENTS.md 增补开发空间约定（repo_commit/cicd_scan_report/只读分包/租户守卫）；assert-anchor 修「最新会话」取样脆弱性（改取最新含分支锚定的会话）
- [x] P3-4 新建模型能力（`assert-model-create.mjs` 19/19）：新增 `model_create`（workspace-write·gated）——分层前缀自动推断/补齐、非法分层与重名拒绝、分区字段 dt 自动追加免绑、字段一次带入可直绑标准（与 bindStd 同口径校验库内/草案）；`model_alter_field` 升级为 upsert（字段不存在即新增，自动插到 dt 前）；新建模型即刻出现在工作台模型目录（/api/models 读 Provider 实况），后续绑标准→提版本→DDL→发布→锚定全链已实证。配套修复：三个旅程断言的会话取样改结构化判定（见采坑）

### P4 · 作业运维编排 V13（大促批量暂停/恢复 · 提示词 04 追加场景）

- [x] P4-1 基建（`assert-platform.mjs` 30/30）：文件类型契约放行 `.ops`（只写 ops/ 下）；分包注册表挂「制品包通道」；锚定 dir 白名单含 ops；CICD 扫描链接入 `.ops`（`scanOpsFile` 文本规则：命令格式 / IF EXISTS 覆盖率 / 分层注释完整性 / DROP·STOP·KILL·DELETE 高危词 fail-closed / 单文件配对；跨文件配对与环检测属编排域权威，槽位 pass:null 不误报）；修复 `git status` 未跟踪目录折叠导致新类型文件漏扫（`-uall`）
- [x] P4-2 工具域 `@his/domain-tools-ops`（`assert-ops.mjs` 26/26）：六工具——`ops_screen`/`ops_topo`/`ops_check`/`ops_callback`（read）、`ops_gen`（commit 级=第一道门·清单确认）、`ops_deploy`（publish 级=第三道门·重门，变更号必填+默认 MANUAL）；mock Provider：财税域 8 作业目录（6 目标三层血缘 + 2 豁免）、血缘拓扑分层（暂停=逆序/恢复=正序/层内并行，**顺序只允许血缘推导**）、镜像 DSL 生成（IF EXISTS 全覆盖 · checkpoint/fromCheckpoint 配对）、自检三件套（依赖完整性告警点名豁免项）、制品库 `ops_change_pack_{commit}.zip`（环境无关）+ 回调模拟；环检测有环拒排序转人工；DROP 从生成器结构上不存在（fail-closed）；`parseOps` 经 `hisOps` 服务透出
- [x] P4-3 界面（`assert-studio-repo.mjs` 23/23）：仓树 OPS 徽标（制品包通道）+ 扫描点扩展至 .ops；`.ops` 三页签——执行序列（拓扑分层视图，Layer 行 + 并行组 + JOB_TYPE 徽标 + OPTIONS 标注）/ DSL 代码 / 配对校验（`/api/ops/check` 镜像自动配对，权威在编排域 Provider）；编排入口 chip「大促暂停/恢复编排」（prompt 内嵌三道门口径）+ .ops 文件态 chips（扫描/复跑校验/部署/回调）
- [x] P4-4 旅程实证（`assert-ops-journey.mjs` 10/10，`e2e-ops.mjs` 多轮驱动）：**真实模型（DeepSeek）两轮独立跑通**——`ops_screen` 筛选回显 →（对话式清单确认门）→ `ops_topo` 排序 → `ops_gen` 生成 → `ops_check` 自检 → `repo_commit` 提交（CICD 复扫 .ops）→ `ops_deploy` 部署（CHG 注入 · MANUAL）→ `ops_callback` 12/12 Success；工具审批恰好 3 次且顺序严格 ops_gen→repo_commit→ops_deploy；模型自发在提交后调 `cicd_scan_report` 复核流水线结论；AGENTS.md 新增「运维编排约定」（三道门话术 / 豁免知情确认 / 只产 PAUSE·RESUME / 恢复文件同包兜底）
- [x] 配套采坑：①e2e 驱动器要处理对话式闸门（turn/end 后旅程未完则自动「确认，继续」）；②studio 的 pendingApprovals 是进程级全局——多会话并行时审批应答会串线（两轮旅程互为对方开门，后续如需并行会话要按 sessionId 隔离）
- [x] 审批卡体验修正（V13 复盘）：**确认门一律走审批卡、禁止对话式确认**——AGENTS.md 明写「不要把清单贴进回复问『确认吗』然后结束回合」，gated 工具即确认门；approval-policy 摘要新增 `approvalNote` 约定（工具参数带它则优先采用，模型用业务语言写清「在确认什么」，替代 60 字符参数截断）；ops_gen/ops_deploy 将 approvalNote 设为必填并给话术要点；旅程断言补两条——审批卡携带业务话术（reason 不含 jobs=[ 截断）、ops_screen→第一道审批卡之间无 turn 中断（无对话门）。修正后旅程驱动 0 次对话门、审批严格 3 卡（assert-ops-journey 12/12）

### 采坑记录（本轮新增）

- Cordis 注册自定义服务用 `ctx.provide(name, value)`，直接赋值报 `cannot set property without provide`；
- `agent/pre-step` 注入的合成消息必须带 `source`（用 `{kind:'plugin', plugin, form:'notice', summary}`），缺 source 会在 step 边界炸 `reading 'kind'`；
- 插件间共享数据走 Cordis 服务 inject，不要跨包 import 内部文件（link: 依赖不会自动装传递依赖）；
- **P0 不做子 Agent 就必须显式摘除整套**：`subagent*`/`tool-subagent*`/`tool-jobs`，且级联摘掉注入 `subagents` 服务的 `workflow-worker-thread`/`tool-workflow`/`tool-ralph`，否则 boot 报 "entries did not activate"。不摘的话模型会自主委派子代理并陷入轮询等待；
- 自建表层创建 Agent 要抄 dsh-headless 四件事：`SessionId()` 包装、`setup` 里 `installModelSelection`、`ctx.get('loader')?.await()` 先行、turn 后 `sessions.flush()`；
- headless answerer 只在 his-data-agent profile 挂载；his-studio 用 UI 应答器（approval/request 挂成 Promise 等 POST 回写）；
- 工作台进程用 `pkill -f "dsh --profile his-studio"` 停（macOS/Linux；Windows PowerShell 用 `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object CommandLine -Match 'his-studio' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`），kill 后台 shell 的 $! 杀不到 node 子孙；
- **`DSH_TOOLS_MODE=code` 不进 profile 配置**，是运行时环境变量——headless Code 模式旅程必须显式 export，否则静默退化为普通工具模式（日志里无 tool/code-dispatch 事件）；
- `tool/code-dispatch` 事件的 `arguments` 是对象（`tool/call` 的是 JSON 字符串），断言脚本要兼容两种；
- 修改旅程的分支常从当前 HEAD 开出（而非 main），diff 断言要锚定「本次提交」粒度（`commit^..commit`），`main...branch` 会混入基线分支的历史产物；
- 打回/拦截场景的「无副作用」断言用分支历史 `git grep -F <新表达式>` 最硬——比对比 HEAD 更抗分支基线干扰；
- 门禁是双层：审批层（人/应答器）+ 工具层自检。headless 自动放行审批时，sched_publish 的三重自检仍以 `blocked:true` 软拦（isError=false），断言认结构化结果而非 isError。

### 采坑记录（P2 会话流 UX 修复）

- **`user/message` 事件的 `data` 直挂消息本体**（`content`/`source`/`role`），**没有 `message` 包装层**；`assistant/message`、`tool/result` 才是 `data.message.*`。前端投影写 `d.message ?? d` 兼容两种，否则用户消息渲染成空气泡；
- `user/message` 不等于"用户说的话"：goal 轮次（`source.kind==='goal'`）、skill 目录、系统快照、锚定注入（`his-workspace-anchor`）全是 user/message。投影必须按 `source.kind` 过滤——`user` 进会话流、锚定只显示 `summary` 摘要、其余静默跳过；
- Code 模式下模型长时间生成只有一个 `run_code` 程序，期间只有 `reasoning-chunks`/`assistant/chunk`/`text-chunks` 高频事件——不逐条渲染，但要拿来做心跳（占位行 + 状态胶囊"运行中 · 阶段 · Ns"），否则用户以为中断；
- 心跳以 `turn/start`/`turn/end` 定界；归档重放可能拿不到 turn/end，poll 侧加 90s 陈旧自动解除防假死；
- 心跳**不要做成会话流里的占位行**：每秒刷新 + `scrollIntoView` 会劫持滚动、占位还会插到迟到的用户消息上面。正解是输入区上方的固定状态条（`.a-busybar`）+ 智能滚动（append 前判 nearBottom，用户在底部才跟随）；
- Agent 回复是 Markdown（标题/表格/加粗/代码块），`textContent` 直出没法看——前端内置了 ~60 行轻量 mdToHtml（代码块/表格/标题/列表/加粗/行内代码），agent 消息走渲染、user/anchor 保持纯文本；
- **Agent「光说不做」用 AGENTS.md 调**：dsh-base 自带 `dsh-agent-instructions`，自动加载会话工作区根目录的 `AGENTS.md` 进基线上下文。写入「动手优先」约定（创建类需求默认直接调工具建草稿、审批兜底、回复 ≤5 行），比改系统提示词插件干净。新会话生效。

### 采坑记录（P3 平台化 V10–V12）

- **工具改名要三处同步**：Definition 本体、断言脚本里按名取样的地方、AGENTS.md 约定文案——漏一处就是「断言全绿但模型找不到工具」；
- `buildDevTools` 新增依赖（hisCicd）用**可选解构 + 执行期兜底报错**，老的多个构造点（测试/旅程/两条 profile）零改动；
- 「最新会话」类断言不能盲取 mtime 最新——旅程/调试会污染。按内容特征取样（如「最新含分支锚定的会话」）；
- 守卫（租户/分包只读）写在 **Provider 层硬执行**，UI 层的 toast/半透明只是体验层，防君子不防 Agent；
- studio 后端重启：`lsof -ti :7300 | xargs kill -9`（macOS/Linux；Windows PowerShell 用 `Get-NetTCPConnection -LocalPort 7300 | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }`），`pkill -f` 匹配不到（启动命令行不含可匹配模式）；
- 单仓 → 多租户布局用 `renameSync` 原地迁移 + 幂等补种，演示分支/历史全部保留，不要重建；
- **X6 `Shape.HTML.register` 是全局一次性**：重复注册直接抛错，前端加 `window._erShapeReg` 守卫；重渲染前必须 `graph.dispose()` 先销再建，否则事件委托翻倍；
- X6 边配置用对象形态（`midSide` anchor / manhattan 路由 / `targetMarker:null`），字符串简写在 2.18.1 下行为不一致；
- X6 vendor 锁版本 2.18.1 本地引入（`/vendor/x6.js`），不依赖 CDN——内网部署前提；
- `.gitignore` 不支持行尾注释；已入索引的文件加进 gitignore 也不会被忽略，要 `git rm --cached`；
- 一致性扫描的口径对齐：模型绑定写 `std/X vN`、代码写 `@std/X vN`，比对前 strip `@`，别让格式差造假差异。
- 「最新会话」断言的二次踩坑：旅程断言按 raw 字符串匹配工具名仍会被**工具 schema 快照**误中（快照里就有 `"name":"repo_commit"`），必须逐行解析事件结构判 `tool/call`/`tool/code-dispatch` 的 `data.name`；用户在日常工作室聊天就会让 mtime 最新会话不再是旅程会话；
- patch 旅程断言引用的仓路径要跟随多租户迁移（`runtime/repo-etl` → `runtime/repos/finance-dw`）。
- **dsh CLI 本身必须声明进根 `package.json`**：profile 的 `link:` 插件不会带来 dsh；之前 dsh 一直来自仓外旧工程，换台机器 clone 就「找不到 dsh」。跨平台启动用 `scripts/dsh-run.mjs` 包一层（自动指 DSH_HOME、解析 .bin、Windows 走 shell），README 只留一套 `pnpm run` 命令，避免 bash/PowerShell 双份文档漂移；
- 共享仓被多套断言迁移/补种时，依赖 studio 实时解析的套件要**最先跑**（run-all.mjs 里排序保证），否则读到中间态偶发误报。
- **patch 层可以给 bundle 内置插件传 `config`**（M2 实证：`- id: llm-pi-ai / config: ...` 与 `agent-default-model` 的默认选择覆盖均生效），不只是能 disable——接内网 LLM 网关零新依赖，模板在 `profiles/his-agent-internal`；
- **`link:` 插件的自身依赖不会被 profile 的 pnpm install 安装**：studio-ui 依赖 `@deepseek-ai/dsh-llm` 等，干净克隆必须单独 `pnpm --dir packages/studio-ui install`（已并入 `pnpm run setup`）——本机一直能跑只是因为包目录里残留着早先手工装的 node_modules；
