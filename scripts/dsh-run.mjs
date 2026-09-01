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

// 直接用 node --expose-internals 起 dsh 入口（相对 repoRoot）：
// dsh 的 cordis-plugin-hmr 要求 --expose-internals，否则 studio 的 HMR 加载器报
// "expose-internals is required for HMR service" 导致 plugin tree 加载失败（本机/新电脑都中招）。
// 经 .bin/dsh shim 无法附加该 flag 且 resolve .pnpm 深层路径会丢 NODE_PATH 上下文，
// 故绕过 shim：以相对 repoRoot 的路径 + cwd=repoRoot 直接 node --expose-internals 起 dsh 入口。
const dshEntry = path.join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(dshEntry)) {
  console.error('未找到 dsh 入口（node_modules/@deepseek-ai/dsh/lib/bin.js）。请先在仓库根目录执行：pnpm run setup')
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

// node --expose-internals <dsh 入口(相对 repoRoot)> --profile <profile> [args...]
// cwd 已 process.chdir(repoRoot)，用相对路径保留 node 的模块解析上下文（NODE_PATH/.pnpm 语义）
const r = spawnSync(process.execPath, ['--expose-internals', dshEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  cwd: repoRoot,
})
process.exit(r.status ?? 1)
