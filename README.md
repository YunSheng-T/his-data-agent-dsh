# HIS Data Agent · P0 工程

> 状态：P0 完成 · 建模旅程在真实模型（DeepSeek v4-flash）+ 三级门禁下端到端跑通，
> 三栏工作台表层（his-studio）已可通过浏览器驱动完整旅程（审批卡片确认/打回、Session Log 落盘）
> 前置阅读：`HIS-Data-Agent-P0P1/his-data-agent/prompts/01-P0-建模空间实施.md`（含 M0 穿刺修正）

## 布局

```
his-data-agent/
├── dsh-home/profiles/
│   ├── his-data-agent/               # headless Profile：bundles(dsh-base+headless)，跑完即退
│   └── his-studio/                   # 工作台 Profile：bundles(仅 dsh-base)，进程常驻 + HTTP 表层
│       └── cordis.patch.yml          # 两个 profile 同步：禁用 shell/file-write/web/遥测/子代理/workflow
├── packages/
│   ├── approval-policy/              # @his/approval-policy：三级边界 + fail-closed + 双保险
│   │   ├── index.js                  #   策略本体（pre-execute + guard）
│   │   └── answerer.js               #   headless 模拟人工应答器（环境变量控制确认/打回）
│   ├── domain-tools-modeling/        # @his/domain-tools-modeling：建模域 11 个工具
│   │   ├── definitions.js            #   Definition 层契约（JSON Schema + risk 标注）
│   │   ├── provider-mock.js          #   Provider 层：宿主平台内存替身（可整层替换）
│   │   └── seed-data.js              #   财税域种子数据（移植自 V9 原型 MODELS）
│   ├── workspace-anchor/             # @his/workspace-anchor：锚定工具 + pre-step 摘要注入
│   └── studio-ui/                    # @his/studio-ui：node:http 三栏工作台（端口 7300）
│       ├── index.js                  #   会话/审批/模型文件/代码仓四类端点 + UI 应答器
│       └── public/index.html         #   三栏：模型树+代码仓树+审计流水 / 设计+DDL+代码+字段映射图+依赖DAG / 会话流+审批卡片
└── tests/regression/
    ├── assert-journey.mjs            # 回归断言：只认 Session Log 事件序列
    ├── assert-studio-repo.mjs        # P1-5：代码仓端点 + 双可视化数据契约（需 studio 在 :7300）
    └── e2e-studio.mjs                # studio 表层端到端：chat→轮询→审批回写→落盘验证
```

## 运行

```bash
cd dsh-home/profiles/his-data-agent && pnpm install   # 插件用 link: 挂源码，改码即生效
cd ../../../..

# headless（CI / 回归）
DSH_HOME=$PWD/dsh-home DEEPSEEK_API_KEY=sk-xxx \
  /path/to/dsh --profile his-data-agent "你的建模任务指令"
DSH_HOME=$PWD/dsh-home node tests/regression/assert-journey.mjs approve       # 全链路断言
HIS_REJECT_TOOL=std_create_draft 可测打回路径；断言换 reject-draft 场景

# 三栏工作台（浏览器交互）
DSH_HOME=$PWD/dsh-home DEEPSEEK_API_KEY=sk-xxx \
  /path/to/dsh --profile his-studio        # 无任务参数，进程常驻
open http://localhost:7300/                # 左栏模型树/审计，中栏设计/DDL，右栏对话+审批卡片
node tests/regression/e2e-studio.mjs       # 表层端到端（需 studio 已在跑）
```

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

### 采坑记录（本轮新增）

- Cordis 注册自定义服务用 `ctx.provide(name, value)`，直接赋值报 `cannot set property without provide`；
- `agent/pre-step` 注入的合成消息必须带 `source`（用 `{kind:'plugin', plugin, form:'notice', summary}`），缺 source 会在 step 边界炸 `reading 'kind'`；
- 插件间共享数据走 Cordis 服务 inject，不要跨包 import 内部文件（link: 依赖不会自动装传递依赖）；
- **P0 不做子 Agent 就必须显式摘除整套**：`subagent*`/`tool-subagent*`/`tool-jobs`，且级联摘掉注入 `subagents` 服务的 `workflow-worker-thread`/`tool-workflow`/`tool-ralph`，否则 boot 报 "entries did not activate"。不摘的话模型会自主委派子代理并陷入轮询等待；
- 自建表层创建 Agent 要抄 dsh-headless 四件事：`SessionId()` 包装、`setup` 里 `installModelSelection`、`ctx.get('loader')?.await()` 先行、turn 后 `sessions.flush()`；
- headless answerer 只在 his-data-agent profile 挂载；his-studio 用 UI 应答器（approval/request 挂成 Promise 等 POST 回写）；
- 工作台进程用 `pkill -f "dsh --profile his-studio"` 停，kill 后台 shell 的 $! 杀不到 node 子孙；
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
