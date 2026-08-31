// @his/domain-tools-ontology — definitions.js：数据开发本体的动力学层（Action + Function）
//
// 五原语归位：语义层在 ontology.js（Object + Link），本文件把「可执行能力」归位——
//   Function（只读语义推理，risk=read）：classify_job / policies_for / rules_for / consistency_check / explain_finding
//   Action（写，gated）：propose
// 显式约定：每个工具带 category（ontology-function / ontology-action），并在 description 标明
//   「这是本体的语义推理函数，不是普通执行工具」——让 Agent/用户能区分"本体能力" vs "普通工具"。

const S = (type, extra = {}) => ({ type, ...extra })
const PATH_ARG = { path: S('string', { description: '仓内相对路径，如 dbscript/alter_dwd_tax_payment_v4.sql' }) }
const jsonOut = { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] }

/** 极简 AST 特征检测（演示）：ALTER ADD COLUMNS → 表结构变更；UPDATE/INSERT INTO → DML */
function detectAst(text) {
  if (/ADD\s+COLUMNS/i.test(text)) return { alterAddColumns: true }
  if (/\b(UPDATE|INSERT\s+INTO)\b/i.test(text)) return { dml: true }
  return {}
}

export function buildDefinitions(p, { repo } = {}) {
  const readText = (path) => {
    if (!repo) return null
    return repo.readWorking(path) ?? repo.readCommitted(repo.currentBranch(), path)
  }
  const FUNC = 'ontology-function'
  const ACTION = 'ontology-action'
  return [
    {
      name: 'ontology_classify_job', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】把作业归入作业类型（Job →instanceOf→ JobType）：按目录/引擎/AST 特征推理，返回作业类型 + 平台实例 + 置信度。这是对本体图的只读推理，非普通执行工具（无副作用）。分类失败 fail-closed 转人工归类',
      parameters: { type: 'object', properties: { ...PATH_ARG, engine: S('string', { description: '引擎，如 Hive SQL' }), ast: S('object', { description: '可选：AST 特征（alterAddColumns/dml），缺省从文件内容检测' }) }, required: ['path'] },
      output: jsonOut,
      execute: (args) => p.classifyJob({ path: args.path, engine: args.engine, ast: args.ast ?? detectAst(readText(args.path) ?? '') }),
    },
    {
      name: 'ontology_policies_for', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】取作业类型适用的治理目标（JobType → PlatformInstance →covers→ Policy，跨平台）。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut,
      execute: (args) => p.policiesFor(args.jobType),
    },
    {
      name: 'ontology_rules_for', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】取平台实例适用的规则及实现（PlatformInstance →appliesTo→ Rule →implementedBy→ RuleImpl，按作业类型匹配实现）。规则只声明，执行在扫描引擎。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { jobType: S('string', { description: '作业类型 id，如 jt/schema-change' }) }, required: ['jobType'] },
      output: jsonOut,
      execute: (args) => p.rulesFor(args.jobType),
    },
    {
      name: 'ontology_consistency_check', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】「设计态 ↔ 开发态」一致性对账：作业与模型版本区间对账（Job →implements→ Model；Release →releaseBaseline→ Job），返回四态 MATCH/AHEAD/BEHIND/DIVERGE 与字段级冲突。注意：这是设计→模型一致性对账，不是规范性/高危质量检查（那些用 code_lint / danger_scan / partition_check）；问「SQL 有哪些质量问题」请走质量检查工具。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { path: S('string', { description: '作业路径' }) }, required: ['path'] },
      output: jsonOut,
      execute: (args) => {
        const cls = p.classifyJob({ path: args.path, engine: null, ast: detectAst(readText(args.path) ?? '') })
        if (!cls.ok) return cls
        return p.consistencyCheck(cls.jobId, {})
      },
    },
    {
      name: 'ontology_explain_finding', risk: 'read', category: FUNC,
      description: '【Ontology Function · 本体语义推理】发现沿本体关系反向回溯（Finding →violates→ Rule →containsRule→ Policy →covers→ PlatformInstance），返回归因链。本体的只读推理，非普通执行工具',
      parameters: { type: 'object', properties: { finding: S('string', { description: 'finding id，如 F-101' }) }, required: ['finding'] },
      output: jsonOut,
      execute: (args) => p.explainFinding(args.finding),
    },
    {
      name: 'ontology_propose', risk: 'knowledge-write', category: ACTION,
      description: '【Ontology Action · 本体的写操作（gated）】提交规则/类型提案、回写归类断言（instanceOf）、DIVERGE 裁决。这是对本体库的受治理写操作，非普通工具；需人确认（gated）。本体 schema 变更 fail-closed（只能在治理界面）',
      parameters: {
        type: 'object',
        properties: {
          kind: S('string', { description: 'proposal | assertion | diverge-ruling' }),
          payload: S('object', { description: '提案/断言/裁决内容' }),
          approvalNote: S('string', { description: '审批卡话术' }),
        },
        required: ['kind', 'payload', 'approvalNote'],
      },
      output: jsonOut,
      execute: (args) => p.propose({ kind: args.kind, payload: args.payload }),
    },
  ]
}
