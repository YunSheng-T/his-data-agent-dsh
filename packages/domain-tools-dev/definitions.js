// @his/domain-tools-dev — definitions.js：开发域只读工具 Definition 层（P1-2）
// risk 标注沿用 P0 约定（挂在 definition 上，审批插件只认标注）：
// 本文件全部是 read 级；写入/gated 工具（etl_codegen/dag_gen/git_*/sched_publish）在 P1-3/4。
// 执行器是纯函数（注入 repo/dryrun 两个 Provider），便于无模型断言测试。

import { parseEtl, parseDag, locateColumn } from './ast.js'
import { lintEtl, lintDag } from './lint.js'
import { genEtl, genDag, patchColumn } from './codegen.js'
import { upstream as lineageUp, downstream as lineageDown, jobsForModel } from './lineage.js'
import { scanVerdict } from './provider-cicd.js'

const jsonOut = { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] }
const pathParam = { path: { type: 'string', description: '仓内相对路径，如 etl/dwd/dwd_tax_declaration.etl 或 dag/dwd_tax_declaration.dag' } }

function mustRead(repo, path, view) {
  const text = view === 'working' ? repo.readWorking(path) : repo.readCommitted(repo.currentBranch(), path)
  if (text == null) throw new Error(`文件不存在于${view === 'working' ? '工作区' : '当前分支已提交视图'}: ${path}`)
  return text
}

/** 作业 → 模型：@model 埋点优先，targetTable 尾名兜底（与 jobsForModel 同规则） */
function modelForJob(parsed) {
  if (parsed.modelFile) return parsed.modelFile
  const tail = parsed.targetTable?.split('.').pop()
  return tail ? `${tail}.model` : null
}

/** 三类扫描（V10）：设计质量 = lint；SQL = 分区 + 危险模式；一致性 = 设计态(模型绑定) ↔ 开发态(代码引用) */
export function scanEtlJob(repo, modeling, path) {
  const text = repo.readCommitted(repo.currentBranch(), path)
  if (text == null) return null
  const parsed = parseEtl(text)
  const lint = lintEtl(text, parsed)
  const design = { pass: lint.pass, errors: lint.issues.filter((i) => i.level === 'error').length, warns: lint.issues.filter((i) => i.level !== 'error').length }
  const dangers = [parsed.hasDrop && 'DROP', parsed.hasTruncate && 'TRUNCATE', parsed.hasDeleteNoWhere && 'DELETE 无 WHERE', parsed.insertMode === 'OVERWRITE' && !parsed.partition && '无分区全量覆盖'].filter(Boolean)
  const sql = { pass: !!parsed.partition && parsed.usesPartitionFilter && dangers.length === 0, partition: parsed.partition ?? null, dangers }
  // 一致性：模型已绑标准而代码未引用 → 差异（可修复项）；模型缺失/无埋点 → pass:null 未知不误报
  let consistency = { pass: null, reason: '无 @model 埋点且目标表无法推断模型，未做一致性比对' }
  const mf = modelForJob(parsed)
  if (mf) {
    let m = null
    try { m = modeling.readFields(mf) } catch { /* 模型不在建模空间 */ }
    if (m) {
      const codeRefs = new Set(parsed.columns.map((c) => c.stdRef).filter(Boolean).map((s) => s.replace(/^@/, '')))
      const diffs = m.fields.filter((f) => f.std && !codeRefs.has(f.std))
        .map((f) => ({ field: f.n, std: f.std, issue: `模型 ${mf} ${m.version} 已绑 ${f.std} · 代码未引用` }))
      consistency = { pass: diffs.length === 0, model: `${mf} · ${m.version}`, diffs }
    } else consistency = { pass: null, reason: `模型 ${mf} 不存在于建模空间` }
  }
  return { design, sql, consistency }
}

/** ops 制品扫描（V13）：轻量文本规则，不依赖编排域——结构规范 / 高危词 fail-closed / 单文件配对。
 *  暂停↔恢复跨文件配对、环检测、依赖完整性的权威判定在编排域 ops_check，此处只做提交时刻快照。 */
export function scanOpsFile(repo, path) {
  const text = repo.readCommitted(repo.currentBranch(), path)
  if (text == null) return null
  const cmdRe = /^(PAUSE|RESUME)\s+([A-Z][A-Z0-9_-]*)\s+JOB\s+(IF\s+EXISTS\s+)?(\S+)/
  const lines = text.split('\n')
  const cmds = []
  const errors = []
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('--')) continue
    if (/^WITH\s+OPTIONS\s*\(/i.test(line)) continue // 命令的选项续行，不参与格式判定
    const m = line.match(cmdRe)
    if (!m) { errors.push(`L${i + 1} 命令格式不合法: ${line.slice(0, 60)}`); continue }
    cmds.push({ line: i + 1, action: m[1], type: m[2], ifExists: !!m[3], job: m[4] })
  }
  const noIfExists = cmds.filter((c) => !c.ifExists)
  if (noIfExists.length) errors.push(`缺 IF EXISTS 幂等保护: ${noIfExists.map((c) => `L${c.line}`).join(', ')}`)
  if (cmds.length && !lines.some((l) => l.trim().startsWith('--') && /Layer\s*\d/.test(l))) {
    errors.push('缺分层注释（-- ── Layer N），执行序列无法分层审阅')
  }
  if (!cmds.length && !errors.length) errors.push('空制品：无任何 PAUSE/RESUME 命令')
  const dangers = ['DROP', 'STOP', 'KILL', 'DELETE'].filter((w) => new RegExp(`\\b${w}\\b`).test(text))
  const design = { pass: errors.length === 0, errors: errors.length, warns: 0, issues: errors }
  const sql = { pass: dangers.length === 0, dangers, note: '高危词 fail-closed：DROP/STOP/KILL/DELETE 不得进入 ops 制品' }
  // 配对：同文件双动作才判；单动作文件（暂停/恢复分文件）pass:null 未知不误报
  let consistency = { pass: null, reason: '单动作制品：配对/环/依赖完整性由编排域 ops_check 权威执行' }
  const pauses = cmds.filter((c) => c.action === 'PAUSE').length
  const resumes = cmds.filter((c) => c.action === 'RESUME').length
  if (pauses && resumes) consistency = { pass: pauses === resumes, pause: pauses, resume: resumes, ...(pauses !== resumes && { diffs: [{ issue: `PAUSE ${pauses} 条 ≠ RESUME ${resumes} 条` }] }) }
  return { design, sql, consistency }
}

/** 本体驱动扫描（V15 @his/domain-tools-ontology）：对 .sql 脚本作业走本体分类/策略/规则/增量匹配，产出与 scanEtlJob 兼容的三类结论 + 本体事实。
 *  与 scanEtlJob 分工：.etl 走既有设计质量/SQL/一致性；.sql(dbscript) 走本体扫描（扫什么由本体驱动）。
 *  一致性消费 matchIncrement 事实（四态 MATCH/AHEAD/BEHIND/DIVERGE），而非各自重新 diff。 */
export function scanScriptJob(repo, modeling, onto, path) {
  const text = repo.readCommitted(repo.currentBranch(), path)
  if (text == null) return null
  const ast = /ADD\s+COLUMNS/i.test(text) ? { alterAddColumns: true } : /\b(UPDATE|INSERT\s+INTO)\b/i.test(text) ? { dml: true } : {}
  const engine = (text.match(/--\s*@engine:\s*(\S+)/) || [])[1] ?? 'Hive SQL'
  const physicalTable = (text.match(/ALTER\s+TABLE\s+(\S+)/i)?.[1] || (text.match(/FROM\s+(\S+)/i) || [])[1]) ?? null
  const ctx = { repo, modeling }
  const cls = onto ? onto.classifyJob({ path, engine, ast }, ctx) : { ok: false, note: '本体服务未挂载' }
  const rules = cls.ok && onto ? onto.rulesFor(cls.jobType) : null
  const match = cls.ok && onto ? onto.consistencyCheck(path, ctx) : null
  const design = cls.ok ? { pass: true, errors: 0, warns: 0, issues: [] } : { pass: false, errors: 1, warns: 0, issues: [{ rule: 'ontology.classify', level: 'error', message: (cls.note || '本体分类失败') }] }
  const sql = { pass: !ast.dml || ast.alterAddColumns, partition: null, dangers: ast.dml && !ast.alterAddColumns ? ['DML 订正'] : [] }
  const conflict = match ? match.conflicts.filter((c) => c.kind === 'MATCH-CONFLICT') : []
  const consistency = match ? { pass: conflict.length === 0, model: match.implements ? match.implements.physicalTable : null, diffs: conflict.map((c) => ({ field: c.field, issue: c.field + ' 类型冲突' })) } : { pass: null, reason: '无匹配模型/基线' }
  return { design, sql, consistency, ontology: rules ? { jobType: cls.jobTypeName, instance: cls.instanceName, ruleCount: rules.ruleCount, impls: rules.rules.map((r) => r.impl ? r.impl.ruleset : null).filter(Boolean), matchStatus: match ? match.status : null, conflictCount: conflict.length } : null }
}

export function buildDevTools({ repo, dryrun, modeling, sched, cicd, onto }) {
  const writeTools = [
    {
      name: 'etl_codegen', risk: 'workspace-write',
      description: '从建模空间的模型版本生成 ETL 作业（.etl）到工作区未提交态：逐列注释携带该版本的标准绑定引用。模型绑定变更后重新生成即同步。返回附 lint 自检结果',
      parameters: {
        type: 'object',
        properties: {
          model: { type: 'string', description: '模型文件名，如 dwd_tax_declaration.model' },
          jobPath: { type: 'string', description: '目标作业路径，如 etl/dwd/dwd_tax_declaration.etl' },
          source: { type: 'string', description: '来源表，如 ods.ods_tax_declare_di' },
        },
        required: ['model', 'jobPath', 'source'],
      },
      output: jsonOut,
      execute: async ({ model, jobPath, source }) => {
        const m = modeling.readFields(model)
        const text = genEtl({ model: m, jobPath, source })
        const written = repo.writeWorking(jobPath, text)
        const lint = lintEtl(text, parseEtl(text))
        return {
          ...written,
          fromModel: { file: m.file, version: m.version, published: m.published, bindingRate: m.bindingRate },
          stdRefs: parseEtl(text).columns.filter((c) => c.stdRef).map((c) => `${c.alias} → ${c.stdRef}`),
          warn: m.published ? null : '模型未发布：代码已生成但未发布模型的引用可能变动，正式上线前请先发布模型',
          lint,
        }
      },
    },

    {
      name: 'dag_gen', risk: 'workspace-write',
      description: '生成调度作业（.dag，yaml：cron/依赖/重试/告警，ref 指向 .etl）。双保险：ref 的 .etl lint 有 error 时拒绝生成（编排不变量固化在工具层）',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: '指向的 .etl 路径，如 etl/dwd/dwd_tax_declaration.etl' },
          cron: { type: 'string', description: 'cron 触发表达式（避开整点/半点），如 "17 2 * * *"' },
          depends: { type: 'array', items: { type: 'string' }, description: '上游 .dag 依赖列表' },
          timeout: { type: 'number', description: '超时秒数（默认 1800）' },
        },
        required: ['ref', 'cron'],
      },
      output: jsonOut,
      execute: async ({ ref, cron, depends, timeout }) => {
        const etlText = repo.readWorking(ref) ?? repo.readCommitted(repo.currentBranch(), ref)
        if (etlText == null) throw new Error(`ref 指向的 .etl 不存在: ${ref}`)
        const etlLint = lintEtl(etlText, parseEtl(etlText))
        if (!etlLint.pass) {
          return { generated: false, blocked: true, reason: '编排不变量：lint 不过 → 不生成 dag', etlLint }
        }
        const job = ref.split('/').pop().replace(/\.etl$/, '')
        const dagPath = `dag/${job}.dag`
        const text = genDag({ ref, cron, depends: depends ?? [], timeout: timeout ?? 1800 })
        const written = repo.writeWorking(dagPath, text)
        return { generated: true, ...written, ref, lint: lintDag(text, parseDag(text)) }
      },
    },

    {
      name: 'etl_patch', risk: 'workspace-write',
      description: '修改链路的列级 diff：AST 定位某列，只改该列表达式/注释（不动 .dag）。修改前应先用 lineage_downstream 做影响分析',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '.etl 路径' },
          column: { type: 'string', description: '目标列名' },
          expr: { type: 'string', description: '新表达式（可选，如 NVL(overdue_flag, \'N\')）' },
          comment: { type: 'string', description: '新注释（可选，逐列标准引用在此维护）' },
        },
        required: ['path', 'column'],
      },
      output: jsonOut,
      execute: async ({ path, column, expr, comment }) => {
        const text = repo.readWorking(path) ?? repo.readCommitted(repo.currentBranch(), path)
        if (text == null) throw new Error(`文件不存在: ${path}`)
        const r = patchColumn(text, { column, expr, comment })
        repo.writeWorking(path, r.text)
        const lint = lintEtl(r.text, parseEtl(r.text))
        return { path, column, before: r.before.trim(), after: r.after.trim(), lint, note: 'diff 只动 .etl；.dag 未触碰' }
      },
    },
  ]
  return [
    ...readTools({ repo, dryrun, modeling, cicd }),
    ...writeTools,
    ...gatedTools({ repo, sched, modeling, cicd, onto }),
  ]
}

/** gated 闸门组（P1-4 → P3 数据化）：commit 闸门挂 CICD 流水线 + 上线闸门 + 上线后的血缘回写 */
function gatedTools({ repo, sched, modeling, cicd, onto }) {
  return [
    {
      name: 'repo_commit', risk: 'commit',
      description: '【人工闸门 1 · 数据化审批】提交工作区全部变更到当前分支（暂存+提交一体，无单独 add 步骤）。提交即自动触发 CICD 流水线（build + 设计质量/SQL/一致性扫描），权威报告用 cicd_scan_report 查询，上线门禁以此为准。提交前必须已完成 lint 与 dry-run 验证；提交后文件才进入已提交视图（其他分支可见性按合并语义）',
      parameters: { type: 'object', properties: { message: { type: 'string', description: '提交信息（建议含作业名与需求号）' } }, required: ['message'] },
      output: jsonOut,
      execute: async ({ message }) => {
        const r = repo.commitAll(message)
        if (!r.committed) return { ...r, gate: 'commit', note: '无变更未产生提交' }
        // 提交即触发 CICD 流水线：对本次提交的 .etl/.ops 现场计算扫描快照（演示态本地计算，正式版走 CICD API）
        const scans = {}
        for (const f of r.files.filter((x) => x.endsWith('.etl') || x.endsWith('.ops') || x.endsWith('.sql'))) {
          const s = f.endsWith('.ops') ? scanOpsFile(repo, f) : f.endsWith('.sql') ? scanScriptJob(repo, modeling, onto, f) : scanEtlJob(repo, modeling, f)
          if (s) scans[f] = s
        }
        const pipeline = cicd?.trigger({ commitId: r.commitId, branch: r.branch, scans }) ?? null
        const diffFiles = Object.entries(scans).filter(([, s]) => scanVerdict(s) === 'diff').map(([f]) => f)
        return {
          ...r, gate: 'commit',
          pipeline: pipeline && { id: pipeline.id, ruleset: pipeline.ruleset, scanned: Object.keys(scans), verdict: diffFiles.length ? 'diff' : 'pass' },
          note: pipeline
            ? `已进入已提交视图 · CICD 流水线 #${pipeline.id} 自动触发（规则集 ${pipeline.ruleset}）· 权威结论 ${diffFiles.length ? `⚠ 差异: ${diffFiles.join(', ')}` : 'PASS'}`
            : '已进入已提交视图',
        }
      },
    },

    {
      name: 'sched_publish', risk: 'publish',
      description: '【人工闸门 2】把调度作业上线到调度系统。双保险自检：.etl/.dag 必须已提交、lint 无 error、危险扫描干净——任一不过则拒绝（无副作用）',
      parameters: { type: 'object', properties: { dagPath: { type: 'string', description: 'dag/ 下的 .dag 路径' } }, required: ['dagPath'] },
      output: jsonOut,
      execute: async ({ dagPath }) => {
        const branch = repo.currentBranch()
        const dagText = repo.readCommitted(branch, dagPath)
        if (dagText == null) return { published: false, blocked: true, reason: `${dagPath} 未提交（上线必须基于已提交态）` }
        const parsed = parseDag(dagText)
        const etlText = parsed.ref ? repo.readCommitted(branch, parsed.ref) : null
        if (etlText == null) return { published: false, blocked: true, reason: `ref 指向的 ${parsed.ref} 未提交或缺失` }
        const dirty = repo.status().filter((s) => s.path === dagPath || s.path === parsed.ref)
        if (dirty.length) return { published: false, blocked: true, reason: `存在未提交变更: ${dirty.map((d) => d.path).join(', ')}` }
        const etlParsed = parseEtl(etlText)
        const lint = lintEtl(etlText, etlParsed)
        if (!lint.pass) return { published: false, blocked: true, reason: 'lint 存在 error 级问题', lint }
        const dangers = [etlParsed.hasDrop && 'DROP', etlParsed.hasTruncate && 'TRUNCATE', etlParsed.hasDeleteNoWhere && 'DELETE 无 WHERE', etlParsed.insertMode === 'OVERWRITE' && !etlParsed.partition && '无分区全量覆盖'].filter(Boolean)
        if (dangers.length) return { published: false, blocked: true, reason: `危险模式命中: ${dangers.join(' | ')}` }
        const commitId = repo.git('rev-parse', '--short', 'HEAD')
        return { gate: 'publish', branch, commitId, ...sched.publish({ dagPath, parsed, commitId }) }
      },
    },

    {
      name: 'asset_sync', risk: 'workspace-write',
      description: '上线后把「作业 → 模型」血缘回写资产目录（跨域单向联动）：建模空间的模型发布页可见作业引用。通常紧跟 sched_publish 成功后调用',
      parameters: {
        type: 'object',
        properties: {
          model: { type: 'string', description: '模型文件名，如 dwd_tax_declaration.model' },
          job: { type: 'string', description: '.etl 作业路径' },
          dag: { type: 'string', description: '.dag 调度路径' },
          commitId: { type: 'string', description: '上线时的 commit id（可选）' },
        },
        required: ['model', 'job', 'dag'],
      },
      output: jsonOut,
      execute: async ({ model, job, dag, commitId }) => modeling.attachJobRef({ model, job, dag, commitId }),
    },
  ]
}

function readTools({ repo, dryrun, modeling, cicd }) {
  return [
    {
      name: 'cicd_scan_report', risk: 'read',
      description: '查询作业的 CICD 权威扫描报告：流水线号 + 规则集版本 + 设计质量/SQL/设计态↔开发态一致性三类结论。扫描的权威执行者是 CICD 流水线，本工具只做订阅解读；未提交的文件没有报告。一致性差异修复路径：etl_patch 补标准引用 → repo_commit（自动触发新流水线）→ 本工具复扫确认清零',
      parameters: { type: 'object', properties: pathParam, required: ['path'] },
      output: jsonOut,
      execute: async ({ path }) => {
        if (!cicd) throw new Error('CICD 适配器未挂载')
        const branch = repo.currentBranch()
        if (repo.readCommitted(branch, path) == null) throw new Error(`文件不存在于已提交视图: ${path}（未提交的文件没有流水线报告）`)
        const hit = cicd.latestFor(path, branch) ?? cicd.latestFor(path)
        if (!hit) return { path, report: null, note: '该作业暂无流水线报告（未被任何流水线覆盖）' }
        const dirty = repo.status().some((s) => s.path === path)
        return {
          path,
          pipeline: hit.pipeline,
          scans: hit.scan,
          verdict: scanVerdict(hit.scan),
          note: dirty ? '工作区存在未提交修改：报告基于最近流水线快照，提交后复扫以清零差异' : '权威报告 · 与已提交态一致',
        }
      },
    },

    {
      name: 'repo_checkout', risk: 'read',
      description: '切换代码仓分支定位（只读语义：不改任何文件内容；分支隔离由 git 保证）。返回该分支目录树',
      parameters: { type: 'object', properties: { branch: { type: 'string', description: '分支名，如 main 或 feature/invoice' }, create: { type: 'boolean', description: '分支不存在时是否新建（默认 false）' } }, required: ['branch'] },
      output: jsonOut,
      execute: async ({ branch, create }) => {
        const exists = repo.branches().includes(branch)
        if (!exists && !create) throw new Error(`分支不存在: ${branch}（需 create=true 显式新建）`)
        const actual = repo.checkout(branch, { create: !!create && !exists })
        return { branch: actual, created: !exists, tree: repo.treeWithState(actual) }
      },
    },

    {
      name: 'job_read', risk: 'read',
      description: '读取作业文件并返回结构化解析（注解头/来源表/目标表/列映射/调度参数）。view=committed 读已提交视图（默认），view=working 读工作区未提交态',
      parameters: { type: 'object', properties: { ...pathParam, view: { type: 'string', enum: ['committed', 'working'], description: 'committed（默认）| working' } }, required: ['path'] },
      output: jsonOut,
      execute: async ({ path, view }) => {
        const text = mustRead(repo, path, view)
        const parsed = path.endsWith('.dag') ? parseDag(text) : parseEtl(text)
        return { path, view: view ?? 'committed', kind: path.endsWith('.dag') ? 'dag' : 'etl', parsed, text }
      },
    },

    {
      name: 'ast_locate', risk: 'read',
      description: '在 .etl 中做 AST 定位：不给 column 返回全部列映射概览；给 column 返回该列的表达式/转换函数/标准引用与列序号（修改链路 diff 的定位锚）',
      parameters: { type: 'object', properties: { ...pathParam, column: { type: 'string', description: '目标列名（可选）' } }, required: ['path'] },
      output: jsonOut,
      execute: async ({ path, column }) => {
        const parsed = parseEtl(mustRead(repo, path))
        if (!column) return { path, targetTable: parsed.targetTable, columns: parsed.columns }
        const hit = locateColumn(parsed, column)
        if (!hit) throw new Error(`列不存在: ${column}（现有列: ${parsed.columns.map((c) => c.alias).filter(Boolean).join(', ')}）`)
        return { path, ...hit }
      },
    },

    {
      name: 'lineage_upstream', risk: 'read',
      description: '作业上游血缘：本作业的来源表 ← 产出这些表的其他作业，以及调度依赖（.dag depends）',
      parameters: { type: 'object', properties: pathParam, required: ['path'] },
      output: jsonOut,
      execute: async ({ path }) => lineageUp(repo, path),
    },

    {
      name: 'lineage_downstream', risk: 'read',
      description: '作业下游血缘（修改链路的影响分析必调）：哪些作业读我产出的表、哪些调度依赖我',
      parameters: { type: 'object', properties: pathParam, required: ['path'] },
      output: jsonOut,
      execute: async ({ path }) => lineageDown(repo, path),
    },

    {
      name: 'impact_check', risk: 'read',
      description: 'P2-1 反向联动（模型 → 作业）：模型版本变更后调用，列出引用该模型的作业及各自代码基线版本，stale=true 表示作业代码基于旧版本生成、需重新 etl_codegen。模型绑定/属性修改并 commit 后应主动调它排查影响面',
      parameters: { type: 'object', properties: { model: { type: 'string', description: '模型文件名，如 dwd_tax_declaration.model' } }, required: ['model'] },
      output: jsonOut,
      execute: async ({ model }) => {
        const summary = modeling.anchorSummary(model)
        if (summary.error) throw new Error(summary.error)
        const jobs = jobsForModel(repo, model).map((j) => ({
          ...j,
          currentVersion: summary.version,
          // baseVersion 为空（手写作业、无 @model 埋点）→ stale: null（未知），不误报
          stale: j.baseVersion ? j.baseVersion !== summary.version : null,
        }))
        return {
          model, currentVersion: summary.version, jobs,
          staleCount: jobs.filter((j) => j.stale === true).length,
          note: 'stale 作业修复路径：etl_codegen 重新生成（注释携带最新标准引用）→ code_lint → test_dryrun → repo_commit → sched_publish；stale=null 表示作业无 @model 版本埋点，需人工确认',
        }
      },
    },

    {
      name: 'code_lint', risk: 'read',
      description: 'ETL/调度代码检查：返回结构化问题清单（error/warn）。pass=false（有 error）时编排不变量要求不得生成 .dag、不得进入提交审批',
      parameters: { type: 'object', properties: { ...pathParam, view: { type: 'string', enum: ['committed', 'working'], description: 'committed（默认）| working（工作区未提交态）' } }, required: ['path'] },
      output: jsonOut,
      execute: async ({ path, view }) => {
        const text = mustRead(repo, path, view)
        const r = path.endsWith('.dag') ? lintDag(text, parseDag(text)) : lintEtl(text, parseEtl(text))
        return { path, ...r }
      },
    },

    {
      name: 'partition_check', risk: 'read',
      description: '分区专项检查：INSERT 是否指定 PARTITION、分区键形态、SELECT 是否按分区过滤',
      parameters: { type: 'object', properties: { ...pathParam, view: { type: 'string', enum: ['committed', 'working'], description: 'committed（默认）| working（工作区未提交态）' } }, required: ['path'] },
      output: jsonOut,
      execute: async ({ path, view }) => {
        const p = parseEtl(mustRead(repo, path, view))
        const ok = !!p.partition && p.usesPartitionFilter
        return { path, ok, insertMode: p.insertMode, partition: p.partition, partitionFilterInWhere: p.usesPartitionFilter, advice: ok ? null : 'INSERT 需指定 PARTITION 且 WHERE 按 dt 过滤' }
      },
    },

    {
      name: 'danger_scan', risk: 'read',
      description: '危险模式扫描：DROP / TRUNCATE / 无 WHERE 的 DELETE / 无分区全量覆盖。命中即结构化返回（与审批插件的高危拦截规则同源）',
      parameters: { type: 'object', properties: { ...pathParam, view: { type: 'string', enum: ['committed', 'working'], description: 'committed（默认）| working（工作区未提交态）' } }, required: ['path'] },
      output: jsonOut,
      execute: async ({ path, view }) => {
        const p = parseEtl(mustRead(repo, path, view))
        const hits = []
        if (p.hasDrop) hits.push('DROP TABLE')
        if (p.hasTruncate) hits.push('TRUNCATE')
        if (p.hasDeleteNoWhere) hits.push('DELETE 无 WHERE')
        if (p.insertMode === 'OVERWRITE' && !p.partition) hits.push('INSERT OVERWRITE 无分区（全量覆盖）')
        return { path, safe: hits.length === 0, hits }
      },
    },

    {
      name: 'test_dryrun', risk: 'read',
      description: '只读采样试运行：约束固化在 Provider（只读账号、行数上限、超时熔断）。pass=false 时编排不变量要求不得进入 commit 审批',
      parameters: { type: 'object', properties: { ...pathParam, view: { type: 'string', enum: ['committed', 'working'], description: 'committed（默认）| working（工作区未提交态）' }, sampleRows: { type: 'number', description: '采样行数（受 Provider 上限截断）' } }, required: ['path'] },
      output: jsonOut,
      execute: async ({ path, view, sampleRows }) => {
        const sql = mustRead(repo, path, view)
        return { path, ...(await dryrun.dryrun({ sql, parsed: parseEtl(sql), sampleRows })) }
      },
    },
  ]
}
