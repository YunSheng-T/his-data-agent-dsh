// dsh 跨平台启动器：pnpm run studio / pnpm run agent 的统一入口
// - DSH_HOME 未设置时自动指向仓库内 dsh-home（bash / PowerShell / cmd 均适用）
// - dsh 可执行文件解析仓库根 node_modules/.bin（Windows 下为 dsh.cmd）
// - DEEPSEEK_API_KEY 缺失时给出明确提示而不是闷死
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env }
env.DSH_HOME ??= path.join(repoRoot, 'dsh-home')

const bin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
if (!existsSync(bin)) {
  console.error('未找到 dsh 可执行文件。请先在仓库根目录执行：pnpm run setup')
  process.exit(1)
}
if (!env.DEEPSEEK_API_KEY) {
  console.error('未设置 DEEPSEEK_API_KEY 环境变量（密钥只走环境变量，不落文件）。')
  console.error('  bash:       export DEEPSEEK_API_KEY=sk-xxx')
  console.error('  PowerShell: $env:DEEPSEEK_API_KEY = "sk-xxx"')
  process.exit(1)
}

const r = spawnSync(bin, process.argv.slice(2), {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32', // .cmd 在 Windows 下必须经 shell
})
process.exit(r.status ?? 1)
