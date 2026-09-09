/** HIS 代码仓树插件 host 端：经 ctx.webServer 暴露 /his-repo/* JSON 端点给浏览器 client（同源 fetch）。
 *  不依赖 Typert codegen 链：标准 dsh web 的 host 进程自带 dsh-host-webserver（7400），注册命名路由即可。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver' // webServer Context 合并

/** hisRepo 服务接口（workspace-repo 注册的服务）——最小面，够代码仓树用。 */
interface HisRepoFace {
  branches(): string[]
  currentBranch(): string
  treeWithState(branch: string): Array<{ path: string; kind: string; dirty?: string; uncommitted?: boolean }>
  readWorking(path: string): string | null
  readCommitted(branch: string, path: string): string | null
  writeWorking(path: string, content: string): unknown
  /** 单调递增版本号：任何写操作/外部 git 变化自增。 */
  revision: number
  /** 订阅仓变更；返回退订函数。 */
  subscribe(fn: () => void): () => void
}

/** hisModeling 服务接口（domain-tools-modeling 注册的 Provider）——模型目录 + ER 图。 */
interface ModelField { n: string; t: string; c: string; std: string | null; pk?: boolean; skip?: string }
interface HisModelFace {
  _state: {
    models: Record<string, {
      file: string; name: string; cn: string; domain: string; layer: string
      version: string; published: boolean
      fields: ModelField[]
    }>
  }
  readFields(file: string): { model: string; file: string; cn: string; domain: string; layer: string; version: string; published: boolean; fields: ModelField[]; bindingRate: string }
  genDdl(file: string): { model: string; version: string; ddl: string }
}

/** hisAnchor 服务接口（workspace-anchor 注册）——锚定条读当前锚定 + 切换。 */
interface HisAnchorFace {
  getCurrent(): null | { kind: string; file?: string; branch?: string; dir?: string | null; path?: string | null; key: string; at: string }
  anchor(args: { file?: string; branch?: string; dir?: string | null; path?: string | null }): unknown
}

/** hisDevAst 服务接口（domain-tools-dev 注册）——血缘上下行。 */
interface HisDevAstFace {
  upstream(repo: unknown, path: string): unknown[]
  downstream(repo: unknown, path: string): unknown[]
  parseEtl(text: string): unknown
  parseDag(text: string): unknown
  scanScriptJob(repo: unknown, modeling: unknown, onto: unknown, path: string): any | null
}

/** hisDryrun 服务接口（domain-tools-dev 注册）——ETL dry-run 采样。 */
interface HisDryrunFace {
  dryrun(args: { sql: string; parsed: unknown; sampleRows?: number }): Promise<unknown>
}

/** hisOps 服务接口（domain-tools-ops 注册）——.ops 解析 + 配对校验。 */
interface HisOpsFace {
  parseOps(text: string): { action?: string; count?: number; layers?: unknown[]; [k: string]: unknown }
  provider: { catalog: Array<{ path: string; name: string }>; check(args: { names: string[]; pauseText: string; resumeText: string }): unknown }
}

/** hisOntology 服务接口（domain-tools-ontology 注册）——本体扫描。 */
interface HisOntologyFace {
  classifyJob(job: unknown, ctx: unknown): { ok: boolean; jobType?: string; jobTypeName?: string; instance?: string; instanceName?: string; signals?: unknown[]; [k: string]: unknown }
  policiesFor(jobTypeId: string): { policies?: Array<{ id: string; name: string; goal?: string; via?: string }> }
  rulesFor(jobTypeId: string): { ruleCount?: number; rules?: Array<{ id: string; name: string; severity?: string; policy?: string; impl?: { engine?: string; ruleset?: string } | null; via?: string }> }
  scanPlan(jobTypeId: string): unknown
  consistencyCheck(path: string, ctx: unknown): { ok: boolean; status?: string; conflicts?: Array<{ field: string; kind: string; design?: string; code?: string; note?: string }>; releaseBaseline?: unknown; note?: string }
  reasonChain(ctx: unknown, path: string): { ok: boolean; nodes?: Array<{ id: string; type: string; name: string; sub?: string }>; edges?: Array<{ type: string; from: string; to: string; label: string }> }
  anchoredObject(ctx: unknown): { ok: boolean; anchored?: { objectType?: { type: string; typeName: string }; name?: string }; objectType?: { type: string; typeName: string }; relations?: Array<{ link: string; count: number }>; why?: string }
  trace(): unknown
  ontVersion: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hisRepo: HisRepoFace
    hisModeling: HisModelFace
    hisAnchor: HisAnchorFace
    hisDevAst: HisDevAstFace
    hisOntology: HisOntologyFace
    hisDryrun: HisDryrunFace
    hisOps: HisOpsFace
  }
}

export const name = 'ui-his-repo'
export const inject = ['webServer', 'hisRepo', 'hisModeling', 'hisAnchor', 'hisDevAst', 'hisOntology', 'hisDryrun', 'hisOps']

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (c) => { data += c })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** 按目标路径生成新建文件模板（目录前缀决定文件类型）。 */
function createTemplate(path: string, job: string): { text: string } | { error: string } {
  if (path.startsWith('dbscript/') && path.endsWith('.sql')) {
    return { text: `-- @job: ${job}
-- @engine: Hive SQL
-- @target: dwd.${job}
-- @kind: dbscript
-- 数据库脚本 / DDL 订正；与模型设计态一致性走本体扫描
ALTER TABLE dwd.${job} ADD COLUMNS (
  -- 在此逐列订正，可挂 @std/v 标准引用注释（如 col_a STRING -- @std/tax_id v1）
  col_a STRING
  ,col_b DECIMAL(18,2)
);
` }
  }
  if (path.startsWith('dag/') && path.endsWith('.dag')) {
    return { text: `# @job: ${job} 调度作业
# ref 指向独立的 .etl 文件 —— 两文件分离提交、分离审计
ref: etl/${job}.etl
cron: "0 2 * * *"
depends: []
retry:
  maxAttempts: 3
  intervalSeconds: 300
alert:
  channel: 财税域值班群
  on: [failure, timeout]
timeout: 1800
` }
  }
  if (path.startsWith('etl/') && path.endsWith('.etl')) {
    return { text: `-- @job: ${job}
-- @engine: hive-sql
-- @source:
-- @target: dwd.${job}
INSERT OVERWRITE TABLE dwd.${job} PARTITION(dt='\${bizdate}')
SELECT
  -- 字段 SELECT ... FROM ods.xxx WHERE dt='\${bizdate}'
` }
  }
  if (path.startsWith('ops/') && path.endsWith('.ops')) {
    return { text: `# @action: PAUSE
# @scope:
# 运维编排（大促暂停/恢复）：PAUSE/RESUME 成对；DROP/STOP/KILL 属 fail-closed 高危，不生成
# 命令清单（JOB IF EXISTS ...）
` }
  }
  if (path.startsWith('svc/') && path.endsWith('.svc')) {
    return { text: `# @service: ${job}
# 服务定义（svc）
version: v1
` }
  }
  return { error: '不支持的目标路径：仅支持 dbscript/ dag/ etl/ ops/ svc/ 目录下新建（文件名后缀需匹配目录类型）' }
}

/** 挂载 /his-repo/* 只读 JSON 端点（分支列表 / 当前分支 / 文件树）。写操作（新建 SQL 等）后续接 gated 流程。 */
export function apply(ctx: Context): void {
  const repo = () => ctx.hisRepo
  const branches = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/branches',
    handler: async (_req, res) => {
      try { json(res, 200, { branches: repo().branches() }) }
      catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  const current = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/current-branch',
    handler: async (_req, res) => {
      try { json(res, 200, { current: repo().currentBranch() }) }
      catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  const tree = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/tree',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const branch = url.searchParams.get('branch') ?? repo().currentBranch()
        json(res, 200, { branch, tree: repo().treeWithState(branch) })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // SSE：仓变更推送（revision 变化即写 data 事件；浏览器据此自动刷新树）
  const events = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/events',
    handler: async (req, res) => {
      try {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.write('retry: 2000\n\n')
        const r = repo()
        let last = typeof r.revision === 'number' ? r.revision : -1
        res.write(`data: ${JSON.stringify({ revision: r.revision })}\n\n`)
        const off = r.subscribe(() => {
          const cur = r.revision
          if (cur !== last) {
            last = cur
            res.write(`data: ${JSON.stringify({ revision: cur })}\n\n`)
          }
        })
        req.on('close', () => off())
      } catch (e) {
        try { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) })) } catch { /* 连接已断 */ }
      }
    },
  })
  // 模型目录（只读）：模型列表按 layer 分组，含字段绑定率（bound/total）
  const models = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/models',
    handler: async (_req, res) => {
      try {
        const list = Object.values(ctx.hisModeling._state.models).map((m) => ({
          file: m.file, name: m.name, cn: m.cn, domain: m.domain, layer: m.layer,
          version: m.version, published: m.published,
          bound: m.fields.filter((f) => f.std).length, total: m.fields.length,
        }))
        json(res, 200, { models: list })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 锚定条：GET 读当前锚定对象 / POST 切换锚点（file=模型，branch[+dir]=代码仓三级）
  const anchor = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/anchor',
    handler: async (req, res) => {
      try {
        if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          const result = await ctx.hisAnchor.anchor(body)
          json(res, 200, { anchor: ctx.hisAnchor.getCurrent(), result })
        } else {
          json(res, 200, { anchor: ctx.hisAnchor.getCurrent() })
        }
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 工作区文件：GET 读（working 优先，view=committed 读已提交）/ POST 写工作区未提交态
  const file = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/file',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const p = url.searchParams.get('path')
        if (!p) return json(res, 400, { error: 'path required' })
        if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          if (typeof body.content !== 'string') return json(res, 400, { error: 'content required' })
          const written = repo().writeWorking(p, body.content)
          json(res, 200, { ok: true, ...(written as object) })
        } else {
          const view = url.searchParams.get('view')
          const text = view === 'committed'
            ? repo().readCommitted(repo().currentBranch(), p)
            : repo().readWorking(p) ?? repo().readCommitted(repo().currentBranch(), p)
          if (text == null) return json(res, 404, { error: '文件不存在: ' + p })
          const kind = p.endsWith('.dag') ? 'dag' : p.endsWith('.ops') ? 'ops' : p.endsWith('.sql') ? 'script' : p.endsWith('.svc') ? 'svc' : 'etl'
          const parsed = kind === 'dag' ? ctx.hisDevAst.parseDag(text)
            : kind === 'ops' ? ctx.hisOps.parseOps(text)
            : kind === 'etl' ? ctx.hisDevAst.parseEtl(text)
            : null
          json(res, 200, { path: p, kind, text, parsed })
        }
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 血缘：上游/下游作业列表（文字呈现，X6 图第二步）
  const lineage = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/lineage',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const p = url.searchParams.get('path')
        if (!p) return json(res, 400, { error: 'path required' })
        json(res, 200, {
          path: p,
          upstream: ctx.hisDevAst.upstream(repo(), p),
          downstream: ctx.hisDevAst.downstream(repo(), p),
        })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 本体扫描：分类 + 策略/规则 + 一致性对账（冲突现场派生）+ 推理链（与 studio /api/repo/onto-scan 同源）
  const scan = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/scan',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const p = url.searchParams.get('path')
        if (!p) return json(res, 400, { error: 'path required' })
        const text = repo().readWorking(p) ?? repo().readCommitted(repo().currentBranch(), p)
        if (text == null) return json(res, 404, { error: '文件不存在: ' + p })
        const onto = ctx.hisOntology
        const engine = (text.match(/--\s*@engine:\s*(\S+)/) || [])[1] ?? 'Hive SQL'
        const ast = /ADD\s+COLUMNS/i.test(text) ? { alterAddColumns: true } : /\b(UPDATE|INSERT\s+INTO)\b/i.test(text) ? { dml: true } : {}
        const anchorSvc = {
          getCurrent: () => {
            const cur = ctx.hisAnchor.getCurrent()
            if (cur) return cur
            const dir = p.split('/').slice(0, -1).join('/')
            return dir ? { kind: 'repo', branch: repo().currentBranch(), dir, key: 'repo:' + repo().currentBranch() + ':' + dir } : null
          },
        }
        const octx = { repo: repo(), modeling: ctx.hisModeling, anchor: anchorSvc }
        const cls = onto.classifyJob({ path: p, engine, ast }, octx)
        const pol = cls.ok ? onto.policiesFor(cls.jobType as string) : null
        const rl = cls.ok ? onto.rulesFor(cls.jobType as string) : null
        const plan = cls.ok ? onto.scanPlan(cls.jobType as string) : null
        const match = cls.ok ? onto.consistencyCheck(p, octx) : null
        const chain = onto.reasonChain(octx, p)
        const anchored = onto.anchoredObject(octx)
        const scan = ctx.hisDevAst.scanScriptJob(repo(), ctx.hisModeling, onto, p)
        const scanVerdict = scan
          ? ([scan.design?.pass, scan.sql?.pass, scan.consistency?.pass].some((x) => x === false) ? 'diff'
            : [scan.design?.pass, scan.sql?.pass].every((x) => x === true) && scan.consistency?.pass === null ? 'pass-unknown' : 'pass')
          : 'no-scan'
        const findings = (match?.conflicts || []).map((c, i) => ({
          id: 'F-' + (101 + i),
          severity: c.kind === 'MATCH-CONFLICT' ? '告警 · 可修复' : c.kind === 'BEHIND' ? 'BEHIND · 提示不阻断' : 'info',
          field: c.field,
          desc: c.field + '：设计 ' + (c.design ?? '—') + '、代码 ' + (c.code || '未实现') + (c.note ? ' —— ' + c.note : ''),
          fix: c.kind === 'MATCH-CONFLICT' ? { column: c.field, from: c.code, to: c.design } : null,
        }))
        json(res, 200, {
          path: p, classify: cls, policies: pol?.policies ?? [], rules: rl ?? null,
          scanPlan: plan, consistency: match, findings, chain, anchored, scan, scanVerdict,
          trace: onto.trace(), ontVersion: onto.ontVersion,
        })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 分步扫描（classify → policies → execute）：供 UI 展示扫描过程（获取对象类型 → 关联策略/规则 → 调用规则能力扫描）
  const scanStep = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/scan-step',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const p = url.searchParams.get('path')
        const step = url.searchParams.get('step')
        if (!p || !step) return json(res, 400, { error: 'path + step required' })
        const text = repo().readWorking(p) ?? repo().readCommitted(repo().currentBranch(), p)
        if (text == null) return json(res, 404, { error: '文件不存在: ' + p })
        const onto = ctx.hisOntology
        const engine = (text.match(/--\s*@engine:\s*(\S+)/) || [])[1] ?? 'Hive SQL'
        const ast = /ADD\s+COLUMNS/i.test(text) ? { alterAddColumns: true } : /\b(UPDATE|INSERT\s+INTO)\b/i.test(text) ? { dml: true } : {}
        const anchorSvc = {
          getCurrent: () => {
            const cur = ctx.hisAnchor.getCurrent()
            if (cur) return cur
            const dir = p.split('/').slice(0, -1).join('/')
            return dir ? { kind: 'repo', branch: repo().currentBranch(), dir, key: 'repo:' + repo().currentBranch() + ':' + dir } : null
          },
        }
        const octx = { repo: repo(), modeling: ctx.hisModeling, anchor: anchorSvc }
        const cls = onto.classifyJob({ path: p, engine, ast }, octx)
        if (step === 'classify') {
          json(res, 200, { classify: cls, anchored: onto.anchoredObject(octx) })
        } else if (step === 'policies') {
          const pol = cls.ok ? onto.policiesFor(cls.jobType as string) : null
          const rl = cls.ok ? onto.rulesFor(cls.jobType as string) : null
          const plan = cls.ok ? onto.scanPlan(cls.jobType as string) : null
          json(res, 200, { policies: pol?.policies ?? [], rules: rl, scanPlan: plan })
        } else if (step === 'execute') {
          const match = cls.ok ? onto.consistencyCheck(p, octx) : null
          const chain = onto.reasonChain(octx, p)
          const scan = ctx.hisDevAst.scanScriptJob(repo(), ctx.hisModeling, onto, p)
          const scanVerdict = scan
            ? ([scan.design?.pass, scan.sql?.pass, scan.consistency?.pass].some((x) => x === false) ? 'diff'
              : [scan.design?.pass, scan.sql?.pass].every((x) => x === true) && scan.consistency?.pass === null ? 'pass-unknown' : 'pass')
            : 'no-scan'
          const findings = (match?.conflicts || []).map((c, i) => ({
            id: 'F-' + (101 + i),
            severity: c.kind === 'MATCH-CONFLICT' ? '告警 · 可修复' : c.kind === 'BEHIND' ? 'BEHIND · 提示不阻断' : 'info',
            field: c.field,
            desc: c.field + '：设计 ' + (c.design ?? '—') + '、代码 ' + (c.code || '未实现') + (c.note ? ' —— ' + c.note : ''),
            fix: c.kind === 'MATCH-CONFLICT' ? { column: c.field, from: c.code, to: c.design } : null,
          }))
          json(res, 200, { consistency: match, chain, scan, scanVerdict, findings, trace: onto.trace(), ontVersion: onto.ontVersion })
        } else {
          json(res, 400, { error: 'unknown step: ' + step })
        }
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 模型详情（ER 图 + DDL）：字段列表 + 绑定率 + DDL（ddl_gen）
  const model = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/model',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const file = url.searchParams.get('file')
        if (!file) return json(res, 400, { error: 'file required' })
        const detail = ctx.hisModeling.readFields(file)
        let ddl: string | null = null
        try { ddl = ctx.hisModeling.genDdl(file).ddl } catch { ddl = null }
        json(res, 200, { ...detail, ddl })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 新建文件：按目录类型生成模板（POST {path}）
  const create = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/create',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
        const body = JSON.parse((await readBody(req)) || '{}')
        const path = String(body.path ?? '')
        if (!path || path.includes('..')) return json(res, 400, { error: '非法路径: ' + path })
        const existing = repo().readWorking(path) ?? repo().readCommitted(repo().currentBranch(), path)
        if (existing != null) return json(res, 200, { created: false, reason: '文件已存在: ' + path })
        const job = path.split('/').pop()!.replace(/\.(etl|dag|ops|svc|sql)$/, '')
        const t = createTemplate(path, job)
        if ('error' in t) return json(res, 400, t)
        const written = repo().writeWorking(path, t.text)
        json(res, 200, { created: true, path, ...(written as object) })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // 测试运行（ETL dry-run 采样）
  const test = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/test',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
        const body = JSON.parse((await readBody(req)) || '{}')
        const p = String(body.path ?? '')
        if (!p.endsWith('.etl')) return json(res, 400, { error: '仅支持 .etl 作业的 dry-run 采样' })
        const text = repo().readWorking(p)
        if (text == null) return json(res, 404, { error: '文件不存在: ' + p })
        const parsed = ctx.hisDevAst.parseEtl(text)
        const result = await ctx.hisDryrun.dryrun({ sql: text, parsed, sampleRows: body.sampleRows ?? 100 })
        json(res, 200, { path: p, at: new Date().toISOString(), ...(result as object) })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  // OPS 配对校验（.ops 找镜像文件跑自检三件套）
  const opsCheck = ctx.webServer.register({
    kind: 'exact',
    path: '/his-repo/ops-check',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const p = url.searchParams.get('path')
        if (!p?.endsWith('.ops')) return json(res, 400, { error: 'path 需指向 .ops 文件' })
        const read = (f: string) => repo().readWorking(f) ?? repo().readCommitted(repo().currentBranch(), f)
        const text = read(p)
        if (text == null) return json(res, 404, { error: '文件不存在: ' + p })
        const mine = ctx.hisOps.parseOps(text)
        const siblings = repo().treeWithState(repo().currentBranch()).filter((e) => e.kind === 'ops' && e.path !== p)
        let mirror: { path: string; text: string } | null = null
        for (const s of siblings) {
          const t = read(s.path)
          if (t != null && ctx.hisOps.parseOps(t).action && ctx.hisOps.parseOps(t).action !== mine.action) { mirror = { path: s.path, text: t }; break }
        }
        if (!mirror) return json(res, 200, { path: p, mirror: null, note: '未找到镜像文件（同分包内动作相反的 .ops）——配对校验需要暂停/恢复成对存在' })
        const pauseText = mine.action === 'PAUSE' ? text : mirror.text
        const resumeText = mine.action === 'PAUSE' ? mirror.text : text
        const jobPaths = [...(pauseText + '\n' + resumeText).matchAll(/JOB\s+IF\s+EXISTS\s+(\S+)/g)].map((m) => m[1])
        const names = ctx.hisOps.provider.catalog.filter((j) => jobPaths.includes(j.path)).map((j) => j.name)
        json(res, 200, { path: p, mirror: mirror.path, ...(ctx.hisOps.provider.check({ names, pauseText, resumeText }) as object) })
      } catch (e) { json(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
    },
  })
  ctx.effect(() => () => { branches(); current(); tree(); models(); anchor(); file(); lineage(); scan(); scanStep(); model(); create(); test(); opsCheck() }, 'ui-his-repo: web routes')
}