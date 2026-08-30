// @his/domain-tools-ontology — 本体平台适配器（演示态 mock，V14/V15 本体驱动扫描）
// 设计：本体 = 定义层(JobType/Policy/Rule/RuleImpl) + 引用层(Model/Job/Release) + 实例层(ScanRun/Finding/ResolutionTrace)。
// 只读消费 + 提案回写(propose gated)；不内嵌本体编辑器、不落元数据格式到代码仓。
// 场景锚定数据库脚本平台(dbscript 分包)；ETL 内 SQL 片段随 ETL 整体扫描不走本场景。
// 演示故事：dwd_tax_payment 模型 v3→v4 变更脚本，ADD COLUMNS 把 tax_rate 写成 DOUBLE(设计 v4 应为 DECIMAL(10,4))。

// ---------- 定义层：JobType（作业类型本体 · 层级树） ----------
export const JOB_TYPES = {
  'dbscript-platform': { id: 'dbscript-platform', name: '数据库脚本平台', kind: 'platform', platform: 'dbscript', children: ['ddl-script', 'dml-correction'] },
  'ddl-script': { id: 'ddl-script', name: 'DDL 脚本', kind: 'form', parent: 'dbscript-platform', children: ['schema-change'] },
  'schema-change': { id: 'schema-change', name: '表结构变更', kind: 'leaf', parent: 'ddl-script' },
  'dml-correction': { id: 'dml-correction', name: 'DML 订正脚本', kind: 'leaf', parent: 'dbscript-platform' },
  'svc-query': { id: 'svc-query', name: '数据服务（SQL→API）', kind: 'leaf', platform: 'svc', parent: null, note: '归属 svc 分包 · 不走数据库脚本场景' },
}

// ---------- 定义层：Policy（策略） ----------
export const POLICIES = [
  { id: 'consistency', name: '设计开发一致性', jobType: 'schema-change', bound: 'direct', ruleCount: 6, rules: ['R-101', 'R-102', 'R-103', 'R-104', 'R-105', 'R-106'] },
  { id: 'script-quality', name: '脚本质量规范', jobType: 'ddl-script', bound: 'inherit', ruleCount: 5, override: 1, rules: ['R-201', 'R-202', 'R-203', 'R-204', 'R-205'] },
  { id: 'sql-safety', name: 'SQL 安全规范', jobType: 'dbscript-platform', bound: 'inherit', ruleCount: 7, rules: ['R-301', 'R-302', 'R-303', 'R-304', 'R-305', 'R-306', 'R-307'] },
  { id: 'cross-tenant', name: '安全 · 跨租户引用', jobType: 'dbscript-platform', bound: 'inherit', filtered: true, filterReason: '适用条件「租户已启用跨域」不满足', ruleCount: 2, rules: ['R-401', 'R-402'] },
]

// ---------- 定义层：Rule（规则 · 只声明不执行）+ RuleImpl ----------
export const RULES = {
  'R-101': { id: 'R-101', name: '表模型一致性', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
  'R-102': { id: 'R-102', name: '字段类型一致性', severity: '告警', stage: '流水线', impl: 'se-sql 1.8', finding: 'F-101' },
  'R-103': { id: 'R-103', name: '字段缺失/多余', severity: '告警', stage: '流水线', impl: 'se-sql 1.8', finding: 'F-102' },
  'R-104': { id: 'R-104', name: '分区一致性', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
  'R-105': { id: 'R-105', name: '主键一致性', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
  'R-106': { id: 'R-106', name: '口径注释一致性', severity: '告警', stage: '流水线', impl: 'se-sql 1.8' },
  'R-201': { id: 'R-201', name: '命名规范', severity: '告警', stage: '事中', impl: 'se-sql 1.8' },
  'R-202': { id: 'R-202', name: '分层归属', severity: '告警', stage: '事中', impl: 'se-sql 1.8' },
  'R-203': { id: 'R-203', name: '注释完备', severity: '阻断', stage: '事中', impl: 'se-sql 1.8', overridden: '告警' },
  'R-204': { id: 'R-204', name: '单一职责', severity: '提示', stage: '事中', impl: 'se-sql 1.8' },
  'R-205': { id: 'R-205', name: '幂等性', severity: '告警', stage: '事中', impl: 'se-sql 1.8' },
  'R-301': { id: 'R-301', name: '高危操作检测', severity: '阻断', stage: '全阶段', impl: 'se-sql 1.8' },
  'R-302': { id: 'R-302', name: '禁 SELECT *', severity: '告警', stage: '事中', impl: 'se-sql 1.8' },
  'R-303': { id: 'R-303', name: '显式分区裁剪', severity: '告警', stage: '事中', impl: 'se-sql 1.8' },
  'R-304': { id: 'R-304', name: '危险函数检测', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
  'R-305': { id: 'R-305', name: '笛卡尔积', severity: '告警', stage: '流水线', impl: 'se-sql 1.8' },
  'R-306': { id: 'R-306', name: '敏感字段引用', severity: '告警', stage: '流水线', impl: 'se-sql 1.8' },
  'R-307': { id: 'R-307', name: '跨租户引用', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
  'R-401': { id: 'R-401', name: '跨租户表引用', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
  'R-402': { id: 'R-402', name: '跨租户数据外流', severity: '阻断', stage: '流水线', impl: 'se-sql 1.8' },
}
export const RULE_IMPL = { id: 'se-sql', version: '1.8', engine: 'sql-scanner' }

// ---------- 引用层：Model / Release / 版本区间增量 ----------
export const MODELS = {
  'M-1024': { id: 'M-1024', name: 'dwd_tax_payment', physicalTable: 'dwd_tax_payment', version: 'v4' },
  'M-2048': { id: 'M-2048', name: 'dwd_tax_payment_test', physicalTable: 'dwd_tax_payment_test', version: 'v1', note: '同名测试模型 · 物理表名不匹配，排除' },
}
export const RELEASES = { 'REL-0820': { id: 'REL-0820', modelVersion: 'v3', commit: 'b7d2f91', note: '上次发布即基线（releaseBaseline）' } }

export const DESIGN_INCREMENT = {
  from: 'v3', to: 'v4', fields: [
    { name: 'tax_rate', type: 'DECIMAL(10,4)', note: '缴款税率（新增）' },
    { name: 'pay_fee', type: 'DECIMAL(14,2)', note: '手续费（新增）' },
    { name: 'dt', type: 'STRING', note: '分区 · 无变更' },
  ],
}
export const CODE_INCREMENT = {
  baseline: 'REL-0820', note: 'REL-0820 → 工作区', fields: [
    { name: 'tax_rate', type: 'DOUBLE', note: '缴款税率（开发中）', conflict: true },
    { name: 'pay_fee', type: null, note: '未实现（待开发事项）', behind: true },
    { name: 'dt', type: 'STRING', note: '分区 · 无变更' },
  ],
}

// ---------- 实例层：Findings / ResolutionTrace ----------
export const FINDINGS = {
  'F-101': { id: 'F-101', rule: 'R-102', severity: '告警 · 可修复', target: 'tax_rate', desc: '设计 v4 定义为 DECIMAL(10,4)，代码写成 DOUBLE——金额/税率类字段浮点会丢精度，建议按设计口径修复。', chain: 'R-102 字段类型一致性 ← 设计开发一致性策略 ← 数据库脚本 · 表结构变更 ← 分包+AST 信号 ｜ 匹配事实：区间 v3→v4 · 得分 0.92 ｜ 本体 v47', fix: { column: 'tax_rate', from: 'DOUBLE', to: 'DECIMAL(10,4)', comment: '缴款税率 · 对齐模型 v4' } },
  'F-102': { id: 'F-102', rule: 'R-103', severity: 'BEHIND · 提示不阻断', target: 'pay_fee', desc: '允许分批实现：该设计增量已列入「待开发事项」，不阻断本次提交；实现后随下次发布自然消解。', chain: 'R-103 字段缺失/多余 ← 设计开发一致性策略 ← 数据库脚本 · 表结构变更 ｜ 匹配事实：区间 v3→v4 · 覆盖率 50% ｜ 本体 v47' },
}

export const RESOLUTION_TRACE = [
  { seg: 'classify', title: '① 分类轨迹 · ontology.classify', stat: 'JobType 命中 1 · 排除 2', hits: [ { signal: '分包信号', value: 'dbscript', hit: '数据库脚本平台', note: '(四类平台)' }, { signal: '元数据信号', value: 'engine: Hive SQL · 目标表声明', hit: 'DDL 脚本' }, { signal: 'AST 特征', value: 'ALTER TABLE … ADD COLUMNS', hit: '表结构变更', note: '合并置信 0.98' } ], excluded: ['DML 订正脚本 —— 无 UPDATE / INSERT INTO 语句，排除', '数据服务（SQL→API 消费作业）—— 无服务声明段，且归属 svc 分包，排除'] },
  { seg: 'policy', title: '② 策略解析轨迹 · ontology.policies', stat: 'appliesTo 命中 3 · 过滤 1 · 覆盖 1', hits: [ { policy: 'consistency', note: '← JobType「表结构变更」· 6 规则' }, { policy: 'script-quality', note: '← 继承自「DDL 脚本」· 5 规则' }, { policy: 'sql-safety', note: '← 平台族「数据库脚本平台」· 7 规则' } ], excluded: ['安全 · 跨租户引用 —— 适用条件「租户已启用跨域」不满足，2 规则跳过'] },
  { seg: 'rules', title: '③ 规则装配轨迹 · ontology.rules', stat: '18 规则 · RuleImpl 全部就绪', hits: [ { rule: 'R-101', note: '· 设计开发一致性 · 流水线 · 阻断' }, { rule: 'R-102', note: '· 设计开发一致性 · 流水线 · 告警（覆盖后）' }, { rule: 'R-103', note: '· 设计开发一致性 · 流水线 · 告警' }, { rule: 'R-301', note: '· SQL 安全规范 · 全阶段 · 阻断' } ], excluded: ['无实现跳过 0 —— 18 条规则 RuleImpl 绑定全部就绪', '去重 0 —— 跨策略规则按执行器坐标合并后无重复'] },
  { seg: 'incr', title: '④ 一致性前置轨迹 · ontology.match_increment', stat: 'implements 唯一匹配 · 基线 REL-0820', hits: [ { item: '目标物理表', value: 'dwd_tax_payment', note: '（ADD COLUMNS 作用对象）→ 模型 M-1024 唯一匹配 ⇒ implements' }, { item: 'devops.release 上次发布', value: 'REL-0820', note: '→ 钉住 commit b7d2f91 之母 + 模型 v3 ⇒ releaseBaseline' }, { item: '候选区间', value: 'v3→v4', note: '（v4 为最新版）· 双侧结构化变更集比对 · 得分 0.92' } ], excluded: ['区间 v2→v3 —— 已在 REL-0820 基线内，不参与比对', '模型 M-2048（同名测试模型）—— 物理表名不匹配，排除'] },
]

const now = () => new Date().toISOString()

// ---------- Provider ----------
export const provider = {
  kind: 'ontology-mock',
  ontVersion: 'v47',

  classify(job) {
    const p = (job.path ?? '').split('/')[0]
    const ast = job.ast ?? {}
    const sig = []
    if (p === 'dbscript') sig.push({ signal: '分包信号', value: 'dbscript', hit: '数据库脚本平台', weight: '强' })
    if (job.engine && job.engine.includes('Hive')) sig.push({ signal: '元数据信号', value: 'engine: ' + job.engine, hit: 'DDL 脚本', weight: '强' })
    if (ast.alterAddColumns) sig.push({ signal: 'AST 特征', value: 'ALTER TABLE … ADD COLUMNS', hit: '表结构变更', weight: '中' })
    else if (ast.dml) sig.push({ signal: 'AST 特征', value: 'DML 订正', hit: 'DML 订正脚本', weight: '中' })
    const excluded = []
    if (String(job.path).endsWith('.svc')) excluded.push('数据服务（SQL→API 消费作业）—— 归属 svc 分包，不走数据库脚本场景')
    else excluded.push('数据服务（SQL→API 消费作业）—— 无服务声明段，且归属 svc 分包，排除')
    if (!ast.dml) excluded.push('DML 订正脚本 —— 无 UPDATE / INSERT INTO 语句，排除')
    const jobType = ast.alterAddColumns ? 'schema-change' : ast.dml ? 'dml-correction' : null
    if (!jobType) return { ok: false, needsHuman: true, note: '分类信号不足/冲突，fail-closed 转人工归类（双入口：工作台确认卡 / 本体平台治理界面）', signals: sig, excluded }
    return { ok: true, jobType, jobTypeName: JOB_TYPES[jobType].name, confidence: sig.length === 3 ? 0.98 : 0.95, platform: 'dbscript', signals: sig, excluded, instanceOf: '数据库脚本 · ' + JOB_TYPES[jobType].name }
  },

  policies(jobTypeId, ctx = {}) {
    const leaf = JOB_TYPES[jobTypeId]
    if (!leaf) return { error: '未知 JobType: ' + jobTypeId }
    const chain = []
    let node = leaf
    while (node) { chain.push(node.id); node = node.parent ? JOB_TYPES[node.parent] : null }
    const hit = []
    const filtered = []
    for (const pol of POLICIES) {
      if (!chain.includes(pol.jobType)) continue
      if (pol.filtered) filtered.push({ id: pol.id, name: pol.name, reason: pol.filterReason, ruleCount: pol.ruleCount })
      else hit.push({ id: pol.id, name: pol.name, bound: pol.jobType === leaf.id ? 'direct' : 'inherit', ruleCount: pol.ruleCount, override: pol.override ?? 0 })
    }
    return { jobType: leaf.id, jobTypeName: leaf.name, tenant: ctx.tenant ?? 'finance', appliedPolicyCount: hit.length, filteredCount: filtered.length, overrideCount: hit.some((p) => p.override) ? 1 : 0, hit, filtered }
  },

  rules(policyIds = []) {
    const ids = new Set(policyIds.flatMap((id) => { const p = POLICIES.find((x) => x.id === id); return p ? p.rules : [] }))
    const rules = [...ids].map((r) => RULES[r]).filter(Boolean)
    const inStage = rules.filter((r) => r.stage === '事中').length
    return { count: rules.length, stageSplit: { done: 4, pre: 3, pipeline: rules.length }, implVersion: RULE_IMPL.version, implReady: rules.every((r) => r.impl === 'se-sql 1.8'), rules }
  },

  matchIncrement(job, opts = {}) {
    const physicalTable = opts.physicalTable
    const model = Object.values(MODELS).find((m) => m.physicalTable === physicalTable)
    if (!model) return { ok: false, needsHuman: true, note: 'implements 无解（物理表 ' + physicalTable + ' 无匹配模型）· fail-closed 转人工确认' }
    const release = RELEASES[opts.baselineRelease || 'REL-0820']
    const conflicts = []
    for (const d of DESIGN_INCREMENT.fields) {
      const c = CODE_INCREMENT.fields.find((x) => x.name === d.name)
      if (!c) conflicts.push({ field: d.name, kind: 'BEHIND', design: d.type, code: null, note: '设计已含 · 代码未实现' })
      else if (c.conflict) conflicts.push({ field: d.name, kind: 'MATCH-CONFLICT', design: d.type, code: c.type, note: '类型冲突' })
      else if (c.behind) conflicts.push({ field: d.name, kind: 'BEHIND', design: d.type, code: null, note: '未实现（待开发事项）' })
    }
    const status = conflicts.some((c) => c.kind === 'MATCH-CONFLICT') ? 'MATCH-CONFLICT' : conflicts.some((c) => c.kind === 'BEHIND') ? 'BEHIND' : 'MATCH'
    return {
      ok: true, implements: { model: model.id, physicalTable: model.physicalTable, modelName: model.name },
      releaseBaseline: { release: release.id, modelVersion: release.modelVersion, commit: release.commit },
      interval: { from: 'v3', to: opts.currentVersion || 'v4' }, score: 0.92, status, conflicts,
      fields: DESIGN_INCREMENT.fields.map((d) => ({ field: d.name, design: d.type, code: (CODE_INCREMENT.fields.find((x) => x.name === d.name)?.type ?? null) })),
      note: 'MATCH 候选 ⚠ ' + conflicts.filter((c) => c.kind === 'MATCH-CONFLICT').length + ' 冲突 · ' + conflicts.filter((c) => c.kind === 'BEHIND').length + ' BEHIND（不阻断）',
    }
  },

  explain(findingId) {
    const f = FINDINGS[findingId]
    if (!f) return { error: '未知 finding: ' + findingId }
    return { finding: f, ruleId: f.rule, rule: RULES[f.rule], chain: f.chain, ontVersion: this.ontVersion }
  },

  propose(payload) {
    return { proposalId: 'prop-' + Date.now().toString(36), status: 'pending-governance', payload, ts: now(), note: '提案进本体平台治理流程审批；Agent 不直接改本体定义' }
  },

  scanPlan(jobTypeId, ctx = {}) {
    const pol = this.policies(jobTypeId, ctx)
    const rl = this.rules(pol.hit ? pol.hit.map((p) => p.id) : [])
    return { ontVersion: this.ontVersion, jobType: jobTypeId, policies: (pol.hit || []).map((p) => ({ id: p.id, name: p.name, bound: p.bound, ruleCount: p.ruleCount })), count: rl.count, stageSplit: rl.stageSplit, implVersion: rl.implVersion }
  },

  trace() { return RESOLUTION_TRACE },
  listFindings() { return Object.values(FINDINGS) },

  _state: { ontVersion: 'v47' },
}

provider.anchorSummary = function anchorSummary() {
  return { ontVersion: this.ontVersion, jobTypes: Object.keys(JOB_TYPES).length, policies: POLICIES.length, rules: Object.keys(RULES).length, impl: RULE_IMPL }
}
