// @his/studio-ui — 三栏工作台表层（P0 骨架）
//
// 形态（技术方案 §12 + M0 穿刺修正 4）：自建表层 = 在 dsh-base 上挂本插件，
// 用 node:http 起服务，对外只暴露三类端点：
//   1) 会话事件流（轮询 /api/sessions/:id/events?after=seq，live 走内存、历史走 Session Log 重放）
//   2) 审批决策回写（POST /api/approvals/:id —— UI 应答器挂起 approval/request 直到人点按钮）
//   3) 工作区文件服务（/api/models/* —— 模型目录树、字段、DDL，全部经 Provider 服务）
//
// UI 纯渲染：所有状态要么来自 Provider，要么来自 Session Log 事件投影，不维护第二份状态。

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { scanScriptJob } from '../domain-tools-dev/definitions.js'
import { fileURLToPath } from 'node:url'

export const name = 'his-studio-ui'
export const inject = ['tools', 'agents', 'sessions', 'agentDefaultModel', 'hisModeling', 'hisRepo', 'hisDevAst', 'hisDryrun', 'hisCicd', 'hisOps', 'hisOntology', 'hisAnchor']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.HIS_STUDIO_PORT ?? 7300)

// ---------- 运行时状态 ----------
const liveAgents = new Map()      // sessionId -> agent
const pendingApprovals = new Map() // pendingId -> {req, resolve, at}

// ---------- 会话事件读取 ----------
function readLogEvents(sessionDir) {
  const f = path.join(sessionDir, 'session.jsonl.zstd')
  if (!fs.existsSync(f)) return null
  const raw = execFileSync('zstd', ['-d', '-c', f], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  return raw.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

function sessionsRoot() {
  return path.join(process.env.DSH_HOME ?? path.join(process.env.HOME, '.dsh'), 'sessions')
}

function findSessionDir(id) {
  const root = sessionsRoot()
  for (const proj of fs.readdirSync(root)) {
    const d = path.join(root, proj, id)
    if (fs.existsSync(d)) return d
  }
  return null
}

function getEvents(sessionId) {
  const agent = liveAgents.get(sessionId)
  if (agent) return agent.session.events // 活会话：内存事件流（与日志同源）
  const dir = findSessionDir(sessionId)
  return dir ? readLogEvents(dir) : null // 历史会话：从 Session Log 重放
}

function listSessions() {
  const root = sessionsRoot()
  const out = []
  if (!fs.existsSync(root)) return out
  for (const proj of fs.readdirSync(root)) {
    const pd = path.join(root, proj)
    if (!fs.statSync(pd).isDirectory()) continue
    for (const sid of fs.readdirSync(pd)) {
      const f = path.join(pd, sid, 'session.jsonl.zstd')
      if (!fs.existsSync(f)) continue
      out.push({ id: sid, mtime: fs.statSync(f).mtimeMs, live: liveAgents.has(sid) })
    }
  }
  for (const [sid] of liveAgents) if (!out.some((s) => s.id === sid)) out.push({ id: sid, mtime: Date.now(), live: true })
  return out.sort((a, b) => b.mtime - a.mtime)
}

// ---------- 审批 UI 应答器（替代 headless answerer） ----------
function mountUiAnswerer(ctx) {
  ctx.on('approval/request', (req) => {
    return new Promise((resolve) => {
      const pid = `appr-${randomUUID().slice(0, 8)}`
      pendingApprovals.set(pid, { req, resolve, at: Date.now() })
      console.error(`[studio-ui] 审批点待决: ${pid} ${req.toolName} —— ${req.reason ?? ''}`)
      req.signal?.addEventListener?.('abort', () => {
        if (pendingApprovals.delete(pid)) resolve('cancelled')
      })
    })
  })
}

// ---------- HTTP ----------
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(obj))
}

async function route(ctx, req, res, url) {
  // 前端
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(fs.readFileSync(path.join(__dirname, 'public/index.html')))
    return
  }
  // 静态资源（vendor：X6 等本地引入，不依赖 CDN）
  const staticMatch = url.pathname.match(/^\/(vendor\/[\w.@/-]+)$/)
  if (staticMatch) {
    const f = path.join(__dirname, 'public', staticMatch[1])
    if (!fs.existsSync(f)) return json(res, 404, { error: 'not found' })
    res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream' })
    res.end(fs.readFileSync(f))
    return
  }

  // 租户服务（V11）：列表 / 切换（切换的全链路跟随由前端驱动，隔离守卫在 Provider 层硬执行）
  if (url.pathname === '/api/tenants') {
    return json(res, 200, { tenants: ctx.hisRepo.tenants(), current: ctx.hisRepo.currentTenant() })
  }
  if (url.pathname === '/api/repo/tenant' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    try {
      const t = ctx.hisRepo.switchTenant(body.tenant)
      return json(res, 200, {
        current: t,
        tenants: ctx.hisRepo.tenants(),
        branches: ctx.hisRepo.branches(),
        branch: ctx.hisRepo.currentBranch(),
        tree: ctx.hisRepo.treeWithState(ctx.hisRepo.currentBranch()),
        packages: ctx.hisRepo.packages(),
      })
    } catch (e) { return json(res, 400, { error: e.message }) }
  }

  // 工作区文件服务
  if (url.pathname === '/api/models') {
    const st = ctx.hisModeling._state
    return json(res, 200, {
      models: Object.values(st.models).map((m) => ({
        file: m.file, name: m.name, cn: m.cn, domain: m.domain, layer: m.layer,
        version: m.version, published: m.published,
        bound: m.fields.filter((f) => f.std).length, total: m.fields.length,
      })),
      stdLibVersion: st.stdLib.version,
    })
  }
  // 模型规范性检查（质量门数据源，P1.5）——必须先于 /api/models/:file 匹配，否则被吞
  const lintMatch = url.pathname.match(/^\/api\/models\/(.+)\/lint$/)
  if (lintMatch) {
    try { return json(res, 200, ctx.hisModeling.lintModel(decodeURIComponent(lintMatch[1]))) }
    catch (e) { return json(res, 404, { error: e.message }) }
  }
  const modelMatch = url.pathname.match(/^\/api\/models\/(.+)$/)
  if (modelMatch) {
    const file = decodeURIComponent(modelMatch[1])
    try {
      const detail = ctx.hisModeling.readFields(file)
      const ddl = ctx.hisModeling.genDdl(file)
      return json(res, 200, { ...detail, ddl: ddl.ddl })
    } catch (e) { return json(res, 404, { error: e.message }) }
  }

  // 代码仓服务（P1-5：分支树 / 文件解析 / 血缘，全部经 hisRepo + hisDevAst 服务）
  if (url.pathname === '/api/repo/tree') {
    const current = ctx.hisRepo.currentBranch()
    const branch = url.searchParams.get('branch') || current
    // treeWithState 的脏标记来自工作区，仅对当前检出分支有意义；看其他分支用纯已提交树
    const tree = branch === current ? ctx.hisRepo.treeWithState(branch) : ctx.hisRepo.tree(branch)
    // P2-1：stale 标记（模型升版 → 基于旧版本生成的作业），仅对当前分支实时计算
    if (branch === current) {
      const { etls } = ctx.hisDevAst.jobIndex(ctx.hisRepo)
      const verCache = new Map()
      for (const e of etls) {
        const mf = e.parsed.modelFile
        if (!mf || !e.parsed.modelVersion) continue
        if (!verCache.has(mf)) verCache.set(mf, ctx.hisModeling.anchorSummary(mf)?.version ?? null)
        const cur = verCache.get(mf)
        if (cur && cur !== e.parsed.modelVersion) {
          const ent = tree.find((t) => t.path === e.path)
          if (ent) ent.stale = { model: mf, baseVersion: e.parsed.modelVersion, currentVersion: cur }
        }
      }
    }
    // V10：分包归属徽标 + 文件行扫描状态点（CICD 权威报告摘要；未提交/工作区已改的不显示）
    const dirtySet = new Set(branch === current ? ctx.hisRepo.status().map((s) => s.path) : [])
    for (const ent of tree) {
      const pkg = ctx.hisRepo.packageOf(ent.path)
      if (pkg) ent.pkg = { platform: pkg.platform, connected: pkg.connected }
      if (branch === current && (ent.kind === 'etl' || ent.kind === 'ops') && !ent.uncommitted && !dirtySet.has(ent.path)) {
        const v = ctx.hisCicd.verdictFor(ent.path, branch)
        if (v) ent.scan = v
      }
    }
    return json(res, 200, {
      branches: ctx.hisRepo.branches(), current, tree,
      tenant: ctx.hisRepo.currentTenant(),
      packages: ctx.hisRepo.packages(),
      address: ctx.hisRepo.address(),
    })
  }
  if (url.pathname === '/api/repo/checkout' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    try {
      ctx.hisRepo.checkout(body.branch) // 不 create：UI 侧分支必须已存在
      return json(res, 200, {
        current: ctx.hisRepo.currentBranch(),
        tree: ctx.hisRepo.treeWithState(body.branch),
      })
    } catch (e) { return json(res, 400, { error: e.message }) }
  }
  if (url.pathname === '/api/repo/file') {
    const p = url.searchParams.get('path')
    const view = url.searchParams.get('view') // 'committed' 读已提交态；缺省读工作区
    if (!p) return json(res, 400, { error: 'path required' })
    try {
      const text = view === 'committed'
        ? ctx.hisRepo.readCommitted(ctx.hisRepo.currentBranch(), p)
        : ctx.hisRepo.readWorking(p)
      if (text == null) return json(res, 404, { error: `文件不存在: ${p}` })
      const kind = p.endsWith('.dag') ? 'dag' : p.endsWith('.ops') ? 'ops' : p.endsWith('.sql') ? 'script' : p.endsWith('.svc') ? 'svc' : 'etl'
      const parsed = kind === 'dag' ? ctx.hisDevAst.parseDag(text) : kind === 'ops' ? ctx.hisOps.parseOps(text) : ctx.hisDevAst.parseEtl(text)
      return json(res, 200, { path: p, kind, text, parsed })
    } catch (e) { return json(res, 400, { error: e.message }) }
  }
  // 新建 SQL 脚本（dbscript/*.sql）到工作区未提交态：前端「新建 SQL」按钮调用，
  // 语义与开发域 sql_create 工具一致；不跨包 import genSql，模板在此内联，可编辑。
  if (url.pathname === '/api/repo/sql-create' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const path = body.path
    if (!path || !path.startsWith('dbscript/') || !path.endsWith('.sql')) return json(res, 400, { error: '必须 dbscript/ 下且 .sql 结尾: ' + path })
    const target = body.target ?? 'dwd.' + path.split('/').pop().replace(/\.sql$/, '')
    const existing = ctx.hisRepo.readWorking(path) ?? ctx.hisRepo.readCommitted(ctx.hisRepo.currentBranch(), path)
    if (existing != null) return json(res, 200, { created: false, reason: `文件已存在: ${path}（不覆盖，编辑走右侧 Agent）` })
    const cols = (body.columns && body.columns.length)
      ? body.columns.map((c, i) => `  ${c.name}${c.type ? ' ' + c.type : ''}${i < body.columns.length - 1 ? ',' : ''} -- ${c.comment ?? ''}`).join('\n')
      : '  -- 在此编写 DDL 订正列；逐列可挂 @std/v 标准引用注释（如 col_a STRING -- @std/tax_id v1）\n  col_a STRING\n  ,col_b DECIMAL(18,2)'
    const job = path.split('/').pop().replace(/\.sql$/, '')
    const text = `-- @job: ${job}\n-- @engine: Hive SQL\n-- @target: ${target}\n-- @kind: dbscript\n-- 本文件新建（模板可编辑），用于数据库脚本 / DDL 订正；与模型设计态的一致性走本体扫描\nALTER TABLE ${target} ADD COLUMNS (\n${cols}\n);\n`
    const written = ctx.hisRepo.writeWorking(path, text)
    return json(res, 200, { created: true, ...written, targetTable: (text.match(/ALTER\s+TABLE\s+(\S+)/i) || [])[1] ?? null, note: '新建 .sql 到工作区未提交态；提交走 repo_commit（提交前预扫描）' })
  }
  // 本体驱动扫描（V15 @his/domain-tools-ontology）：对脚本作业做本体分类/策略/规则/增量匹配/归因，返回扫描数据供前端渲染
  if (url.pathname === '/api/repo/onto-scan') {
    const p = url.searchParams.get('path')
    if (!p) return json(res, 400, { error: 'path required' })
    const text = ctx.hisRepo.readWorking(p) ?? ctx.hisRepo.readCommitted(ctx.hisRepo.currentBranch(), p)
    if (text == null) return json(res, 404, { error: '文件不存在: ' + p })
    const onto = ctx.hisOntology
    if (!onto) return json(res, 500, { error: 'hisOntology 服务未挂载' })
    const engine = (text.match(/--\s*@engine:\s*(\S+)/) || [])[1] ?? 'Hive SQL'
    const ast = /ADD\s+COLUMNS/i.test(text) ? { alterAddColumns: true } : /\b(UPDATE|INSERT\s+INTO)\b/i.test(text) ? { dml: true } : {}
    const physicalTable = (text.match(/ALTER\s+TABLE\s+(\S+)/i)?.[1] || (text.match(/FROM\s+(\S+)/i) || [])[1]) ?? null
    // 锚定优先取 workspace-anchor 当前态；未锚定（如首次进入扫描页）时回退到被扫文件的目录，
    // 保证「当前锚定的对象是什么」始终有真实依据，而不是调用方现编
    const anchorSvc = {
      getCurrent: () => {
        const cur = ctx.hisAnchor && ctx.hisAnchor.getCurrent ? ctx.hisAnchor.getCurrent() : null
        if (cur) return cur
        const dir = p.split('/').slice(0, -1).join('/')
        return dir ? { kind: 'repo', branch: ctx.hisRepo.currentBranch(), dir, key: 'repo:' + ctx.hisRepo.currentBranch() + ':' + dir } : null
      },
    }
    const octx = { repo: ctx.hisRepo, modeling: ctx.hisModeling, anchor: anchorSvc }
    const anchored = onto.anchoredObject(octx)
    const chain = onto.reasonChain ? onto.reasonChain(octx, p) : null
    const cls = onto.classifyJob({ path: p, engine, ast }, octx)
    const pol = cls.ok ? onto.policiesFor(cls.jobType) : null
    const rl = cls.ok ? onto.rulesFor(cls.jobType) : null
    const plan = cls.ok ? onto.scanPlan(cls.jobType) : null
    const match = cls.ok ? onto.consistencyCheck(p, octx) : null
    // 扫描结论主视图：三类结论（设计质量/SQL/一致性）+ 差异明细（复用域引擎 scanScriptJob）
    const scan = scanScriptJob(ctx.hisRepo, ctx.hisModeling, onto, p) ?? null
    const scanVerdict = scan ? (
      [scan.design?.pass, scan.sql?.pass, scan.consistency?.pass].some((x) => x === false) ? 'diff'
      : [scan.design?.pass, scan.sql?.pass].every((x) => x === true) && scan.consistency?.pass === null ? 'pass-unknown' : 'pass'
    ) : 'no-scan'
    // 发现项现场派生自一致性冲突（非写死 FINDINGS）：只对真实冲突产生 finding
    const findings = (match && match.conflicts || []).map((c, i) => ({
      id: 'F-' + (101 + i),
      severity: c.kind === 'MATCH-CONFLICT' ? '告警 · 可修复' : c.kind === 'BEHIND' ? 'BEHIND · 提示不阻断' : 'info',
      target: c.field,
      rule: (c.kind === 'MATCH-CONFLICT' ? 'rule/rc@dbscript-field-type' : 'rule/rc@dbscript-field-missing'),
      desc: c.field + '：设计 ' + c.design + '、代码 ' + (c.code || '未实现') + (c.note ? ' —— ' + c.note : ''),
      chain: (c.kind === 'MATCH-CONFLICT' ? 'R-102 字段类型一致性' : 'R-103 字段缺失/多余') + ' ← 设计开发一致性策略 ← ' + (cls && cls.instanceName) + ' ｜ 基线 ' + (match.releaseBaseline && match.releaseBaseline.modelVersion || ''),
      fix: c.kind === 'MATCH-CONFLICT' ? { column: c.field, from: c.code, to: c.design } : null,
    }))
    return json(res, 200, { path: p, anchored, chain, classify: cls, policies: pol?.policies ?? [], rules: rl ?? null, scanPlan: plan, match, scan, scanVerdict, findings, trace: onto.trace(), context: onto.graphContext(octx, p), ontVersion: onto.ontVersion })
  }
  if (url.pathname === '/api/repo/lineage') {
    const p = url.searchParams.get('path')
    if (!p) return json(res, 400, { error: 'path required' })
    return json(res, 200, {
      path: p,
      upstream: ctx.hisDevAst.upstream(ctx.hisRepo, p),
      downstream: ctx.hisDevAst.downstream(ctx.hisRepo, p),
    })
  }
  // 测试运行（P1.5）：对当前工作区文件做 dry-run 采样；约束固化在 hisDryrun Provider
  if (url.pathname === '/api/repo/test' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const p = body.path
    if (!p?.endsWith('.etl')) return json(res, 400, { error: '仅支持 .etl 作业的 dry-run 采样' })
    const text = ctx.hisRepo.readWorking(p)
    if (text == null) return json(res, 404, { error: `文件不存在: ${p}` })
    const parsed = ctx.hisDevAst.parseEtl(text)
    const result = await ctx.hisDryrun.dryrun({ sql: text, parsed, sampleRows: body.sampleRows ?? 100 })
    return json(res, 200, { path: p, at: new Date().toISOString(), ...result })
  }

  // 配对校验（V13）：对指定 .ops 找同分包内动作相反的镜像文件，跑编排域自检三件套
  if (url.pathname === '/api/ops/check') {
    const p = url.searchParams.get('path')
    if (!p?.endsWith('.ops')) return json(res, 400, { error: 'path 需指向 .ops 文件' })
    const read = (f) => ctx.hisRepo.readWorking(f) ?? ctx.hisRepo.readCommitted(ctx.hisRepo.currentBranch(), f)
    const text = read(p)
    if (text == null) return json(res, 404, { error: `文件不存在: ${p}` })
    const mine = ctx.hisOps.parseOps(text)
    // 镜像 = 同目录下动作相反（PAUSE↔RESUME）的 .ops；工作区未提交的新文件也要能看见
    const siblings = ctx.hisRepo.treeWithState(ctx.hisRepo.currentBranch()).filter((e) => e.kind === 'ops' && e.path !== p)
    let mirror = null
    for (const s of siblings) {
      const t = read(s.path)
      if (t != null && ctx.hisOps.parseOps(t).action && ctx.hisOps.parseOps(t).action !== mine.action) { mirror = { path: s.path, text: t }; break }
    }
    if (!mirror) return json(res, 200, { path: p, mirror: null, note: '未找到镜像文件（同分包内动作相反的 .ops）——配对校验需要暂停/恢复成对存在' })
    const pauseText = mine.action === 'PAUSE' ? text : mirror.text
    const resumeText = mine.action === 'PAUSE' ? mirror.text : text
    const jobPaths = [...(pauseText + '\n' + resumeText).matchAll(/JOB\s+IF\s+EXISTS\s+(\S+)/g)].map((m) => m[1])
    const names = ctx.hisOps.provider.catalog.filter((j) => jobPaths.includes(j.path)).map((j) => j.name)
    return json(res, 200, {
      path: p, mirror: mirror.path,
      ...ctx.hisOps.provider.check({ names, pauseText, resumeText }),
    })
  }

  // 会话事件流
  if (url.pathname === '/api/sessions') return json(res, 200, { sessions: listSessions() })
  const evMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/events$/)
  if (evMatch) {
    const events = getEvents(evMatch[1])
    if (!events) return json(res, 404, { error: 'session not found' })
    const after = Number(url.searchParams.get('after') ?? -1)
    return json(res, 200, {
      events: events.filter((e) => e.seq > after),
      live: liveAgents.has(evMatch[1]),
      pendingApprovals: [...pendingApprovals.entries()].map(([id, p]) => ({
        id, toolName: p.req.toolName, reason: p.req.reason ?? '', at: p.at,
      })),
    })
  }

  // 发消息（无 sessionId 则新建会话）
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    let agent = body.sessionId ? liveAgents.get(body.sessionId) : null
    if (!agent) {
      await ctx.get('loader')?.await() // 与 headless 一致：等插件树就绪
      const selection = ctx.agentDefaultModel.currentSelection()
      const sessionId = SessionId(`session-${randomUUID()}`)
      const created = await ctx.agents.create({
        sessionId, meta: { cwd: process.cwd() },
        agentOptions: { provider: selection.provider, model: selection.model },
        setup: (agentCtx) => {
          installModelSelection(agentCtx, { current: selection, assembled: void 0 })
        },
      })
      agent = created.agent
      await agent.whenIdle()
      liveAgents.set(sessionId, agent)
      console.error(`[studio-ui] 新会话 ${sessionId}`)
    }
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: body.text }],
      source: { kind: 'user' },
    }))
    // turn 落盘后 flush Session Log（历史会话重放依赖它）
    agent.whenIdle()
      .then(() => ctx.sessions?.flush(agent.session))
      .catch((e) => console.error(`[studio-ui] flush 失败: ${e?.message ?? e}`))
    const sid = [...liveAgents.entries()].find(([, a]) => a === agent)?.[0]
    return json(res, 200, { sessionId: sid })
  }

  // 审批决策回写
  const apMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/)
  if (apMatch && req.method === 'POST') {
    const body = JSON.parse(await readBody(req))
    const p = pendingApprovals.get(apMatch[1])
    if (!p) return json(res, 404, { error: 'approval not pending' })
    pendingApprovals.delete(apMatch[1])
    const outcome = body.outcome === 'allowed-once' ? 'allowed-once' : 'rejected'
    console.error(`[studio-ui] 审批决策: ${apMatch[1]} ${p.req.toolName} -> ${outcome}（${body.by ?? 'UI 用户'}）`)
    p.resolve(outcome)
    return json(res, 200, { ok: true, outcome })
  }

  json(res, 404, { error: 'not found' })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => resolve(s || '{}'))
    req.on('error', reject)
  })
}

export function apply(ctx) {
  mountUiAnswerer(ctx)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    route(ctx, req, res, url).catch((e) => json(res, 500, { error: String(e?.message ?? e) }))
  })
  server.listen(PORT, () => {
    console.error(`[studio-ui] 三栏工作台: http://localhost:${PORT}/`)
  })
  ctx.effect(() => () => server.close())
}
