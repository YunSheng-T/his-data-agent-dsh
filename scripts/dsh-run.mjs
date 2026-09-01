// dsh 跨平台启动器：pnpm run studio / pnpm run agent 的统一入口
// - DSH_HOME 未设置时自动指向仓库内 dsh-home（bash / PowerShell / cmd 均适用）
// - dsh 可执行文件解析仓库根 node_modules/.bin（Windows 下为 dsh.cmd）
// - DEEPSEEK_API_KEY 缺失时给出明确提示而不是闷死
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, readFileSync } from 'node:fs'
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
// 按 profile 校验凭据：内网网关（his-agent-internal / his-studio 皆可）走 INTERNAL_LLM_API_KEY，
// 否则默认模型是 DeepSeek 路由，需要 DEEPSEEK_API_KEY。
// 规则：已设 INTERNAL_LLM_API_KEY → 用内部模型（放行）；否则要求 DEEPSEEK_API_KEY。
const pIdx = process.argv.indexOf('--profile')
const profile = pIdx >= 0 ? process.argv[pIdx + 1] : null
if (!env.INTERNAL_LLM_API_KEY && !env.DEEPSEEK_API_KEY) {
  console.error('未设置模型密钥（密钥只走环境变量，不落文件）：内部模型或 DeepSeek 至少设一个')
  console.error('  · 内部模型：export INTERNAL_LLM_API_KEY=xxx（仅此一个即可）')
  console.error('  · DeepSeek：export DEEPSEEK_API_KEY=sk-xxx')
  console.error('  并确认对应 profile 的 cordis.patch.yml 里 llm-pi-ai / baseURL 已指向你的模型网关（his-agent-internal 或 his-studio）')
  process.exit(1)
}
if (!env.INTERNAL_LLM_API_KEY && !env.DEEPSEEK_API_KEY) process.exit(1)

// 双模型 profile（his-studio / his-agent-internal）：仅在 settings.yaml 尚无 agent-default-model
// 选择时，按所设 key 写一次默认（运行时文件，不入库，可被用户会话区下拉覆盖）。
// 已存在则绝不覆盖——尊重用户手动选择的 provider/model（各用各的 provider 场景下不应被启动重置）。
// 设了 INTERNAL_LLM_API_KEY → 默认 internal-openai；只设 DEEPSEEK_API_KEY → 默认 deepseek-official。
const DUAL_PROFILES = new Set(['his-studio', 'his-agent-internal'])
if (DUAL_PROFILES.has(profile)) {
  const defaultProvider = env.INTERNAL_LLM_API_KEY ? 'internal-openai' : 'deepseek-official'
  const defaultModel = defaultProvider === 'internal-openai' ? 'internal-chat' : 'deepseek-v4-flash'
  try {
    const sf = path.join(env.DSH_HOME, 'settings.yaml')
    let existing = ''
    if (existsSync(sf)) existing = readFileSync(sf, 'utf8')
    if (!/^agent-default-model\s*:/m.test(existing)) {
      // 尚无默认选择：追加一段（保留文件已有其它 settings 段）
      const block = `agent-default-model:\n  provider: ${defaultProvider}\n  model: ${defaultModel}\n`
      writeFileSync(sf, (existing.trim() ? existing.replace(/\s*$/, '\n\n') : '') + block)
    }
  } catch (e) {
    console.error(`[launcher] 设置默认模型失败（不影响启动）: ${e?.message ?? e}`)
  }
}

// node --expose-internals <dsh 入口(相对 repoRoot)> --profile <profile> [args...]
// cwd 已 process.chdir(repoRoot)，用相对路径保留 node 的模块解析上下文（NODE_PATH/.pnpm 语义）
const r = spawnSync(process.execPath, ['--expose-internals', dshEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  cwd: repoRoot,
})
process.exit(r.status ?? 1)
