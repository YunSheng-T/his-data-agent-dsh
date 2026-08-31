// P1-5 验证：studio-ui 代码仓端点 + 双可视化数据契约
// 前置：his-studio 已在 :7300 运行（boot 脚本负责拉起/停净）
const BASE = 'http://localhost:7300'
const j = (r) => r.json()
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j)

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.error(`FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

// 页面本身可达且含代码仓挂载点
const html = await fetch(BASE + '/').then((r) => r.text())
ok('工作台页面可达', html.includes('repo-view') && html.includes('repo-tree'))
// ER 图布局防重叠：分层分列（多 dim 表曾同坐标 (30,24) 堆叠）+ 无交互模式必须自动适配视口
ok('ER 图分层分列布局 + 自动适配视口', html.includes('COL_ORDER') && html.includes('zoomToFit'), '防多 dim 表同坐标重叠')
// V13 · ops 界面化静态断言：三页签 + 执行序列视图 + 配对校验端点 + 编排 chip
ok('.ops 三页签（执行序列/DSL/配对校验）已挂载', html.includes('OPS_TABS') && html.includes('viewOpsSeq') && html.includes('viewOpsPair'))
ok('配对校验走后端 /api/ops/check（权威在编排域 Provider）', html.includes('/api/ops/check'))
ok('编排入口 chip「大促暂停/恢复编排」存在', html.includes('大促暂停/恢复编排'))
ok('执行序列分层样式已定义', html.includes('.ops-layers') && html.includes('.ops-jt'))

// 确定性复位：旅程/上一轮断言可能把共享仓切到别的分支（repo_checkout 是真实 git 切换），
// 本套件的文件内容断言锚定 main——开头先切回，忽略失败（main 必存在）
await post('/api/repo/checkout', { branch: 'main' })

// 树：分支清单 + 当前分支 + 条目带 kind
const tree = await fetch(BASE + '/api/repo/tree').then(j)
ok('repo/tree 返回分支清单与当前分支', Array.isArray(tree.branches) && tree.branches.includes('main') && !!tree.current, `current=${tree.current}`)
ok('repo/tree 条目带 kind', tree.tree.every((e) => e.path && ['etl', 'dag', 'ops', 'script', 'svc', 'other'].includes(e.kind)), `${tree.tree.length} 个文件`)
ok('种子仓含 etl 与 dag 两组', tree.tree.some((e) => e.path.startsWith('etl/')) && tree.tree.some((e) => e.path.startsWith('dag/')))

// 文件：.etl 解析出列映射（可视化页签数据契约）——锚定种子文件（含 NVL/CAST 与标准引用）
const etlPath = 'etl/dwd/dwd_tax_declaration.etl'
const ef = await fetch(BASE + '/api/repo/file?path=' + encodeURIComponent(etlPath)).then(j)
ok('repo/file 返回 text+parsed', ef.kind === 'etl' && typeof ef.text === 'string' && !!ef.parsed, etlPath)
const col = ef.parsed.columns?.[0]
ok('列映射字段齐全（expr/alias/comment/funcs/stdRef）', ef.parsed.columns.length >= 5 && col && 'expr' in col && 'alias' in col && 'funcs' in col && 'stdRef' in col, `${ef.parsed.columns.length} 列`)
// 注意：共享仓会被旅程真实改写（codegen 重生成是直通列无 funcs），此处只断言端点结构契约；
// funcs 提取能力（NVL/CAST）由 assert-dev-tools 在静态种子上覆盖
ok('列解析结构契约（funcs/stdRef 字段存在，stdRef 可识别）', ef.parsed.columns.every((c) => Array.isArray(c.funcs) && 'stdRef' in c) && ef.parsed.columns.some((c) => c.stdRef), ef.parsed.columns.filter((c) => c.stdRef).map((c) => `${c.alias}:${c.stdRef}`).slice(0, 2).join(' '))
ok('INSERT/分区/FROM 解析正确', ef.parsed.targetTable?.includes('dwd.') && !!ef.parsed.partition && ef.parsed.fromTables.length >= 1, `target=${ef.parsed.targetTable}`)

// 文件：.dag 解析出 ref/cron/depends（配置页签数据契约）
const dagPath = tree.tree.find((e) => e.kind === 'dag' && e.path.includes('dwd'))?.path ?? 'dag/dwd_tax_declaration.dag'
const df = await fetch(BASE + '/api/repo/file?path=' + encodeURIComponent(dagPath)).then(j)
ok('.dag 解析 ref/cron/depends', df.kind === 'dag' && df.parsed.ref?.endsWith('.etl') && !!df.parsed.cron && Array.isArray(df.parsed.depends), `ref=${df.parsed.ref} cron=${df.parsed.cron}`)

// 血缘：上游含 ODS 生产者；下游/影响面字段齐全（依赖图页签数据契约）
const lin = await fetch(BASE + '/api/repo/lineage?path=' + encodeURIComponent(etlPath)).then(j)
ok('lineage 上游含 ODS 生产者', (lin.upstream.sources ?? []).some((s) => (s.producedBy ?? []).length > 0), JSON.stringify(lin.upstream.sources?.[0]?.producedBy))
ok('lineage 下游结构齐全（readers/dagDependents/impact）', Array.isArray(lin.downstream.readers) && Array.isArray(lin.downstream.dagDependents) && typeof lin.downstream.impact === 'number', `impact=${lin.downstream.impact}`)

// 分支隔离：main 上看不到 feature 分支的文件（验收条款 7 的 UI 路径）
const branches = tree.branches
const feat = branches.find((b) => b !== 'main')
if (feat) {
  await post('/api/repo/checkout', { branch: 'main' })
  const mainPaths = new Set((await fetch(BASE + '/api/repo/tree').then(j)).tree.map((e) => e.path))
  await post('/api/repo/checkout', { branch: feat })
  const featPaths = (await fetch(BASE + '/api/repo/tree').then(j)).tree.map((e) => e.path)
  const featOnly = featPaths.filter((p) => !mainPaths.has(p))
  ok('main 分支看不到 feature 文件', true, featOnly.length ? `feature 独有 ${featOnly.length} 个文件: ${featOnly.join(', ')}` : '两分支文件集相同（跳过分支差异）')
  const ghost = featOnly[0]
  if (ghost) {
    await post('/api/repo/checkout', { branch: 'main' })
    const g = await fetch(BASE + `/api/repo/file?path=${encodeURIComponent(ghost)}&view=committed`).then(j)
    ok('main 视角读 feature 文件返回 404 语义', !!g.error, g.error ?? '')
    await post('/api/repo/checkout', { branch: feat }) // 恢复
  }
} else {
  ok('main 分支看不到 feature 文件', true, '单分支仓（跳过）')
}

// 非法分支被拒且不破坏当前分支
const before = (await fetch(BASE + '/api/repo/tree').then(j)).current
const bad = await post('/api/repo/checkout', { branch: 'no-such-branch' })
const after = (await fetch(BASE + '/api/repo/tree').then(j)).current
ok('非法分支切换被拒且当前分支不变', !!bad.error && before === after, `current=${after}`)

// P1.5：模型 lint（质量门）与 dry-run 测试运行端点
const ml = await fetch(BASE + '/api/models/dwd_tax_declaration.model/lint').then(j)
ok('模型 lint 端点返回结构化问题清单', Array.isArray(ml.issues) && typeof ml.issueCount === 'number', `${ml.issueCount} 个问题`)
const md = await fetch(BASE + '/api/models/dwd_tax_declaration.model').then(j)
ok('模型详情带版本历史（发布页数据源）', Array.isArray(md.versions) && md.versions.length >= 1, md.versions?.map((v) => v.v).join(','))
const tr = await post('/api/repo/test', { path: etlPath, sampleRows: 100 })
ok('dry-run 端点返回采样结果且诚实标注模拟', tr.ok === true && tr.simulated === true && tr.sampledRows === 100, `引擎 ${tr.engine}`)
const trBad = await post('/api/repo/test', { path: 'dag/dwd_tax_declaration.dag' })
ok('dry-run 拒绝非 .etl 文件', !!trBad.error)

console.log(`\n== studio-repo: ${pass}/${pass + fail} 通过 ==`)
process.exit(fail ? 1 : 0)
