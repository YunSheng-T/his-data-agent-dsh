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
}

/** hisModeling 服务接口（domain-tools-modeling 注册的 Provider）——模型目录用。 */
interface HisModelFace {
  _state: {
    models: Record<string, {
      file: string; name: string; cn: string; domain: string; layer: string
      version: string; published: boolean
      fields: Array<{ n: string; t: string; c: string; std: string | null; pk?: boolean; skip?: string }>
    }>
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    hisRepo: HisRepoFace
    hisModeling: HisModelFace
  }
}

export const name = 'ui-his-repo'
export const inject = ['webServer', 'hisRepo', 'hisModeling']

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
  ctx.effect(() => () => { branches(); current(); tree(); models() }, 'ui-his-repo: web routes')
}