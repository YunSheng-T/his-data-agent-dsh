// @his/domain-tools-ontology — provider-mock.js：本体平台适配器（演示态）
//
// 五原语归位：语义层在 ontology.js（Object + Link）；本文件承载「动力学层」——
//   Function（只读计算：classifyJob / policiesFor / rulesFor / consistencyCheck / explainFinding）
//   Action（写：propose，gated）
// 扫描的「执行」不在这里（在 domain-tools-dev 引擎层）；本体只声明规则 + RuleImpl.engine 指向执行器。
// 演示故事：dwd_tax_payment 模型 v3→v4 变更脚本，ADD COLUMNS 把 tax_rate 写成 DOUBLE（设计 v4 应为 DECIMAL(10,4)）。

import { GRAPH, traverse, getObject, OBJECT_TYPES, LINK_TYPES } from './ontology.js'

// ---------- 实例层（运行产物，回挂本体节点） ----------
export const FINDINGS = {
  'F-101': {
    id: 'F-101', rule: 'rule/rc@dbscript-field-type', severity: '告警 · 可修复', target: 'tax_rate',
    desc: '设计 v4 定义为 DECIMAL(10,4)，代码写成 DOUBLE——金额/税率类字段浮点会丢精度，建议按设计口径修复。',
    chain: 'R-102 字段类型一致性 ← 设计开发一致性策略 ← 数据库脚本平台 · 表结构变更 ← 作业分类信号 ｜ 匹配事实：区间 v3→v4 · 得分 0.92 ｜ 本体 v47',
    fix: { column: 'tax_rate', from: 'DOUBLE', to: 'DECIMAL(10,4)', comment: '缴款税率 · 对齐模型 v4' },
  },
  'F-102': {
    id: 'F-102', rule: 'rule/rc@dbscript-field-missing', severity: 'BEHIND · 提示不阻断', target: 'pay_fee',
    desc: '允许分批实现：该设计增量已列入「待开发事项」，不阻断本次提交；实现后随下次发布自然消解。',
    chain: 'R-103 字段缺失/多余 ← 设计开发一致性策略 ← 数据库脚本平台 · 表结构变更 ｜ 匹配事实：区间 v3→v4 · 覆盖率 50% ｜ 本体 v47',
  },
}

export const RESOLUTION_TRACE = [
  { seg: 'classify', title: '① 作业分类', stat: 'Job →instanceOf→ JobType', hits: [ { signal: '目录', value: 'dbscript', hit: '数据库脚本平台' }, { signal: '引擎', value: 'Hive SQL', hit: '数据库脚本' }, { signal: 'AST', value: 'ALTER TABLE … ADD COLUMNS', hit: '表结构变更', note: '置信 0.98' } ], excluded: ['DML 订正（无 UPDATE/INSERT）', '数据服务（svc 分包）'] },
  { seg: 'policy', title: '② 策略解析', stat: 'JobType → PlatformInstance →covers→ Policy', hits: [ { policy: 'design-consistency', note: '← 设计开发一致性（跨平台）' }, { policy: 'script-quality', note: '← 脚本质量规范' }, { policy: 'sql-safety', note: '← SQL 安全规范' } ], excluded: [] },
  { seg: 'rules', title: '③ 规则装配', stat: 'PlatformInstance →appliesTo→ Rule →implementedBy→ RuleImpl', hits: [ { rule: 'rc@dbscript-field-type', note: '· 字段类型一致性 · 告警 · impl se-sql 1.8' }, { rule: 'rc@dbscript-table', note: '· 表模型一致性 · 阻断' }, { rule: 'rc@dbscript-field-missing', note: '· 字段缺失/多余 · 告警' } ], excluded: [] },
  { seg: 'incr', title: '④ 一致性前置', stat: 'Job →implements→ Model；Release →releaseBaseline→ Job', hits: [ { item: '目标物理表', value: 'dwd_tax_payment', note: '→ 模型 M-1024 匹配' }, { item: '基线', value: 'REL-0820', note: '→ 模型 v3' }, { item: '区间', value: 'v3→v4', note: '得分 0.92' } ], excluded: ['区间 v2→v3（基线内）'] },
]

const now = () => new Date().toISOString()

// ---------- Provider（动力学层：Function + Action） ----------
export const provider = {
  kind: 'ontology',
  ontVersion: 'v47',

  // 平台能力：对象查询/图遍历（这里是图存储的 helper，供 Function 内部使用）
  getObject(id) { return getObject(GRAPH, id) },
  traverse(fromId, linkType, opts) { return traverse(GRAPH, fromId, linkType, opts) },

  // Function：作业分类（Job →instanceOf→ JobType；按特征推理）
  classifyJob(job = {}) {
    const path = job.path || ''
    const jobEntry = Object.entries(GRAPH.objects).find(([, o]) => o.type === 'Job' && o.path === path)
    if (!jobEntry) return { ok: false, needsHuman: true, note: '作业未建模，分类失败（fail-closed 转人工归类）' }
    const jobId = jobEntry[0]
    const jtIds = traverse(GRAPH, jobId, 'instanceOf')
    const jt = jtIds.length ? getObject(GRAPH, jtIds[0]) : null
    if (!jt) return { ok: false, needsHuman: true, note: 'instanceOf 关系缺失，分类失败' }
    const inst = getObject(GRAPH, jt.instance)
    const signals = [
      { signal: '目录', value: (path.split('/')[0] || ''), hit: inst.name },
      { signal: '引擎', value: job.engine || 'Hive SQL', hit: jt.name },
      { signal: 'AST', value: job.ast?.alterAddColumns ? 'ALTER TABLE … ADD COLUMNS' : (job.ast?.dml ? 'DML' : '—'), hit: jt.name },
    ]
    return { ok: true, jobId, jobType: jt.id, jobTypeName: jt.name, instance: jt.instance, instanceName: inst.name, platformStyle: inst.style, confidence: 0.98, signals, instanceOf: jt.name + ' · ' + inst.name }
  },

  // Function：适用策略（JobType → PlatformInstance →covers(逆向)→ Policy，跨平台）
  policiesFor(jobTypeId) {
    const jt = getObject(GRAPH, jobTypeId)
    if (!jt) return { error: '未知 JobType: ' + jobTypeId }
    const inst = getObject(GRAPH, jt.instance)
    const polIds = traverse(GRAPH, inst.id, 'covers', { reverse: true })
    const policies = polIds.map((id) => { const p = getObject(GRAPH, id); return { id, name: p.name, goal: p.goal } })
    return { instance: inst.id, instanceName: inst.name, jobType: jobTypeId, policies }
  },

  // Function：适用规则 + 实现（PlatformInstance →appliesTo(逆向)→ Rule →implementedBy→ RuleImpl；匹配 jobType）
  rulesFor(jobTypeId) {
    const jt = getObject(GRAPH, jobTypeId)
    if (!jt) return { error: '未知 JobType: ' + jobTypeId }
    const inst = getObject(GRAPH, jt.instance)
    const ruleIds = traverse(GRAPH, inst.id, 'appliesTo', { reverse: true })
    const rules = ruleIds.map((id) => {
      const r = getObject(GRAPH, id)
      const implIds = traverse(GRAPH, id, 'implementedBy')
      const impl = implIds.map((iid) => getObject(GRAPH, iid)).find((i) => i && i.jobType === jobTypeId) || null
      return { id, name: r.name, severity: r.severity, stage: r.stage, policy: r.policy, impl: impl ? { id: impl.id, engine: impl.engine, ruleset: impl.ruleset } : null }
    })
    return { instance: inst.id, instanceName: inst.name, jobType: jobTypeId, ruleCount: rules.length, rules }
  },

  // Function：一致性检查（编排入口：本体取规则 + 引用层事实 → 四态；扫描执行在引擎）
  consistencyCheck(jobId, opts = {}) {
    const job = getObject(GRAPH, jobId)
    if (!job) return { ok: false, note: '作业未建模' }
    const modelIds = traverse(GRAPH, jobId, 'implements')
    const model = modelIds.length ? getObject(GRAPH, modelIds[0]) : null
    const relIds = traverse(GRAPH, jobId, 'releaseBaseline', { reverse: true })
    const rel = relIds.length ? getObject(GRAPH, relIds[0]) : null
    const conflicts = [
      { field: 'tax_rate', kind: 'MATCH-CONFLICT', design: 'DECIMAL(10,4)', code: 'DOUBLE' },
      { field: 'pay_fee', kind: 'BEHIND', design: 'DECIMAL(14,2)', code: null },
    ]
    const status = conflicts.some((c) => c.kind === 'DIVERGE') ? 'DIVERGE' : conflicts.some((c) => c.kind === 'MATCH-CONFLICT') ? 'MATCH-CONFLICT' : conflicts.some((c) => c.kind === 'AHEAD') ? 'AHEAD' : conflicts.some((c) => c.kind === 'BEHIND') ? 'BEHIND' : 'MATCH'
    return {
      ok: true,
      implements: model ? { model: model.id, physicalTable: model.physicalTable } : null,
      releaseBaseline: rel ? { release: rel.release, modelVersion: rel.modelVersion, commit: rel.commit } : null,
      status, conflicts,
      note: 'MATCH 候选 ⚠ ' + conflicts.filter((c) => c.kind === 'MATCH-CONFLICT').length + ' 冲突 · ' + conflicts.filter((c) => c.kind === 'BEHIND').length + ' BEHIND（不阻断）',
    }
  },

  // Function：归因（finding → rule → policy → platform → jobType，沿图关系回溯）
  explainFinding(findingId) {
    const f = FINDINGS[findingId]
    if (!f) return { error: '未知 finding: ' + findingId }
    return { finding: f, ruleId: f.rule, chain: f.chain, ontVersion: this.ontVersion }
  },

  // Action：提案/断言/裁决（写，gated）
  propose(payload = {}) {
    const kind = ['proposal', 'assertion', 'diverge-ruling'].includes(payload.kind) ? payload.kind : 'proposal'
    return { proposalId: 'prop-' + Date.now().toString(36), kind, status: 'pending-governance', payload, ts: now(), note: '提案/断言/裁决进本体平台治理审批；Agent 不直接改本体定义' }
  },

  // 实例层出口
  trace() { return RESOLUTION_TRACE },
  listFindings() { return Object.values(FINDINGS) },

  _state: { ontVersion: 'v47' },
}

provider.anchorSummary = function anchorSummary() {
  return { ontVersion: this.ontVersion, objectTypes: Object.keys(OBJECT_TYPES).length, linkTypes: Object.keys(LINK_TYPES).length, objects: Object.keys(GRAPH.objects).length, links: GRAPH.links.length }
}

// 兼容旧导出（供 scanScriptJob 等过渡期引用，C 阶段移除）
export { GRAPH }
