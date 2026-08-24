// @his/approval-policy — HIS Data Agent 人机边界策略插件
//
// 三级边界（风险级标注驱动，只认标注不认工具名）：
//   read            → 自动执行（next() 放行，轨迹照常落 Session Log）
//   workspace-write → 工作区写入：自动执行但留痕（未提交态，可继续改）
//   commit / publish / knowledge-write → 拦截，抛审批点，人确认后放行
//   未标注 risk     → fail-closed，按最高级走审批
//
// 高危硬阻断双保险（M0 穿刺结论：必须先于审批点）：
//   第一层：本插件在 pre-execute 里先扫参数，命中 forbidden 模式直接 deny（不产生审批点）
//   第二层：ctx.tools.guard 正则兜底（即使模型绕过业务扫描直接调 commit，diff 内容仍被检查）

export const name = 'his-approval-policy'
export const inject = ['tools']

// 高危模式：DROP / TRUNCATE / 无分区全量覆盖（INSERT OVERWRITE 不带 PARTITION）
const FORBIDDEN_PATTERNS = [
  { re: /\bDROP\s+(TABLE|VIEW|DATABASE|SCHEMA)\b/i, label: 'DROP' },
  { re: /\bTRUNCATE\s+(TABLE\b)?/i, label: 'TRUNCATE' },
  { re: /\bINSERT\s+OVERWRITE\s+(?!.*\bPARTITION\s*\()/is, label: '无分区全量覆盖' },
]

// gated 级别：这些 risk 必须人工确认
const GATED_RISKS = new Set(['commit', 'publish', 'knowledge-write'])
// 自动放行级别
const AUTO_RISKS = new Set(['read', 'workspace-write'])

function scanForbidden(exec) {
  const payload = JSON.stringify(exec.arguments ?? {})
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(payload)) return label
  }
  return null
}

// 从参数里提炼方案摘要（审批请求不携带参数，摘要只能编码进 reason —— M0 穿刺结论 2）
// 约定：工具参数带 approvalNote（string）时优先采用——由模型用业务语言写清「在确认什么」，
// 否则回退到参数截断摘要（60 字符截断对企业用户不友好，如作业清单）
function summarize(exec) {
  const args = exec.arguments ?? {}
  if (typeof args.approvalNote === 'string' && args.approvalNote.trim()) return args.approvalNote.trim()
  const parts = Object.entries(args)
    .filter(([k]) => k !== 'approvalNote')
    .slice(0, 4)
    .map(([k, v]) => `${k}=${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 60)}`)
  return parts.join(', ')
}

export function apply(ctx, config = {}) {
  const gatedRisks = new Set(config.gatedRisks ?? GATED_RISKS)
  // 内置/第三方工具的 risk 标注表：它们不带我们的 risk 约定，
  // 由配置层补标注（例如 todo_write 是 harness 内部任务清单，等同 read 自动放行）
  const riskOverrides = config.riskOverrides ?? {}

  // 第一层：pre-execute 策略
  ctx.on('tools/pre-execute', async (exec, next) => {
    // 高危先拦：审批点都不给
    const hit = scanForbidden(exec)
    if (hit) {
      console.error(`[approval-policy] ${exec.name}: FORBIDDEN(${hit}) -> deny`)
      return { kind: 'deny', reason: `高危操作硬阻断：检测到 ${hit} 模式。此类操作不被允许，请改用安全方案（如分区级覆盖、软删除）。` }
    }

    const def = ctx.tools.get(exec.name)
    const risk = def?.risk ?? riskOverrides[exec.name]

    if (risk && AUTO_RISKS.has(risk)) return next()

    if (!risk) {
      // fail-closed：新工具忘记标注 → 按最高级拦截
      console.error(`[approval-policy] ${exec.name}: no risk annotation -> ask (fail-closed)`)
      return { kind: 'ask', reason: `[未标注风险级] 工具 ${exec.name} 未声明 risk，按最高级拦截。参数摘要：${summarize(exec)}` }
    }
    if (gatedRisks.has(risk)) {
      console.error(`[approval-policy] ${exec.name}: risk=${risk} -> ask`)
      return { kind: 'ask', reason: `[${risk} 级写入] ${exec.name} 需要人工确认。方案摘要：${summarize(exec)}` }
    }
    // 未知 risk 值同样 fail-closed
    console.error(`[approval-policy] ${exec.name}: unknown risk=${risk} -> ask (fail-closed)`)
    return { kind: 'ask', reason: `[未知风险级 ${risk}] ${exec.name} 按最高级拦截。参数摘要：${summarize(exec)}` }
  })

  // 第二层：guard 正则兜底（单调守卫，只能否不能放）
  ctx.tools.guard((exec) => {
    const hit = scanForbidden(exec)
    if (hit) {
      console.error(`[approval-policy] guard 兜底拦截 ${exec.name}: FORBIDDEN(${hit})`)
      return `高危操作硬阻断（guard 兜底）：检测到 ${hit} 模式（工具 ${exec.name}）`
    }
  })

  console.error('[approval-policy] mounted: gated=' + [...gatedRisks].join('/') + ', forbidden=' + FORBIDDEN_PATTERNS.map((p) => p.label).join('/'))
}
