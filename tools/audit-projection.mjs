// 审计投影 —— 左下审计流水的 P0 形态：Session Log 的派生只读视图
// 不写第二份日志；从 session.jsonl.zstd 过滤写入类事件，输出审计流水表。
// 用法：node tools/audit-projection.mjs [session-dir-or-file]   （缺省取最新会话）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const home = process.env.DSH_HOME || path.join(process.cwd(), 'dsh-home')
const arg = process.argv[2]

let file = arg
if (!file) {
  let newest = null
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'session.jsonl.zstd' && (!newest || fs.statSync(p).mtimeMs > newest.mtime)) newest = p
    }
  }
  walk(path.join(home, 'sessions'))
  file = newest
}
if (fs.statSync(file).isDirectory()) file = path.join(file, 'session.jsonl.zstd')

const raw = execFileSync('zstd', ['-d', '-c', file], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
const events = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

// 审计关注的事件：审批决策、gated 工具调用结果、锚定切换
const GATED = new Set(['std_create_draft', 'model_commit', 'asset_register', 'lineage_attach'])
const rows = []
const pendingApprovals = new Map()

const fmt = (ms) => new Date(ms).toTimeString().slice(0, 8)

for (const e of events) {
  const d = e.data ?? {}
  if (e.type === 'user/message') {
    const text = (d.message?.content ?? []).map((b) => b.text ?? '').join('')
    const m = text.match(/\[workspace\.anchor\].*?\n文件: (\S+)/s)
    if (m) rows.push({ t: fmt(e.time), kind: '锚定', what: m[1], by: 'Agent 上下文注入' })
  }
  if (e.type === 'approval/asked') {
    pendingApprovals.set(d.id, { t: fmt(e.time), tool: d.toolName, reason: d.reason ?? '' })
  }
  if (e.type === 'approval/decided') {
    const a = pendingApprovals.get(d.id)
    if (a) {
      rows.push({
        t: a.t, kind: '审批',
        what: `${a.tool} → ${d.outcome === 'allowed-once' ? '✅ 已确认' : '❌ 已打回'}`,
        by: '人（确认身份见 SSO 透传）',
        detail: a.reason.slice(0, 100),
      })
    }
  }
  if (e.type === 'tool/result') {
    for (const b of d.message?.content ?? []) {
      if (b.type !== 'tool-result') continue
      const text = (b.content ?? []).map((c) => c.text ?? '').join('')
      try {
        const v = JSON.parse(text)
        if (v.draft) rows.push({ t: fmt(e.time), kind: '知识库', what: `标准草案 ${v.draft.code}（draft 态）`, by: 'Agent 执行 · 人已确认' })
        if (v.version && v.committed) rows.push({ t: fmt(e.time), kind: '版本', what: `${v.model} → ${v.version}（绑定率 ${v.bindingRate}）`, by: 'Agent 执行 · 人已确认' })
        if (v.asset) rows.push({ t: fmt(e.time), kind: '资产', what: `资产发布 ${v.asset.model} ${v.asset.version}（质量门 ${v.asset.qualityGate}）`, by: 'Agent 执行 · 人已确认' })
        if (v.edge) rows.push({ t: fmt(e.time), kind: '血缘', what: `${v.edge.from} → ${v.edge.to}`, by: 'Agent 执行 · 人已确认' })
      } catch { /* 非 JSON 结果跳过 */ }
    }
  }
}

console.log(`\n审计流水（派生投影 · 源: ${path.basename(path.dirname(file))} · ${events.length} 事件）`)
console.log('─'.repeat(100))
console.log('时间       类别    事项'.padEnd(60) + '执行/确认')
console.log('─'.repeat(100))
for (const r of rows) {
  console.log(`${r.t}  ${r.kind.padEnd(4)}  ${r.what}`)
  if (r.detail) console.log(`           └ ${r.detail}`)
}
console.log('─'.repeat(100))
console.log(`共 ${rows.length} 条审计记录\n`)
