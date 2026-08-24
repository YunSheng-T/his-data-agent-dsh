// @his/domain-tools-dev — 开发域工具包插件（P1-2 只读组 + P1-3 codegen/patch + P1-4 闸门）
// inject hisRepo（@his/workspace-repo 注册）+ hisModeling（@his/domain-tools-modeling 注册）：
// 「建模产出是开发的输入」经 Cordis 服务层成立，不跨包 import。
// P3（V10）：git_add/git_commit 合并更名为 repo_commit（提交即自动触发 CICD 流水线）；
// 新增 cicd_scan_report 只读工具 + hisCicd 服务透出（studio-ui 文件行扫描点的数据源）。

import { buildDevTools, scanEtlJob, scanOpsFile } from './definitions.js'
import { LocalSimDryrunProvider } from './provider-dryrun.js'
import { LocalSchedProvider } from './provider-sched.js'
import { LocalCicdProvider, scanVerdict } from './provider-cicd.js'
import { parseEtl, parseDag } from './ast.js'
import { jobIndex, upstream, downstream, jobsForModel } from './lineage.js'

export const name = 'his-domain-tools-dev'
export const inject = ['tools', 'hisRepo', 'hisModeling']

export function apply(ctx) {
  const dryrun = new LocalSimDryrunProvider()
  const sched = new LocalSchedProvider()
  const cicd = new LocalCicdProvider()
  const tools = buildDevTools({ repo: ctx.hisRepo, modeling: ctx.hisModeling, dryrun, sched, cicd })
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
  // hisCicd：CICD 适配器透出（studio-ui 文件行扫描点 / 扫描报告查询的数据源）
  ctx.provide('hisCicd', cicd)

  // 启动补登：为当前 HEAD 的已提交 .etl/.ops 生成首条流水线报告（etl_legacy 未接入平台，不被扫描）
  try {
    const branch = ctx.hisRepo.currentBranch()
    const commitId = ctx.hisRepo.git('rev-parse', '--short', 'HEAD')
    const scans = {}
    for (const e of ctx.hisRepo.tree(branch)) {
      if (e.path.startsWith('etl_legacy/')) continue
      const s = e.kind === 'etl' ? scanEtlJob(ctx.hisRepo, ctx.hisModeling, e.path)
        : e.kind === 'ops' ? scanOpsFile(ctx.hisRepo, e.path)
          : null
      if (s) scans[e.path] = s
    }
    if (Object.keys(scans).length) {
      const p = cicd.trigger({ commitId, branch, scans })
      console.error(`[domain-tools-dev] 启动补登流水线 #${p.id}：${Object.keys(scans).length} 个作业完成扫描（${Object.entries(scans).map(([f, s]) => `${f.split('/').pop()}:${scanVerdict(s)}`).join(' ')}）`)
    }
  } catch (e) {
    console.error(`[domain-tools-dev] 启动补登流水线跳过: ${e?.message ?? e}`)
  }

  console.error(`[domain-tools-dev] registered: ${tools.map((t) => `${t.name}(${t.risk})`).join(' ')} · dryrun=${dryrun.kind} · sched=${sched.kind} · cicd=${cicd.kind}`)
}
