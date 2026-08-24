// P4-4 编排旅程断言（V13）：真实模型三道门 + 链路完整性 + 镜像/回调语义
// 数据源：最近一次「真实调过 ops_gen 且走完 ops_callback」的会话日志（e2e-ops.mjs 驱动产生）
// 用法：node tests/regression/assert-ops-journey.mjs（DSH_HOME 缺省指仓库 dsh-home）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const home = process.env.DSH_HOME || path.join(process.cwd(), 'dsh-home')

const candidates = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name === 'session.jsonl.zstd') candidates.push({ f: p, mtime: fs.statSync(p).mtimeMs })
  }
}
walk(path.join(home, 'sessions'))
const load = (f) => execFileSync('zstd', ['-d', '-c', f], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
const hasCall = (events, name) => events.some((e) => e.type === 'tool/call' && e.data?.name === name)
const found = candidates.sort((a, b) => b.mtime - a.mtime)
  .map((c) => ({ ...c, events: load(c.f).trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) }))
  .find((c) => hasCall(c.events, 'ops_gen') && hasCall(c.events, 'ops_callback'))
if (!found) { console.error('FAIL: 找不到含编排旅程的会话日志（先跑 e2e-ops.mjs 驱动）'); process.exit(1) }

const events = found.events
const calls = events.filter((e) => e.type === 'tool/call')
const callNames = calls.map((e) => e.data.name)
const asked = events.filter((e) => e.type === 'approval/asked')
const askedNames = asked.map((e) => e.data.toolName)
const decided = events.filter((e) => e.type === 'approval/decided')

// tool/call.callId ↔ tool/result message.content[].toolCallId
function resultOf(name) {
  const call = calls.find((e) => e.data.name === name)
  if (!call) return null
  const res = events.find((e) => e.type === 'tool/result'
    && (e.data?.message?.content ?? []).some((b) => b.toolCallId === call.data.callId))
  const text = (res?.data?.message?.content ?? []).flatMap((b) => b.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('')
  try { return JSON.parse(text) } catch { return { _raw: text } }
}

const checks = []
const check = (label, ok, extra = '') => { checks.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

console.log(`日志: ${path.basename(path.dirname(found.f))} · 调用: ${callNames.join(',')}`)

// ---------- 三道门 ----------
check('工具审批恰好 3 次且顺序为 ops_gen → repo_commit → ops_deploy',
  JSON.stringify(askedNames) === JSON.stringify(['ops_gen', 'repo_commit', 'ops_deploy']), askedNames.join(','))
check('三次审批均 allowed-once 落日志', decided.filter((e) => e.data.outcome === 'allowed-once').length === 3)

// 审批卡质量（企业定制口径）：approvalNote 优先生效，卡片上是人话不是参数截断
const genAsk = asked.find((e) => e.data.toolName === 'ops_gen')
check('第一道门审批卡携带业务话术（approvalNote 生效，非参数截断）', !!genAsk?.data?.reason && !genAsk.data.reason.includes('jobs=['), (genAsk?.data?.reason ?? '').slice(0, 80))

// 无对话式闸门：ops_screen 之后、第一道审批卡之前不应有 turn 中断（模型直接调 gated 工具）
const seqOf = (pred) => events.find(pred)?.seq ?? -1
const screenSeq = seqOf((e) => e.type === 'tool/call' && e.data.name === 'ops_screen')
const turnEndBetween = events.some((e) => e.type === 'turn/end' && e.seq > screenSeq && e.seq < (genAsk?.seq ?? Infinity))
check('第一道门直达审批卡（无对话式确认中断）', screenSeq > 0 && !!genAsk && !turnEndBetween, `screen@${screenSeq} → ask@${genAsk?.seq}`)

// ---------- 链路完整性 ----------
check('编排链路工具齐全（screen/topo/gen/check/commit/deploy/callback）',
  ['ops_screen', 'ops_topo', 'ops_gen', 'ops_check', 'repo_commit', 'ops_deploy', 'ops_callback'].every((n) => callNames.includes(n)))

// ---------- 语义 ----------
const scr = resultOf('ops_screen')
check('筛选：6 目标 + 2 自动排除（核心/实时）', scr?.targets?.length === 6 && scr?.excluded?.length === 2)
const topo = resultOf('ops_topo')
check('排序：暂停逆序（首层 dws 下游）· 恢复正序（首层 ods/lts 上游）',
  topo?.pauseOrder?.[0]?.includes('dws_') && topo?.resumeOrder?.[0]?.includes('ods_tax_return'), (topo?.pauseOrder ?? ['?'])[0])
const gen = resultOf('ops_gen')
check('生成：配对 6/6 · 环无 · 高危无', gen?.check?.pairing?.pass === true && gen?.check?.cycle?.pass === true && gen?.check?.danger?.pass === true, gen?.check?.pairing?.note)
check('豁免告警点名核心报表（依赖完整性）', (gen?.exemptions ?? gen?.check?.completeness?.warnings ?? []).some((w) => w.name === 'ads_tax_core_report'))
const commit = resultOf('repo_commit')
// 幂等重跑容忍：再生成内容与已提交一致时 git 无变更（无新流水线属正常）；有变更则 .ops 必须进扫描
check('提交触发 CICD 且 .ops 被扫描（或冪等无变更）',
  (commit?.pipeline?.scanned ?? []).some((f) => f.endsWith('.ops')) || commit?.committed === false,
  JSON.stringify(commit?.pipeline?.scanned ?? commit?.reason))
const dep = resultOf('ops_deploy')
check('部署：变更号 CHG 注入 · MANUAL · 环境无关制品包', /^CHG-/.test(dep?.changeNumber ?? '') && dep?.executeMode === 'MANUAL' && dep?.pack?.envNeutral === true, `${dep?.changeNumber} · ${dep?.pack?.id}`)
const cb = resultOf('ops_callback')
check('回调：12/12 Success（暂停+恢复两文件）· 0 Failure', cb?.summary?.success === 12 && cb?.summary?.failure === 0, JSON.stringify(cb?.summary))

const pass = checks.filter(Boolean).length
console.log(`\n== ops-journey(三道门): ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)
