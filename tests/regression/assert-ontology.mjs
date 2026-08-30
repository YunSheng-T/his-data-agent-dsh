// @his/domain-tools-ontology 断言（V14/V15 本体驱动扫描）：直调 provider + definition，不依赖 dsh/模型
// 用法：node tests/regression/assert-ontology.mjs
// 覆盖：classify/policies/rules/match_increment/explain/propose 六工具语义 + risk 分级 + 四态
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { provider } from '../../packages/domain-tools-ontology/provider-mock.js'
import { buildDefinitions } from '../../packages/domain-tools-ontology/definitions.js'
import { TenantRepoProvider } from '../../packages/workspace-repo/provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from '../../packages/workspace-repo/seed-repo.js'
import { scanScriptJob } from '../../packages/domain-tools-dev/definitions.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')) }

// 临时仓（mount finance 种子，含 dbscript/svc），供 classify 从文件读 AST 特征
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'his-onto-'))
const repo = new TenantRepoProvider(root)
repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
const tools = new Map(buildDefinitions(provider, { repo }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

// 1. 工具注册与 risk 分级
check('ontology 域工具注册（6 个）', ['ontology_classify','ontology_policies','ontology_rules','ontology_match_increment','ontology_explain','ontology_propose'].every((n) => tools.has(n)))
check('只读工具 risk=read', ['ontology_classify','ontology_policies','ontology_rules','ontology_match_increment','ontology_explain'].every((n) => tools.get(n)?.risk === 'read'))
check('ontology_propose risk=knowledge-write(gated)', tools.get('ontology_propose')?.risk === 'knowledge-write')

// 2. classify：脚本 → 表结构变更（信号链 + 排除项）
const scriptJob = { path: 'dbscript/alter_dwd_tax_payment_v4.sql', engine: 'Hive SQL' }
const c1 = call('ontology_classify', scriptJob)
check('classify 识别脚本为表结构变更', c1.ok === true && c1.jobType === 'schema-change', c1.jobTypeName)
check('classify 置信 0.98（三级信号）', c1.confidence === 0.98, String(c1.confidence))
check('classify 输出排除项（DML + 数据服务）', c1.excluded.length >= 2, c1.excluded.join(' | '))

// 3. policies：schema-change → 命中 3 过滤 1
const p1 = call('ontology_policies', { jobType: 'schema-change', tenant: 'finance' })
check('policies 命中共 3', p1.appliedPolicyCount === 3, String(p1.appliedPolicyCount))
check('policies 过滤 1（跨租户）', p1.filteredCount === 1, p1.filtered.map((f) => f.name).join(','))
check('policies 含继承/覆盖说明', p1.hit.find((p) => p.id === 'script-quality')?.override === 1, '脚本质量规范 override=1')

// 4. rules：18 条 + impl 就绪 + 阶段拆分
const r1 = call('ontology_rules', { policies: ['consistency','script-quality','sql-safety'] })
check('rules 18 条', r1.count === 18, String(r1.count))
check('rules impl se-sql 1.8 就绪', r1.implVersion === '1.8' && r1.implReady === true)
check('rules 阶段拆分含事中/流水线', r1.stageSplit.done === 4 && r1.stageSplit.pipeline === 18, JSON.stringify(r1.stageSplit))

// 5. match_increment：implements + 基线 + 四态（MATCH-CONFLICT）
const m1 = call('ontology_match_increment', { path: 'dbscript/alter_dwd_tax_payment_v4.sql', physicalTable: 'dwd_tax_payment' })
check('matchIncrement implements 模型 M-1024', m1.ok === true && m1.implements.model === 'M-1024', m1.implements.modelName)
check('matchIncrement 基线 REL-0820(模型 v3)', m1.releaseBaseline.release === 'REL-0820' && m1.releaseBaseline.modelVersion === 'v3')
check('matchIncrement 四态 MATCH-CONFLICT(tax_rate)', m1.status === 'MATCH-CONFLICT' && m1.conflicts.some((c) => c.field === 'tax_rate' && c.kind === 'MATCH-CONFLICT'), JSON.stringify(m1.conflicts.map((c) => c.field + ':' + c.kind)))
check('matchIncrement BEHIND(pay_fee 未实现不阻断)', m1.conflicts.some((c) => c.field === 'pay_fee' && c.kind === 'BEHIND'))
// implements 无解 → fail-closed
const m2 = call('ontology_match_increment', { path: 'dbscript/foo.sql', physicalTable: 'no_such_table' })
check('matchIncrement 无解 fail-closed 转人工', m2.ok === false && m2.needsHuman === true, m2.note)

// 6. explain：归因链
const e1 = call('ontology_explain', { finding: 'F-101' })
check('explain F-101 归因链', e1.chain.includes('R-102') && e1.chain.includes('设计开发一致性策略') && e1.chain.includes('数据库脚本 · 表结构变更'), e1.chain.slice(0, 30) + '…')

// 7. propose：gated 提案
const pr = call('ontology_propose', { kind: 'assertion', payload: { instanceOf: 'schema-change' }, approvalNote: '确认该作业归类为表结构变更' })
check('propose 返回提案号与治理状态', pr.proposalId && pr.status === 'pending-governance')

// 8. P4：scanScriptJob 本体驱动扫描（.sql 纳入 CICD 扫描 + 一致性消费匹配事实）
const ss = scanScriptJob(repo, null, provider, 'dbscript/alter_dwd_tax_payment_v4.sql')
check('P4 scanScriptJob 本体分类+规则18', ss.ontology && ss.ontology.jobType === '表结构变更' && ss.ontology.ruleCount === 18, JSON.stringify(ss.ontology))
check('P4 scanScriptJob 一致性消费匹配事实（类型冲突→diff）', ss.consistency.pass === false && ss.consistency.diffs.some((d) => d.field === 'tax_rate'), JSON.stringify(ss.consistency.diffs))
check('P4 scanVerdict 判 script 结论为 diff', (await import('../../packages/domain-tools-dev/provider-cicd.js')).scanVerdict(ss) === 'diff', '(scanVerdict)')

const pass = checks.filter(Boolean).length
console.log('\n== ontology: ' + pass + '/' + checks.length + ' 通过 ==')
process.exit(pass === checks.length ? 0 : 1)
