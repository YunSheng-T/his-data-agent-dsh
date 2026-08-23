// 开发旅程断言（P1-4/P1-6 新建链路）：Code 模式 PTC 编排 + 双闸门
// 对应任务书回归集：产物两个文件、审批点恰好 2 次、dry-run 先于 commit 审批、血缘事件落日志
// 用法：DSH_HOME=../dsh-home node assert-dev-journey.mjs（分析最新会话日志）
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
// 取「最新且真实子调度过 repo_commit」的会话：日常工作室对话没有开发旅程，
// 且工具 schema 快照里也含工具名，必须解析事件结构判断（不能 raw 字符串匹配）
const load = (f) => execFileSync('zstd', ['-d', '-c', f], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
const hasCall = (raw, name) => raw.trim().split('\n').filter(Boolean).some((l) => {
  try { const e = JSON.parse(l); return (e.type === 'tool/call' || e.type === 'tool/code-dispatch') && e.data?.name === name } catch { return false }
})
const found = candidates.sort((a, b) => b.mtime - a.mtime).map((c) => ({ ...c, raw: load(c.f) }))
  .find((c) => hasCall(c.raw, 'repo_commit') && hasCall(c.raw, 'etl_codegen')) // patch 旅程也有 repo_commit，用 codegen 区分新建链路
if (!found) { console.error('FAIL: 找不到含开发旅程的会话日志'); process.exit(1) }

const raw = found.raw
const events = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

const topCalls = events.filter((e) => e.type === 'tool/call').map((e) => e.data.name)
const subs = events.filter((e) => e.type === 'tool/code-dispatch')
const subNames = subs.map((e) => e.data.name)
const asked = events.filter((e) => e.type === 'approval/asked')
const askedNames = asked.map((e) => e.data.toolName)
const seqOf = (pred) => events.find(pred)?.seq ?? -1

console.log(`日志: ${path.basename(path.dirname(found.f))} · 顶层调用: ${topCalls.join(',')} · 子调度: ${subNames.join(',')}`)

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

check('PTC 模式：顶层调用只有 run_code', topCalls.length > 0 && topCalls.every((n) => n === 'run_code'), topCalls.join(','))
check('子调度覆盖旅程全链', ['etl_codegen', 'code_lint', 'test_dryrun', 'dag_gen', 'repo_commit', 'sched_publish', 'asset_sync'].every((n) => subNames.includes(n)))

check('审批点恰好 2 次（commit + 上线）', JSON.stringify(askedNames) === JSON.stringify(['repo_commit', 'sched_publish']), askedNames.join(','))
const decided = events.filter((e) => e.type === 'approval/decided')
check('两次审批均 allowed-once 落日志', decided.filter((e) => e.data.outcome === 'allowed-once').length >= 2)

const drySeq = seqOf((e) => e.type === 'tool/code-dispatch' && e.data.name === 'test_dryrun')
const commitAskSeq = seqOf((e) => e.type === 'approval/asked' && e.data.toolName === 'repo_commit')
check('dry-run 先于 commit 审批（编排不变量）', drySeq > 0 && commitAskSeq > 0 && drySeq < commitAskSeq, `dry=${drySeq} < commitAsk=${commitAskSeq}`)

const etlSub = subs.find((e) => e.data.name === 'etl_codegen')
const dagSub = subs.find((e) => e.data.name === 'dag_gen')
check('产物为两个独立文件（.etl + .dag）', !!etlSub && !!dagSub && etlSub.data.arguments.jobPath?.endsWith('.etl') && dagSub.data.result !== null)

const pubSub = subs.find((e) => e.data.name === 'sched_publish')
const pubText = (pubSub?.data.content ?? []).map((c) => c.text ?? '').join('')
check('上线成功（status online）', pubText.includes('"online"'))

const asSub = subs.find((e) => e.data.name === 'asset_sync')
const asText = (asSub?.data.content ?? []).map((c) => c.text ?? '').join('')
check('血缘回写落日志（jobRefsOnModel）', asText.includes('jobRefsOnModel'), asText.slice(0, 120))

check('gated 子调度零报错', ['repo_commit', 'sched_publish', 'asset_sync'].every((n) => subs.find((e) => e.data.name === n)?.data.isError === false))

const pass = checks.filter(Boolean).length
console.log(`\n== dev-journey(新建链路): ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)
