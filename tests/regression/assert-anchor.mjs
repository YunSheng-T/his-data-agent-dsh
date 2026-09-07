// 锚定回归断言（P1-1b）：模型/代码仓目录/单个作业三级锚定可切换，锚定切换随注入落 Session Log
// 用法：DSH_HOME=../dsh-home node assert-anchor.mjs（分析最新含锚定活动的会话日志）
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const home = process.env.DSH_HOME || path.join(process.cwd(), 'dsh-home')

let candidates = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name === 'session.jsonl.zstd') candidates.push({ f: p, mtime: fs.statSync(p).mtimeMs })
  }
}
walk(path.join(home, 'sessions'))
candidates = candidates.sort((a, b) => b.mtime - a.mtime)
const load = (f) => execFileSync('zstd', ['-d', '-c', f], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

// 锚定活动证据：his-workspace-anchor 注入消息（UI 路由 /his-repo/anchor 与 workspace_anchor 工具都会触发注入）
const isNotice = (e) => e.type === 'user/message' && e.data?.source?.form === 'notice' && e.data?.source?.plugin === 'his-workspace-anchor'
const isTool = (e) => e.type === 'tool/call' && e.data.name === 'workspace_anchor'
// 选最新且含「分支/作业级锚定活动」的会话（summary 形如 "锚定切换: branch/dir" 或工具 branch 参数）
const found = candidates.map((c) => ({ ...c, events: load(c.f) })).find((c) => {
  const hasAnchor = c.events.some((e) => isNotice(e) || isTool(e))
  const hasBranch = c.events.some((e) => {
    if (isNotice(e)) return /\//.test(e.data.source.summary || '')
    if (isTool(e)) { try { const a = JSON.parse(e.data.arguments ?? '{}'); return a.branch } catch {} return false }
    return false
  })
  return hasAnchor && hasBranch
})
if (!found) {
  console.log('SKIP: 最新会话无锚定活动（注入或 workspace_anchor）——需先在 UI 切一次锚定或跑一次 agent 锚定会话')
  process.exit(0)
}
const events = found.events

const anchorCalls = events.filter((e) => isTool(e))
const notices = events.filter((e) => isNotice(e))
const noticeSummary = notices.map((e) => e.data.source.summary || '')

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

check('锚定切换发生（注入 ≥2 次，UI 路由或工具皆可）', notices.length >= 2, notices.length + ' 次注入')
check('分支/作业级锚定发生（summary 含路径 或 工具 branch）', noticeSummary.some((s) => /\//.test(s)) || anchorCalls.some((e) => { try { return JSON.parse(e.data.arguments).branch } catch { return false } }), noticeSummary.join(' | '))
check('模型锚定发生（summary 含 .model 或 工具 file）', noticeSummary.some((s) => s.includes('.model')) || anchorCalls.some((e) => { try { return JSON.parse(e.data.arguments).file } catch { return false } }), noticeSummary.join(' | '))
check('锚定注入消息落日志（带 plugin source 溯源）', notices.length >= 1)
check('注入消息含结构化摘要（非全文）', notices.every((e) => {
  const t = (e.data.content ?? []).map((b) => b.text ?? '').join('')
  return t.includes('[workspace.anchor]') && t.length < 2000
}))

const pass = checks.filter(Boolean).length
console.log(`\n== anchor: ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)

