// @his/workspace-repo — Provider 层：本地真实 git 仓封装（P1-1）
//
// 分支隔离语义全部交给 git 原生能力（M1a 穿刺结论，零自研）：
//   - 已提交目录树 = git ls-tree <branch>（feature 未合并的文件在 main 视图天然不可见）
//   - 已提交文件内容 = git show <branch>:<path>
//   - 未提交态 = 工作区文件 + git status --porcelain（与已提交视图严格区分）
// 生产期可整层替换为平台代码仓 API（Consumer/工具定义不动）。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export class GitRepoProvider {
  constructor(dir) {
    this.dir = dir
  }

  git(...args) {
    return execFileSync('git', args, { cwd: this.dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
  }

  /** 不 trim 的原始输出（porcelain 等列对齐格式必须用原始字节） */
  gitRaw(...args) {
    return execFileSync('git', args, { cwd: this.dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  }

  get initialized() {
    return fs.existsSync(path.join(this.dir, '.git'))
  }

  /** 初始化空仓并提交种子文件（seedFiles: {相对路径: 内容}） */
  init(seedFiles, { branch = 'main', message = 'init: 种子仓（财税域 ETL）' } = {}) {
    fs.mkdirSync(this.dir, { recursive: true })
    this.git('init', '-q', '-b', branch)
    this.git('config', 'user.email', 'his-data-agent@local')
    this.git('config', 'user.name', 'HIS Data Agent')
    for (const [rel, content] of Object.entries(seedFiles)) {
      const abs = path.join(this.dir, rel)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content)
    }
    this.git('add', '-A')
    this.git('commit', '--allow-empty', '-qm', message) // 空种子（空租户占位仓）也允许
    return this
  }

  branches() {
    return this.git('branch', '--format=%(refname:short)').split('\n').filter(Boolean)
  }

  currentBranch() {
    return this.git('branch', '--show-current')
  }

  /** 切换分支；create=true 时从当前分支新建 */
  checkout(branch, { create = false } = {}) {
    if (!/^[A-Za-z0-9/_-]+$/.test(branch)) throw new Error(`非法分支名: ${branch}`)
    this.git('checkout', ...(create ? ['-b'] : []), branch)
    return this.currentBranch()
  }

  /** 已提交目录树：[{path, kind}]，kind ∈ etl|dag|other */
  tree(branch = this.currentBranch()) {
    const out = this.git('ls-tree', '-r', '--name-only', branch)
    return out.split('\n').filter(Boolean).map((p) => ({ path: p, kind: fileKind(p) }))
  }

  /** 已提交文件内容；文件在该分支不存在时返回 null（不抛错，供工具层表达「main 上还没有」） */
  readCommitted(branch, relPath) {
    try {
      return this.git('show', `${branch}:${relPath}`)
    } catch {
      return null
    }
  }

  /** 工作区状态：[{path, state}]，state: M(修改) | A(新增) | ??(未跟踪) */
  status() {
    const out = this.gitRaw('status', '--porcelain') // 不可 trim：首行前导空格是状态列
    if (!out.trim()) return []
    return out.split('\n').filter(Boolean).map((l) => {
      const m = l.match(/^(.{1,2})\s(.+)$/)
      return { state: m[1].trim(), path: m[2].trim().replace(/^"|"$/g, '') }
    })
  }

  /** 合并视图：已提交树 + 未提交覆盖（uncommitted: true 的条目在「提交前目录树」语义下标出） */
  treeWithState(branch = this.currentBranch()) {
    const committed = new Map(this.tree(branch).map((e) => [e.path, e]))
    const dirty = this.status()
    for (const s of dirty) {
      const e = committed.get(s.path)
      if (e) e.dirty = s.state
      else if (s.state !== 'D') committed.set(s.path, { path: s.path, kind: fileKind(s.path), uncommitted: true, dirty: s.state })
    }
    return [...committed.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  readWorking(relPath) {
    const abs = path.join(this.dir, relPath)
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
  }

  /** 写工作区（未提交态）。只允许写在 etl/ 与 dag/ 下，且扩展名受文件类型契约约束 */
  writeWorking(relPath, content) {
    const kind = fileKind(relPath)
    if (kind === 'other') throw new Error(`文件类型契约拒绝: ${relPath}（只接受 etl/**/*.etl 与 dag/*.dag）`)
    if (kind === 'etl' && !relPath.startsWith('etl/')) throw new Error(`.etl 必须放在 etl/ 下: ${relPath}`)
    if (kind === 'dag' && !relPath.startsWith('dag/')) throw new Error(`.dag 必须放在 dag/ 下: ${relPath}`)
    const abs = path.join(this.dir, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
    return { path: relPath, kind, bytes: Buffer.byteLength(content) }
  }

  isClean() {
    return this.status().length === 0
  }

  /** 提交工作区全部变更（gated 工具调用它；返回 commit id 与统计） */
  commitAll(message) {
    if (this.isClean()) return { committed: false, reason: '工作区无变更' }
    const files = this.status().map((s) => s.path)
    this.git('add', '-A')
    this.git('commit', '-qm', message)
    return { committed: true, commitId: this.git('rev-parse', '--short', 'HEAD'), branch: this.currentBranch(), files }
  }

  /** 仅暂存（git_add 工具用；不改历史，workspace-write 语义） */
  add(paths) {
    this.git('add', '--', ...paths)
    return { staged: paths }
  }

  /** 分支间差异（feature 相对 main 的新增文件，供合并前检查/审计） */
  diffNames(base, head) {
    const out = this.git('diff', '--name-only', `${base}...${head}`)
    return out ? out.split('\n').filter(Boolean) : []
  }
}

/** 文件类型契约：.etl = ETL 作业；.dag = 调度作业（yaml）；其余拒绝 */
export function fileKind(p) {
  if (p.endsWith('.etl')) return 'etl'
  if (p.endsWith('.dag')) return 'dag'
  return 'other'
}
