// gated 闸门断言（P1-4）：git_add/git_commit/sched_publish/asset_sync 的无模型语义验证
// 用法：node tests/regression/assert-gates.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GitRepoProvider } from '../../packages/workspace-repo/provider-git.js'
import { SEED_FILES } from '../../packages/workspace-repo/seed-repo.js'
import { provider as modeling } from '../../packages/domain-tools-modeling/provider-mock.js'
import { LocalSimDryrunProvider } from '../../packages/domain-tools-dev/provider-dryrun.js'
import { LocalSchedProvider } from '../../packages/domain-tools-dev/provider-sched.js'
import { buildDevTools } from '../../packages/domain-tools-dev/definitions.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'his-gates-'))
const repo = new GitRepoProvider(dir).init(SEED_FILES)
const sched = new LocalSchedProvider()
const tools = new Map(buildDevTools({ repo, modeling, dryrun: new LocalSimDryrunProvider(), sched }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }
const JOB = 'etl/dwd/dwd_tax_declaration_v2.etl'
const DAG = 'dag/dwd_tax_declaration_v2.dag'

// 1. 全链路：codegen → dag_gen → commit → publish → asset_sync
repo.checkout('feature/dwd-v2', { create: true })
await call('etl_codegen', { model: 'dwd_tax_declaration.model', jobPath: JOB, source: 'ods.ods_tax_declare_di' })
await call('dag_gen', { ref: JOB, cron: '23 2 * * *', depends: ['dag/ods_tax_declare_load.dag'] })

// 2. 未提交时上线被拒（双保险）
const pubEarly = await call('sched_publish', { dagPath: DAG })
check('未提交态上线被拒（无副作用）', pubEarly.published === false && pubEarly.blocked === true, pubEarly.reason)
check('调度注册表仍为空', sched.list().length === 0)

// 3. git_add（workspace-write，可反复）
const ga = await call('git_add', { paths: [JOB, DAG] })
check('git_add 暂存两文件', ga.staged.length === 2)

// 4. git_commit（gated 工具的本体语义）
const gc = await call('git_commit', { message: 'feat(FIN-3302): dwd_tax_declaration v2 作业 + 调度' })
check('git_commit 提交成功', gc.committed === true && gc.files.length === 2, gc.commitId)
check('提交后已提交视图可见', repo.readCommitted('feature/dwd-v2', JOB) !== null)
check('main 仍不可见（未合并）', repo.readCommitted('main', JOB) === null)

// 5. publish 成功路径
const pub = await call('sched_publish', { dagPath: DAG })
check('sched_publish 上线成功', pub.published === true && pub.entry.status === 'online', `v${pub.entry?.version} cron=${pub.entry?.cron}`)
check('调度注册表含作业与依赖', sched.list()[0]?.depends?.includes('dag/ods_tax_declare_load.dag'))

// 6. asset_sync 血缘回写
const as = await call('asset_sync', { model: 'dwd_tax_declaration.model', job: JOB, dag: DAG, commitId: pub.commitId })
check('asset_sync 回写成功', as.jobRefsOnModel === 1)
const m = modeling.readFields('dwd_tax_declaration.model')
check('模型携带作业引用（建模空间可见）', modeling._state.models['dwd_tax_declaration.model'].jobRefs?.[0]?.job === JOB)
check('血缘边落 catalog（etl-produce）', modeling._state.catalog.lineage.some((e) => e.from === JOB && e.to === 'dwd_tax_declaration' && e.type === 'etl-produce'))
void m

// 7. 危险代码上线被拒
repo.writeWorking('etl/dwd/evil2.etl', '-- @job: evil2\n-- @engine: hive-sql\nINSERT OVERWRITE TABLE dwd.x\nSELECT a FROM ods.y WHERE dt=\'1\';\nDROP TABLE dwd.old;\n')
repo.writeWorking('dag/evil2.dag', 'ref: etl/dwd/evil2.etl\ncron: "1 1 * * *"\ntimeout: 60\n')
await call('git_commit', { message: 'bad' })
const pubEvil = await call('sched_publish', { dagPath: 'dag/evil2.dag' })
check('危险作业上线被拒（lint error + DROP）', pubEvil.published === false && pubEvil.blocked === true)

const pass = checks.filter(Boolean).length
console.log(`\n== gates: ${pass}/${checks.length} 通过 ==`)
fs.rmSync(dir, { recursive: true, force: true })
process.exit(pass === checks.length ? 0 : 1)
