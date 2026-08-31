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
    { name: 'ontology_anchored_object', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体推理入口｜必须先调】读当前工作区锚定的对象（workspace-anchor 的 current：建模空间模型文件，或代码仓分支+作业目录），回答「当前锚定的对象是什么」——五原语 ObjectType（Model / Directory / Job…）+ 在本体图中的直接关系（hasField / implements / inDirectory / instanceOf）+ 可达的作业类型 jobTypes。当用户问『这个脚本/作业/模型』『设计开发一致性』『代码质量』『应该怎么扫描』时，先调本函数拿到「锚定的对象」本体认知，再沿返回的 jobTypes 依次调 ontology_policies_for（covers）→ ontology_rules_for（appliesTo→implementedBy）→ ontology_scan_plan（要扫哪些规则、怎么扫），不要跳过锚定对象直接调用结果型 function。返回的 why 就是识别依据；**调用后必须在回复中引用识别依据**（如「锚定=代码仓 main/dbscript → 作业 1 个 → instanceOf 表结构变更；沿 covers 逆向边找到 N 组策略」），让用户看得懂「怎么锚定到、怎么识别到」，不要只报结论',
      parameters: { type: 'object', properties: {}, required: [] },
      output: jsonOut, execute: () => p.anchoredObject(ctx) },
    { name: 'ontology_classify_job', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】把作业归入作业类型（Job →instanceOf→ JobType）：按目录/引擎/AST 特征推理，返回作业类型 + 平台实例 + 置信度。这是对本体图的只读推理，非普通执行工具（无副作用）。分类失败 fail-closed 转人工归类',
      parameters: { type: 'object', properties: { ...PATH_ARG, engine: S('string', { description: '引擎，如 Hive SQL' }) }, required: ['path'] },
      output: jsonOut,
      execute: (args) => p.classifyJob({ path: args.path, engine: args.engine }, ctx) },
    { name: 'ontology_policies_for', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】取作业类型适用的治理目标（JobType → PlatformInstance →covers→ Policy，跨平台）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.policiesFor(args.jobType) },
    { name: 'ontology_rules_for', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】取平台实例适用的规则及实现（PlatformInstance →appliesTo→ Rule →implementedBy→ RuleImpl，按作业类型匹配实现）。规则只声明，执行在扫描引擎。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.rulesFor(args.jobType) },
    { name: 'ontology_scan_plan', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】回答「要扫哪些规则、怎么扫」：取作业类型适用且有实现（RuleImpl）的规则清单 + 执行引擎（RuleImpl.engine/ruleset）+ 怎么扫（一致性对账 ontology_consistency_check / 规范性·高危 code_lint·danger_scan·partition_check）。规则只声明、执行在引擎。先 ontology_anchored_object 拿 jobTypes，再本函数决定扫什么、怎么扫。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut, execute: (args) => p.scanPlan(args.jobType) },
    { name: 'ontology_consistency_check', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】「设计态 ↔ 开发态」一致性对账：作业与模型版本区间对账（Job →implements→ Model；Release →releaseBaseline→ Job），返回四态 MATCH/AHEAD/BEHIND/DIVERGE 与字段级冲突。注意：这是设计→模型一致性对账，不是规范性/高危质量检查（那些用 code_lint / danger_scan / partition_check）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: PATH_ARG, required: ['path'] },
      output: jsonOut, execute: (args) => p.consistencyCheck(args.path, ctx) },
    { name: 'ontology_lineage_upstream', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】作业上游血缘：本作业来源表 ← 生产它的作业（Job →implements→ Model 及反向）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: PATH_ARG, required: ['path'] },
      output: jsonOut, execute: (args) => p.lineageUpstream(ctx, args.path) },
    { name: 'ontology_lineage_downstream', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】作业下游血缘：依赖本作业产出表的其他作业（影响面）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: PATH_ARG, required: ['path'] },
      output: jsonOut, execute: (args) => p.lineageDownstream(ctx, args.path) },
    { name: 'ontology_impact_check', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】模型变更影响面：找出实现该模型（implements）的所有作业。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { model: S('string', { description: '模型文件名，如 dwd_tax_declaration.model' }) }, required: ['model'] },
      output: jsonOut, execute: (args) => p.impactCheck(ctx, args.model) },
    { name: 'ontology_explain_finding', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】发现沿本体关系反向回溯（Finding →violates→ Rule →containsRule→ Policy →covers→ PlatformInstance），返回归因链。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { finding: S('string', { description: 'finding id，如 F-101' }) }, required: ['finding'] },
      output: jsonOut, execute: (args) => p.explainFinding(args.finding) },
    { name: 'ontology_propose', risk: 'knowledge-write', category: ACTION,
      description: '【Ontology Action · 本体的写操作（gated）】提交规则/类型提案、回写归类断言（instanceOf）、DIVERGE 裁决。这是对本体库的受治理写操作，非普通工具；需人确认（gated）。本体 schema 变更 fail-closed（只能在治理界面）',
      parameters: { type: 'object', properties: { kind: S('string', { description: 'proposal | assertion | diverge-ruling' }), payload: S('object', { description: '提案/断言/裁决内容' }), approvalNote: S('string', { description: '审批卡话术' }) }, required: ['kind', 'payload', 'approvalNote'] },
      output: jsonOut, execute: (args) => p.propose({ kind: args.kind, payload: args.payload }) },
  ]
}
