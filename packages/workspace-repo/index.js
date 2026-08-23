// @his/workspace-repo — 代码仓工作区插件（P1-1 单仓 → P3 V10/V11 多租户平台化）
// 职责：持有多租户本地真实 git 仓（TenantRepoProvider 门面），以 Cordis 服务 hisRepo
// 提供给开发域工具包与 studio-ui 消费。方法面与单仓时代一致（代理当前租户仓），
// 新增租户语义：tenants()/currentTenant()/switchTenant()/address()。
// 锚定三级（仓/分支/作业目录）的 pre-step 注入由 workspace-anchor 扩展承担。

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TenantRepoProvider, TENANTS } from './provider-tenants.js'
import { SEED_FILES, SEED_EXTRAS } from './seed-repo.js'

export const name = 'his-workspace-repo'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function apply(ctx, config) {
  const root = process.env.HIS_REPO_ROOT
    ?? config?.repoRoot
    ?? path.join(__dirname, '..', '..', 'runtime', 'repos')
  const legacy = path.join(__dirname, '..', '..', 'runtime', 'repo-etl') // 单仓时代目录（自动迁移）

  const repo = new TenantRepoProvider(root, { legacyDir: legacy })
  // finance：全量种子（财税域 ETL 工程）；risk：空仓占位（空租户视图演示）
  repo.mount('finance', { ...SEED_FILES, ...SEED_EXTRAS })
  repo.mount('risk', {})
  // 老仓迁移后补种 etl_legacy 只读演示分包
  if (repo.ensureExtras('finance', SEED_EXTRAS)) console.error('[workspace-repo] 已补种 etl_legacy 只读演示分包')

  ctx.provide('hisRepo', repo)
  console.error(`[workspace-repo] mounted: ${root} · 租户: ${Object.keys(TENANTS).join(', ')} · 当前: ${repo.current} · 分支: ${repo.branches().join(', ')}`)

  ctx.effect(() => () => console.error('[workspace-repo] disposed'))
}
