// @his/domain-tools-dev — lint.js：ETL 代码检查规则（P1-2）
// 规则全部返回结构化条目 {rule, level: error|warn, message, suggestion}，
// error 级存在 = 编排不变量「lint 不过 → 不生成 dag」的判定依据。

export function lintEtl(text, parsed) {
  const issues = []
  const add = (rule, level, message, suggestion) => issues.push({ rule, level, message, suggestion })

  if (!parsed.job) add('anno.job', 'warn', '缺少 @job 注解', '文件头补 -- @job: <作业名>')
  if (!parsed.engine) add('anno.engine', 'warn', '缺少 @engine 注解', '文件头补 -- @engine: hive-sql')
  if (parsed.selectStar) add('sql.select-star', 'error', '禁止 SELECT *', '逐列显式列出字段，保证血缘与映射可解析')
  if (parsed.insertMode === 'OVERWRITE' && !parsed.partition)
    add('sql.partition', 'error', 'INSERT OVERWRITE 未指定 PARTITION（无分区全量覆盖）', '补 PARTITION(dt=\'${bizdate}\') 类分区子句')
  if (parsed.insertMode && !parsed.insertMode) add('sql.insert', 'error', '未识别 INSERT 语句', '明确 INSERT OVERWRITE/INTO TABLE')
  if (parsed.fromTables.length && !parsed.usesPartitionFilter)
    add('sql.partition-filter', 'warn', 'SELECT 未按 dt 分区过滤，可能全表扫描', 'WHERE 中加 dt = \'${bizdate}\' 条件')
  for (const c of parsed.columns) {
    if (!c.comment) add('column.comment', 'warn', `列 ${c.alias ?? c.expr} 缺少注释`, '逐列补中文注释；已绑标准用 @std/XXX vN 标注')
    if (/DECIMAL|STRING|TIMESTAMP/i.test(c.expr) && !c.funcs.includes('CAST') && /:/.test(c.expr))
      add('column.cast', 'warn', `列 ${c.alias ?? c.expr} 疑似隐式类型转换`, '显式 CAST 包裹')
  }
  if (parsed.hasDrop) add('danger.drop', 'error', '含 DROP TABLE', '域内禁止；确需执行走平台人工变更流')
  if (parsed.hasTruncate) add('danger.truncate', 'error', '含 TRUNCATE', '域内禁止')
  if (parsed.hasDeleteNoWhere) add('danger.delete', 'error', 'DELETE 无 WHERE', '域内禁止')

  // 列行逗号完整性（约定式检查：一列一行；非末列行代码段必须以逗号结尾，逗号在注释之前）
  const selMatch = text.match(/SELECT([\s\S]*?)\bFROM\b/i)
  if (selMatch && !parsed.selectStar) {
    const colLines = selMatch[1].split('\n').map((l) => l.replace(/--.*$/, '').trim()).filter(Boolean)
    colLines.forEach((code, i) => {
      if (i < colLines.length - 1 && !code.endsWith(',') && !code.endsWith('('))
        add('sql.column-comma', 'error', `第 ${i + 1} 个列行缺少行尾逗号（SQL 语法错误）: ${code.slice(0, 40)}…`, '逗号必须保留在行尾注释之前；etl_patch 已修复此缺陷，请重新生成')
    })
  }

  return { pass: !issues.some((i) => i.level === 'error'), issues }
}

export function lintDag(text, dag) {
  const issues = []
  const add = (rule, level, message, suggestion) => issues.push({ rule, level, message, suggestion })
  if (!dag.ref) add('dag.ref', 'error', '缺少 ref 指向 .etl 文件', '补 ref: etl/xxx/yyy.etl')
  if (dag.ref && !dag.ref.endsWith('.etl')) add('dag.ref-kind', 'error', `ref 必须指向 .etl 文件: ${dag.ref}`, '两文件分离契约：dag 不内嵌 SQL')
  if (!dag.cron) add('dag.cron', 'error', '缺少 cron 触发表达式', '补 cron（建议避开整点/半点）')
  if (!dag.timeout) add('dag.timeout', 'warn', '缺少 timeout 熔断', '补 timeout 秒数')
  return { pass: !issues.some((i) => i.level === 'error'), issues }
}
