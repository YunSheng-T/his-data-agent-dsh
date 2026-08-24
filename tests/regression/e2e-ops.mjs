// P4-4 旅程驱动（V13 运维编排）：真实模型 + studio HTTP 表层 + 三道门
// 与 e2e-studio 的差异：编排旅程的第一道门常是对话式口径确认（turn 结束等用户），
// 本驱动在 turn/end 后若旅程未走完（ops_callback 未出现）则自动回复「确认，继续」（最多 4 次）。
// 用法：node tests/regression/e2e-ops.mjs（前置：his-studio 已在 :7300 运行）
const BASE = 'http://localhost:7300'
const TASK = process.argv[2] ?? `大促前批量暂停财税域非核心离线作业并完成部署：ops_screen 筛清单、ops_topo 血缘排序后直接把口径写进 approvalNote 调 ops_gen（确认走审批卡，不要对话式问我），制品标题用「大促${new Date().toISOString().slice(5, 10)}专场」，自检后 repo_commit 提交、ops_deploy 部署，变更单号 CHG-20260824，执行模式 MANUAL。`

const j = (r) => r.json()
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j)

const { sessionId } = await post('/api/chat', { text: TASK })
console.log(`[e2e-ops] 会话建立: ${sessionId}`)

let after = -1
const seen = new Set()
const approved = []
let followups = 0
const t0 = Date.now()
let journeyDone = false // ops_callback 出现 = 旅程走完

while (Date.now() - t0 < 280_000) {
  const data = await fetch(`${BASE}/api/sessions/${sessionId}/events?after=${after}`).then(j)
  let turnEnded = false
  for (const e of data.events ?? []) {
    after = Math.max(after, e.seq)
    const key = `${e.seq}:${e.type}`
    if (seen.has(key)) continue
    seen.add(key)
    if (e.type === 'tool/call') {
      const name = e.data?.name ?? ''
      if (name.startsWith('ops_') || name === 'repo_commit') console.log(`[e2e-ops] #${e.seq} 工具: ${name}`)
      if (name === 'ops_callback') journeyDone = true
    }
    if (e.type === 'turn/end') turnEnded = true
  }
  for (const p of data.pendingApprovals ?? []) {
    if (approved.includes(p.id)) continue
    console.log(`[e2e-ops] 审批点: ${p.toolName} —— ${(p.reason ?? '').slice(0, 60)} -> 确认`)
    await post(`/api/approvals/${p.id}`, { outcome: 'allowed-once', by: 'e2e-ops' })
    approved.push(p.id)
  }
  if (journeyDone && turnEnded) break
  if (turnEnded && !journeyDone && followups < 4 && !data.pendingApprovals?.length) {
    followups++
    console.log(`[e2e-ops] 对话门应答（第 ${followups} 次）：确认，继续`)
    await post('/api/chat', { sessionId, text: '确认，继续下一步。' })
  }
  await new Promise((r) => setTimeout(r, 2000))
}

console.log(`[e2e-ops] 结束: journeyDone=${journeyDone} 工具审批=${approved.length} 对话门=${followups} 用时=${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (!journeyDone) { console.error('[e2e-ops] FAIL: 旅程未走完（ops_callback 未出现）'); process.exit(1) }
const list = await fetch(`${BASE}/api/sessions`).then(j)
if (!list.sessions?.some((s) => s.id === sessionId)) { console.error('[e2e-ops] FAIL: 会话日志未落盘'); process.exit(1) }
console.log(`[e2e-ops] PASS: 编排旅程完成 · ${sessionId}`)
