// P0-9 端到端验证：通过 studio HTTP 表层跑完整建模旅程
// 流程：POST /api/chat 建会话 -> 轮询事件 -> 出现审批点就确认 -> 等 turn/end
const BASE = 'http://localhost:7300'
const TASK = process.argv[2] ?? '请在财税域新建一张"发票明细"事实表 dwd_invoice_detail，字段至少包含 invoice_id、taxpayer_id、amount、tax_rate、invoice_date，尽量绑定标准库，完成后提交并登记资产。'

const j = (r) => r.json()
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j)

const { sessionId } = await post('/api/chat', { text: TASK })
console.log(`[e2e] 会话建立: ${sessionId}`)

let after = -1
const seen = new Set()
const approved = []
const t0 = Date.now()
let done = null

while (Date.now() - t0 < 260_000) {
  const data = await fetch(`${BASE}/api/sessions/${sessionId}/events?after=${after}`).then(j)
  for (const e of data.events ?? []) {
    after = Math.max(after, e.seq)
    const key = `${e.seq}:${e.type}`
    if (seen.has(key)) continue
    seen.add(key)
    if (e.type === 'assistant/message') {
      const t = (e.data?.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('')
      if (t) console.log(`[e2e] #${e.seq} 助手: ${t.slice(0, 120).replace(/\n/g, ' ')}`)
    } else if (e.type === 'tool/call' || e.type === 'tool/result') {
      const name = e.data?.call?.name ?? e.data?.name ?? ''
      console.log(`[e2e] #${e.seq} ${e.type}: ${name}`)
    } else if (!['agent/spawn', 'session/meta', 'assistant/chunk', 'request/header', 'request/context'].includes(e.type)) {
      console.log(`[e2e] #${e.seq} ${e.type}`)
    }
    if (e.type === 'turn/end') done = e.data?.reason
  }
  for (const p of data.pendingApprovals ?? []) {
    if (approved.includes(p.id)) continue
    console.log(`[e2e] 审批点出现: ${p.id} ${p.toolName} —— ${p.reason} -> 确认`)
    const r = await post(`/api/approvals/${p.id}`, { outcome: 'allowed-once', by: 'e2e-script' })
    console.log(`[e2e] 审批回写: ${JSON.stringify(r)}`)
    approved.push(p.id)
  }
  if (done) break
  await new Promise((r) => setTimeout(r, 2000))
}

console.log(`[e2e] 结束: ${JSON.stringify(done)} 审批数=${approved.length} 用时=${((Date.now() - t0) / 1000).toFixed(0)}s`)
if (!done) { console.error('[e2e] FAIL: 超时未完成'); process.exit(1) }
if (done.kind !== 'completed') { console.error('[e2e] FAIL: 非正常完成'); process.exit(1) }
if (approved.length < 1) { console.error('[e2e] FAIL: 未出现任何审批点（UI 应答器未被触发）'); process.exit(1) }
// flush 验证：会话必须出现在历史列表（Session Log 已落盘）
const list = await fetch(`${BASE}/api/sessions`).then(j)
if (!list.sessions?.some((s) => s.id === sessionId)) { console.error('[e2e] FAIL: 会话日志未落盘'); process.exit(1) }
console.log(`[e2e] PASS: 旅程完成 · UI 审批往返 ${approved.length} 次 · Session Log 已落盘`)
