// @his/domain-tools-dev — provider-sched.js：调度系统 mock Provider（P1-4）
// seam 设计：sched_publish 的 Consumer（工具定义）只面对这个接口；
// 生产期替换为真实调度平台（DolphinScheduler/Airflow/自研）Provider，工具定义不动。

export class LocalSchedProvider {
  constructor() {
    this.kind = 'local-sim'
    this.jobs = new Map() // dagPath -> {dagPath, ref, cron, status, publishedAt, version}
  }

  /** 上线：注册/更新调度作业 */
  publish({ dagPath, parsed, commitId }) {
    const prev = this.jobs.get(dagPath)
    const entry = {
      dagPath,
      ref: parsed.ref,
      cron: parsed.cron,
      depends: parsed.depends,
      timeout: parsed.timeout,
      status: 'online',
      commitId: commitId ?? null,
      version: prev ? prev.version + 1 : 1,
      publishedAt: new Date().toISOString(),
    }
    this.jobs.set(dagPath, entry)
    return { published: true, entry, note: '本地模拟调度注册表；生产期 seam 替换为调度平台 Provider' }
  }

  list() {
    return [...this.jobs.values()]
  }
}
