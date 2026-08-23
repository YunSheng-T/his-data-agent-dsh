// @his/workspace-repo — 租户层 Provider（V10/V11 代码仓平台化）
//
// 四级定位：tenant://{tenant}/{repo}@{branch}/{path}
//   - 租户 → 仓 是一对一映射（演示态：finance→finance-dw 全量；risk→risk-mart 空仓占位）
//   - 分支隔离仍交给 git 原生；租户隔离在本层硬执行（新建作业守卫）
//   - 分包归属 = Registry 投影：按路径前缀定归属平台，不猜不嗅探；
//     未接入平台的分包（etl_legacy/）照常可见但只读——设计纪律：其余平台本版不接，但不假装不存在
//
// 对上层（域工具/锚定/studio）暴露与 GitRepoProvider 相同的方法面，全部代理到当前租户仓；
// 生产期本层整层替换为平台多租户仓 API。

import fs from 'node:fs'
import path from 'node:path'
import { GitRepoProvider } from './provider-git.js'

export const TENANTS = {
  finance: { repo: 'finance-dw', cn: '财税数据租户', dataTenant: true },
  risk: { repo: 'risk-mart', cn: '风控数据租户', dataTenant: false },
}

/** 分包注册表：路径前缀 → 归属平台（connected=false = 未接入 · 只读演示） */
export const PACKAGE_REGISTRY = [
  { prefix: 'etl/', platform: '主力 ETL 平台', connected: true },
  { prefix: 'dag/', platform: '调度平台', connected: true },
  { prefix: 'etl_legacy/', platform: '遗留 ETL 平台', connected: false },
]

export function packageOf(p) {
  return PACKAGE_REGISTRY.find((k) => p.startsWith(k.prefix)) ?? null
}

export class TenantRepoProvider {
  /** rootDir: 多租户仓根目录（runtime/repos）；legacyDir: 单仓时代的旧目录（存在则迁移为 finance 仓） */
  constructor(rootDir, { legacyDir } = {}) {
    this.root = rootDir
    this.repos = new Map()
    this.current = 'finance'
    if (legacyDir) this.#migrateLegacy(legacyDir)
  }

  #migrateLegacy(legacyDir) {
    const target = path.join(this.root, TENANTS.finance.repo)
    if (fs.existsSync(path.join(legacyDir, '.git')) && !fs.existsSync(target)) {
      fs.mkdirSync(this.root, { recursive: true })
      fs.renameSync(legacyDir, target)
      console.error(`[workspace-repo] 单仓迁移为多租户布局: ${legacyDir} → ${target}`)
    }
  }

  /** 挂载仓：未初始化则按 seedFiles 初始化（空种子 → 空提交占位，对应「空租户」） */
  mount(tenantId, seedFiles = {}, seedMessage) {
    const t = TENANTS[tenantId]
    if (!t) throw new Error(`未知租户: ${tenantId}`)
    const repo = new GitRepoProvider(path.join(this.root, t.repo))
    if (!repo.initialized) {
      repo.init(seedFiles, { message: seedMessage ?? `init: ${t.cn} 种子仓` })
      console.error(`[workspace-repo] 租户仓已初始化: ${tenantId}/${t.repo}（${Object.keys(seedFiles).length} 个种子文件）`)
    }
    this.repos.set(tenantId, repo)
    return repo
  }

  /** 补种演示分包（老仓迁移后缺 etl_legacy 时补一个只读演示文件并提交） */
  ensureExtras(tenantId, extras, message = 'chore: 接入遗留平台分包投影（只读）') {
    const repo = this.repos.get(tenantId)
    const missing = Object.entries(extras).filter(([rel]) => repo.readCommitted(repo.currentBranch(), rel) == null)
    if (!missing.length) return false
    for (const [rel, content] of missing) {
      const abs = path.join(repo.dir, rel)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content)
    }
    repo.git('add', '-A')
    repo.git('commit', '-qm', message)
    return true
  }

  // ---------- 租户语义 ----------
  tenants() {
    return Object.entries(TENANTS).map(([id, t]) => ({ id, ...t, active: id === this.current }))
  }

  currentTenant() {
    return { id: this.current, ...TENANTS[this.current] }
  }

  switchTenant(id) {
    if (!TENANTS[id]) throw new Error(`未知租户: ${id}（可选: ${Object.keys(TENANTS).join(', ')}）`)
    if (!this.repos.has(id)) throw new Error(`租户仓未挂载: ${id}`)
    this.current = id
    return this.currentTenant()
  }

  /** 对象全地址（审计留痕/correlation id 携带） */
  address(relPath = '') {
    const t = this.currentTenant()
    return `tenant://${t.id}/${t.repo}@${this.repo.currentBranch()}${relPath ? '/' + relPath : ''}`
  }

  /** 分包注册表 / 路径归属（Registry 投影，供 studio 渲染徽标与只读态） */
  packages() { return PACKAGE_REGISTRY }
  packageOf(p) { return packageOf(p) }

  // ---------- 代理当前租户仓（与 GitRepoProvider 同方法面） ----------
  get repo() {
    const r = this.repos.get(this.current)
    if (!r) throw new Error(`租户仓未挂载: ${this.current}`)
    return r
  }
  get dir() { return this.repo.dir }
  get initialized() { return this.repo.initialized }
  branches() { return this.repo.branches() }
  currentBranch() { return this.repo.currentBranch() }
  checkout(...a) { return this.repo.checkout(...a) }
  tree(...a) { return this.repo.tree(...a) }
  treeWithState(...a) { return this.repo.treeWithState(...a) }
  readCommitted(...a) { return this.repo.readCommitted(...a) }
  readWorking(...a) { return this.repo.readWorking(...a) }
  status() { return this.repo.status() }
  isClean() { return this.repo.isClean() }
  commitAll(...a) { return this.repo.commitAll(...a) }
  add(...a) { return this.repo.add(...a) }
  diffNames(...a) { return this.repo.diffNames(...a) }
  git(...a) { return this.repo.git(...a) }

  /** 写工作区（守卫在本层硬执行，V11 注意 3）：非数据租户 / 未接入分包一律拒绝 */
  writeWorking(relPath, content) {
    const t = this.currentTenant()
    if (!t.dataTenant) {
      throw new Error(`新建作业守卫：租户 ${t.id}（${t.cn}）未接入数据开发范围，只读浏览`)
    }
    const pkg = packageOf(relPath)
    if (pkg && !pkg.connected) {
      throw new Error(`分包守卫：${pkg.prefix} 归属「${pkg.platform}」，未接入 Agent 工作范围 · 仅只读`)
    }
    return this.repo.writeWorking(relPath, content)
  }
}
