// 锚定回归断言（P1-1b）：仓/分支/目录三级定位可切换，锚定事件随切换落 Session Log
// 对应 P1 验收条款 1。用法：DSH_HOME=../dsh-home node assert-anchor.mjs（分析最新会话日志）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const home = process.env.DSH_HOME || path.join(process.cwd(), 'dsh-home')

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

const anchorCalls = events.filter((e) => e.type === 'tool/call' && e.data.name === 'workspace_anchor')
const notices = events.filter((e) => e.type === 'user/message' && e.data?.source?.form === 'notice' && e.data?.source?.plugin === 'his-workspace-anchor')

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

check('锚定工具被调用（三级切换）', anchorCalls.length >= 2, `${anchorCalls.length} 次`)
check('分支锚定调用带 branch+dir 参数', anchorCalls.some((e) => {
  const a = JSON.parse(e.data.arguments ?? '{}')
  return a.branch && a.dir
}))
check('模型锚定调用带 file 参数', anchorCalls.some((e) => JSON.parse(e.data.arguments ?? '{}').file))
check('锚定注入消息落日志（带 plugin source 溯源）', notices.length >= 1, notices.map((e) => e.data.source.summary).join(' | '))
check('注入消息含结构化摘要（非全文）', notices.every((e) => {
  const t = (e.data.content ?? []).map((b) => b.text ?? '').join('')
  return t.includes('[workspace.anchor]') && t.length < 2000
}))

const pass = checks.filter(Boolean).length
console.log(`\n== anchor: ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)
