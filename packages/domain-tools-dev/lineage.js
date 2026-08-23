// @his/domain-tools-dev — lineage.js：血缘计算（definitions.js 与 studio-ui 共用单一事实源）
import { parseEtl, parseDag } from './ast.js'

/** 全仓作业索引：扫当前分支已提交视图的 .etl/.dag，建 target/source/depends 映射 */
export function jobIndex(repo) {
  const branch = repo.currentBranch()
  const tree = repo.tree(branch)
  const etls = tree.filter((e) => e.kind === 'etl').map((e) => {
    const parsed = parseEtl(repo.readCommitted(branch, e.path))
    return { path: e.path, parsed }
  })
  const dags = tree.filter((e) => e.kind === 'dag').map((e) => ({ path: e.path, parsed: parseDag(repo.readCommitted(branch, e.path)) }))
  return { etls, dags }
}

export function upstream(repo, path) {
  const { etls, dags } = jobIndex(repo)
  const me = etls.find((e) => e.path === path)
  if (!me) throw new Error(`不是有效 .etl 作业: ${path}`)
  const byTable = me.parsed.fromTables.map((t) => ({
    table: t,
    producedBy: etls.filter((e) => e.path !== path && e.parsed.targetTable && t.endsWith(e.parsed.targetTable.split('.').pop())).map((e) => e.path),
  }))
  const myDag = dags.find((d) => d.parsed.ref === path)
  return { job: path, sources: byTable, scheduleDepends: myDag?.parsed.depends ?? [], note: '无上游则为链路入口（ODS 接入或外部源）' }
}

export function downstream(repo, path) {
  const { etls, dags } = jobIndex(repo)
  const me = etls.find((e) => e.path === path)
  if (!me) throw new Error(`不是有效 .etl 作业: ${path}`)
  const target = me.parsed.targetTable
  const readers = target
    ? etls.filter((e) => e.path !== path && e.parsed.fromTables.some((t) => t.endsWith(target.split('.').pop()))).map((e) => e.path)
    : []
  const myDagPath = `dag/${me.parsed.job ?? path.split('/').pop().replace('.etl', '')}.dag`
  const dagDependents = dags.filter((d) => d.parsed.depends.includes(myDagPath)).map((d) => d.path)
  return { job: path, targetTable: target, readers, dagDependents, impact: readers.length + dagDependents.length }
}

/**
 * P2-1 反向联动：模型 → 引用它的作业清单。
 * 匹配优先级：@model 注解（codegen 埋点，精确到模型文件）→ targetTable 尾名兜底（手写作业）。
 * 返回 [{path, baseVersion, via}]，stale 判定由调用方对照模型服务当前版本。
 */
export function jobsForModel(repo, modelFile) {
  const { etls } = jobIndex(repo)
  const modelName = modelFile.replace(/\.model$/, '')
  return etls
    .map((e) => {
      if (e.parsed.modelFile === modelFile) return { path: e.path, baseVersion: e.parsed.modelVersion, via: '@model 注解' }
      if (e.parsed.targetTable?.split('.').pop() === modelName) return { path: e.path, baseVersion: e.parsed.modelVersion ?? null, via: 'targetTable 尾名' }
      return null
    })
    .filter(Boolean)
}
