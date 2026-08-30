// dev 只读工具断言（P1-2）：不依赖 dsh/模型，直接驱动纯执行器
// 用法：node tests/regression/assert-dev-tools.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GitRepoProvider } from '../../packages/workspace-repo/provider-git.js'
import { SEED_FILES } from '../../packages/workspace-repo/seed-repo.js'
import { LocalSimDryrunProvider } from '../../packages/domain-tools-dev/provider-dryrun.js'
import { buildDevTools } from '../../packages/domain-tools-dev/definitions.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'his-dev-'))
const repo = new GitRepoProvider(dir).init(SEED_FILES)
const tools = new Map(buildDevTools({ repo, dryrun: new LocalSimDryrunProvider() }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

// repo_checkout
const co = await call('repo_checkout', { branch: 'main' })
check('repo_checkout 返回目录树', co.branch === 'main' && co.tree.length === 6)
let threw = false
try { await call('repo_checkout', { branch: 'feature/nope' }) } catch { threw = true }
check('不存在分支未显式 create 时拒绝', threw)

// job_read：已提交视图解析
const jr = await call('job_read', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('job_read 解析注解头', jr.parsed.job === 'dwd_tax_declaration' && jr.parsed.engine === 'hive-sql')
check('job_read 解析目标表与分区', jr.parsed.targetTable === 'dwd.dwd_tax_declaration' && !!jr.parsed.partition)
check('job_read 列映射含标准引用', jr.parsed.columns.some((c) => c.stdRef === '@std/TAXPAYER_ID v2'), jr.parsed.columns.filter((c) => c.stdRef).length + ' 列带引用')
check('job_read 转换函数识别', jr.parsed.columns.some((c) => c.funcs.includes('CAST')) && jr.parsed.columns.some((c) => c.funcs.includes('NVL')))
const jd = await call('job_read', { path: 'dag/dwd_tax_declaration.dag' })
check('job_read .dag 解析 ref/cron/depends', jd.parsed.ref === 'etl/dwd/dwd_tax_declaration.etl' && jd.parsed.depends.length === 1)

// ast_locate
const al = await call('ast_locate', { path: 'etl/dwd/dwd_tax_declaration.etl', column: 'decl_amt' })
check('ast_locate 定位列（含 CAST 与标准引用）', al.funcs.includes('CAST') && al.stdRef === '@std/AMOUNT v1')
threw = false
try { await call('ast_locate', { path: 'etl/dwd/dwd_tax_declaration.etl', column: 'ghost' }) } catch (e) { threw = /列不存在/.test(e.message) }
check('ast_locate 列不存在时报现有列清单', threw)

// lineage
const up = await call('lineage_upstream', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('lineage_upstream 找到 ODS 生产者和调度依赖', up.sources.some((s) => s.producedBy.includes('etl/ods/ods_tax_declare_load.etl')) && up.scheduleDepends.includes('dag/ods_tax_declare_load.dag'))
const down = await call('lineage_downstream', { path: 'etl/ods/ods_tax_declare_load.etl' })
check('lineage_downstream 找到 dwd 读者与 dag 依赖方', down.readers.includes('etl/dwd/dwd_tax_declaration.etl') && down.dagDependents.includes('dag/dwd_tax_declaration.dag'))

// lint：种子 .etl 应过（允许 warn，不许 error）；故意坏代码应不过
const l1 = await call('code_lint', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('种子 ETL lint 通过（无 error）', l1.pass === true, l1.issues.filter((i) => i.level === 'error').map((i) => i.rule).join(',') || 'no-error')
repo.writeWorking('etl/dwd/bad.etl', 'SELECT * FROM ods.x;\n')
const l2 = await call('code_lint', { path: 'etl/dwd/bad.etl', view: 'working' })
check('坏代码 lint 拦截（SELECT * + 无 INSERT）', l2.pass === false && l2.issues.some((i) => i.rule === 'sql.select-star'))

// partition_check
const pc = await call('partition_check', { path: 'etl/dwd/dwd_tax_declaration.etl' })
check('partition_check 种子作业通过', pc.ok === true)

// danger_scan：命中 DROP 与无分区覆盖
repo.writeWorking('etl/dwd/evil.etl', '-- @job: evil\n-- @engine: hive-sql\nINSERT OVERWRITE TABLE dwd.x\nSELECT a FROM ods.y WHERE dt=\'202608\';\nDROP TABLE dwd.old;\n')
const ds = await call('danger_scan', { path: 'etl/dwd/evil.etl', view: 'working' })
check('danger_scan 命中 DROP + 无分区覆盖', ds.safe === false && ds.hits.length === 2, ds.hits.join(' | '))

// test_dryrun：约束固化
const dr = await call('test_dryrun', { path: 'etl/dwd/dwd_tax_declaration.etl', sampleRows: 99999 })
check('dry-run 行数被 Provider 上限截断', dr.ok === true && dr.sampledRows === 1000)
check('dry-run 诚实标注 simulated', dr.simulated === true)
const drb = await call('test_dryrun', { path: 'etl/dwd/evil.etl', view: 'working' })
check('dry-run 只读账号拒绝危险语句', drb.blocked === true)

const pass = checks.filter(Boolean).length
console.log(`\n== dev-tools: ${pass}/${checks.length} 通过 ==`)
fs.rmSync(dir, { recursive: true, force: true })
process.exit(pass === checks.length ? 0 : 1)
