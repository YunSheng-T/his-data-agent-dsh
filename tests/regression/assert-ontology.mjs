// @his/domain-tools-ontology 断言（V4 · 引用层现场派生）：直调 provider + definition，不依赖 dsh/模型
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { provider } from '../../packages/domain-tools-ontology/provider-mock.js'
import { buildDefinitions } from '../../packages/domain-tools-ontology/definitions.js'
import { OBJECT_TYPES, LINK_TYPES, DEFINITION, buildGraph, traverse } from '../../packages/domain-tools-ontology/ontology.js'
import { provider as modelingProvider } from '../../packages/domain-tools-modeling/provider-mock.js'
import { TenantRepoProvider } from '../../packages/workspace-repo/provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from '../../packages/workspace-repo/seed-repo.js'
import { scanScriptJob } from '../../packages/domain-tools-dev/definitions.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'his-onto-'))
const repo = new TenantRepoProvider(root)
repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
const modeling = modelingProvider
// 锚定服务替身：本体入口读「当前锚定的对象」——测试里可切换模型锚点 / 代码仓目录锚点
let anchorState = { kind: 'repo', branch: 'main', dir: 'dbscript', key: 'repo:main:dbscript@clean' }
const anchor = { getCurrent: () => anchorState, key: () => (anchorState ? anchorState.key : null) }
const ctx = { repo, modeling, anchor }
const tools = new Map(buildDefinitions(provider, { repo, modeling, anchor }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

// 1. 语义层 schema + 引用层现场派生
check('Object Types schema 齐全', Object.keys(OBJECT_TYPES).length >= 12)
check('Link Types schema 齐全', Object.keys(LINK_TYPES).length >= 13)
const g = buildGraph(repo, modeling)
check('buildGraph 现场派生（对象数>语义层）', Object.keys(g.objects).length > Object.keys(DEFINITION.objects).length, Object.keys(DEFINITION.objects).length + '→' + Object.keys(g.objects).length)
check('引用层含 建模空间的模型投影', Object.keys(g.objects).some((id) => id.startsWith('model/') && g.objects[id].type === 'Model'))
check('引用层含 代码仓作业投影', Object.keys(g.objects).some((id) => id.startsWith('job/') && g.objects[id].type === 'Job'))

// 2. 工具归位（Function/Action）
const FUNC = ['ontology_anchored_object', 'ontology_classify_job', 'ontology_policies_for', 'ontology_rules_for', 'ontology_scan_plan', 'ontology_consistency_check', 'ontology_lineage_upstream', 'ontology_lineage_downstream', 'ontology_impact_check', 'ontology_explain_finding']
check('10 Function + 1 Action 注册', [...FUNC, 'ontology_propose'].every((n) => tools.has(n)))
check('Function risk=read', FUNC.every((n) => tools.get(n)?.risk === 'read'))
check('Action propose risk=knowledge-write', tools.get('ontology_propose')?.risk === 'knowledge-write')
// 本体推理入口：锚定驱动——先找「当前锚定的对象」（读 workspace 锚点，非手传 path）
const ao = call('ontology_anchored_object', {})
check('anchored_object 读锚点：代码仓 dbscript 目录 → ObjectType=Directory（作业目录）', ao.ok === true && ao.objectType && ao.objectType.type === 'Directory' && ao.objectType.typeName === '作业目录' && ao.anchored.name === 'dbscript', JSON.stringify(ao.objectType))
check('anchored_object 关系遍历：inDirectory(逆向) 作业 + instanceOf 作业类型', (ao.relations || []).some((r) => r.link === 'inDirectory(逆向)' && r.count >= 1) && (ao.jobs || []).includes('dbscript/alter_dwd_tax_payment_v4.sql') && (ao.jobTypes || []).some((j) => j.id === 'jt/schema-change'), JSON.stringify(ao.jobs) + ' / ' + JSON.stringify(ao.jobTypes))
check('anchored_object 识别依据 why 可引用（锚定 → 作业 → instanceOf）', /锚定=代码仓 main\/dbscript/.test(ao.why || '') && /instanceOf/.test(ao.why || ''), ao.why)
// 模型锚点 → ObjectType=Model，沿 implements(逆向) 找作业与作业类型
anchorState = { kind: 'model', file: 'dwd_tax_payment.model', key: 'model:dwd_tax_payment.model@v4' }
const ao2 = call('ontology_anchored_object', {})
check('anchored_object 模型锚点 → ObjectType=Model + implements(逆向) 作业', ao2.ok === true && ao2.objectType.type === 'Model' && (ao2.relations || []).some((r) => r.link === 'implements(逆向)' && r.count >= 1) && (ao2.jobTypes || []).some((j) => j.id === 'jt/schema-change'), JSON.stringify(ao2.relations))
// 未锚定 → fail-closed
anchorState = null
const ao3 = call('ontology_anchored_object', {})
check('anchored_object 未锚定 fail-closed', ao3.ok === false && /workspace_anchor/.test(ao3.note || ''), ao3.note)
// 扫描计划：沿 jobTypes → 要扫哪些规则、怎么扫
const plan = call('ontology_scan_plan', { jobType: 'jt/schema-change' })
check('scan_plan 列出可执行规则（有 RuleImpl）', plan.scanRules && plan.scanRules.some((r) => r.id === 'rule/rc@dbscript-field-type' && r.impl && r.impl.ruleset === 'se-sql 1.8'), JSON.stringify((plan.scanRules || []).map((r) => r.id)))
check('scan_plan 给出怎么扫（engines + 执行器）', plan.engines && plan.engines.includes('se-sql 1.8') && /ontology_consistency_check/.test(plan.howToScan || ''), plan.howToScan)

// 3. classify_job：特征推理（从 repo 读 ETL 作业，非查预建）
const c1 = call('ontology_classify_job', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('classify ETL 作业 → jt/process-bds（特征推理）', c1.ok === true && c1.jobType === 'jt/process-bds', c1.jobTypeName + '/' + c1.instanceName)
const c2 = call('ontology_classify_job', { path: 'dbscript/alter_dwd_tax_payment_v4.sql' })
check('classify dbscript → jt/schema-change', c2.ok === true && c2.jobType === 'jt/schema-change', c2.jobTypeName)

// 4. consistency_check：现场对账（implements 模型 + 四态）
const m1 = call('ontology_consistency_check', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('consistency ETL jobs implements 模型（现场匹配）', m1.implements && m1.implements.physicalTable === 'dwd_tax_declaration', m1.implements?.physicalTable)
check('consistency ETL(INSERT) 无 ALTER 冲突 → MATCH（现场非写死）', m1.status === 'MATCH' && m1.conflicts.length === 0, m1.status + '/' + JSON.stringify(m1.conflicts))
const m2 = call('ontology_consistency_check', { path: 'dbscript/alter_dwd_tax_payment_v4.sql' })
check('consistency dbscript 现场推导 tax_rate 类型冲突（设计 DECIMAL(10,4) ≠ 代码 DOUBLE）', m2.ok === true && m2.status === 'MATCH-CONFLICT' && m2.conflicts.some((c) => c.field === 'tax_rate' && c.kind === 'MATCH-CONFLICT' && c.design === 'DECIMAL(10,4)' && c.code === 'DOUBLE'), JSON.stringify(m2.conflicts))
check('consistency dbscript BEHIND pay_fee + 基线模型 v4（源于模型 seed）', m2.conflicts.some((c) => c.field === 'pay_fee' && c.kind === 'BEHIND') && m2.releaseBaseline.modelVersion === 'v4', m2.releaseBaseline?.modelVersion)

// 5. lineage / impact（基于现场派生图）
const up = call('ontology_lineage_upstream', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('lineage_upstream 可调用', up.path === 'etl/dwd/dwd_tax_declaration.etl')
const imp = call('ontology_impact_check', { model: 'dwd_tax_declaration.model' })
check('impact_check 列出实现作业', imp.jobs.includes('etl/dwd/dwd_tax_declaration.etl'), JSON.stringify(imp.jobs))
// 本体上下文（现场派生子图）——UI 呈现「本体」本身用
const gctx = provider.graphContext(ctx, 'etl/dwd/dwd_tax_declaration.etl')
const gtypes = (gctx.nodes || []).map(n => n.type)
check('graphContext 现场派生本体子图（Job→Model→Field）', gctx.center === 'job/etl/dwd/dwd_tax_declaration.etl' && gtypes.includes('Model') && gtypes.includes('Field'), gtypes.join(','))
check('graphContext 含 Field→标准 binds 边（本体绑定）', (gctx.edges || []).some(e => e.type === 'binds'), JSON.stringify((gctx.edges || []).map(e => e.type)))

// 6. policies / rules / explain / propose
const pol = call('ontology_policies_for', { jobType: 'jt/schema-change' })
check('policies_for 跨平台策略', (pol.policies || []).length >= 3, (pol.policies || []).map((p) => p.name).join(','))
const rl = call('ontology_rules_for', { jobType: 'jt/schema-change' })
check('rules_for 规则+impl 绑定', rl.ruleCount >= 3 && rl.rules.some((r) => r.impl && r.impl.ruleset === 'se-sql 1.8'))
const e1 = call('ontology_explain_finding', { finding: 'F-101' })
check('explain_finding 归因链', e1.chain.includes('字段类型一致性'))
check('propose 三 kind', ['proposal', 'assertion', 'diverge-ruling'].every((k) => call('ontology_propose', { kind: k, payload: {}, approvalNote: '确认' }).kind === k))

// 7. scanScriptJob（引擎层调本体 Function）
const ss = scanScriptJob(repo, modeling, provider, 'dbscript/alter_dwd_tax_payment_v4.sql')
check('scanScriptJob 本体取规则（impl se-sql 1.8）', ss.ontology && ss.ontology.ruleCount >= 3 && ss.ontology.impls.includes('se-sql 1.8'), JSON.stringify(ss.ontology))
check('scanScriptJob 一致性消费事实（冲突→diff）', ss.consistency.pass === false && ss.consistency.diffs.some((d) => d.field === 'tax_rate'))
check('scanVerdict 判 diff', (await import('../../packages/domain-tools-dev/provider-cicd.js')).scanVerdict(ss) === 'diff')

const pass = checks.filter(Boolean).length
console.log('\n== ontology: ' + pass + '/' + checks.length + ' 通过 ==')
process.exit(pass === checks.length ? 0 : 1)
