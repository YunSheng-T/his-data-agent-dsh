// @his/domain-tools-ops — 运维编排域工具插件（V13 · P4-2）
// Seam 三层对齐 modeling/dev 包：definitions.js = 契约层；provider-mock.js = 演示态替身；本文件 = 装配。
// inject hisRepo（workspace-repo 注册）：.ops 写入/读取走仓 Provider，分包守卫在 Provider 层硬执行。
// hisOps 服务透出 parseOps + Provider（studio-ui 的 .ops 三页签不跨包 import，走服务层）。

import { buildOpsTools } from './definitions.js'
import { LocalOpsProvider, parseOps } from './provider-mock.js'

export const name = 'his-domain-tools-ops'
export const inject = ['tools', 'hisRepo']

export function apply(ctx, config = {}) {
  const ops = config.provider ?? new LocalOpsProvider()
  ctx.provide('hisOps', { parseOps, provider: ops, kind: ops.kind })
  const defs = buildOpsTools({ repo: ctx.hisRepo, ops })
  for (const def of defs) ctx.tools.register(def)
  console.error(`[domain-tools-ops] registered: ${defs.map((d) => `${d.name}(${d.risk})`).join(' ')} · provider=${ops.kind} · 作业目录 ${ops.catalog.length} 个`)
}
