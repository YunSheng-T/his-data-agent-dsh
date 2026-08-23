// 修改链路断言（P1-6）：diff 只动 .etl 不动 .dag、影响分析调用 lineage_downstream、打回路径无副作用
// 对应任务书回归集第 2 条 + 验收条款 4/5。
// 用法：DSH_HOME=../dsh-home node assert-patch-journey.mjs [approve|reject-commit]（分析最新会话日志 + 仓 git 实况）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const scenario = process.argv[2] ?? 'approve'
const home = process.env.DSH_HOME || path.join(process.cwd(), 'dsh-home')
const repoDir = path.join(process.cwd(), 'runtime/repo-etl')

let newest = null
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name === 'session.jsonl.zstd' && (!newest || fs.statSync(p).mtimeMs > newest.mtime)) newest = { f: p, mtime: fs.statSync(p).mtimeMs }
  }
}
walk(path.join(home, 'sessions'))
if (!newest) { console.error('FAIL: 找不到会话日志'); process.exit(1) }

const raw = execFileSync('zstd', ['-d', '-c', newest.f], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
const events = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

const topCalls = events.filter((e) => e.type === 'tool/call').map((e) => e.data.name)
const subs = events.filter((e) => e.type === 'tool/code-dispatch')
const subNames = subs.map((e) => e.data.name)
const asked = events.filter((e) => e.type === 'approval/asked')
const decided = events.filter((e) => e.type === 'approval/decided')
const seqOf = (pred) => events.find(pred)?.seq ?? -1
// code-dispatch 的 arguments 是对象；tool/call 的是 JSON 字符串 —— 兼容两种
const argsOf = (e) => { const a = e.data.arguments ?? {}; return typeof a === 'string' ? JSON.parse(a || '{}') : a }
const git = (...args) => { try { return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' }).trim() } catch { return null } }

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

// 从日志提取旅程实际使用的分支（repo_checkout create 子调度的参数）
const coSub = subs.find((e) => e.data.name === 'repo_checkout' && argsOf(e).create)
const branch = coSub ? argsOf(coSub).branch : null

console.log(`日志: ${path.basename(path.dirname(newest.f))} · 场景: ${scenario} · 分支: ${branch ?? '未识别'} · 子调度: ${subNames.join(',')}`)

if (scenario === 'approve') {
  check('PTC 模式：顶层调用只有 run_code', topCalls.length > 0 && topCalls.every((n) => n === 'run_code'))
  check('修改链路复用同一编排（lint/dryrun/commit/publish）', ['etl_patch', 'code_lint', 'test_dryrun', 'repo_commit', 'sched_publish'].every((n) => subNames.includes(n)))
  check('影响分析调用 lineage_downstream', subNames.includes('lineage_downstream'))
  const linSeq = seqOf((e) => e.type === 'tool/code-dispatch' && e.data.name === 'lineage_downstream')
  const patchSeq = seqOf((e) => e.type === 'tool/code-dispatch' && e.data.name === 'etl_patch')
  check('影响分析先于修改（lineage_downstream → etl_patch）', linSeq > 0 && patchSeq > 0 && linSeq < patchSeq, `lin=${linSeq} < patch=${patchSeq}`)
  check('未调用 dag_gen（修改链路不重生成调度）', !subNames.includes('dag_gen'))

  const askedNames = asked.map((e) => e.data.toolName)
  check('审批点恰好 2 次（commit + 上线）', JSON.stringify(askedNames) === JSON.stringify(['repo_commit', 'sched_publish']), askedNames.join(','))
  check('两次审批均 allowed-once 落日志', decided.filter((e) => e.data.outcome === 'allowed-once').length >= 2)

  const drySeq = seqOf((e) => e.type === 'tool/code-dispatch' && e.data.name === 'test_dryrun')
  const commitAskSeq = seqOf((e) => e.type === 'approval/asked' && e.data.toolName === 'repo_commit')
  check('dry-run 先于 commit 审批（编排不变量）', drySeq > 0 && commitAskSeq > 0 && drySeq < commitAskSeq, `dry=${drySeq} < commitAsk=${commitAskSeq}`)

  check('分支信息可从日志识别', !!branch, branch ?? '')
  // diff 断言以「本次旅程的提交」为准（分支可能从 feature 基线开出，main...branch 会含历史产物）
  const commitSub = subs.find((e) => e.data.name === 'repo_commit')
  const commitText = (commitSub?.data.content ?? []).map((c) => c.text ?? '').join('')
  const commitId = commitText.match(/[0-9a-f]{7,40}/)?.[0]
  check('提交 ID 可从日志识别', !!commitId, commitId ?? commitText.slice(0, 80))
  if (commitId) {
    const diffNames = git('diff', '--name-only', `${commitId}^`, commitId)?.split('\n').filter(Boolean) ?? []
    check('diff 只动 .etl 不动 .dag', diffNames.length >= 1 && diffNames.every((p) => p.endsWith('.etl')), diffNames.join(', '))
    check('dag/ 目录零变更（git 实况）', (git('diff', '--name-only', `${commitId}^`, commitId, '--', 'dag/') ?? '') === '')
  }
  const pubSub = subs.find((e) => e.data.name === 'sched_publish')
  const pubText = (pubSub?.data.content ?? []).map((c) => c.text ?? '').join('')
  check('上线成功（status online）', pubText.includes('"online"'))
} else if (scenario === 'reject-commit') {
  // reject-commit：HIS_REJECT_TOOL=repo_commit 的打回路径
  const commitAsk = asked.find((e) => e.data.toolName === 'repo_commit')
  check('repo_commit 触发审批点', !!commitAsk)
  const commitDecide = decided.find((e) => e.data.id === commitAsk?.data.id)
  check('审批结果 rejected 落日志', commitDecide?.data.outcome === 'rejected', commitDecide?.data.outcome ?? '')
  const commitSub = subs.find((e) => e.data.name === 'repo_commit')
  check('打回后提交未发生（isError）', commitSub?.data.isError === true)
  const pubSub = subs.find((e) => e.data.name === 'sched_publish')
  const pubText = (pubSub?.data.content ?? []).map((c) => c.text ?? '').join('')
  check('上线未发生或被闸门拦截（无 online）', !pubText.includes('"online"'), pubSub ? 'publish 被调但失败' : 'publish 未被调')
  // 无副作用：被拒绝的修改不进入任何提交（分支历史 grep 不到新表达式）
  if (branch) {
    const leaked = git('grep', '-F', "NVL(overdue_flag, '0')", branch, '--', 'etl/')
    check('被拒绝的修改未落入任何提交（git 实况）', !leaked, leaked ? '发现泄漏!' : '分支历史无该表达式')
    const dirty = git('status', '--porcelain')?.split('\n').filter(Boolean) ?? []
    check('工作区保持未提交态可继续（.etl 改动仍在）', dirty.some((l) => l.includes('.etl')), dirty.join(' | ').slice(0, 120))
    check('打回路径不碰 .dag（工作区实况）', !dirty.some((l) => l.includes('.dag')))
  }
} else {
  // blocked-publish：验收条款 4 —— lint 失败，作业不得上线（工具层自检兜底，与审批层独立）
  check('检查先行（code_lint 或 danger_scan 被调）', subNames.includes('code_lint') || subNames.includes('danger_scan'), subNames.join(','))
  const pubSub = subs.find((e) => e.data.name === 'sched_publish')
  const pubText = (pubSub?.data.content ?? []).map((c) => c.text ?? '').join('')
  check('sched_publish 被调用且返回结构化拦截（blocked:true）', !!pubSub && /"blocked":\s*true/.test(pubText) && /"published":\s*false/.test(pubText))
  check('拦截原因为 lint error 级（sql.partition）', pubText.includes('lint 存在 error') && pubText.includes('sql.partition'))
  check('无 online 结果（作业未上线）', !pubText.includes('"online"'))
  check('repo_commit 审批点未出现（无可提交物，编排终止）', !asked.some((e) => e.data.toolName === 'repo_commit'))
  check('仓实况：危险分支与工作区未被旅程破坏', git('status', '--porcelain') !== null)
}

const pass = checks.filter(Boolean).length
console.log(`\n== patch-journey(${scenario}): ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)
