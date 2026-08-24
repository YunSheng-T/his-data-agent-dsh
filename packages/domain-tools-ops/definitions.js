// @his/domain-tools-ops — 运维编排域工具 Definition 层（V13 · P4-2）
// 三道门 = 既有审批机制的自然映射，零新增闸门代码：
//   ops_gen(commit 级) = 第一道门·清单确认 → repo_commit(commit 级，既有) = 第二道门·序列确认 → ops_deploy(publish 级) = 第三道门·重门
// DROP/STOP 不经过本域工具：生成器结构上只产 PAUSE/RESUME；审批插件的高危词 forbidden 扫描兜底。

const jsonOut = { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] }

export function buildOpsTools({ repo, ops }) {
  const readOps = (path) => repo.readWorking(path) ?? repo.readCommitted(repo.currentBranch(), path)
  const namesFromTexts = (...texts) => {
    const paths = texts.flatMap((t) => [...t.matchAll(/JOB\s+IF\s+EXISTS\s+(\S+)/g)].map((m) => m[1]))
    return ops.catalog.filter((j) => paths.includes(j.path)).map((j) => j.name)
  }

  return [
    {
      name: 'ops_screen', risk: 'read',
      description: '作业筛选（编排第一步）：按域/类型/优先级从作业目录筛出编排目标清单，自动排除核心保留与实时任务（含排除原因）。返回清单必须先向用户回显口径，经确认后才进入生成',
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: '业务域，如 财税' },
          types: { type: 'array', items: { type: 'string' }, description: '作业类型过滤，如 ["ETL","FLASHSYNC","LTS-TASK"]' },
        },
      },
      output: jsonOut,
      execute: async ({ domain, types }) => {
        const r = ops.screen({ domain, types })
        return {
          targets: r.targets.map((j) => ({ name: j.name, cn: j.cn, type: j.type, path: j.path, schedule: j.schedule })),
          excluded: r.excluded,
          note: `命中 ${r.targets.length} 个作业 · 自动排除 ${r.excluded.length} 个（${r.excluded.map((e) => e.reason).join('；') || '无'}）`,
        }
      },
    },

    {
      name: 'ops_topo', risk: 'read',
      description: '依赖感知排序：对作业清单按血缘做拓扑分层——暂停=逆序（先下游后上游），恢复=正序（先上游后下游），同层无依赖可并行。fail-fast 语义下顺序是正确性的一部分，只允许血缘推导、不允许手写。有环时拒绝排序（转人工）',
      parameters: {
        type: 'object',
        properties: { jobs: { type: 'array', items: { type: 'string' }, description: '作业名清单（ops_screen 返回的 name）' } },
        required: ['jobs'],
      },
      output: jsonOut,
      execute: async ({ jobs }) => {
        const unknown = jobs.filter((n) => !ops.job(n))
        if (unknown.length) throw new Error(`作业目录中不存在: ${unknown.join(', ')}`)
        const t = ops.topo(jobs)
        if (t.cycle) return { sorted: false, cycle: true, note: t.note }
        const show = (layers) => layers.map((l) => `Layer ${l.n}（${l.cn} · ${l.jobs.length} 个可并行）: ${l.jobs.map((j) => j.name).join(', ')}`)
        return { sorted: true, count: t.count, pauseOrder: show(t.pause), resumeOrder: show(t.resume), note: '暂停=拓扑逆序 · 恢复=拓扑正序（镜像）· 层内并行下发' }
      },
    },

    {
      name: 'ops_gen', risk: 'commit',
      description: '【人工闸门 · 第一道门：清单确认】成对生成 .ops 制品到工作区（未提交态）：暂停/恢复镜像文件，全命令 IF EXISTS，PAUSE 带 checkpoint=TRUE、RESUME 带 fromCheckpoint=TRUE，JOB_TYPE 按作业元数据自动适配。生成后自动跑自检三件套并随结果返回。只产出 PAUSE/RESUME，DROP/STOP 属 fail-closed 不进入本场景',
      parameters: {
        type: 'object',
        properties: {
          jobs: { type: 'array', items: { type: 'string' }, description: '经第一道门确认的作业名清单' },
          head: { type: 'string', description: '制品标题，如 大促批量暂停/恢复（默认）' },
          pausePath: { type: 'string', description: '暂停文件路径（默认 ops/pause_before_promotion.ops）' },
          resumePath: { type: 'string', description: '恢复文件路径（默认 ops/resume_after_promotion.ops）' },
        },
        required: ['jobs'],
      },
      output: jsonOut,
      execute: async ({ jobs, head, pausePath = 'ops/pause_before_promotion.ops', resumePath = 'ops/resume_after_promotion.ops' }) => {
        const unknown = jobs.filter((n) => !ops.job(n))
        if (unknown.length) throw new Error(`作业目录中不存在: ${unknown.join(', ')}`)
        const { pause, resume, topo } = ops.genPair({ names: jobs, head })
        const w1 = repo.writeWorking(pausePath, pause)
        const w2 = repo.writeWorking(resumePath, resume)
        const check = ops.check({ names: jobs, pauseText: pause, resumeText: resume })
        return {
          gate: 'ops-gen（清单确认）',
          files: [w1, w2],
          layers: topo.pause.length,
          commands: topo.count,
          check,
          exemptions: check.completeness.warnings,
          note: `已生成镜像对（工作区未提交）· 自检：配对 ${check.pairing.note} · 环检测 ${check.cycle.note} · 依赖完整性 ${check.completeness.warnings.length ? `${check.completeness.warnings.length} 条豁免告警需知情确认` : '干净'}。下一步：repo_commit 提交（自动触发 CICD 的 ops lint 复扫）`,
        }
      },
    },

    {
      name: 'ops_check', risk: 'read',
      description: '自检三件套（权威版）：对暂停/恢复两个 .ops 做依赖完整性（集合外依赖者告警）/ 配对校验（镜像+参数一致）/ 环检测。ops_gen 已自动跑过一次；单独调用用于确认前复核或提交前复检',
      parameters: {
        type: 'object',
        properties: {
          pausePath: { type: 'string', description: '暂停 .ops 路径' },
          resumePath: { type: 'string', description: '恢复 .ops 路径' },
        },
        required: ['pausePath', 'resumePath'],
      },
      output: jsonOut,
      execute: async ({ pausePath, resumePath }) => {
        const pauseText = readOps(pausePath)
        const resumeText = readOps(resumePath)
        if (pauseText == null || resumeText == null) throw new Error(`文件不存在: ${pauseText == null ? pausePath : resumePath}`)
        return { pausePath, resumePath, ...ops.check({ names: namesFromTexts(pauseText, resumeText), pauseText, resumeText }) }
      },
    },

    {
      name: 'ops_deploy', risk: 'publish',
      description: '【人工闸门 · 第三道门：部署确认（重门）】把已提交的 .ops 编译为环境无关制品包并交付制品包通道（LTS/FlashSync/BIDS 解析执行）。必须绑定变更单号；执行模式默认 MANUAL。部署后结果回调用 ops_callback 查询。恢复文件与暂停文件同包交付——暂停出事故时恢复制品立即可部署',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: '待部署的 .ops 路径（须已提交），默认暂停+恢复两个文件' },
          changeNumber: { type: 'string', description: '变更单号（必填，如 CHG-20260823）——部署审批与审计回溯的锚' },
          executeMode: { type: 'string', enum: ['MANUAL', 'AUTO'], description: '执行模式，默认 MANUAL（第三方平台待人工触发执行）' },
        },
        required: ['changeNumber'],
      },
      output: jsonOut,
      execute: async ({ paths = ['ops/pause_before_promotion.ops', 'ops/resume_after_promotion.ops'], changeNumber, executeMode = 'MANUAL' }) => {
        const branch = repo.currentBranch()
        const files = []
        for (const p of paths) {
          const content = repo.readCommitted(branch, p)
          if (content == null) return { deployed: false, blocked: true, reason: `${p} 未提交（部署必须基于已提交态，先走 repo_commit 第二道门）` }
          files.push({ path: p, content })
        }
        const dirty = repo.status().filter((s) => paths.includes(s.path))
        if (dirty.length) return { deployed: false, blocked: true, reason: `存在未提交变更: ${dirty.map((d) => d.path).join(', ')}` }
        const commitId = repo.git('rev-parse', '--short', 'HEAD')
        const pack = ops.buildPack({ commitId, files })
        const d = ops.deploy({ packId: pack.id, changeNumber, executeMode })
        return {
          gate: 'ops-deploy（部署确认）',
          pack: { id: pack.id, commitId, envNeutral: true },
          changeNumber, executeMode,
          dispatched: d.results.length,
          note: `制品包 ${pack.id} 已交付制品包通道（变更号 ${changeNumber} · ${executeMode}）· 第三方平台按 JOB_TYPE 认领解析执行，回调结果用 ops_callback 查询`,
        }
      },
    },

    {
      name: 'ops_callback', risk: 'read',
      description: '订阅第三方平台执行回调：逐命令结果（Success/Failure/Blocking）+ 检查点状态。fail-fast 命中时按「已执行/失败点/未执行」三段解读并给出续跑建议',
      parameters: {
        type: 'object',
        properties: { packId: { type: 'string', description: '制品包 id（默认最近一次部署）' } },
      },
      output: jsonOut,
      execute: async ({ packId }) => {
        const d = ops.callback(packId)
        if (!d) return { callback: null, note: '暂无部署回调（先走 ops_deploy 第三道门）' }
        const failed = d.results.filter((r) => r.status !== 'Success')
        return {
          packId: d.packId, changeNumber: d.changeNumber, executeMode: d.executeMode, at: d.at,
          summary: d.summary,
          results: d.results,
          note: failed.length
            ? `存在 ${failed.length} 条非成功命令（fail-fast 已中止后续）：可从失败点生成续跑 .ops`
            : `${d.summary.success}/${d.summary.total} Success · 检查点全部保存 · 恢复制品就绪时可按正序从检查点恢复`,
        }
      },
    },
  ]
}
