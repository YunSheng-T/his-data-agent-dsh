// @his/workspace-anchor — 锚定与上下文注入插件（P0 建模锚点 → P1 三级扩展）
//
// 设计（技术方案第 5 节 + M0 穿刺修正 + P1 任务书交付物 1）：
//   1) 锚定事件：工作区切换锚点时写入锚定。headless 阶段用 workspace_anchor 工具承载；
//      UI 阶段由 studio-ui 切换时调同一服务。自定义会话事件类型的持久化注册面 dsh 尚未开放，
//      锚定信息经由注入的 user/message 落 Session Log（修正 3 的绕法 a）。
//   2) 上下文注入：挂在 agent/pre-step waterfall 上，锚定变化时把结构化摘要作为一条合成
//      user 消息注入；进入 step 的消息会被循环写入 Session Log，满足「模型可见即落日志」。
//   3) 注入摘要不是全文；全文由模型按需调域工具拉取。
//   4) 同一锚定只注入一次（按 key 去重），不轰炸每个 step。
//   5) P1 三级锚定：仓 / 分支 / 作业目录。切分支 = hisRepo.checkout（真实 git 切换），
//      分支隔离语义由 git 原生保证（M1a 穿刺）。
//
// 依赖：inject hisModeling + hisRepo（服务由各自插件注册），不直接 import 对方包内文件。

export const name = 'his-workspace-anchor'
export const inject = ['tools', 'hisModeling', 'hisRepo', 'hisDevAst']

let current = null // { kind:'model', file, key, at } | { kind:'repo', branch, dir, key, at }
let lastInjectedKey = null

function modelAnchorText(s) {
  if (s.error) return `[workspace.anchor] 锚定失败：${s.error}`
  return [
    `[workspace.anchor] 当前工作区锚定对象（建模空间 · 结构化摘要，全文请调 model_read_fields）`,
    `文件: ${s.file} · ${s.cn}`,
    `空间: ${s.space} · 域: ${s.domain} · 分层: ${s.layer}`,
    `版本: ${s.version}${s.published ? ' · 已发布' : ' · 未发布'}`,
    `字段: ${s.fieldCount} 个 · 标准绑定率: ${s.bindingRate}`,
    `未绑定字段: ${s.unbound.length ? s.unbound.join(', ') : '无'}`,
    `数据标准库: ${s.stdLibVersion}`,
  ].join('\n')
}

function repoAnchorText(repo, branch, dir) {
  const tree = repo.treeWithState(branch)
  const inDir = dir ? tree.filter((e) => e.path.startsWith(dir.replace(/\/?$/, '/'))) : tree
  const dirty = tree.filter((e) => e.dirty || e.uncommitted)
  const t = repo.currentTenant?.() // P3 租户层（门面方法，单仓 Provider 无此方法时降级不显示）
  return [
    `[workspace.anchor] 当前工作区锚定对象（开发空间 · 代码仓视图）`,
    ...(t ? [`租户: ${t.id}（${t.cn}）${t.dataTenant ? '' : ' · 非数据租户 · 只读'} · 全地址: ${repo.address?.() ?? ''}`] : []),
    `仓: ${repo.dir.split('/').pop()} · 分支: ${branch}${dir ? ` · 作业目录: ${dir}` : ''}`,
    `作业文件: etl ${inDir.filter((e) => e.kind === 'etl').length} 个 · dag ${inDir.filter((e) => e.kind === 'dag').length} 个${dir ? `（目录 ${dir} 内）` : ''}`,
    `未提交变更: ${dirty.length ? dirty.map((e) => `${e.dirty} ${e.path}`).join('；') : '无（工作区干净）'}`,
    `提示: 已提交视图与未提交态严格区分；切到 main 看不到 feature 未合并的文件`,
    `提交走 repo_commit（暂存+提交一体，自动触发 CICD 流水线）；作业扫描报告用 cicd_scan_report 查询`,
  ].join('\n')
}

/** P2-1 反向提醒：模型升版后，基于旧版本生成的作业在锚定摘要里点名（实时计算，不落状态） */
function staleJobs(ctx, repo, branch) {
  const { etls } = ctx.hisDevAst.jobIndex(repo)
  const seen = new Map() // modelFile -> 当前版本
  const stale = []
  for (const e of etls) {
    const mf = e.parsed.modelFile
    if (!mf || !e.parsed.modelVersion) continue
    if (!seen.has(mf)) seen.set(mf, ctx.hisModeling.anchorSummary(mf)?.version ?? null)
    const cur = seen.get(mf)
    if (cur && cur !== e.parsed.modelVersion) stale.push({ path: e.path, baseVersion: e.parsed.modelVersion, currentVersion: cur, model: mf })
  }
  return stale
}

export function apply(ctx) {
  // 锚定工具：UI/人通过它切换锚点（等价于 UI 里点击文件/分支/目录）
  // 两种用法：{file} 锚定模型；{branch, dir?} 锚定代码仓三级定位
  ctx.tools.register({
    name: 'workspace_anchor',
    risk: 'read',
    description: '切换工作区锚点：传 file 锚定模型文件；传 branch（可带 dir 作业目录）锚定代码仓定位。返回锚定对象的结构化摘要',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '模型文件名，如 dwd_tax_declaration.model' },
        branch: { type: 'string', description: '代码仓分支名（不存在时自动从当前分支新建），如 feature/invoice' },
        dir: { type: 'string', description: '作业目录（配合 branch），如 etl/dwd 或 dag' },
      },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    execute: async (args) => {
      if (args.branch) {
        const repo = ctx.hisRepo
        const exists = repo.branches().includes(args.branch)
        const actual = repo.checkout(args.branch, { create: !exists })
        const dir = args.dir ?? null
        if (dir && !/^(etl|dag)(\/[a-z0-9_-]+)*$/i.test(dir)) throw new Error(`非法作业目录: ${dir}（只接受 etl/* 或 dag）`)
        current = { kind: 'repo', branch: actual, dir, key: `repo:${actual}:${dir ?? ''}@${repo.isClean() ? 'clean' : 'dirty'}`, at: new Date().toISOString() }
        console.error(`[anchor] 锚定 -> ${current.key}${exists ? '' : '（新建分支）'}`)
        const stale = staleJobs(ctx, repo, actual)
        return { space: '开发空间', repo: repo.dir.split('/').pop(), branch: actual, created: !exists, dir, tree: repo.treeWithState(actual), staleJobs: stale }
      }
      if (args.file) {
        const s = ctx.hisModeling.anchorSummary(args.file)
        current = { kind: 'model', file: args.file, key: `model:${args.file}@${s.version ?? '?'}`, at: new Date().toISOString() }
        console.error(`[anchor] 锚定 -> ${current.key}`)
        return s
      }
      throw new Error('workspace_anchor 需要 file（模型）或 branch（代码仓）参数')
    },
  })

  // 上下文注入：锚定变化时把摘要注入下一个 step
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || !current) return decision
    if (current.key === lastInjectedKey) return decision
    lastInjectedKey = current.key
    let text
    if (current.kind === 'repo') {
      text = repoAnchorText(ctx.hisRepo, current.branch, current.dir)
      const stale = staleJobs(ctx, ctx.hisRepo, current.branch)
      if (stale.length) {
        text += '\n' + [
          `⚠ 模型已更新，以下作业代码基于旧版本生成（注释里的标准引用可能过期）：`,
          ...stale.map((s) => `  - ${s.path}（基线 ${s.baseVersion} → 当前 ${s.currentVersion}）`),
          `修复路径：impact_check 确认影响面 → etl_codegen 重新生成 → lint/dryrun → commit → publish`,
        ].join('\n')
      }
    } else {
      text = modelAnchorText(ctx.hisModeling.anchorSummary(current.file))
    }
    const summary = current.kind === 'repo'
      ? `锚定切换: ${current.branch}${current.dir ? '/' + current.dir : ''}`
      : `锚定切换: ${current.file}`
    console.error(`[anchor] 注入锚定摘要 -> step ${payload.step}`)
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        {
          role: 'user',
          content: [{ type: 'text', text }],
          id: `anchor-${Date.now()}`,
          source: { kind: 'plugin', plugin: 'his-workspace-anchor', form: 'notice', summary },
        },
      ],
    }
  })

  console.error('[anchor] workspace-anchor mounted（模型 + 代码仓三级）')
}
