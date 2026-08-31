// @his/domain-tools-ontology — ontology.js：数据开发本体的语义层（五原语之 Object + Link）
//
// 定位（Palantir Ontology 范式）：本体 = 语义层（Object/Link）+ 动力学层（Action/Function）。
// 本文件只承载「语义层」——对象类型 schema、关系类型 schema、以及演示实例图（对象 + 关系）。
// Action（写操作）/ Function（只读计算）在 definitions.js 归位，扫描执行在 domain-tools-dev（引擎层）。
// 规则（Policy/Rule/RuleImpl）是普通 Object Type + Link，不是独立原语。

// ---------- 对象类型 schema（有哪些对象类型、各有哪些属性） ----------
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

// ---------- 关系类型 schema（有哪些关系、source/target 对象类型） ----------
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

// ---------- 演示实例图（对齐 dbscript/alter_dwd_tax_payment_v4.sql 场景 + 多平台实例） ----------
export const GRAPH = {
  objects: {
    // 平台实例
    'inst/dbscript':  { type: 'PlatformInstance', name: '数据库脚本平台', style: '高代码', engine: 'sql-scanner' },
    'inst/flashsync': { type: 'PlatformInstance', name: 'FlashSync', style: '低代码', engine: 'flashsync-parser' },
    'inst/bds':       { type: 'PlatformInstance', name: 'BDS', style: '高代码', engine: 'bds-parser' },
    // 作业类型
    'jt/schema-change':      { type: 'JobType', name: '表结构变更', instance: 'inst/dbscript' },
    'jt/transfer':           { type: 'JobType', name: '传输任务', instance: 'inst/flashsync' },
    'jt/process-flashsync':  { type: 'JobType', name: '加工任务', instance: 'inst/flashsync' },
    'jt/process-bds':        { type: 'JobType', name: '加工任务', instance: 'inst/bds' },
    // 作业 / 模型 / 目录
    'job/alter-dwd-tax-payment-v4': { type: 'Job', path: 'dbscript/alter_dwd_tax_payment_v4.sql', engine: 'Hive SQL', targetTable: 'dwd_tax_payment' },
    'model/M-1024': { type: 'Model', name: 'dwd_tax_payment', physicalTable: 'dwd_tax_payment', version: 'v4' },
    'dir/dbscript': { type: 'Directory', path: 'dbscript' },
    // 治理对象（普通 Object Type）
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
    // 引用层
    'rel/REL-0820': { type: 'Release', release: 'REL-0820', commit: 'b7d2f91', modelVersion: 'v3' },
  },
  links: [
    // 分类 / 归属
    { type: 'instanceOf', from: 'job/alter-dwd-tax-payment-v4', to: 'jt/schema-change' },
    { type: 'hasJobType', from: 'inst/dbscript', to: 'jt/schema-change' },
    { type: 'hasJobType', from: 'inst/flashsync', to: 'jt/transfer' },
    { type: 'hasJobType', from: 'inst/flashsync', to: 'jt/process-flashsync' },
    { type: 'hasJobType', from: 'inst/bds', to: 'jt/process-bds' },
    { type: 'implements', from: 'job/alter-dwd-tax-payment-v4', to: 'model/M-1024' },
    { type: 'inDirectory', from: 'job/alter-dwd-tax-payment-v4', to: 'dir/dbscript' },
    // 治理关系（Policy/Rule/RuleImpl 作为普通对象关联）
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
    // 引用层基线
    { type: 'releaseBaseline', from: 'rel/REL-0820', to: 'job/alter-dwd-tax-payment-v4' },
  ],
}

// ---------- 图遍历辅助 ----------
// 沿某关系类型，取 from 对象的相邻对象 id（正向）；reverse=true 取反向（指向 from 的对象）
export function traverse(graph, fromId, linkType, { reverse = false } = {}) {
  const g = graph || GRAPH
  return g.links
    .filter((l) => l.type === linkType && (reverse ? l.to === fromId : l.from === fromId))
    .map((l) => (reverse ? l.from : l.to))
}
// 取对象实例（含类型）
export function getObject(graph, id) {
  const g = graph || GRAPH
  return g.objects[id] ? { id, ...g.objects[id] } : null
}
