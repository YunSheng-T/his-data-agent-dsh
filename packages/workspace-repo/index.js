// @his/workspace-repo — 代码仓工作区插件（P1-1）
// 职责：持有本地真实 git 仓（Provider），以 Cordis 服务 hisRepo 提供给
// 开发域工具包（P1-2）与 studio-ui（仓/分支/目录树视图）消费。
// 锚定三级（仓/分支/作业目录）的 pre-step 注入由 workspace-anchor 扩展承担。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GitRepoProvider } from './provider-git.js'
import { SEED_FILES } from './seed-repo.js'

export const name = 'his-workspace-repo'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function apply(ctx, config) {
  const dir = process.env.HIS_REPO_DIR
    ?? config?.repoDir
    ?? path.join(__dirname, '..', '..', 'runtime', 'repo-etl')

  const repo = new GitRepoProvider(dir)
  if (!repo.initialized) {
    repo.init(SEED_FILES)
    console.error(`[workspace-repo] 种子仓已初始化: ${dir}`)
  }

  ctx.provide('hisRepo', repo)
  console.error(`[workspace-repo] mounted: ${dir} · 分支: ${repo.branches().join(', ')} · 当前: ${repo.currentBranch()}`)

  ctx.effect(() => () => console.error('[workspace-repo] disposed'))
}
