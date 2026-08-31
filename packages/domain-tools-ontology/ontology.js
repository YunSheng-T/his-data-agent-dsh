// @his/domain-tools-ontology — ontology.js：数据开发本体的语义层（五原语之 Object + Link）
//
// 定位（Palantir Ontology 范式）：本体 = 语义层（Object/Link）+ 动力学层（Action/Function）。
// 本文件拆成两层：
//   DEFINITION（语义层·定义型，固定）：PlatformInstance/JobType/Policy/Rule/RuleImpl + 治理关系
//   buildReferenceGraph（引用层·投影型，现场派生）：从 建模空间(hisModeling)+代码仓(hisRepo) 投影
//     Model/Field/DataStandard/ModelVersion/Job/Directory + implements/instanceOf/inDirectory/hasField 等关系
//   buildGraph(repo, modeling) = DEFINITION + buildReferenceGraph 合并后的完整图（供 provider 推理）
// 规则（Policy/Rule/RuleImpl）是普通 Object Type + Link，不是独立原语。

// ---------- 对象类型 schema ----------
export const OBJECT_TYPES = {
  Model:           { props: ['name', 'physicalTable', 'domain', 'layer', 'version', 'published'] },
  Field:           { props: ['name', 'type', 'comment', 'std'] },
  DataStandard:    { props: ['code', 'version', 'rule', 'status'] },
  ModelVersion:    { props: ['version', 'summary', 'release'] },
  PlatformInstance:{ props: ['name', 'style', 'engine'] },
  JobType:         { props: ['name', 'instance'] },
  Job:             { props: ['path', 'engine', 'targetTable', 'code'] },
  Directory:       { props: ['path'] },
  Policy:          { props: ['name', 'goal'] },
  Rule:            { props: ['name', 'severity', 'stage', 'policy', 'platform'] },
  RuleImpl:        { props: ['engine', 'ruleset', 'jobType'] },
  Release:         { props: ['release', 'commit', 'modelVersion'] },
}

// ---------- 关系类型 schema ----------
export const LINK_TYPES = {
  implements:      { from: 'Job', to: 'Model' },
  hasField:        { from: 'Model', to: 'Field' },
  binds:           { from: 'Field', to: 'DataStandard' },
  hasVersion:      { from: 'Model', to: 'ModelVersion' },
  instanceOf:      { from: 'Job', to: 'JobType' },
  hasJobType:      { from: 'PlatformInstance', to: 'JobType' },
  inDirectory:     { from: 'Job', to: 'Directory' },
  releaseBaseline: { from: 'Release', to: 'Job' },
  containsRule:    { from: 'Policy', to: 'Rule' },
  covers:          { from: 'Policy', to: 'PlatformInstance' },
  appliesTo:       { from: 'Rule', to: 'PlatformInstance' },
  implementedBy:   { from: 'Rule', to: 'RuleImpl' },
  bindsJobType:    { from: 'RuleImpl', to: 'JobType' },
}

// ---------- 语义层 · 定义型（固定） ----------
export const DEFINITION = {
  objects: {
    'inst/dbscript':  { type: 'PlatformInstance', name: '数据库脚本平台', style: '高代码', engine: 'sql-scanner' },
    'inst/flashsync': { type: 'PlatformInstance', name: 'FlashSync', style: '低代码', engine: 'flashsync-parser' },
    'inst/bds':       { type: 'PlatformInstance', name: 'BDS', style: '高代码', engine: 'bds-parser' },
    'inst/schedule':  { type: 'PlatformInstance', name: '数据调度平台', style: '—', engine: 'sched' },
    'inst/svc':       { type: 'PlatformInstance', name: '数据服务平台', style: '—', engine: 'svc' },
    'jt/schema-change':     { type: 'JobType', name: '表结构变更', instance: 'inst/dbscript' },
    'jt/transfer':          { type: 'JobType', name: '传输任务', instance: 'inst/flashsync' },
    'jt/process-flashsync': { type: 'JobType', name: '加工任务', instance: 'inst/flashsync' },
    'jt/process-bds':       { type: 'JobType', name: '加工任务', instance: 'inst/bds' },
    'jt/schedule':          { type: 'JobType', name: '调度作业', instance: 'inst/schedule' },
    'jt/svc':               { type: 'JobType', name: '数据服务', instance: 'inst/svc' },
    'jt/ops':               { type: 'JobType', name: '运维编排', instance: 'inst/schedule' },
    'pol/design-consistency': { type: 'Policy', name: '设计开发一致性', goal: '设计态↔开发态对齐' },
    'pol/script-quality':     { type: 'Policy', name: '脚本质量规范', goal: '脚本编制质量' },
    'pol/sql-safety':         { type: 'Policy', name: 'SQL 安全规范', goal: '高危/安全红线' },
    'rule/rc@dbscript-field-type':    { type: 'Rule', name: '字段类型一致性', severity: '告警', stage: '流水线', policy: 'pol/design-consistency', platform: 'inst/dbscript' },
    'rule/rc@dbscript-table':         { type: 'Rule', name: '表模型一致性', severity: '阻断', stage: '流水线', policy: 'pol/design-consistency', platform: 'inst/dbscript' },
    'rule/rc@dbscript-field-missing': { type: 'Rule', name: '字段缺失/多余', severity: '告警', stage: '流水线', policy: 'pol/design-consistency', platform: 'inst/dbscript' },
    'rule/rc@etl-field-type':         { type: 'Rule', name: '字段类型一致性', severity: '告警', stage: '流水线', policy: 'pol/design-consistency', platform: 'inst/flashsync' },
    'rule/rc@etl-danger':             { type: 'Rule', name: '高危操作检测', severity: '阻断', stage: '全阶段', policy: 'pol/sql-safety', platform: 'inst/flashsync' },
    'impl/se-sql-1.8':      { type: 'RuleImpl', engine: 'sql-scanner', ruleset: 'se-sql 1.8', jobType: 'jt/schema-change' },
    'impl/fs-transfer-2.1': { type: 'RuleImpl', engine: 'flashsync-parser', ruleset: 'fs-transfer 2.1', jobType: 'jt/transfer' },
    'impl/bds-etl-3.0':     { type: 'RuleImpl', engine: 'bds-parser', ruleset: 'bds-etl 3.0', jobType: 'jt/process-bds' },
  },
  links: [
    { type: 'hasJobType', from: 'inst/dbscript', to: 'jt/schema-change' },
    { type: 'hasJobType', from: 'inst/flashsync', to: 'jt/transfer' },
    { type: 'hasJobType', from: 'inst/flashsync', to: 'jt/process-flashsync' },
    { type: 'hasJobType', from: 'inst/bds', to: 'jt/process-bds' },
    { type: 'hasJobType', from: 'inst/schedule', to: 'jt/schedule' },
    { type: 'hasJobType', from: 'inst/svc', to: 'jt/svc' },
    { type: 'containsRule', from: 'pol/design-consistency', to: 'rule/rc@dbscript-field-type' },
    { type: 'containsRule', from: 'pol/design-consistency', to: 'rule/rc@dbscript-table' },
    { type: 'containsRule', from: 'pol/design-consistency', to: 'rule/rc@dbscript-field-missing' },
    { type: 'containsRule', from: 'pol/design-consistency', to: 'rule/rc@etl-field-type' },
    { type: 'containsRule', from: 'pol/sql-safety', to: 'rule/rc@etl-danger' },
    { type: 'covers', from: 'pol/design-consistency', to: 'inst/dbscript' },
    { type: 'covers', from: 'pol/design-consistency', to: 'inst/flashsync' },
    { type: 'covers', from: 'pol/script-quality', to: 'inst/dbscript' },
    { type: 'covers', from: 'pol/sql-safety', to: 'inst/dbscript' },
    { type: 'appliesTo', from: 'rule/rc@dbscript-field-type', to: 'inst/dbscript' },
    { type: 'appliesTo', from: 'rule/rc@dbscript-table', to: 'inst/dbscript' },
    { type: 'appliesTo', from: 'rule/rc@dbscript-field-missing', to: 'inst/dbscript' },
    { type: 'appliesTo', from: 'rule/rc@etl-field-type', to: 'inst/flashsync' },
    { type: 'appliesTo', from: 'rule/rc@etl-danger', to: 'inst/flashsync' },
    { type: 'implementedBy', from: 'rule/rc@dbscript-field-type', to: 'impl/se-sql-1.8' },
    { type: 'implementedBy', from: 'rule/rc@etl-field-type', to: 'impl/fs-transfer-2.1' },
    { type: 'implementedBy', from: 'rule/rc@etl-field-type', to: 'impl/bds-etl-3.0' },
    { type: 'bindsJobType', from: 'impl/se-sql-1.8', to: 'jt/schema-change' },
    { type: 'bindsJobType', from: 'impl/fs-transfer-2.1', to: 'jt/transfer' },
    { type: 'bindsJobType', from: 'impl/bds-etl-3.0', to: 'jt/process-bds' },
  ],
}

// ---------- 引用层 · 投影型（现场派生） ----------
export function extractTable(text) {
  if (!text) return null
  const m = text.match(/INSERT\s+(OVERWRITE|INTO)\s+TABLE\s+([\w.]+)/i) || text.match(/ALTER\s+TABLE\s+(\S+)/i) || text.match(/FROM\s+([\w.]+)/i)
  return m ? m[m.length - 1].split('.').pop() : null
}
export function extractEngine(text) {
  return (text && text.match(/--\s*@engine:\s*(\S+)/))?.[1] ?? null
}
export function inferJobType(path) {
  const d = (path || '').split('/')[0]
  if (d === 'dbscript') return 'jt/schema-change'
  if (d.startsWith('etl/ods')) return 'jt/transfer'
  if (d.startsWith('etl')) return 'jt/process-bds'
  if (d === 'dag') return 'jt/schedule'
  if (d === 'svc') return 'jt/svc'
  if (d === 'ops') return 'jt/ops'
  return null
}

/** 引用层投影：从建模空间 + 代码仓 现场派生 Model/Field/Job 等 + 关系 */
export function buildReferenceGraph(repo, modeling) {
  const objects = {}
  const links = []
  const branch = repo.currentBranch()
  const models = modeling?._state?.models ? Object.values(modeling._state.models) : []
  for (const m of models) {
    const mid = 'model/' + m.file
    objects[mid] = { type: 'Model', name: m.name, physicalTable: m.name, domain: m.domain, layer: m.layer, version: m.version, published: m.published }
    const vid = mid + '@v' + m.version
    objects[vid] = { type: 'ModelVersion', version: m.version, summary: '模型 ' + m.name, release: null }
    links.push({ type: 'hasVersion', from: mid, to: vid })
    for (const f of m.fields || []) {
      const fid = mid + '/field/' + f.n
      objects[fid] = { type: 'Field', name: f.n, datatype: f.t, comment: f.c, std: f.std }
      links.push({ type: 'hasField', from: mid, to: fid })
      if (f.std) {
        const sid = 'std/' + f.std
        objects[sid] = objects[sid] || { type: 'DataStandard', code: f.std }
        links.push({ type: 'binds', from: fid, to: sid })
      }
    }
  }
  // 目录树用 treeWithState（已提交 + 未提交覆盖）：dbscript/svc 这类未提交的新作业也必须投影进本体，
  // 否则「当前锚定的对象」在未提交态下会显示为空目录（扫描语义是工作区现场，不是只看已提交视图）
  const tree = repo.treeWithState ? repo.treeWithState(branch) : (repo.tree ? repo.tree(branch) : [])
  for (const e of tree) {
    if (!['etl', 'script', 'dag', 'svc', 'ops'].includes(e.kind)) continue
    const text = repo.readCommitted(branch, e.path) ?? repo.readWorking(e.path)
    const jobId = 'job/' + e.path
    objects[jobId] = { type: 'Job', path: e.path, engine: extractEngine(text) || 'Hive SQL', targetTable: extractTable(text) }
    const dir = e.path.split('/').slice(0, -1).join('/')
    const dirId = 'dir/' + dir
    if (!objects[dirId]) objects[dirId] = { type: 'Directory', path: dir }
    links.push({ type: 'inDirectory', from: jobId, to: dirId })
    const jtId = inferJobType(e.path)
    if (jtId) links.push({ type: 'instanceOf', from: jobId, to: jtId })
    const ttail = objects[jobId].targetTable
    const model = models.find((m) => m.name === ttail)
    if (model) links.push({ type: 'implements', from: jobId, to: 'model/' + model.file })
  }
  return { objects, links }
}

/** 完整图 = 语义层定义 + 引用层投影 */
export function buildGraph(repo, modeling) {
  const ref = buildReferenceGraph(repo, modeling)
  return { objects: { ...DEFINITION.objects, ...ref.objects }, links: [...DEFINITION.links, ...ref.links] }
}

// ---------- 图遍历 ----------
export function traverse(graph, fromId, linkType, { reverse = false } = {}) {
  const g = graph || DEFINITION
  return g.links.filter((l) => l.type === linkType && (reverse ? l.to === fromId : l.from === fromId)).map((l) => (reverse ? l.from : l.to))
}
export function getObject(graph, id) {
  const g = graph || DEFINITION
  return g.objects[id] ? { id, ...g.objects[id] } : null
}
