// @his/domain-tools-modeling — 建模域工具插件（P0）
// Seam 三层：definitions.js = Definition 层（契约）；provider-mock.js = Provider 层（内存替身）；
// 本文件 = 装配（把 Definition 注册进 ctx.tools，Consumer 即模型可见的 tool schema）。

import { buildDefinitions } from './definitions.js'
import { provider } from './provider-mock.js'

export const name = 'his-domain-tools-modeling'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const p = config.provider ?? provider
  // 把 Provider 注册为 Cordis 服务：其他插件（如 workspace-anchor）经 inject 取用，
  // 不直接 import 本包内部文件（保持 Seam 边界）
  ctx.provide('hisModeling', p)
  const defs = buildDefinitions(p)
  for (const def of defs) ctx.tools.register(def)
  console.error('[domain-tools-modeling] registered: ' + defs.map((d) => `${d.name}(${d.risk})`).join(' '))
}
