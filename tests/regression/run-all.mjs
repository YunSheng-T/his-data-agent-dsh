// 回归总入口：跨平台（替代 bash for 循环）
// 用法：node tests/regression/run-all.mjs
// 行为：逐个跑 assert-*.mjs；DSH_HOME 自动指向仓库 dsh-home；
//       依赖 studio（:7300）的套件在 studio 未启动时自动跳过并明示。
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const DSH_HOME = path.join(repoRoot, 'dsh-home')

// studio 依赖型套件（需要 :7300 在跑）
const NEEDS_STUDIO = new Set(['assert-studio-repo.mjs'])

const studioUp = await new Promise((resolve) => {
  const sock = net.connect(7300, '127.0.0.1')
  sock.once('connect', () => { sock.end(); resolve(true) })
  sock.once('error', () => resolve(false))
})

const files = readdirSync(here).filter((f) => f.startsWith('assert-') && f.endsWith('.mjs')).sort()
// studio 依赖型套件最先跑：assert-platform 等会迁移/补种共享仓（runtime/repos），
// 跑完它们再读 studio 的实时解析会拿到中间态（曾因此偶发误报）
files.sort((a, b) => Number(NEEDS_STUDIO.has(b)) - Number(NEEDS_STUDIO.has(a)))
let failed = 0
for (const f of files) {
  if (NEEDS_STUDIO.has(f) && !studioUp) {
    console.log(`SKIP ${f} —— 依赖 studio(:7300)，未启动；先跑 pnpm run studio 再单独补跑`)
    continue
  }
  const r = spawnSync(process.execPath, [path.join(here, f)], {
    env: { ...process.env, DSH_HOME },
    encoding: 'utf8',
  })
  const last = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? ''
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${f} → ${last}`)
  if (!ok && r.stderr) console.log(r.stderr.split('\n').slice(0, 5).join('\n'))
}
console.log(failed === 0 ? '\n== 全部通过 ==' : `\n== ${failed} 个套件失败 ==`)
process.exit(failed === 0 ? 0 : 1)
