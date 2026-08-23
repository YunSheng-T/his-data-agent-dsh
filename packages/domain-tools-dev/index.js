// @his/domain-tools-dev — 开发域工具包插件（P1-2 只读组 + P1-3 codegen/patch）
// inject hisRepo（@his/workspace-repo 注册）+ hisModeling（@his/domain-tools-modeling 注册）：
// 「建模产出是开发的输入」经 Cordis 服务层成立，不跨包 import。
// P1-4 追加 git_* / sched_publish（gated）。

import { buildDevTools } from './definitions.js'
import { LocalSimDryrunProvider } from './provider-dryrun.js'
import { LocalSchedProvider } from './provider-sched.js'
import { parseEtl, parseDag } from './ast.js'
import { jobIndex, upstream, downstream, jobsForModel } from './lineage.js'

export const name = 'his-domain-tools-dev'
export const inject = ['tools', 'hisRepo', 'hisModeling']

export function apply(ctx) {
  const dryrun = new LocalSimDryrunProvider()
  const sched = new LocalSchedProvider()
  const tools = buildDevTools({ repo: ctx.hisRepo, modeling: ctx.hisModeling, dryrun, sched })
  for (const t of tools) ctx.tools.register(t)
  // hisDevAst：解析/血缘能力作为 Cordis 服务透出（studio-ui 不跨包 import，走服务层）
  ctx.provide('hisDevAst', {
    parseEtl, parseDag,
    jobIndex: (repo) => jobIndex(repo),
    upstream: (repo, path) => upstream(repo, path),
    downstream: (repo, path) => downstream(repo, path),
    jobsForModel: (repo, modelFile) => jobsForModel(repo, modelFile),
  })
  // hisDryrun：dry-run 沙箱 Provider 透出（studio-ui「测试运行」页签走服务层，约束固化在 Provider）
  ctx.provide('hisDryrun', dryrun)
  console.error(`[domain-tools-dev] registered: ${tools.map((t) => `${t.name}(${t.risk})`).join(' ')} · dryrun=${dryrun.kind} · sched=${sched.kind} · hisDevAst 服务已透出`)
}
