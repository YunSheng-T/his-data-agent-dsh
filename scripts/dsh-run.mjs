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
// 固定工作目录到仓库根：dsh-agent-instructions 按会话 cwd 解析 AGENTS.md，
// 从别的目录启动会静默丢掉「动手优先」等工作约定
process.chdir(repoRoot)

const bin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
if (!existsSync(bin)) {
  console.error('未找到 dsh 可执行文件。请先在仓库根目录执行：pnpm run setup')
  process.exit(1)
}
// 按 profile 校验凭据：内网网关 profile（his-agent-internal）走 INTERNAL_LLM_API_KEY，
// 其余 profile 的默认模型是 DeepSeek 路由，需要 DEEPSEEK_API_KEY
const pIdx = process.argv.indexOf('--profile')
const profile = pIdx >= 0 ? process.argv[pIdx + 1] : null
const isInternal = profile === 'his-agent-internal'
const needKey = isInternal ? 'INTERNAL_LLM_API_KEY' : 'DEEPSEEK_API_KEY'
if (!env[needKey]) {
  console.error(`未设置 ${needKey} 环境变量（密钥只走环境变量，不落文件）。`)
  if (isInternal) {
    console.error('  bash:       export INTERNAL_LLM_API_KEY=xxx')
    console.error('  PowerShell: $env:INTERNAL_LLM_API_KEY = "xxx"')
    console.error('  并确认 dsh-home/profiles/his-agent-internal/cordis.patch.yml 里 llm-pi-ai 的 baseURL 已改成内网网关地址')
  } else {
    console.error('  bash:       export DEEPSEEK_API_KEY=sk-xxx')
    console.error('  PowerShell: $env:DEEPSEEK_API_KEY = "sk-xxx"')
  }
  process.exit(1)
}

const r = spawnSync(bin, process.argv.slice(2), {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32', // .cmd 在 Windows 下必须经 shell
})
process.exit(r.status ?? 1)
