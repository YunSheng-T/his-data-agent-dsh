// P4-2 运维编排域断言（V13）：六工具语义直调（无模型）
// 覆盖：筛选排除 / 拓扑正逆序 / 成对生成镜像+配对 / 三件套自检 / 部署重门语义 / 回调 / DROP fail-closed / 环检测
// 用法：node tests/regression/assert-ops.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TenantRepoProvider } from '../../packages/workspace-repo/provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from '../../packages/workspace-repo/seed-repo.js'
import { LocalOpsProvider, parseOps } from '../../packages/domain-tools-ops/provider-mock.js'
import { buildOpsTools } from '../../packages/domain-tools-ops/definitions.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'his-ops-'))
const repo = new TenantRepoProvider(root)
repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
const ops = new LocalOpsProvider()
const tools = new Map(buildOpsTools({ repo, ops }).map((t) => [t.name, t]))
const call = (name, args) => tools.get(name).execute(args)

// ---------- 风险级与注册 ----------
check('六工具注册齐全', ['ops_screen', 'ops_topo', 'ops_gen', 'ops_check', 'ops_deploy', 'ops_callback'].every((n) => tools.has(n)), [...tools.keys()].join(','))
check('风险级：screen/topo/check/callback=read · gen=commit · deploy=publish',
  tools.get('ops_screen').risk === 'read' && tools.get('ops_topo').risk === 'read' && tools.get('ops_check').risk === 'read' && tools.get('ops_callback').risk === 'read' && tools.get('ops_gen').risk === 'commit' && tools.get('ops_deploy').risk === 'publish')

// ---------- ops_screen：筛选 + 自动排除 ----------
const scr = await call('ops_screen', { domain: '财税' })
check('筛选命中 6 个非核心离线作业', scr.targets.length === 6, scr.targets.map((t) => t.name).join(','))
check('自动排除 2 个（核心报表 + 实时同步）', scr.excluded.length === 2 && scr.excluded.some((e) => e.name === 'ads_tax_core_report') && scr.excluded.some((e) => e.name === 'rt_tax_sync'))
check('目标含 ETL×4 + FLASHSYNC×1 + LTS-TASK×1',
  scr.targets.filter((t) => t.type === 'ETL').length === 4 && scr.targets.some((t) => t.type === 'FLASHSYNC') && scr.targets.some((t) => t.type === 'LTS-TASK'))
const names = scr.targets.map((t) => t.name)

// ---------- ops_topo：方向正确性 ----------
const topo = await call('ops_topo', { jobs: names })
check('三层拓扑', /Layer 1/.test(topo.pauseOrder[0]) && topo.pauseOrder.length === 3, topo.pauseOrder.join(' | '))
check('暂停=逆序：Layer 1 是下游 dws 层', topo.pauseOrder[0].includes('dws_tax_daily') && topo.pauseOrder[0].includes('dws_tax_stat_t'))
check('恢复=正序：Layer 1 是上游接入层（镜像反转）', topo.resumeOrder[0].includes('ods_tax_return') && topo.resumeOrder[0].includes('gtax_sync_001'))
let unknownMsg = ''
try { await call('ops_topo', { jobs: ['ghost_job'] }) } catch (e) { unknownMsg = e.message }
check('未知作业拒绝排序', unknownMsg.includes('不存在'), unknownMsg)

// 环检测（自定义环状目录）
{
  const cyclic = new LocalOpsProvider([
    { name: 'a', cn: 'A', type: 'ETL', path: '/x/a', domain: '财税', priority: 'normal', realtime: false, schedule: 'daily', dependsOn: ['b'] },
    { name: 'b', cn: 'B', type: 'ETL', path: '/x/b', domain: '财税', priority: 'normal', realtime: false, schedule: 'daily', dependsOn: ['a'] },
  ])
  const t = cyclic.topo(['a', 'b'])
  check('环检测：有环拒绝排序转人工', t.cycle === true && /环/.test(t.note))
}

// ---------- ops_gen：成对生成 + 自动自检 ----------
const gen = await call('ops_gen', { jobs: names })
check('生成镜像对到工作区（ops/ 分包）', gen.files.length === 2 && gen.files.every((f) => f.kind === 'ops' && f.path.startsWith('ops/')), gen.files.map((f) => f.path).join(','))
const pauseText = repo.readWorking('ops/pause_before_promotion.ops')
const resumeText = repo.readWorking('ops/resume_after_promotion.ops')
check('暂停文件 6 条 PAUSE · 全 IF EXISTS · checkpoint=TRUE', (pauseText.match(/^PAUSE /gm) ?? []).length === 6 && !pauseText.includes('JOB /') && pauseText.includes('checkpoint = TRUE'))
check('恢复文件 6 条 RESUME · fromCheckpoint=TRUE（镜像）', (resumeText.match(/^RESUME /gm) ?? []).length === 6 && resumeText.includes('fromCheckpoint = TRUE'))
check('FAIL-CLOSED：生成物结构上无 DROP/STOP', !/\b(DROP|STOP|KILL|DELETE)\b/.test(pauseText + resumeText))
check('暂停文件先下游（首层 dws）· 恢复文件先上游（首层 ods/lts）',
  /Layer 1[\s\S]*?dws_tax_daily/.test(pauseText) && /Layer 1[\s\S]*?ods_tax_return/.test(resumeText))
check('自动自检：配对 6/6 · 环无 · 高危无', gen.check.pairing.pass === true && gen.check.cycle.pass === true && gen.check.danger.pass === true, gen.check.pairing.note)
check('依赖完整性告警点名核心报表（豁免知情确认）', gen.check.completeness.warnings.some((w) => w.name === 'ads_tax_core_report'), JSON.stringify(gen.check.completeness.warnings.map((w) => w.name)))

// ---------- ops_check：独立复核 ----------
const chk = await call('ops_check', { pausePath: 'ops/pause_before_promotion.ops', resumePath: 'ops/resume_after_promotion.ops' })
check('ops_check 独立复核结论一致', chk.pairing.pass === true && chk.ifExists.pass === true && chk.completeness.warnings.length === 1)

// ---------- parseOps：studio 三页签的解析源 ----------
const parsed = parseOps(pauseText)
check('parseOps：action/layers/count 结构正确', parsed.action === 'PAUSE' && parsed.layers.length === 3 && parsed.count === 6)
check('parseOps：节点带类型/路径/OPTIONS', parsed.layers[0].jobs[0].type === 'ETL' && parsed.layers[0].jobs[0].options.checkpoint === 'TRUE')

// ---------- ops_deploy：重门语义 ----------
const blocked = await call('ops_deploy', { changeNumber: 'CHG-TEST-1' })
check('未提交时部署被拒（必须先过 repo_commit 第二道门）', blocked.blocked === true && /未提交/.test(blocked.reason), blocked.reason)
repo.commitAll('test: ops pair')
const dep = await call('ops_deploy', { changeNumber: 'CHG-20260824' })
check('部署产出环境无关制品包（ops_change_pack_<commit>.zip）', /^ops_change_pack_[0-9a-f]+\.zip$/.test(dep.pack?.id) && dep.pack.envNeutral === true, dep.pack?.id)
check('部署注入变更号 + 默认 MANUAL', dep.changeNumber === 'CHG-20260824' && dep.executeMode === 'MANUAL')
check('两文件 12 条命令全部下发', dep.dispatched === 12)

// ---------- ops_callback ----------
const none = await call('ops_callback', { packId: 'ops_change_pack_ghost.zip' })
check('无部署时回调为空（提示先走第三道门）', none.callback === null)
const cb = await call('ops_callback', {})
check('回调 12/12 Success · 暂停命令检查点已存', cb.summary.success === 12 && cb.results.filter((r) => r.action === 'PAUSE').every((r) => r.checkpointSaved))

const pass = checks.filter(Boolean).length
console.log(`\n== ops: ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)
