// approval-policy/answerer — headless 环境的模拟人工应答器
// P0 冒烟/回归用：没有 UI 时由它按环境变量模拟人点「确认/打回」。
//   HIS_ANSWER=allowed-once（默认，全部确认）
//   HIS_ANSWER=rejected（全部打回）
//   HIS_REJECT_TOOL=std.create_draft（只打回指定工具，其余确认）
// 真实部署时由 studio-ui 的审批按钮应答者替换本插件。

export const name = 'his-approval-answerer-headless'

export function apply(ctx) {
  ctx.on('approval/request', async (req) => {
    const rejectTool = process.env.HIS_REJECT_TOOL
    let outcome = process.env.HIS_ANSWER || 'allowed-once'
    if (rejectTool && req.toolName === rejectTool) outcome = 'rejected'
    console.error(`[answerer] ${req.toolName}: ${outcome}  （reason: ${req.reason ?? '-'}）`)
    return outcome
  })
  console.error('[answerer] headless answerer mounted')
}
