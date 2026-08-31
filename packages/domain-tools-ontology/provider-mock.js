// @his/domain-tools-ontology — provider-mock.js：本体平台适配器（演示态）
//
// 五原语归位：语义层（Object/Link）在 ontology.js；本文件承载「动力学层」——
//   Function（只读语义推理）：classifyJob / policiesFor / rulesFor / consistencyCheck / explainFinding / lineage / impact
//   Action（写，gated）：propose
// 引用层现场派生：本 provider 的方法接受 ctx = { repo, modeling }（hisRepo / hisModeling），
//   从 建模空间+代码仓 现场投影本体图（buildGraph），而非依赖硬编码的演示图。
// 扫描的「执行」不在这里（在 domain-tools-dev 引擎层）；本体只声明规则 + RuleImpl.engine 指向执行器。

import { buildGraph, DEFINITION, traverse, getObject, extractTable, extractEngine, inferJobType } from './ontology.js'

// ---------- 实例层（运行产物，回挂本体节点） ----------
export const FINDINGS = {
  'F-101': { id: 'F-101', rule: 'rule/rc@dbscript-field-type', severity: '告警 · 可修复', target: 'tax_rate', desc: '设计 v4 定义为 DECIMAL(10,4)，代码写成 DOUBLE——金额/税率类字段浮点会丢精度，建议按设计口径修复。', chain: 'R-102 字段类型一致性 ← 设计开发一致性策略 ← 数据库脚本平台 · 表结构变更 ← 作业分类信号 ｜ 匹配事实：区间 v3→v4 · 本体 v47', fix: { column: 'tax_rate', from: 'DOUBLE', to: 'DECIMAL(10,4)' } },
  'F-102': { id: 'F-102', rule: 'rule/rc@dbscript-field-missing', severity: 'BEHIND · 提示不阻断', target: 'pay_fee', desc: '允许分批实现：该设计增量已列入「待开发事项」，不阻断本次提交。', chain: 'R-103 字段缺失/多余 ← 设计开发一致性策略 ← 数据库脚本平台 · 表结构变更 ｜ 区间 v3→v4 · 本体 v47' },
}

export const RESOLUTION_TRACE = [
  { seg: 'classify', title: '① 作业分类', stat: 'Job →instanceOf→ JobType（特征推理）', hits: [{ signal: '目录', value: 'dbscript', hit: '数据库脚本平台' }, { signal: 'AST', value: 'ALTER TABLE … ADD COLUMNS', hit: '表结构变更', note: '置信 0.98' }], excluded: ['DML（无 UPDATE/INSERT）', '数据服务（svc）'] },
  { seg: 'policy', title: '② 策略解析', stat: 'JobType → PlatformInstance →covers→ Policy', hits: [{ policy: 'design-consistency', note: '← 设计开发一致性（跨平台）' }, { policy: 'script-quality', note: '← 脚本质量规范' }, { policy: 'sql-safety', note: '← SQL 安全规范' }], excluded: [] },
  { seg: 'rules', title: '③ 规则装配', stat: 'PlatformInstance →appliesTo→ Rule →implementedBy→ RuleImpl', hits: [{ rule: 'rc@dbscript-field-type', note: '· 字段类型一致性 · 告警 · impl se-sql 1.8' }, { rule: 'rc@dbscript-table', note: '· 表模型一致性 · 阻断' }], excluded: [] },
  { seg: 'incr', title: '④ 一致性前置', stat: 'Job →implements→ Model；Release →releaseBaseline→ Job', hits: [{ item: '目标物理表', value: 'dwd_tax_payment', note: '→ 模型匹配' }, { item: '基线', value: 'REL-0820', note: '→ 模型 v3' }], excluded: [] },
]

const now = () => new Date().toISOString()

function readJobCtx(ctx, path) {
  const repo = ctx.repo
  if (!repo) return null
  return repo.readWorking(path) ?? repo.readCommitted(repo.currentBranch(), path)
}

// 解析 ALTER TABLE … ADD COLUMNS ( col TYPE COMMENT '…', … ) → 脚本字段（真实推导，非写死）
function parseAlterCols(text) {
  const m = text && text.match(/ALTER\s+TABLE\s+([\w.]+)\s+ADD\s+COLUMNS\s*\((.*?)\)/is)
  if (!m) return { table: extractTable(text), cols: [] }
  const cols = []
  for (const part of m[2].split(',')) {
    const cm = part.trim().match(/^([A-Za-z_]\w*)\s+([A-Za-z0-9_]+)/)
    if (cm) cols.push({ name: cm[1], type: cm[2] })
  }
  return { table: m[1].split('.').pop(), cols }
}
const normType = (t) => String(t || '').toUpperCase().replace(/\s+/g, '')

// ---------- Provider（动力学层：Function + Action） ----------
export const provider = {
  kind: 'ontology',
  ontVersion: 'v47',

  // Function：作业分类（特征推理，从 repo 读作业，非查预建 Job）
  classifyJob(job = {}, ctx = {}) {
    const path = job.path || ''
    const text = readJobCtx(ctx, path)
    const ast = job.ast || (text && /ADD\s+COLUMNS/i.test(text) ? { alterAddColumns: true } : text && /\b(UPDATE|INSERT\s+INTO)\b/i.test(text) ? { dml: true } : {})
    const engine = job.engine || (text ? extractEngine(text) : 'Hive SQL')
    const jtId = inferJobType(path)
    if (!jtId) return { ok: false, needsHuman: true, note: '分类信号不足/冲突，fail-closed 转人工归类' }
    const jt = getObject(DEFINITION, jtId)
    const inst = getObject(DEFINITION, jt.instance)
    const dir = path.split('/')[0]
    return {
      ok: true, jobType: jtId, jobTypeName: jt.name, instance: jt.instance, instanceName: inst.name,
      platformStyle: inst.style, confidence: 0.98, targetTable: text ? extractTable(text) : (job.targetTable || null),
      signals: [
        { signal: '目录', value: dir, hit: inst.name },
        { signal: '引擎', value: engine, hit: jt.name },
        { signal: 'AST', value: ast.alterAddColumns ? 'ALTER TABLE … ADD COLUMNS' : '—', hit: jt.name },
      ],
      instanceOf: jt.name + ' · ' + inst.name,
    }
  },

  // Function：策略（语义层 covers 逆向，跨平台）
  policiesFor(jobTypeId) {
    const jt = getObject(DEFINITION, jobTypeId)
    if (!jt) return { error: '未知 JobType: ' + jobTypeId }
    const inst = getObject(DEFINITION, jt.instance)
    const polIds = traverse(DEFINITION, inst.id, 'covers', { reverse: true })
    return { instance: inst.id, instanceName: inst.name, jobType: jobTypeId, policies: polIds.map((id) => { const p = getObject(DEFINITION, id); return { id, name: p.name, goal: p.goal, via: 'covers(逆向) ← ' + inst.name } }) }
  },

  // Function：规则 + 实现（语义层，RuleImpl.engine 指向）
  rulesFor(jobTypeId) {
    const jt = getObject(DEFINITION, jobTypeId)
    if (!jt) return { error: '未知 JobType: ' + jobTypeId }
    const inst = getObject(DEFINITION, jt.instance)
    const ruleIds = traverse(DEFINITION, inst.id, 'appliesTo', { reverse: true })
    const rules = ruleIds.map((id) => {
      const r = getObject(DEFINITION, id)
      const impls = traverse(DEFINITION, id, 'implementedBy').map((iid) => getObject(DEFINITION, iid))
      const impl = impls.find((i) => i && i.jobType === jobTypeId) || null
      return { id, name: r.name, severity: r.severity, stage: r.stage, policy: r.policy, via: 'appliesTo(逆向) ← ' + inst.name, impl: impl ? { id: impl.id, engine: impl.engine, ruleset: impl.ruleset, via: 'implementedBy' } : null }
    })
    return { instance: inst.id, instanceName: inst.name, jobType: jobTypeId, ruleCount: rules.length, rules }
  },

  // Function：一致性对账（现场派生：脚本字段 vs 模型设计字段，真实推导而非写死冲突）
  consistencyCheck(pathOrJobId, ctx = {}) {
    const path = String(pathOrJobId || '').startsWith('job/') ? String(pathOrJobId).slice(4) : pathOrJobId
    const text = readJobCtx(ctx, path)
    const targetTable = text ? extractTable(text) : null
    const models = ctx.modeling?._state?.models ? Object.values(ctx.modeling._state.models) : []
    const model = models.find((m) => m.name === targetTable)
    if (!model) {
      return { ok: false, implements: null, releaseBaseline: null, status: 'NO-MODEL', conflicts: [], note: '未找到目标模型 ' + (targetTable || '—') + '：作业未对齐模型（无 implements 边）' }
    }
    const parsed = parseAlterCols(text)
    const designFields = model.fields || []
    const conflicts = []
    // ① 脚本字段 vs 设计字段：类型一致 → MATCH；不一致 → MATCH-CONFLICT；设计未定义 → 单边新增
    for (const c of parsed.cols) {
      const d = designFields.find((f) => f.n === c.name)
      if (!d) conflicts.push({ field: c.name, kind: 'MATCH-CONFLICT', design: '设计未定义', code: c.type, note: '代码新增字段未在设计中定义（需补模型 v4 字段）' })
      else if (normType(d.t) !== normType(c.type)) conflicts.push({ field: c.name, kind: 'MATCH-CONFLICT', design: d.t, code: c.type, note: '设计类型 ' + d.t + ' ≠ 代码 ' + c.type + '（金额/税率类浮点丢精度）' })
    }
    // ② 设计增量「待补」字段：脚本注释声明的待开发事项，设计已含但代码未实现 → BEHIND
    const pendingM = text && text.match(/待补[：:]?\s*([^\n]*)/i)
    if (pendingM) {
      for (const name of (pendingM[1].match(/[A-Za-z_]\w*/g) || [])) {
        const d = designFields.find((f) => f.n === name)
        if (d && !parsed.cols.some((c) => c.name === name)) conflicts.push({ field: name, kind: 'BEHIND', design: d.t, code: null, note: '设计已含 · 代码待补（随下批脚本）' })
      }
    }
    const status = conflicts.some((c) => c.kind === 'DIVERGE') ? 'DIVERGE' : conflicts.some((c) => c.kind === 'MATCH-CONFLICT') ? 'MATCH-CONFLICT' : conflicts.some((c) => c.kind === 'BEHIND') ? 'BEHIND' : 'MATCH'
    const releaseBaseline = { release: model.release ?? ('REL-' + (model.version || '0000')), modelVersion: model.version, commit: model.baselineCommit ?? null }
    return {
      ok: true,
      implements: { model: 'model/' + model.file, physicalTable: model.name },
      releaseBaseline, status, conflicts,
      note: (status === 'MATCH' ? 'MATCH 完全一致' : '⚠ ' + conflicts.filter((c) => c.kind === 'MATCH-CONFLICT').length + ' 类型冲突 · ' + conflicts.filter((c) => c.kind === 'BEHIND').length + ' BEHIND（不阻断）· 基线 ' + releaseBaseline.modelVersion),
    }
  },

  // Function：血缘（上游/下游，基于 buildGraph 的 implements）
  lineageUpstream(ctx, path) {
    const graph = buildGraph(ctx.repo, ctx.modeling)
    const jobId = 'job/' + path
    const j = getObject(graph, jobId)
    const srcs = j && j.targetTable ? traverse(graph, jobId, 'implements') : []
    return { path, sources: srcs.length ? [{ table: j.targetTable }] : [], scheduleDepends: [] }
  },
  lineageDownstream(ctx, path) {
    const graph = buildGraph(ctx.repo, ctx.modeling)
    const jobId = 'job/' + path
    const j = getObject(graph, jobId)
    // 找 targetTable 相等的其他作业（简化）
    const readers = Object.entries(graph.objects).filter(([, o]) => o.type === 'Job' && o.targetTable && j && o.targetTable === j.targetTable && ('job/' + o.path !== jobId)).map(([id, o]) => o.path)
    return { path, targetTable: j ? j.targetTable : null, readers, dagDependents: [], impact: readers.length }
  },
  impactCheck(ctx, modelFile) {
    const graph = buildGraph(ctx.repo, ctx.modeling)
    const mid = 'model/' + modelFile
    const jobIds = traverse(graph, mid, 'implements', { reverse: true })
    return { model: modelFile, jobs: jobIds.map((id) => getObject(graph, id)?.path).filter(Boolean) }
  },

  // Function：本体上下文（现场派生图上锚定当前作业的局部子图，供 UI 呈现「本体」而非工具输出）
  graphContext(ctx, path) {
    const graph = buildGraph(ctx.repo, ctx.modeling)
    const jobId = 'job/' + String(path || '').replace(/^job\//, '')
    const job = getObject(graph, jobId)
    if (!job) return { center: null, nodes: [], edges: [], note: '当前路径未投影为本体 Job 节点（不在分支/未建模）' }
    const nodes = [], edges = [], seen = new Set()
    const addNode = (id) => { if (id && !seen.has(id)) { seen.add(id); const o = getObject(graph, id); if (o) nodes.push({ id, type: o.type, name: o.name || o.path || o.code || o.physicalTable || id, datatype: o.datatype || null }) } }
    const addEdge = (type, a, b) => edges.push({ type, from: a, to: b })
    addNode(jobId)
    for (const to of traverse(graph, jobId, 'instanceOf')) { addNode(to); addEdge('instanceOf', jobId, to) }
    for (const to of traverse(graph, jobId, 'inDirectory')) { addNode(to); addEdge('inDirectory', jobId, to) }
    let modelId = null
    for (const to of traverse(graph, jobId, 'implements')) { addNode(to); addEdge('implements', jobId, to); modelId = to }
    if (modelId) {
      for (const fd of traverse(graph, modelId, 'hasField')) {
        addNode(fd); addEdge('hasField', modelId, fd)
        for (const sd of traverse(graph, fd, 'binds')) { addNode(sd); addEdge('binds', fd, sd) }
      }
      for (const jid of traverse(graph, modelId, 'implements', { reverse: true })) {
        if (jid !== jobId) { addNode(jid); addEdge('implements', jid, modelId) }
      }
    }
    return { center: jobId, nodes: nodes.length ? nodes : [ { id: jobId, type: 'Job', name: job.name || job.path } ], edges, model: modelId ? (getObject(graph, modelId)?.name ?? modelId) : null, derivedFrom: '建模空间+代码仓现场派生' }
  },

  // Function：锚定对象（读 workspace 锚点，回答「当前锚定的对象是什么」——五原语 ObjectType + 关系）
  // 锚定 = workspace-anchor 的 current（模型文件或代码仓分支+目录），经 ctx.anchor.getCurrent() 取，
  // 不由 Agent 手传 path——「当前锚定的对象」由工作区锚点决定，不是调用方现编。
  anchoredObject(ctx = {}) {
    const anchor = ctx.anchor && ctx.anchor.getCurrent ? ctx.anchor.getCurrent() : null
    if (!anchor) return { ok: false, anchored: null, note: '未锚定对象：请先用 workspace_anchor 切换锚点（模型文件，或代码仓分支+作业目录）' }
    const graph = buildGraph(ctx.repo, ctx.modeling)
    if (anchor.kind === 'model') {
      const m = (ctx.modeling?._state?.models ?? {})[anchor.file]
      if (!m) return { ok: false, anchored: null, note: '锚定模型不在建模空间: ' + anchor.file }
      const mid = 'model/' + anchor.file
      const fields = traverse(graph, mid, 'hasField').map((id) => getObject(graph, id)).filter(Boolean)
      const jobs = traverse(graph, mid, 'implements', { reverse: true }).map((id) => getObject(graph, id)).filter(Boolean)
      const jobTypeIds = [...new Set(jobs.map((j) => traverse(graph, 'job/' + j.path, 'instanceOf')[0]).filter(Boolean))]
      const why = '锚定=建模空间模型 ' + anchor.file + '（' + (m.version || '?') + '）→ 沿 hasField ' + fields.length + ' 个字段；沿 implements(逆向) ' + jobs.length + ' 个作业实现 → instanceOf 作业类型 ' + (jobTypeIds.map((id) => getObject(graph, id)?.name).join('/') || '—')
      return {
        ok: true,
        anchored: { kind: 'model', objectType: { type: 'Model', typeName: '模型' }, id: mid, name: m.name, file: anchor.file },
        objectType: { type: 'Model', typeName: '模型' },
        relations: [
          { link: 'hasField', from: mid, to: fields.map((f) => f.id), count: fields.length },
          { link: 'implements(逆向)', from: mid, to: jobs.map((j) => 'job/' + j.path), count: jobs.length },
        ],
        jobTypes: jobTypeIds.map((id) => { const o = getObject(graph, id); return { id, name: o.name } }),
        why,
        note: '模型锚点：沿 implements(逆向) 找到实现作业 → instanceOf 作业类型 → covers/appliesTo 找策略与规则；要扫哪些规则、怎么扫用 ontology_scan_plan',
      }
    }
    // 代码仓锚点（分支 / 分支+目录）
    const branch = anchor.branch
    const dir = anchor.dir || null
    const dirId = dir ? 'dir/' + dir : null
    const jobs = dirId ? traverse(graph, dirId, 'inDirectory', { reverse: true }).map((id) => getObject(graph, id)).filter(Boolean)
      : Object.values(graph.objects).filter((o) => o.type === 'Job')
    const jobTypeIds = [...new Set(jobs.map((j) => traverse(graph, 'job/' + j.path, 'instanceOf')[0]).filter(Boolean))]
    const anchored = dirId
      ? { kind: 'repo', objectType: { type: 'Directory', typeName: '作业目录' }, id: dirId, name: dir, branch }
      : { kind: 'repo', objectType: { type: 'Job', typeName: '作业集合' }, id: 'repo/' + branch, name: branch, branch }
    const why = '锚定=代码仓 ' + branch + (dir ? '/' + dir : '') + ' → 作业 ' + jobs.length + ' 个 → instanceOf 作业类型 ' + (jobTypeIds.map((id) => getObject(graph, id)?.name).join('/') || '—')
    return {
      ok: true,
      anchored,
      objectType: anchored.objectType,
      relations: [
        { link: dirId ? 'inDirectory(逆向)' : 'repo(投影)', from: dirId || ('repo/' + branch), to: jobs.map((j) => 'job/' + j.path), count: jobs.length },
        { link: 'instanceOf', from: jobs.map((j) => 'job/' + j.path), to: jobTypeIds, count: jobTypeIds.length },
      ],
      jobs: jobs.map((j) => j.path),
      jobTypes: jobTypeIds.map((id) => { const o = getObject(graph, id); return { id, name: o.name } }),
      why,
      note: dir ? '目录锚点：沿 instanceOf 到作业类型后，用 ontology_policies_for / ontology_rules_for 取策略与规则' : '分支锚点：请锚定到具体作业目录（workspace_anchor 传 branch+dir）做对象级推理',
    }
  },

  // Function：扫描计划（回答「要扫哪些规则、怎么扫」：规则只声明，执行在引擎，RuleImpl.engine 指向执行器）
  scanPlan(jobTypeId) {
    const rl = this.rulesFor(jobTypeId)
    if (rl.error) return rl
    const rules = (rl.rules || []).filter((r) => r.impl)
    const engines = [...new Set(rules.map((r) => r.impl.ruleset).filter(Boolean))]
    return {
      jobType: jobTypeId, instance: rl.instanceName,
      scanRules: rules.map((r) => ({ id: r.id, name: r.name, severity: r.severity, impl: r.impl })),
      engines,
      howToScan: '由 RuleImpl.engine 执行：' + (engines.join(' / ') || '—') + '。一致性对账走 ontology_consistency_check（Job →implements→ Model 版本区间对账）；规范性/高危走 code_lint / danger_scan / partition_check。规则只声明，执行在引擎。',
    }
  },

  // Function：归因
  explainFinding(findingId) {
    const f = FINDINGS[findingId]
    if (!f) return { error: '未知 finding: ' + findingId }
    return { finding: f, ruleId: f.rule, chain: f.chain, ontVersion: this.ontVersion }
  },

  // Action：提案/断言/裁决（写，gated）
  propose(payload = {}) {
    const kind = ['proposal', 'assertion', 'diverge-ruling'].includes(payload.kind) ? payload.kind : 'proposal'
    return { proposalId: 'prop-' + Date.now().toString(36), kind, status: 'pending-governance', payload, ts: now(), note: '提案/断言/裁决进本体平台治理审批' }
  },

  trace() { return RESOLUTION_TRACE },
  listFindings() { return Object.values(FINDINGS) },

  _state: { ontVersion: 'v47' },
}

provider.anchorSummary = function anchorSummary() {
  return { ontVersion: this.ontVersion, semanticObjects: Object.keys(DEFINITION.objects).length, semanticLinks: DEFINITION.links.length }
}
