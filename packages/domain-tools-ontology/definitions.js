// @his/domain-tools-ontology — definitions.js：数据开发本体的动力学层（Action + Function）
//
// 五原语归位：语义层（Object/Link）在 ontology.js，本文件把「可执行能力」归位——
//   Function（只读语义推理，risk=read）：classify_job / policies_for / rules_for / consistency_check / explain_finding / lineage / impact
//   Action（写，gated）：propose
// 显式约定：每个工具带 category（ontology-function / ontology-action），并标明这是本体的语义推理函数，非普通执行工具。
// 引用层现场派生：execute 传 ctx = { repo, modeling }（hisRepo / hisModeling），provider 据此现场投影本体图。

const S = (type, extra = {}) => ({ type, ...extra })
const PATH_ARG = { path: S('string', { description: '仓内相对路径，如 dbscript/alter_dwd_tax_payment_v4.sql' }) }
const jsonOut = { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] }
const FUNC = 'ontology-function', ACTION = 'ontology-action'

export function buildDefinitions(p, { repo, modeling, anchor } = {}) {
  const ctx = { repo, modeling, anchor }
  const readText = (path) => {
    if (!repo) return null
    return repo.readWorking(path) ?? repo.readCommitted(repo.currentBranch(), path)
  }
  const detectAst = (text) => /ADD\s+COLUMNS/i.test(text) ? { alterAddColumns: true } : /\b(UPDATE|INSERT\s+INTO)\b/i.test(text) ? { dml: true } : {}
  return [
    { name: 'get_anchored_object', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体推理入口｜必须先调】读当前工作区锚定的对象（workspace-anchor 的 current：建模空间模型文件，或代码仓分支+作业目录），回答「当前锚定的对象是什么」——五原语 ObjectType（Model / Directory / Job…）+ 在本体图中的直接关系（hasField / implements / inDirectory / instanceOf）+ 可达的作业类型 jobTypes。这是本体推理的起点：拿到锚定对象后，用 get_object_type（看 ObjectType 定义）与 get_links（关系遍历）沿本体边找 Platform/Policy/Rule，再用对象类型作用域查询（如 Policy.getPolicies(platform) / Rule.getImplementations(rule)）查策略规则，最后 get_scan_plan 决定扫什么、怎么扫。不要跳过锚定对象直接调用结果型 function。返回的 why 就是识别依据；**调用后必须在回复中引用识别依据**（如「锚定=代码仓 main/dbscript → 作业 1 个 → instanceOf DDL」），让用户看得懂「怎么锚定到、怎么识别到」，不要只报结论',
      parameters: { type: 'object', properties: {}, required: [] },
      output: jsonOut, execute: () => p.anchoredObject(ctx) },
    { name: 'get_object_type', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体能力 type()】ObjectType 内省：返回某对象类型的 primitive（五原语 Object）+ 属性 schema + 参与的关系类型（out/in 方向）+ 可用对象类型作用域查询（如 Policy.getPolicies(platform)）。Palantir Ontology 范式的 type() 能力；本体的只读语义推理',
      parameters: { type: 'object', properties: { type: S('string', { description: 'ObjectType 名，如 JobType / Policy / Rule / PlatformInstance / Model' }) }, required: ['type'] },
      output: jsonOut, execute: (args) => p.type(args.type) },
    { name: 'get_links', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体能力 links()】关系遍历：target 是 ObjectType 名 → 返回该类型参与的关系类型（out/in + 对端类型）；是对象 id（如 inst/dbscript、jt/schema-change、rule/rc@dbscript-field-type）→ 返回该对象沿所有关系边的实例级邻接（link 名 + 方向 + 对端对象类型/名称）。Palantir Ontology 范式的 links() 能力；沿本体边找关联对象的唯一手段',
      parameters: { type: 'object', properties: { target: S('string', { description: 'ObjectType 名或对象 id，如 JobType / inst/dbscript / jt/schema-change' }) }, required: ['target'] },
      output: jsonOut, execute: (args) => p.links(args.target) },
    // —— 对象类型作用域查询（Palantir 范式 ObjectType.method(arg)）——
    // 工具名必须用 LLM tools schema 允许的 snake_case（不能带点号，否则请求被拒）。
    // 「打印为 Policy.getPolicies(inst/dbscript)」的效果在 UI 显示层转换（见 index.html 的 ontoDisplayName）。
    { name: 'policy_get_policies', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】Policy.getPolicies(platform)：沿 covers(逆向) 取覆盖某平台实例的策略（治理目标）。如 Policy.getPolicies(inst/dbscript) → 数据库脚本平台的 3 组策略。先 get_anchored_object + get_links 拿到 platform，再调本方法',
      parameters: { type: 'object', properties: { platform: S('string', { description: '平台实例 id，如 inst/dbscript / inst/flashsync' }) }, required: ['platform'] },
      output: jsonOut, execute: (args) => p.objectQuery('Policy', 'getPolicies', args.platform, ctx) },
    { name: 'policy_get_rules', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】Policy.getRules(policy)：沿 containsRule 取某策略下的规则。如 Policy.getRules(pol/design-consistency) → 设计开发一致性策略下的字段类型/表模型/字段缺失规则。先 Policy.getPolicies 拿到 policy，再据此查规则',
      parameters: { type: 'object', properties: { policy: S('string', { description: '策略 id，如 pol/design-consistency / pol/sql-safety' }) }, required: ['policy'] },
      output: jsonOut, execute: (args) => p.objectQuery('Policy', 'getRules', args.policy, ctx) },
    { name: 'rule_get_implementations', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】Rule.getImplementations(rule)：沿 implementedBy 取某规则的实现（RuleImpl.engine/ruleset 指向执行器）。如 Rule.getImplementations(rule/rc@dbscript-field-type) → se-sql 1.8 / sql-scanner。规则只声明、执行在引擎，这里拿到「这条规则由谁扫、怎么扫」',
      parameters: { type: 'object', properties: { rule: S('string', { description: '规则 id，如 rule/rc@dbscript-field-type' }) }, required: ['rule'] },
      output: jsonOut, execute: (args) => p.objectQuery('Rule', 'getImplementations', args.rule, ctx) },
    { name: 'platform_get_policies', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】PlatformInstance.getPolicies(platform)：沿 covers(逆向) 取该平台实例的策略（与 Policy.getPolicies 等价，从平台侧出发）',
      parameters: { type: 'object', properties: { platform: S('string', { description: '平台实例 id' }) }, required: ['platform'] },
      output: jsonOut, execute: (args) => p.objectQuery('PlatformInstance', 'getPolicies', args.platform, ctx) },
    { name: 'platform_get_rules', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】PlatformInstance.getRules(platform)：沿 appliesTo(逆向) 取该平台实例的规则',
      parameters: { type: 'object', properties: { platform: S('string', { description: '平台实例 id' }) }, required: ['platform'] },
      output: jsonOut, execute: (args) => p.objectQuery('PlatformInstance', 'getRules', args.platform, ctx) },
    { name: 'platform_get_job_types', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】PlatformInstance.getJobTypes(platform)：沿 hasJobType 取该平台实例的作业类型',
      parameters: { type: 'object', properties: { platform: S('string', { description: '平台实例 id' }) }, required: ['platform'] },
      output: jsonOut, execute: (args) => p.objectQuery('PlatformInstance', 'getJobTypes', args.platform, ctx) },
    { name: 'job_type_get_platform', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】JobType.getPlatform(jobType)：沿 hasJobType(逆向) 取该作业类型归属的平台实例。如 JobType.getPlatform(jt/schema-change) → inst/dbscript 数据库脚本平台',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.objectQuery('JobType', 'getPlatform', args.jobType, ctx) },
    { name: 'rule_impl_get_job_type', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】RuleImpl.getJobType(impl)：沿 bindsJobType 取该规则实现绑定的作业类型',
      parameters: { type: 'object', properties: { impl: S('string', { description: '规则实现 id，如 impl/se-sql-1.8' }) }, required: ['impl'] },
      output: jsonOut, execute: (args) => p.objectQuery('RuleImpl', 'getJobType', args.impl, ctx) },
    { name: 'model_get_fields', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】Model.getFields(model)：沿 hasField 取模型的字段（引用层，现场派生自建模空间）',
      parameters: { type: 'object', properties: { model: S('string', { description: '模型对象 id，如 model/dwd_tax_payment.model' }) }, required: ['model'] },
      output: jsonOut, execute: (args) => p.objectQuery('Model', 'getFields', args.model, ctx) },
    { name: 'model_get_jobs', risk: 'read', category: FUNC,
      description: '【Ontology ObjectType 查询】Model.getImplementingJobs(model)：沿 implements(逆向) 取实现该模型的作业',
      parameters: { type: 'object', properties: { model: S('string', { description: '模型对象 id，如 model/dwd_tax_payment.model' }) }, required: ['model'] },
      output: jsonOut, execute: (args) => p.objectQuery('Model', 'getImplementingJobs', args.model, ctx) },
    { name: 'list_functions', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体能力 functions()】列动力学层 Function 目录（只读语义推理函数清单：type/links/anchored_object/classify_job/policies_for/rules_for/scan_plan/consistency_check/lineage/impact/explain_finding 等，含 risk 与用途）。Palantir Ontology 范式的 functions() 能力',
      parameters: { type: 'object', properties: {}, required: [] },
      output: jsonOut, execute: () => p.functions() },
    { name: 'list_actions', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体能力 actions()】列动力学层 Action 目录（写操作清单，如 propose 提交规则/类型提案，gated 需人确认）。Palantir Ontology 范式的 actions() 能力',
      parameters: { type: 'object', properties: {}, required: [] },
      output: jsonOut, execute: () => p.actions() },
    { name: 'classify_job', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】把作业归入作业类型（Job →instanceOf→ JobType）：按目录/引擎/AST 特征推理，返回作业类型 + 平台实例 + 置信度。这是对本体图的只读推理，非普通执行工具（无副作用）。分类失败 fail-closed 转人工归类',
      parameters: { type: 'object', properties: { ...PATH_ARG, engine: S('string', { description: '引擎，如 Hive SQL' }) }, required: ['path'] },
      output: jsonOut,
      execute: (args) => p.classifyJob({ path: args.path, engine: args.engine }, ctx) },
    { name: 'policies_for', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】取作业类型适用的治理目标（JobType → PlatformInstance →covers 逆向→ Policy，跨平台）。是 Policy.getPolicies(platform) 的作业类型糖：先 get_anchored_object 拿 jobTypes，再据此取策略。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.policiesFor(args.jobType) },
    { name: 'rules_for', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】取平台实例适用的规则及实现（PlatformInstance →appliesTo 逆向→ Rule →implementedBy→ RuleImpl，按作业类型匹配实现）。是 PlatformInstance.getRules / Rule.getImplementations 的作业类型糖。规则只声明，执行在扫描引擎。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.rulesFor(args.jobType) },
    { name: 'get_scan_plan', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】回答「要扫哪些规则、怎么扫」：取作业类型适用且有实现（RuleImpl）的规则清单 + 执行引擎（RuleImpl.engine/ruleset）+ 怎么扫（一致性对账 check_consistency / 规范性·高危 code_lint·danger_scan·partition_check）。规则只声明、执行在引擎。先 get_anchored_object 拿 jobTypes，再本函数决定扫什么、怎么扫。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.scanPlan(args.jobType) },
    { name: 'check_consistency', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】「设计态 ↔ 开发态」一致性对账：作业与模型版本区间对账（Job →implements→ Model；Release →releaseBaseline→ Job），返回四态 MATCH/AHEAD/BEHIND/DIVERGE 与字段级冲突。注意：这是设计→模型一致性对账，不是规范性/高危质量检查（那些用 code_lint / danger_scan / partition_check）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: PATH_ARG, required: ['path'] },
      output: jsonOut, execute: (args) => p.consistencyCheck(args.path, ctx) },
    { name: 'get_lineage_upstream', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】作业上游血缘：本作业来源表 ← 生产它的作业（Job →implements→ Model 及反向）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: PATH_ARG, required: ['path'] },
      output: jsonOut, execute: (args) => p.lineageUpstream(ctx, args.path) },
    { name: 'get_lineage_downstream', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】作业下游血缘：依赖本作业产出表的其他作业（影响面）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: PATH_ARG, required: ['path'] },
      output: jsonOut, execute: (args) => p.lineageDownstream(ctx, args.path) },
    { name: 'get_impact', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】模型变更影响面：找出实现该模型（implements）的所有作业。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { model: S('string', { description: '模型文件名，如 dwd_tax_declaration.model' }) }, required: ['model'] },
      output: jsonOut, execute: (args) => p.impactCheck(ctx, args.model) },
    { name: 'explain_finding', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】发现沿本体关系反向回溯（Finding →violates→ Rule →containsRule→ Policy →covers→ PlatformInstance），返回归因链。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { finding: S('string', { description: 'finding id，如 F-101' }) }, required: ['finding'] },
      output: jsonOut, execute: (args) => p.explainFinding(args.finding) },
    { name: 'propose', risk: 'knowledge-write', category: ACTION,
      description: '【Ontology Action · 本体的写操作（gated）】提交规则/类型提案、回写归类断言（instanceOf）、DIVERGE 裁决。这是对本体库的受治理写操作，非普通工具；需人确认（gated）。本体 schema 变更 fail-closed（只能在治理界面）',
      parameters: { type: 'object', properties: { kind: S('string', { description: 'proposal | assertion | diverge-ruling' }), payload: S('object', { description: '提案/断言/裁决内容' }), approvalNote: S('string', { description: '审批卡话术' }) }, required: ['kind', 'payload', 'approvalNote'] },
      output: jsonOut, execute: (args) => p.propose({ kind: args.kind, payload: args.payload }) },
  ]
}
