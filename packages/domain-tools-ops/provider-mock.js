// @his/domain-tools-ops — 运维编排 Provider（演示态 mock，V13）
//
// 设计纪律：作业目录、制品库、第三方执行回调均为内置演示数据/本地模拟；
// 正式版整层替换为 调度平台作业目录 API + 制品库 + LTS/FlashSync/BIDS 回调订阅，工具定义不动。
//
// 核心语义（《作业命令化 DSL 语法规范》落地）：
//   - fail-fast 让「顺序」成为正确性的一部分：顺序只能由血缘推导，不允许手写
//   - 暂停 = 拓扑逆序（先下游后上游）；恢复 = 拓扑正序（先上游后下游）；同层无依赖可并行
//   - 全命令带 IF EXISTS（个别作业已下线不打断 fail-fast）；PAUSE checkpoint / RESUME fromCheckpoint 配对
//   - DROP/STOP 属 fail-closed：本 Provider 的生成器只产出 PAUSE/RESUME，从结构上不存在

import { JOB_CATALOG } from './seed-data.js'

const LAYER_CN = { 1: '下游 · 汇总/同步层', 2: '明细层', 3: '上游 · 接入层' }
const layerCn = (n) => LAYER_CN[n] ?? `第 ${n} 层`

/** .ops 文本 → 结构化（studio-ui「执行序列/配对校验」页签的解析源，经 hisOps 服务透出） */
export function parseOps(text) {
  const lines = text.split('\n')
  const header = lines.filter((l) => l.trim().startsWith('--') && !/Layer\s*\d/.test(l)).map((l) => l.trim())
  const layers = []
  let cur = null
  const cmdRe = /^(PAUSE|RESUME)\s+([A-Z][A-Z0-9_-]*)\s+JOB\s+(IF\s+EXISTS\s+)?(\S+)/
  for (const raw of lines) {
    const line = raw.trim()
    const lm = line.match(/^--\s*──\s*Layer\s*(\d+)\s*·\s*(.+?)（(\d+)\s*个/)
    if (lm) { cur = { n: +lm[1], cn: lm[2], jobs: [] }; layers.push(cur); continue }
    const cm = line.match(cmdRe)
    if (cm) {
      const job = { action: cm[1], type: cm[2], ifExists: !!cm[3], path: cm[4], options: {} }
      ;(cur?.jobs ?? (layers.push(cur = { n: 0, cn: '未分层', jobs: [] }), cur.jobs)).push(job)
      continue
    }
    const om = line.match(/^([a-zA-Z]+)\s*=\s*(.+)$/)
    if (om && cur?.jobs.length) cur.jobs[cur.jobs.length - 1].options[om[1]] = om[2].replace(/\)?$/, '').trim()
  }
  const action = layers.flatMap((l) => l.jobs)[0]?.action ?? null
  return { action, header, layers, count: layers.reduce((a, l) => a + l.jobs.length, 0) }
}

export class LocalOpsProvider {
  constructor(catalog = JOB_CATALOG) {
    this.kind = 'local-mock'
    this.catalog = catalog
    this.packs = new Map() // packId -> {id, commitId, files, at}
    this.deployments = [] // {packId, changeNumber, executeMode, at, results:[...]}
  }

  job(name) { return this.catalog.find((j) => j.name === name) ?? null }

  /** ops_screen：按域/类型/优先级/实时性筛选；返回目标清单 + 自动排除项（含原因） */
  screen({ domain, types, excludeCore = true, excludeRealtime = true } = {}) {
    const inScope = this.catalog.filter((j) => (!domain || j.domain === domain) && (!types?.length || types.includes(j.type)))
    const targets = inScope.filter((j) => !(excludeCore && j.priority === 'core') && !(excludeRealtime && j.realtime))
    const excluded = inScope.filter((j) => !targets.includes(j))
      .map((j) => ({ name: j.name, cn: j.cn, type: j.type, reason: j.priority === 'core' ? `${j.cn} · 核心保留` : `${j.cn} · 实时任务保留` }))
    return { targets, excluded }
  }

  /** 拓扑分层：Layer 1 = 最下游（集合内无被依赖者）。有环返回 {cycle} 不排序（转人工） */
  topo(names) {
    const set = new Set(names)
    const dependents = new Map(names.map((n) => [n, []]))
    for (const n of names) for (const d of this.job(n)?.dependsOn ?? []) if (set.has(d)) dependents.get(d).push(n)
    const depth = new Map()
    const visiting = new Set()
    const layerOf = (n) => {
      if (depth.has(n)) return depth.get(n)
      if (visiting.has(n)) return -1 // 环
      visiting.add(n)
      let l = 1
      for (const d of dependents.get(n) ?? []) {
        const dl = layerOf(d)
        if (dl < 0) { visiting.delete(n); depth.set(n, -1); return -1 } // 环向上传播
        l = Math.max(l, dl + 1)
      }
      visiting.delete(n)
      depth.set(n, l)
      return l
    }
    const layers = new Map()
    for (const n of names) {
      const l = layerOf(n)
      if (l < 0) return { cycle: true, note: '血缘 DAG 存在环，无法拓扑排序，转人工处理' }
      if (!layers.has(l)) layers.set(l, [])
      layers.get(l).push(this.job(n))
    }
    // 暂停序：Layer 1（最下游）→ N（最上游）；恢复序 = 镜像反转
    const pause = [...layers.keys()].sort((a, b) => a - b).map((n, i) => ({ n: i + 1, cn: layerCn(n), jobs: layers.get(n) }))
    const resume = [...pause].reverse().map((l, i) => ({ ...l, n: i + 1 }))
    return { cycle: false, pause, resume, count: names.length }
  }

  /** 成对生成 .ops 文本（镜像）：返回 { pause, resume } 两份文本 */
  genPair({ names, head = '大促批量暂停/恢复' }) {
    const t = this.topo(names)
    if (t.cycle) throw new Error(t.note)
    const render = (action, layers) => {
      const act = action === 'pause' ? 'PAUSE' : 'RESUME'
      const opt = action === 'pause' ? 'checkpoint = TRUE' : 'fromCheckpoint = TRUE'
      const dir = action === 'pause' ? '拓扑逆序 · 先下游、后上游' : '拓扑正序 · 先上游、后下游（暂停文件的镜像）'
      const title = action === 'pause' ? `${head} · 暂停` : `${head} · 恢复`
      const total = layers.reduce((a, l) => a + l.jobs.length, 0)
      const out = [`-- ${title} · ${total} 条命令`, `-- 排序：${dir} · fail-fast · rollbackIfFailed 默认 TRUE`, '']
      for (const l of layers) {
        out.push(`-- ── Layer ${l.n} · ${l.cn}（${l.jobs.length} 个 · 可并行）`)
        for (const j of l.jobs) out.push(`${act} ${j.type} JOB IF EXISTS ${j.path}`, 'WITH OPTIONS(', `  ${opt}`, ')', '')
      }
      return out.join('\n').trim() + '\n'
    }
    return { pause: render('pause', t.pause), resume: render('resume', t.resume), topo: t }
  }

  /** 自检三件套：依赖完整性（集合外依赖者告警）/ 配对（镜像+参数一致）/ 环检测 */
  check({ names, pauseText, resumeText }) {
    const set = new Set(names)
    const outsiders = this.catalog.filter((j) => !set.has(j.name) && j.dependsOn.some((d) => set.has(d)))
      .map((j) => ({ name: j.name, cn: j.cn, dependsOnPaused: j.dependsOn.filter((d) => set.has(d)), note: `${j.cn} 依赖将被暂停的 ${j.dependsOn.filter((d) => set.has(d)).join('、')} · 期间停更 · 需豁免知情确认` }))
    const p = parseOps(pauseText)
    const r = parseOps(resumeText)
    const pJobs = p.layers.flatMap((l) => l.jobs)
    const rJobs = r.layers.flatMap((l) => l.jobs)
    const sameSet = pJobs.length === rJobs.length && pJobs.every((j) => rJobs.some((x) => x.path === j.path && x.type === j.type))
    const optPair = pJobs.every((j) => j.options.checkpoint === 'TRUE') && rJobs.every((j) => j.options.fromCheckpoint === 'TRUE')
    const ifExists = pJobs.every((j) => j.ifExists) && rJobs.every((j) => j.ifExists)
    const topo = this.topo(names)
    return {
      pairing: { pass: sameSet && optPair, pause: pJobs.length, resume: rJobs.length, note: sameSet && optPair ? `${pJobs.length}/${rJobs.length} 镜像 · checkpoint/fromCheckpoint 参数一致` : '镜像不一致或参数未配对' },
      ifExists: { pass: ifExists, note: ifExists ? `${pJobs.length + rJobs.length}/${pJobs.length + rJobs.length} 覆盖 · 个别作业已下线不打断 fail-fast` : '存在缺 IF EXISTS 的命令' },
      cycle: { pass: !topo.cycle, note: topo.cycle ? topo.note : '血缘 DAG 无环 · 拓扑可排序' },
      completeness: { pass: outsiders.length === 0, warnings: outsiders },
      danger: { pass: !/\b(DROP|STOP|KILL|DELETE)\b/.test(pauseText + resumeText), note: '无 DROP/STOP · 仅 PAUSE/RESUME（fail-closed 高危命令不进入本场景）' },
    }
  }

  /** 制品包构建（环境无关）：ops_change_pack_{commitId}.zip */
  buildPack({ commitId, files }) {
    const id = `ops_change_pack_${commitId}`
    const pack = { id: `${id}.zip`, commitId, files, envNeutral: true, at: new Date().toISOString() }
    this.packs.set(pack.id, pack)
    return pack
  }

  /** 部署（重门）：注入变更号 + 执行模式；mock 立即生成逐命令回调结果 */
  deploy({ packId, changeNumber, executeMode = 'MANUAL' }) {
    const pack = this.packs.get(packId)
    if (!pack) throw new Error(`制品包不存在: ${packId}`)
    // 演示态：第三方平台（LTS/FlashSync/BIDS 按 JOB_TYPE 认领）解析执行后回调
    const results = []
    for (const f of pack.files.filter((x) => x.path.endsWith('.ops'))) {
      const parsed = parseOps(f.content)
      for (const l of parsed.layers) for (const j of l.jobs) {
        results.push({ job: j.path, action: j.action, type: j.type, status: 'Success', checkpointSaved: j.action === 'PAUSE', fromCheckpoint: j.action === 'RESUME' })
      }
    }
    const d = { packId, changeNumber, executeMode, at: new Date().toISOString(), results }
    this.deployments.push(d)
    return d
  }

  /** 回调订阅（演示态取最近一次部署） */
  callback(packId) {
    const d = packId ? this.deployments.find((x) => x.packId === packId) : this.deployments[this.deployments.length - 1]
    if (!d) return null
    const ok = d.results.filter((r) => r.status === 'Success').length
    return { ...d, summary: { success: ok, failure: d.results.length - ok, blocking: 0, total: d.results.length } }
  }
}
