// repo_commit 提交前预扫描（pre-hook）：未提交 .sql 有 diff -> 阻断提交；force=true 放行；干净 -> 正常提交
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TenantRepoProvider } from '../../packages/workspace-repo/provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from '../../packages/workspace-repo/seed-repo.js'
import { provider as modelingProvider } from '../../packages/domain-tools-modeling/provider-mock.js'
import { buildDevTools } from '../../packages/domain-tools-dev/definitions.js'
import { LocalCicdProvider } from '../../packages/domain-tools-dev/provider-cicd.js'
import { provider as ontoProvider } from '../../packages/domain-tools-ontology/provider-mock.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'his-prehook-'))
const repo = new TenantRepoProvider(root)
repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
const modeling = modelingProvider
const onto = ontoProvider
const cicd = new LocalCicdProvider()
const tools = new Map(buildDevTools({ repo, dryrun: {}, modeling, cicd, onto }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

// ① 未提交一个「干净」的 .etl（无 diff）-> 预扫描干净，正常提交
const cleanSql = '-- @job: dwd_tax_declaration\n' + '-- @target: dwd.dwd_tax_declaration\n' + "INSERT OVERWRITE TABLE dwd.dwd_tax_declaration PARTITION(dt='bizdt')\nSELECT decl_id FROM ods.ods_tax_declare_di WHERE dt = 'bizdt';\n"
repo.writeWorking('dbscript/alter_dwd_tax_payment_v4.sql', cleanSql)
const r1 = await call('repo_commit', { message: 'clean commit' })
check('干净未提交 .sql 预扫描通过，正常提交', r1.committed === true && r1.gate === 'commit' && !r1.blocked, JSON.stringify({ committed: r1.committed, blocked: r1.blocked }))

// ② 再写入一个「有冲突」的未提交 dbscript（tax_rate DOUBLE vs 设计 DECIMAL(10,4)）-> 预扫描应阻断
repo.writeWorking('dbscript/alter_dwd_tax_payment_v4.sql', '-- @job: alter_dwd_tax_payment\nALTER TABLE dwd_tax_payment ADD COLUMNS (\n  tax_rate DOUBLE COMMENT \'设计 v4 增量\'\n)\n')
const r2 = await call('repo_commit', { message: 'should be blocked' })
check('有 diff 的未提交 .sql 阻断提交（blocked=true，未 commitAll）', r2.blocked === true && r2.gate === 'commit' && Array.isArray(r2.preScan) && r2.preScan.length > 0 && r2.note.includes('阻断'), JSON.stringify({ blocked: r2.blocked, preScan: (r2.preScan || []).map((p) => p.path) }))
check('阻断返回扫描细节（含 tax_rate 一致性冲突）', (r2.preScan || []).some((p) => p.scan?.consistency?.diffs?.some((d) => d.field === 'tax_rate')), JSON.stringify((r2.preScan || []).map((p) => p.scan && p.scan.consistency)))

// ③ force=true 显式放行
const r3 = await call('repo_commit', { message: 'force commit', force: true })
check('force=true 显式放行提交（preScan 数组 + 提交成功）', r3.committed === true && Array.isArray(r3.preScan) && r3.preScan.length > 0, JSON.stringify({ committed: r3.committed, preScan: (r3.preScan || []).map((p) => p.path) }))
check('force 提交后文件进入已提交视图', repo.readCommitted(repo.currentBranch(), 'dbscript/alter_dwd_tax_payment_v4.sql') != null)

const pass = checks.filter(Boolean).length
console.log('\n== commit-prebranch: ' + pass + '/' + checks.length + ' 通过 ==')
process.exit(pass === checks.length ? 0 : 1)