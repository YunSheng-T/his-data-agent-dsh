// @his/domain-tools-ontology 断言（V3 · 五原语）：直调 provider + definition，不依赖 dsh/模型
// 覆盖：语义层（Object/Link 数据模型）+ 动力学层（Function/Action 归位）+ 扫描引擎分离
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { provider } from '../../packages/domain-tools-ontology/provider-mock.js'
import { buildDefinitions } from '../../packages/domain-tools-ontology/definitions.js'
import { GRAPH, OBJECT_TYPES, LINK_TYPES, traverse } from '../../packages/domain-tools-ontology/ontology.js'
import { TenantRepoProvider } from '../../packages/workspace-repo/provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from '../../packages/workspace-repo/seed-repo.js'
import { scanScriptJob } from '../../packages/domain-tools-dev/definitions.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'his-onto-'))
const repo = new TenantRepoProvider(root)
repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
const tools = new Map(buildDefinitions(provider, { repo }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

// 1. 语义层：Object/Link 数据模型（五原语之 Object + Link）
check('Object Types schema 齐全（含治理对象）', Object.keys(OBJECT_TYPES).length >= 12, String(Object.keys(OBJECT_TYPES).length))
check('Link Types schema 齐全（含治理关系）', Object.keys(LINK_TYPES).length >= 13, String(Object.keys(LINK_TYPES).length))
check('实例图：对象 + 关系', Object.keys(GRAPH.objects).length >= 20 && GRAPH.links.length >= 25, Object.keys(GRAPH.objects).length + '对象/' + GRAPH.links.length + '关系')
check('Policy/Rule/RuleImpl 是普通 Object Type', ['pol/design-consistency', 'rule/rc@dbscript-field-type', 'impl/se-sql-1.8'].every((id) => GRAPH.objects[id]?.type))
check('遍历：Job →instanceOf→ JobType', traverse(GRAPH, 'job/alter-dwd-tax-payment-v4', 'instanceOf')[0] === 'jt/schema-change')
check('遍历：Policy →containsRule→ Rule', traverse(GRAPH, 'pol/design-consistency', 'containsRule').length === 4)
check('遍历：Rule →implementedBy→ RuleImpl(engine 指向)', traverse(GRAPH, 'rule/rc@dbscript-field-type', 'implementedBy').length === 1)

// 2. 动力学层：工具归位 Action/Function
check('6 工具注册', ['ontology_classify_job', 'ontology_policies_for', 'ontology_rules_for', 'ontology_consistency_check', 'ontology_explain_finding', 'ontology_propose'].every((n) => tools.has(n)))
check('Function risk=read（5 个）', ['ontology_classify_job', 'ontology_policies_for', 'ontology_rules_for', 'ontology_consistency_check', 'ontology_explain_finding'].every((n) => tools.get(n)?.risk === 'read'))
check('Action propose risk=knowledge-write(gated)', tools.get('ontology_propose')?.risk === 'knowledge-write')

// 3. Function：classify_job（作业分类 → 作业类型 + 平台实例）
const c1 = call('ontology_classify_job', { path: 'dbscript/alter_dwd_tax_payment_v4.sql', engine: 'Hive SQL' })
check('classify_job 识别表结构变更 + 平台实例', c1.ok === true && c1.jobType === 'jt/schema-change' && c1.instance === 'inst/dbscript', c1.jobTypeName + ' / ' + c1.instanceName + ' / 置信 ' + c1.confidence)

// 4. Function：policies_for / rules_for（跨平台策略 + 规则实现绑定）
const pol = call('ontology_policies_for', { jobType: 'jt/schema-change' })
check('policies_for 跨平台策略（covers 逆向）', (pol.policies || []).length >= 3, (pol.policies || []).map((p) => p.name).join(','))
const rl = call('ontology_rules_for', { jobType: 'jt/schema-change' })
check('rules_for 规则 + RuleImpl 绑定（engine 指向）', rl.ruleCount >= 3 && rl.rules.some((r) => r.impl && r.impl.ruleset === 'se-sql 1.8'), rl.rules.map((r) => r.name + '/' + (r.impl ? r.impl.ruleset : '无')).join(','))

// 5. Function：consistency_check（编排：本体规则 + 引用层事实 → 四态）
const m1 = call('ontology_consistency_check', { path: 'dbscript/alter_dwd_tax_payment_v4.sql' })
check('consistency_check 四态 MATCH-CONFLICT', m1.status === 'MATCH-CONFLICT', m1.status)
check('consistency_check implements 物理表名 + 基线', m1.implements.physicalTable === 'dwd_tax_payment' && m1.releaseBaseline.release === 'REL-0820', m1.implements.physicalTable + ' / ' + m1.releaseBaseline.release)

// 6. Function：explain_finding（归因链沿本体关系回溯）
const e1 = call('ontology_explain_finding', { finding: 'F-101' })
check('explain_finding 归因链', e1.chain.includes('字段类型一致性') && e1.chain.includes('设计开发一致性'), e1.chain.slice(0, 40) + '…')

// 7. Action：propose（写本体，gated，治理流）
check('propose 支持 proposal/assertion/diverge-ruling 三 kind', ['proposal', 'assertion', 'diverge-ruling'].every((k) => call('ontology_propose', { kind: k, payload: { x: 1 }, approvalNote: '确认' }).kind === k))

// 8. 扫描引擎分离：scanScriptJob（引擎层调本体 Function 取规则 + 引擎判定）
const ss = scanScriptJob(repo, null, provider, 'dbscript/alter_dwd_tax_payment_v4.sql')
check('scanScriptJob 本体取规则（impl 指向引擎 se-sql 1.8）', ss.ontology && ss.ontology.ruleCount >= 3 && ss.ontology.impls.includes('se-sql 1.8'), JSON.stringify(ss.ontology))
check('scanScriptJob 一致性消费事实（类型冲突→diff）', ss.consistency.pass === false && ss.consistency.diffs.some((d) => d.field === 'tax_rate'), JSON.stringify(ss.consistency.diffs))
check('scanVerdict 判 script 结论为 diff', (await import('../../packages/domain-tools-dev/provider-cicd.js')).scanVerdict(ss) === 'diff')

const pass = checks.filter(Boolean).length
console.log('\n== ontology: ' + pass + '/' + checks.length + ' 通过 ==')
process.exit(pass === checks.length ? 0 : 1)