// @his/domain-tools-ontology — 本体驱动扫描工具域插件（V14/V15）
// Seam 三层：definitions.js = Definition 层（契约）；provider-mock.js = Provider 层（本体平台可替换替身）；
// 本文件 = 装配（注册工具进 ctx.tools + 透出 hisOntology 服务供 studio/workspace-anchor 消费）。
// 依赖：hisRepo（读作业文件做 AST 特征检测），不跨包 import 对方文件（走 Cordis 服务）。

import { buildDefinitions } from './definitions.js'
import { provider } from './provider-mock.js'

export const name = 'his-domain-tools-ontology'
export const inject = ['tools', 'hisRepo']

export function apply(ctx, config = {}) {
  const p = config.provider ?? provider
  ctx.provide('hisOntology', p)
  const defs = buildDefinitions(p, { repo: ctx.hisRepo })
  for (const def of defs) ctx.tools.register(def)
  console.error('[domain-tools-ontology] registered: ' + defs.map((d) => d.name + '(' + d.risk + ')').join(' '))
}
