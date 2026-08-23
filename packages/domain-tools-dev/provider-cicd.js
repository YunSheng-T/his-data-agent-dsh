// @his/domain-tools-dev — CICD 平台适配器（演示态 mock，V10 扫描体系）
//
// 设计纪律（提示词 04 · 注意 1）：扫描状态、流水线号均为内置演示数据/本地计算；
// 正式实现整层替换为 CICD 平台 API（触发流水线、订阅报告），Consumer 与工具定义不动。
//
// 权威语义：
//   - 流水线由 repo_commit 提交后自动触发（cicd_trigger 不单独暴露为工具，无手工触发入口）
//   - 报告是提交时刻的快照：提交时对每个 .etl 文件计算三类扫描（设计质量/SQL/一致性）
//   - 未提交的文件没有报告（UI 不显示扫描点）；工作区有未提交修改时报告标注「非最新」

export class LocalCicdProvider {
  constructor() {
    this.kind = 'local-mock'
    this.seq = 4820 // 演示起始流水线号（对齐原型 #4821 起）
    this.ruleset = 'v1.2'
    this.pipelines = [] // {id, commitId, branch, at, scans: {path: scan}}
  }

  /** repo_commit 提交后调用：登记流水线（scans 由工具层现场计算后传入） */
  trigger({ commitId, branch, scans }) {
    const p = {
      id: ++this.seq,
      commitId, branch,
      ruleset: this.ruleset,
      at: new Date().toISOString(),
      scans, // { path: {design:{pass,...}, sql:{pass,...}, consistency:{pass|null,diffs}, verdict} }
    }
    this.pipelines.push(p)
    return p
  }

  /** 某文件最近一次被流水线覆盖的报告（branch 维度匹配，取最新一条） */
  latestFor(path, branch) {
    for (let i = this.pipelines.length - 1; i >= 0; i--) {
      const p = this.pipelines[i]
      if (branch && p.branch !== branch) continue
      if (p.scans[path]) return { pipeline: { id: p.id, commitId: p.commitId, branch: p.branch, ruleset: p.ruleset, at: p.at }, scan: p.scans[path] }
    }
    return null
  }

  /** 文件行扫描点摘要（studio 用）：'pass' | 'diff' | null（无报告） */
  verdictFor(path, branch) {
    const hit = this.latestFor(path, branch)
    return hit ? scanVerdict(hit.scan) : null
  }

  list() { return this.pipelines }
}

/** 汇总判定：三类扫描全过 → pass；任一 fail → fail；一致性未知(null) 不判 fail */
export function scanVerdict(scan) {
  if (!scan) return null
  const parts = [scan.design?.pass, scan.sql?.pass, scan.consistency?.pass]
  return parts.some((p) => p === false) ? 'diff' : 'pass'
}
