// codegen 链路断言（P1-3）：建模产出 → ETL 代码的标准引用一致性
// 对应 P1 验收条款 2（未提交态）、3（标准引用随模型绑定变化）
// 用法：node tests/regression/assert-codegen.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GitRepoProvider } from '../../packages/workspace-repo/provider-git.js'
import { SEED_FILES } from '../../packages/workspace-repo/seed-repo.js'
import { provider as modeling } from '../../packages/domain-tools-modeling/provider-mock.js'
import { LocalSimDryrunProvider } from '../../packages/domain-tools-dev/provider-dryrun.js'
import { buildDevTools } from '../../packages/domain-tools-dev/definitions.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'his-codegen-'))
const repo = new GitRepoProvider(dir).init(SEED_FILES)
const tools = new Map(buildDevTools({ repo, modeling, dryrun: new LocalSimDryrunProvider() }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }
const MODEL = 'dwd_tax_declaration.model'
const JOB = 'etl/dwd/dwd_tax_declaration_gen.etl'

// 1. codegen 从模型版本生成
const g1 = await call('etl_codegen', { model: MODEL, jobPath: JOB, source: 'ods.ods_tax_declare_di' })
check('codegen 成功并标注来源模型版本', g1.fromModel.version === 'v1.0' && g1.kind === 'etl')
check('未发布模型带警告', !!g1.warn)
check('逐列标准引用携带（种子绑定 2 个）', g1.stdRefs.length === 2, g1.stdRefs.join(' | '))
check('生成物 lint 自检通过', g1.lint.pass === true, g1.lint.issues.filter((i) => i.level === 'error').map((i) => i.rule).join(',') || 'no-error')

// 2. 未提交态语义（验收条款 2）
check('生成物在工作区可见', repo.readWorking(JOB) !== null)
check('已提交视图不可见（commit 前目录树不可见）', repo.readCommitted('main', JOB) === null)
check('合并视图标出未提交条目', repo.treeWithState('main').find((e) => e.path === JOB)?.uncommitted === true)

// 3. 表达式生成规则
const text1 = repo.readWorking(JOB)
check('免绑字段直引且注明理由', /-- 申报ID · 业务主键 · 免绑/.test(text1))
check('未绑定字段直引并标注', /-- 申报状态 · 未绑定标准/.test(text1))

// 4. 条款 3 核心：建模改了 → 重新生成就变
modeling.bindStd({ model: MODEL, field: 'decl_status_cd', std: 'std/DECL_STATUS v1' })
const g2 = await call('etl_codegen', { model: MODEL, jobPath: JOB, source: 'ods.ods_tax_declare_di' })
check('建模绑定变更后引用数 2→3', g2.stdRefs.length === 3)
check('重新生成后注释携带新标准引用', repo.readWorking(JOB).includes('申报状态 · @std/DECL_STATUS v1'))

// 5. dag_gen + 双保险
const dg = await call('dag_gen', { ref: JOB, cron: '17 2 * * *', depends: ['dag/ods_tax_declare_load.dag'] })
check('dag_gen 生成独立 .dag', dg.generated === true && dg.path === 'dag/dwd_tax_declaration_gen.dag')
check('.dag ref 指向 .etl', repo.readWorking('dag/dwd_tax_declaration_gen.dag').includes(`ref: ${JOB}`))
repo.writeWorking('etl/dwd/broken.etl', 'SELECT * FROM ods.x;\n')
const dgb = await call('dag_gen', { ref: 'etl/dwd/broken.etl', cron: '17 2 * * *' })
check('lint 不过 → 拒绝生成 dag（不变量固化在工具层）', dgb.generated === false && dgb.blocked === true)

// 6. etl_patch（修改链路）：只动 .etl 不动 .dag
const before = repo.status().map((s) => s.path).sort()
const pt = await call('etl_patch', { path: JOB, column: 'decl_amt', expr: `CAST(decl_amt AS DECIMAL(18,2))`, comment: '申报金额 @std/AMOUNT v2 · 精度升级' })
check('etl_patch 返回 before/after diff', pt.before.includes('decl_amt') && pt.after.includes('DECIMAL(18,2)'))
const after = repo.status().map((s) => s.path).sort()
check('patch 后变更集不含 .dag（只动 .etl）', JSON.stringify(before) === JSON.stringify(after))
check('patch 后 lint 仍通过', pt.lint.pass === true)

const pass = checks.filter(Boolean).length
console.log(`\n== codegen: ${pass}/${checks.length} 通过 ==`)
fs.rmSync(dir, { recursive: true, force: true })
process.exit(pass === checks.length ? 0 : 1)
