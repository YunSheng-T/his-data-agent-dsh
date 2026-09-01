// @his/domain-tools-dev — codegen.js：建模产出 → ETL/调度代码生成（P1-3）
//
// 核心链路（任务书交付物 2 + 验收条款 3）：
//   etl_codegen 的输入 = 模型服务里的模型版本 + 标准绑定状态（hisModeling.readFields），
//   逐列注释携带 @std 引用——建模改了绑定，重新生成代码就变。
// 生成物写工作区（未提交态），commit 是独立的 gated 闸门。

import { parseEtl, parseDag } from './ast.js'
import { lintEtl, lintDag } from './lint.js'

/** 列表达式生成规则（朴素但确定：绑定状态 → 转换方式） */
function columnExpr(f) {
  if (f.skip) return { expr: f.n, note: f.skip }
  if (!f.std) return { expr: f.n, note: '未绑定标准' }
  if (f.fixType) return { expr: `CAST(${f.n} AS ${f.fixType})`, note: `类型对齐 ${f.fixType}` }
  if (/FLAG_YN/.test(f.std)) return { expr: `NVL(${f.n}, 'N')`, note: '空值补 N' }
  return { expr: f.n, note: null }
}

/** 生成 .etl 全文（Hive SQL 引擎） */
export function genEtl({ model, jobPath, source }) {
  const job = jobPath.split('/').pop().replace(/\.etl$/, '')
  const targetTable = `dwd.${model.model ?? model.name}`
  const lines = model.fields.map((f, i) => {
    const { expr, note } = columnExpr(f)
    const comment = [f.c, f.std ? `@${f.std}` : null, note].filter(Boolean).join(' · ')
    const exprPart = expr === f.n ? f.n : `${expr} AS ${f.n}`
    const comma = i < model.fields.length - 1 ? ',' : '' // 逗号必须在注释前（SQL 语法）
    return `  ${exprPart.padEnd(42)}${comma} -- ${comment}`
  })
  return `-- @job: ${job}
-- @engine: hive-sql
-- @source: ${source}
-- @target: ${targetTable}
-- @model: ${model.file} ${model.version}（${model.published ? '已发布' : '未发布'}） · 绑定率 ${model.bindingRate}
-- 本文件由 etl_codegen 从建模空间生成；逐列注释携带数据标准引用，模型绑定变更后需重新生成
INSERT OVERWRITE TABLE ${targetTable} PARTITION(dt='\${bizdate}')
SELECT
${lines.join('\n')}
FROM ${source}
WHERE dt = '\${bizdate}';
`
}

/** 生成 .dag 全文（yaml；ref 指向 .etl，两文件分离契约） */
export function genDag({ ref, cron, depends = [], timeout = 1800, maxAttempts = 3, alertChannel = '财税域值班群' }) {
  const job = ref.split('/').pop().replace(/\.etl$/, '')
  return `# @job: ${job} 调度作业
# ref 指向独立的 .etl 文件 —— 两文件分离提交、分离审计
ref: ${ref}
cron: "${cron}"${''}
depends:${depends.length ? '\n' + depends.map((d) => `  - ${d}`).join('\n') : ' []'}
retry:
  maxAttempts: ${maxAttempts}
  intervalSeconds: 300
alert:
  channel: ${alertChannel}
  on: [failure, timeout]
timeout: ${timeout}
`
}

/** 生成 dbscript/*.sql（SQL 脚本作业，V15 新建能力）——模板可编辑，头部 @engine/@job/@target 注解供
 * scanScriptJob 本体分类/一致性扫描识别；列级 @std/v 标准引用注释携带建模标准绑定，供与设计态对比。
 * 与 genEtl 的分工：genEtl 生成 .etl（ETL 作业）；genSql 生成 .sql（数据库脚本 / DDL 订正类）。 */
export function genSql({ path, engine = 'Hive SQL', target, columns = [], mode }) {
  const job = path.split('/').pop().replace(/\.sql$/, '')
  const targetTable = target ?? 'dwd.' + job
  // 可解析结构（供 scanScriptJob / extractTable 识别 targetTable 并匹配模型 implements 关系）
  if (mode !== 'query') {
    const cols = columns.length
      ? columns.map((c, i) => `  ${c.expr ?? c.name}${c.type ? ' ' + c.type : ''}${(i < columns.length - 1) ? ',' : ''} -- ${c.comment ?? ''}`).join('\n')
      : `  -- 在此编写 DDL 订正列；逐列可挂 @std/v 标准引用注释（如 col_a STRING -- @std/tax_id v1）
  col_a STRING
  ,col_b DECIMAL(18,2)`
    return `-- @job: ${job}
-- @engine: ${engine}
-- @target: ${targetTable}
-- @kind: dbscript
-- 本文件由 sql_create 新建（模板可编辑），用于数据库脚本 / DDL 订正；与模型设计态的一致性走本体扫描
ALTER TABLE ${targetTable} ADD COLUMNS (
${cols.trim()}
);
`
  }
  const cols = columns.length
    ? columns.map((c, i) => `  ${c.expr ?? c.name}${(i < columns.length - 1) ? ',' : ''} -- ${c.comment ?? ''}`).join('\n')
    : `  -- 在此编写查询列映射；逐列可挂 @std/v 标准引用注释（如 id -- @std/tax_id v1）
  id
  ,col_a
  ,dt`
  return `-- @job: ${job}
-- @engine: ${engine}
-- @target: ${targetTable}
-- @kind: dbscript
-- 本文件由 sql_create 新建（模板可编辑）；SELECT 查询型脚本
SELECT
${cols.trim()}
FROM ${targetTable}
WHERE dt = '\${bizdate}';
`
}

/** 列级 diff 修改（修改链路）：AST 定位目标列，只动 .etl 的该列行 */
export function patchColumn(text, { column, expr, comment }) {
  const parsed = parseEtl(text)
  const colIdx = parsed.columns.findIndex((c) => c.alias === column)
  const hit = parsed.columns[colIdx]
  if (!hit) throw new Error(`列不存在: ${column}（现有列: ${parsed.columns.map((c) => c.alias).filter(Boolean).join(', ')}）`)
  const lines = text.split('\n')
  const idx = lines.findIndex((l) => new RegExp(`\\b${column}\\b`).test(l) && l.includes('--') )
  // 精确定位：含该列别名且含注释的 SELECT 列行；找不到退化到含别名的行
  const target = idx >= 0 ? idx : lines.findIndex((l) => new RegExp(`\\b${column}\\b`).test(l))
  if (target < 0) throw new Error(`无法在文本中定位列行: ${column}`)
  const before = lines[target]
  // 逗号是 SQL 语法的一部分：非末列必须有行尾逗号（注释之前）；原行已带逗号时也必须保留
  const hadComma = before.split('--')[0].trimEnd().endsWith(',')
  const needComma = hadComma || colIdx < parsed.columns.length - 1
  const newExpr = expr ?? hit.expr
  const newComment = comment ?? hit.comment ?? ''
  const exprPart = newExpr === column ? column : `${newExpr} AS ${column}`
  const replaced = `  ${exprPart.padEnd(42)}${needComma ? ',' : ''} -- ${newComment}`
  lines[target] = replaced
  return { text: lines.join('\n'), before, after: replaced, column }
}

export { lintEtl, lintDag, parseEtl, parseDag }
