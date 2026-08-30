// workspace-repo Provider 断言（P1-1）：不依赖 dsh/模型，纯 git 语义
// 对应 P1 验收条款 2（commit 前目录树不可见）与 7（main 看不到 feature 未合并文件）
// 用法：node tests/regression/assert-repo.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GitRepoProvider } from '../../packages/workspace-repo/provider-git.js'
import { SEED_FILES } from '../../packages/workspace-repo/seed-repo.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'his-repo-'))
const repo = new GitRepoProvider(dir).init(SEED_FILES)

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

// 1. 种子仓形态
check('种子仓初始化：main 分支', repo.currentBranch() === 'main')
const mainTree = repo.tree('main')
check('种子仓 6 个文件（2 .etl + 2 .dag + 1 .sql + 1 .svc）', mainTree.length === 6, mainTree.map((e) => e.path).join(','))
check('文件类型契约识别', mainTree.filter((e) => e.kind === 'etl').length === 2 && mainTree.filter((e) => e.kind === 'dag').length === 2 && mainTree.filter((e) => e.kind === 'script').length === 1 && mainTree.filter((e) => e.kind === 'svc').length === 1)

// 2. feature 分支隔离（验收条款 7）
repo.checkout('feature/invoice', { create: true })
repo.writeWorking('etl/dwd/new_invoice.etl', '-- @job: new_invoice\nSELECT invoice_id FROM ods.ods_invoice;\n')
const c1 = repo.commitAll('feature: 新发票作业')
check('feature 提交成功', c1.committed && c1.branch === 'feature/invoice', c1.commitId)
check('feature 树含新作业', repo.tree('feature/invoice').some((e) => e.path === 'etl/dwd/new_invoice.etl'))
check('main 树看不到 feature 未合并文件', !repo.tree('main').some((e) => e.path === 'etl/dwd/new_invoice.etl'))
check('main 上读 feature 文件返回 null', repo.readCommitted('main', 'etl/dwd/new_invoice.etl') === null)
check('分支差异可枚举', repo.diffNames('main', 'feature/invoice').includes('etl/dwd/new_invoice.etl'))

// 3. 未提交态语义（验收条款 2：commit 前目录树不可见）
repo.writeWorking('etl/dwd/new_invoice.etl', '-- @job: new_invoice v2\nSELECT invoice_id, amount FROM ods.ods_invoice;\n')
repo.writeWorking('dag/new_invoice.dag', 'ref: etl/dwd/new_invoice.etl\ncron: "23 3 * * *"\n')
const st = repo.status()
check('未提交修改可枚举', st.some((s) => s.path === 'etl/dwd/new_invoice.etl' && s.state === 'M'))
check('未跟踪 .dag 可枚举', st.some((s) => s.path === 'dag/new_invoice.dag'))
const overlay = repo.treeWithState('feature/invoice')
check('合并视图标出未提交条目', overlay.find((e) => e.path === 'dag/new_invoice.dag')?.uncommitted === true)
check('已提交视图不受未提交修改污染', repo.readCommitted('feature/invoice', 'etl/dwd/new_invoice.etl').includes('v1') === false
  && !repo.readCommitted('feature/invoice', 'etl/dwd/new_invoice.etl').includes('amount'))

// 4. 文件类型契约门禁
let rejected = false
try { repo.writeWorking('README.md', 'x') } catch { rejected = true }
check('契约拒绝非 .etl/.dag 文件', rejected)
rejected = false
try { repo.writeWorking('dag/bad.etl', 'x') } catch { rejected = true }
check('契约拒绝 .etl 放 dag/ 下', rejected)

// 5. 提交后干净
const c2 = repo.commitAll('feature: 发票作业 v2 + 调度')
check('二次提交含两个文件', c2.committed && c2.files.length === 2, c2.files?.join(','))
check('提交后工作区干净', repo.isClean())
const c3 = repo.commitAll('noop')
check('空提交被拒绝', c3.committed === false)

const pass = checks.filter(Boolean).length
console.log(`\n== workspace-repo provider: ${pass}/${checks.length} 通过 ==`)
fs.rmSync(dir, { recursive: true, force: true })
process.exit(pass === checks.length ? 0 : 1)
