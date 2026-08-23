// P2-1 反向联动断言：模型变更 → ETL 作业过期提醒
// 用法：node assert-impact.mjs       —— 纯单测（注解解析 / 反查 / stale 判定）
//       node assert-impact.mjs log   —— 分析最新会话日志（真实旅程的锚定提醒注入）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { GitRepoProvider } from '../../packages/workspace-repo/provider-git.js'
import { SEED_FILES } from '../../packages/workspace-repo/seed-repo.js'
import { LocalSimDryrunProvider } from '../../packages/domain-tools-dev/provider-dryrun.js'
import { LocalSchedProvider } from '../../packages/domain-tools-dev/provider-sched.js'
import { buildDevTools } from '../../packages/domain-tools-dev/definitions.js'
import { parseEtl } from '../../packages/domain-tools-dev/ast.js'
import { provider as modeling } from '../../packages/domain-tools-modeling/provider-mock.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

if (process.argv[2] === 'log') {
  // ---- 日志模式：真实旅程里，模型升版后锚定代码仓应注入 ⚠ 过期提醒 ----
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
  const raw = execFileSync('zstd', ['-d', '-c', newest.f], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  const events = raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const notices = events.filter((e) => e.type === 'user/message' && e.data?.source?.plugin === 'his-workspace-anchor')
  const texts = notices.map((e) => (e.data.content ?? []).map((b) => b.text ?? '').join(''))
  check('旅程中有模型 commit 升版', events.some((e) => e.type === 'approval/asked' && e.data.toolName === 'model_commit'))
  check('模型升版后锚定代码仓（工具返回带 staleJobs）', events.some((e) => {
    if (e.type !== 'tool/result') return false
    const t = JSON.stringify(e.data ?? {})
    return t.includes('staleJobs') && t.includes('"staleJobs": []') === false && t.includes('etl/')
  }))
  check('锚定注入 notice 含 ⚠ 过期提醒', texts.some((t) => t.includes('模型已更新') && t.includes('基线')), notices.length + ' 条锚定注入')
  check('提醒点名具体作业与版本迁移', texts.some((t) => /基线 v[\d.]+ → 当前 v[\d.]+/.test(t)))
} else {
  // ---- 纯单测：不依赖 dsh/模型 ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'his-impact-'))
  const repo = new GitRepoProvider(dir).init(SEED_FILES)
  const tools = new Map(buildDevTools({ repo, dryrun: new LocalSimDryrunProvider(), modeling, sched: new LocalSchedProvider() }).map((t) => [t.name, t]))
  const call = (name, args) => tools.get(name).execute(args)

  // 准备：codegen 一个带 @model 埋点的作业并提交
  await call('etl_codegen', { model: 'dwd_tax_declaration.model', jobPath: 'etl/dwd/dwd_tax_declaration_v9.etl', source: 'ods.ods_tax_declare_di' })
  repo.add(['etl/dwd/dwd_tax_declaration_v9.etl'])
  repo.commitAll('test: 埋点作业')

  const parsed = parseEtl(repo.readCommitted('main', 'etl/dwd/dwd_tax_declaration_v9.etl'))
  check('parseEtl 解析 @model 注解（modelFile + modelVersion）', parsed.modelFile === 'dwd_tax_declaration.model' && /^v[\d.]+$/.test(parsed.modelVersion), `${parsed.modelFile} @${parsed.modelVersion}`)
  const seedParsed = parseEtl(repo.readCommitted('main', 'etl/dwd/dwd_tax_declaration.etl'))
  check('种子作业（手写、无埋点）modelFile 为 null', seedParsed.modelFile === null)

  const m0 = modeling.anchorSummary('dwd_tax_declaration.model')
  const r0 = await call('impact_check', { model: 'dwd_tax_declaration.model' })
  check('impact_check 找到引用作业（注解 + 尾名两条路径）', r0.jobs.length >= 2, r0.jobs.map((j) => `${j.path}(${j.via})`).join(' '))
  check('模型未变更时 stale 全为非 true', r0.staleCount === 0 && r0.jobs.every((j) => j.stale !== true), `staleCount=${r0.staleCount}`)
  check('无埋点作业 stale=null（未知，不误报）', r0.jobs.some((j) => j.baseVersion === null && j.stale === null))

  // 模型变更：绑定一个字段并提交升版（v1.0 → v1.1）
  modeling.bindStd({ model: 'dwd_tax_declaration.model', field: 'decl_status_cd', std: 'std/DECL_STATUS v1' })
  modeling.commitModel({ model: 'dwd_tax_declaration.model', message: 'impact 断言：升版' })
  const m1 = modeling.anchorSummary('dwd_tax_declaration.model')
  check('模型升版成功', m1.version !== m0.version, `${m0.version} → ${m1.version}`)

  const r1 = await call('impact_check', { model: 'dwd_tax_declaration.model' })
  const staleOne = r1.jobs.find((j) => j.path === 'etl/dwd/dwd_tax_declaration_v9.etl')
  check('升版后埋点作业 stale=true 且版本迁移正确', staleOne?.stale === true && staleOne.baseVersion === m0.version && staleOne.currentVersion === m1.version, `${staleOne?.baseVersion} → ${staleOne?.currentVersion}`)
  check('staleCount 只统计确定的 stale', r1.staleCount === 1, `staleCount=${r1.staleCount}`)

  const r2 = await call('impact_check', { model: 'dwd_tax_payment.model' })
  check('未被引用的模型不误报（缴款模型无作业）', r2.jobs.length === 0 && r2.staleCount === 0)

  let threw = false
  try { await call('impact_check', { model: 'ghost.model' }) } catch { threw = true }
  check('模型不存在时报错（而非空结果）', threw)
}

const pass = checks.filter(Boolean).length
console.log(`\n== impact(${process.argv[2] ?? 'unit'}): ${pass}/${checks.length} 通过 ==`)
process.exit(pass === checks.length ? 0 : 1)
