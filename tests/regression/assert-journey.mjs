// P0 回归断言：建模旅程端到端（真实模型 or mock 均可，只认 Session Log 事件）
// 用法：DSH_HOME=../dsh-home node assert-journey.mjs [approve|reject-draft]
// 断言依据：prompts/01-P0-建模空间实施.md 验收清单
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const scenario = process.argv[2] ?? 'approve'
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

const asked = events.filter((e) => e.type === 'approval/asked')
const decided = events.filter((e) => e.type === 'approval/decided')

const callName = {}
for (const e of events) if (e.type === 'tool/call') callName[e.data.callId] = e.data.name
const results = []
for (const e of events) {
  if (e.type !== 'tool/result') continue
  for (const b of e.data?.message?.content ?? []) {
    if (b.type === 'tool-result') {
      results.push({ name: callName[b.toolCallId], isError: !!b.isError, text: (b.content ?? []).map((c) => c.text ?? '').join('') })
    }
  }
}

const DOMAIN = ['model_read_fields','model_lint','std_ref_scan','std_search','std_create_draft','model_bind_std','model_alter_field','model_commit','ddl_gen','asset_register','lineage_attach']
const domainAsked = asked.filter((e) => DOMAIN.includes(e.data.toolName))

console.log(`日志: ${path.basename(path.dirname(newest.f))} · 事件 ${events.length} 条 · 工具结果 ${results.length} 条 · 域审批点 ${domainAsked.length} 个`)

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

if (scenario === 'approve') {
  const askedNames = domainAsked.map((e) => e.data.toolName)
  check('域工具审批点恰好 3 个（草案/提交/发布）', JSON.stringify([...new Set(askedNames)]) === JSON.stringify(['std_create_draft', 'model_commit', 'asset_register']), askedNames.join(','))
  check('审批全部 allowed-once 落日志', decided.filter((e) => e.data.outcome === 'allowed-once').length >= 3)
  check('只读工具不触发审批（model_lint / std_ref_scan / ddl_gen）', !askedNames.some((n) => ['model_lint', 'std_ref_scan', 'ddl_gen', 'model_read_fields', 'std_search'].includes(n)))
  check('工作区写入不触发审批（bind/alter）', !askedNames.some((n) => ['model_bind_std', 'model_alter_field'].includes(n)))

  const commit = results.find((r) => r.name === 'model_commit' && !r.isError)
  check('model_commit 成功', !!commit)
  check('版本升至 v1.1', !!commit && commit.text.includes('"v1.1"'), commit?.text.match(/v\d\.\d/)?.[0])
  check('终态绑定率 7/9', !!commit && commit.text.includes('7/9'), commit?.text.match(/bindingRate[^,]*/)?.[0])

  const ddl = results.find((r) => r.name === 'ddl_gen' && !r.isError)
  check('DDL 生成成功且含标准引用注释', !!ddl && ddl.text.includes('标准引用'), '')
  const stdRefs = (ddl?.text.match(/标准引用: std\//g) ?? []).length
  check('DDL 至少 7 处标准引用', stdRefs >= 7, `${stdRefs} 处`)

  check('资产注册成功', results.some((r) => r.name === 'asset_register' && !r.isError))
  check('标准草案创建成功（draft 态）', results.some((r) => r.name === 'std_create_draft' && !r.isError && r.text.includes('draft')))
} else if (scenario === 'reject-draft') {
  check('std_create_draft 触发审批点', domainAsked.some((e) => e.data.toolName === 'std_create_draft'))
  check('审批结果 rejected 落日志', decided.some((e) => e.data.outcome === 'rejected'))
  const draft = results.find((r) => r.name === 'std_create_draft')
  check('打回后草案未创建（isError）', !!draft && draft.isError)
  check('无副作用：无 draftId 产出', !results.some((r) => r.text.includes('DRAFT') || r.text.includes('v0-draft')))
}

const failed = checks.filter((ok) => !ok).length
console.log(failed === 0 ? `\n== ${scenario}: ${checks.length}/${checks.length} 通过 ==` : `\n== ${scenario}: ${failed} 项失败 ==`)
process.exit(failed ? 1 : 0)
