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
import { fileURLToPath } from 'node:url'

export const name = 'his-studio-ui'
export const inject = ['tools', 'agents', 'sessions', 'agentDefaultModel', 'hisModeling', 'hisRepo', 'hisDevAst', 'hisDryrun', 'hisCicd']

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
      if (branch === current && ent.kind === 'etl' && !ent.uncommitted && !dirtySet.has(ent.path)) {
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
      const kind = p.endsWith('.dag') ? 'dag' : 'etl'
      const parsed = kind === 'dag' ? ctx.hisDevAst.parseDag(text) : ctx.hisDevAst.parseEtl(text)
      return json(res, 200, { path: p, kind, text, parsed })
    } catch (e) { return json(res, 400, { error: e.message }) }
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
