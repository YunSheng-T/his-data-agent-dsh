// P3 平台化断言（V10/V11/V12 基建）：租户层 + 分包归属 + 守卫 + repo.commit → CICD 链路
// 无模型语义验证（Provider/工具层直调）。用法：node tests/regression/assert-platform.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TenantRepoProvider, packageOf, TENANTS } from '../../packages/workspace-repo/provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from '../../packages/workspace-repo/seed-repo.js'
import { provider as modeling } from '../../packages/domain-tools-modeling/provider-mock.js'
import { LocalSimDryrunProvider } from '../../packages/domain-tools-dev/provider-dryrun.js'
import { LocalSchedProvider } from '../../packages/domain-tools-dev/provider-sched.js'
import { LocalCicdProvider, scanVerdict } from '../../packages/domain-tools-dev/provider-cicd.js'
import { buildDevTools } from '../../packages/domain-tools-dev/definitions.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

// ---------- 租户层 ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'his-platform-'))
const repo = new TenantRepoProvider(root)
repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
repo.mount('risk', {})

check('租户清单：finance/risk 且 finance 为数据租户', repo.tenants().length === 2 && TENANTS.finance.dataTenant === true && TENANTS.risk.dataTenant === false)
check('默认租户 finance · 仓 finance-dw', repo.currentTenant().repo === 'finance-dw')
check('四级地址 scheme', repo.address('etl/dwd/dwd_tax_declaration.etl') === `tenant://finance/finance-dw@${repo.currentBranch()}/etl/dwd/dwd_tax_declaration.etl`, repo.address())
check('finance 仓含 etl_legacy 只读演示分包', repo.readCommitted(repo.currentBranch(), 'etl_legacy/ods/legacy_tax_sync.etl') !== null)

// 分包归属（Registry 投影）
check('分包归属：etl→主力 ETL 平台', packageOf('etl/dwd/x.etl')?.platform === '主力 ETL 平台' && packageOf('etl/dwd/x.etl').connected)
check('分包归属：dag→调度平台', packageOf('dag/x.dag')?.platform === '调度平台')
check('分包归属：ops→制品包通道（V13）', packageOf('ops/x.ops')?.platform === '制品包通道' && packageOf('ops/x.ops').connected)
check('分包归属：etl_legacy→未接入只读', packageOf('etl_legacy/ods/x.etl')?.connected === false)

// 文件类型契约：.ops 可写且只能写在 ops/ 下
{
  const w = repo.writeWorking('ops/contract_probe.ops', '-- probe\nPAUSE ETL JOB IF EXISTS etl/dwd/x.etl\n')
  check('.ops 写入 ops/ 放行（kind=ops）', w.kind === 'ops')
  let m = ''
  try { repo.writeWorking('etl/dwd/bad.ops', '-- x') } catch (e) { m = e.message }
  check('.ops 写在 ops/ 之外被拒', m.includes('必须放在 ops/'), m)
  fs.rmSync(path.join(root, 'finance-dw', 'ops'), { recursive: true, force: true }) // 探针不进后续流程
}

// 守卫（Provider 层硬执行）
let guardMsg = ''
try { repo.writeWorking('etl_legacy/ods/x.etl', '-- x') } catch (e) { guardMsg = e.message }
check('未接入分包写入被守卫拦截', guardMsg.includes('未接入'), guardMsg)
repo.switchTenant('risk')
check('切到 risk：空仓（暂无作业）', repo.treeWithState(repo.currentBranch()).length === 0)
guardMsg = ''
try { repo.writeWorking('etl/dwd/x.etl', '-- x') } catch (e) { guardMsg = e.message }
check('非数据租户新建作业被守卫拦截', guardMsg.includes('新建作业守卫'), guardMsg)
let badTenant = ''
try { repo.switchTenant('ghost') } catch (e) { badTenant = e.message }
check('未知租户拒绝切换', badTenant.includes('未知租户'))
repo.switchTenant('finance')

// ---------- repo.commit → CICD 链路 ----------
const cicd = new LocalCicdProvider()
const tools = new Map(buildDevTools({ repo, modeling, dryrun: new LocalSimDryrunProvider(), sched: new LocalSchedProvider(), cicd }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

check('工具清单无 git.* 残留', ![...tools.keys()].some((n) => n.startsWith('git_')), [...tools.keys()].join(','))
check('cicd_scan_report 已注册且 read 级', tools.get('cicd_scan_report')?.risk === 'read')
check('repo_commit 为 commit 级闸门', tools.get('repo_commit')?.risk === 'commit')

// 首条流水线（模拟启动补登）：为 HEAD 的 .etl 生成报告
{
  const branch = repo.currentBranch()
  const commitId = repo.git('rev-parse', '--short', 'HEAD')
  const scans = {}
  for (const e of repo.tree(branch)) {
    if (e.kind !== 'etl' || e.path.startsWith('etl_legacy/')) continue
    const { scanEtlJob } = await import('../../packages/domain-tools-dev/definitions.js')
    scans[e.path] = scanEtlJob(repo, modeling, e.path)
  }
  cicd.trigger({ commitId, branch, scans })
}
const seedHit = cicd.latestFor('etl/dwd/dwd_tax_declaration.etl', 'main')
check('补登流水线覆盖种子作业（etl_legacy 除外）', !!seedHit && !cicd.latestFor('etl_legacy/ods/legacy_tax_sync.etl', 'main'))
check('种子作业初始一致性干净（绑定与代码引用同步）', seedHit?.scan.consistency.pass === true, JSON.stringify(seedHit?.scan.consistency))

// 扫描场景核心：模型侧新绑标准（代码未引用）→ 复检出差异 → etl_patch 修复 → 提交复扫清零
modeling.bindStd({ model: 'dwd_tax_declaration.model', field: 'overdue_flag', std: 'std/FLAG_YN v9' }) // v9 为代码未引用的新版本
{
  const branch = repo.currentBranch()
  const scans = { 'etl/dwd/dwd_tax_declaration.etl': (await import('../../packages/domain-tools-dev/definitions.js')).scanEtlJob(repo, modeling, 'etl/dwd/dwd_tax_declaration.etl') }
  cicd.trigger({ commitId: repo.git('rev-parse', '--short', 'HEAD'), branch, scans })
}
const diffHit = cicd.latestFor('etl/dwd/dwd_tax_declaration.etl', 'main')
check('模型新绑标准后复检出一致性差异', diffHit?.scan.consistency.pass === false && diffHit.scan.consistency.diffs.some((d) => d.field === 'overdue_flag'), JSON.stringify(diffHit?.scan.consistency.diffs))

// 提交 → 自动触发流水线
repo.checkout('feature/scan-demo', { create: true })
await call('etl_codegen', { model: 'dwd_tax_declaration.model', jobPath: 'etl/dwd/scan_demo.etl', source: 'ods.ods_tax_declare_di' })
const rc = await call('repo_commit', { message: 'test: scan demo' })
check('repo_commit 提交成功且自动触发流水线', rc.committed === true && rc.pipeline?.id > 4820, `pipeline #${rc.pipeline?.id}`)
check('流水线报告含三类扫描', rc.pipeline.scanned.includes('etl/dwd/scan_demo.etl'))

// 权威报告查询
const rep = await call('cicd_scan_report', { path: 'etl/dwd/scan_demo.etl' })
check('cicd_scan_report 返回权威报告（流水线号+规则集）', rep.pipeline?.id === rc.pipeline.id && rep.pipeline?.ruleset === 'v1.2')
check('codegen 产物一致性清零（标准引用同步）', rep.verdict === 'pass', rep.note)

// 未提交文件无报告
repo.writeWorking('etl/dwd/uncommitted.etl', '-- @job: uncommitted\n-- @engine: hive-sql\nINSERT OVERWRITE TABLE dwd.x PARTITION(dt=\'1\')\nSELECT a FROM ods.y WHERE dt=\'1\';\n')
let noReport = ''
try { await call('cicd_scan_report', { path: 'etl/dwd/uncommitted.etl' }) } catch (e) { noReport = e.message }
check('未提交文件查询报告被拒', noReport.includes('没有流水线报告') || noReport.includes('不存在'), noReport)

// ---------- ops 制品 CICD 扫描（V13） ----------
repo.writeWorking('ops/big_sale_pause.ops', '-- 大促暂停制品（演示）\n-- 排序：拓扑逆序（先下游）· fail-fast\n-- ── Layer 1 · 下游（1 个 · 可并行）\nPAUSE ETL JOB IF EXISTS etl/dwd/scan_demo.etl\nWITH OPTIONS( checkpoint = TRUE )\n')
repo.writeWorking('ops/bad_drop.ops', 'DROP TABLE dwd.x;\n')
const rc2 = await call('repo_commit', { message: 'test: ops scan' })
check('ops 制品提交触发流水线且两文件被扫描', rc2.pipeline?.scanned?.includes('ops/big_sale_pause.ops') && rc2.pipeline?.scanned?.includes('ops/bad_drop.ops'), JSON.stringify(rc2.pipeline?.scanned))
const goodRep = await call('cicd_scan_report', { path: 'ops/big_sale_pause.ops' })
check('合规 ops 扫描 pass（WITH OPTIONS 续行不误判）', goodRep.verdict === 'pass', JSON.stringify(goodRep.scans))
check('单动作制品一致性槽位未知(null) 不误报', goodRep.scans?.consistency?.pass === null)
const badRep = await call('cicd_scan_report', { path: 'ops/bad_drop.ops' })
check('含 DROP 的 ops 被 fail-closed 判 diff', badRep.verdict === 'diff' && badRep.scans?.sql?.dangers?.includes('DROP'), JSON.stringify(badRep.scans?.sql))

// 锚定守卫静态断言：dir 白名单含 ops（V13 分包即路由）
{
  const src = fs.readFileSync(new URL('../../packages/workspace-anchor/index.js', import.meta.url), 'utf8')
  check('锚定 dir 守卫放行 ops 目录', /\^\(etl\|dag\|ops\)/.test(src))
}

const pass = checks.filter(Boolean).length
console.log(`\n${pass}/${checks.length} 通过`)
process.exit(pass === checks.length ? 0 : 1)
