// @his/domain-tools-dev — provider-dryrun.js：dry-run 沙箱 seam（P1-2）
//
// seam 设计（技术方案 §11）：安全约束固化在 Provider，不依赖模型自觉。
//   READONLY   —— 只允许 SELECT/INSERT 类语句的「采样执行」语义，DDL/DML 变更直接拒绝
//   MAX_ROWS   —— 采样行数上限
//   TIMEOUT_MS —— 超时熔断
// 本期实现 LocalSimProvider（解析 + 结构化采样计划，不真正执行 SQL）；
// 生产期替换为 DuckDB/Livy Provider，接口签名不变（Consumer 一行不动）。

export const DRYRUN_CONSTRAINTS = Object.freeze({
  READONLY: true,
  MAX_ROWS: 1000,
  TIMEOUT_MS: 30_000,
})

export class LocalSimDryrunProvider {
  constructor(constraints = DRYRUN_CONSTRAINTS) {
    this.constraints = constraints
    this.kind = 'local-sim'
  }

  /**
   * @param {{sql: string, parsed: object, sampleRows?: number}} req
   * @returns 结构化采样结果；约束违反走 blocked（不是异常，模型可读）
   */
  async dryrun({ sql, parsed, sampleRows }) {
    const c = this.constraints
    const rows = Math.min(sampleRows ?? 100, c.MAX_ROWS)

    if (parsed.hasDrop || parsed.hasTruncate || parsed.hasDeleteNoWhere) {
      return { ok: false, blocked: true, reason: 'dry-run 只读账号拒绝 DDL/危险 DML（约束固化在 Provider）', constraints: c }
    }
    if (!parsed.insertMode && !/^\s*SELECT/i.test(sql)) {
      return { ok: false, blocked: true, reason: 'dry-run 仅支持 SELECT / INSERT ... SELECT 作业', constraints: c }
    }

    const started = Date.now()
    // 本地模拟：不做真实计算，返回采样计划与估算（诚实标注 simulated: true）
    return {
      ok: true,
      simulated: true,
      engine: parsed.engine ?? 'hive-sql',
      sourceTables: parsed.fromTables,
      targetTable: parsed.targetTable,
      partition: parsed.partition,
      sampledRows: rows,
      cappedBy: c.MAX_ROWS,
      columns: parsed.columns.map((col) => ({ name: col.alias, funcs: col.funcs, stdRef: col.stdRef })),
      elapsedMs: Date.now() - started,
      timeoutMs: c.TIMEOUT_MS,
      note: '本地模拟采样（未连真实引擎）；生产期 seam 替换为 DuckDB/集群 Livy 后此字段消失',
    }
  }
}
