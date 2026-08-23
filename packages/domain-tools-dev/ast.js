// @his/domain-tools-dev — ast.js：.etl/.dag 轻量解析（P1-2）
// 面向种子语料的约定式解析：@注解头 + SELECT 逐列映射 + INSERT/PARTITION 结构。
// 不是通用 SQL 解析器；未知形态降级为「未识别」而非报错（模型可据此走人工确认）。

/** 解析 .etl（Hive SQL 引擎为主，Python 引擎只取注解头） */
export function parseEtl(text) {
  const anno = {}
  for (const m of text.matchAll(/--\s*@(\w+):\s*(.+)/g)) anno[m[1].toLowerCase()] = m[2].trim()
  // @model 注解（codegen 生成时埋点）：「模型文件 + 代码基线版本」，P2-1 反向提醒的判定依据
  const modelM = anno.model?.match(/^(\S+\.model)\s+(v[\d.]+)/)

  const insert = text.match(/INSERT\s+(OVERWRITE|INTO)\s+TABLE\s+([\w.一-龥]+)\s*(?:PARTITION\s*\(([^)]*)\))?/i)
  const fromTables = [...text.matchAll(/\bFROM\s+([\w.一-龥]+)/gi)].map((m) => m[1])
  const selMatch = text.match(/SELECT([\s\S]*?)\bFROM\b/i)

  return {
    job: anno.job ?? null,
    engine: anno.engine ?? null,
    sourceAnno: anno.source ?? null,
    targetAnno: anno.target ?? null,
    modelFile: modelM?.[1] ?? null,
    modelVersion: modelM?.[2] ?? null,
    insertMode: insert?.[1]?.toUpperCase() ?? null,
    targetTable: insert?.[2] ?? null,
    partition: insert?.[3]?.trim() ?? null,
    fromTables,
    columns: parseColumns(selMatch?.[1] ?? ''),
    selectStar: /SELECT\s+\*/i.test(text),
    usesPartitionFilter: /\bWHERE\b[\s\S]*?\bdt\b\s*=/i.test(text),
    hasDrop: /\bDROP\s+TABLE\b/i.test(text),
    hasTruncate: /\bTRUNCATE\b/i.test(text),
    hasDeleteNoWhere: /\bDELETE\s+FROM\b(?![\s\S]*?\bWHERE\b)/i.test(text),
  }
}

/** 解析 SELECT 列清单：逐列 {expr, alias, comment, funcs, stdRef}。
 * 逐行处理：行尾 `--` 注释归属本行所在的列（先摘注释再按深度感知逗号切段） */
export function parseColumns(sel) {
  const cols = []
  let depth = 0
  let cur = ''
  let curComment = null
  const flush = () => {
    if (cur.trim()) cols.push(makeCol(cur, curComment))
    cur = ''
    curComment = null
  }
  for (const rawLine of sel.split('\n')) {
    const cm = rawLine.match(/--\s*(.+)$/)
    if (cm && !curComment) curComment = cm[1].trim()
    const line = rawLine.replace(/--.*$/, '')
    for (const ch of line) {
      if (ch === '(') depth++
      if (ch === ')') depth = Math.max(0, depth - 1)
      if (ch === ',' && depth === 0) { flush(); continue }
      cur += ch
    }
    cur += '\n'
  }
  flush()
  return cols
}

function makeCol(seg, comment) {
  const body = seg.trim()
  const asM = body.match(/([\s\S]*?)\s+AS\s+(\w+)\s*$/i)
  const expr = (asM ? asM[1] : body).trim()
  const alias = asM ? asM[2] : (body.match(/^([\w.]+)$/)?.[1]?.split('.').pop() ?? null)
  const funcs = [...new Set([...expr.matchAll(/\b(NVL|CAST|IF|COALESCE|CASE|TRIM|SUBSTR|CONCAT)\b/gi)].map((m) => m[1].toUpperCase()))]
  const stdRef = comment?.match(/@std\/[\w_]+\s*v\d+/)?.[0] ?? null
  return { expr, alias, comment, funcs, stdRef }
}

/** 解析 .dag（yaml 子集：ref/cron/depends/retry/alert/timeout） */
export function parseDag(text) {
  const get = (k) => text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null
  // 行值先摘行尾注释；cron 优先取引号内文本
  const stripCm = (v) => v?.replace(/\s+#.*$/, '').trim() ?? null
  const cronRaw = text.match(/^cron:\s*"([^"]+)"/m)?.[1] ?? stripCm(get('cron'))
  const dependsBlock = text.match(/^depends:\s*\n((?:\s+-\s+.+\n?)*)/m)
  const depends = dependsBlock
    ? [...dependsBlock[1].matchAll(/-\s+(.+)/g)].map((m) => m[1].trim())
    : (get('depends') === '[]' ? [] : [])
  return {
    ref: stripCm(get('ref')),
    cron: cronRaw ?? null,
    depends,
    timeout: Number(get('timeout')) || null,
    maxAttempts: Number(text.match(/maxAttempts:\s*(\d+)/)?.[1]) || null,
  }
}

/** 定位字段映射（修改链路用）：按目标列名找列位置与表达式 */
export function locateColumn(parsed, column) {
  const idx = parsed.columns.findIndex((c) => c.alias === column)
  if (idx < 0) return null
  return { index: idx, ...parsed.columns[idx] }
}
