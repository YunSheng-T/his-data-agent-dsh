/** HIS 代码仓树 client 端：React slot 组件，经 ctx.remote.hisRepo 拉 branches/tree 展示。
 *  最小可跑雏形：注册 sidebar 子槽，列出分支列表。 */
import { useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar'

/** client 端 remote 命名空间（host HisRepoController 暴露）。 */
interface HisRepoRemote {
  branches(): Promise<string[]>
  currentBranch(): Promise<string>
  tree(req: { branch: string }): Promise<Array<{ path: string; kind: string }>>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remote: { hisRepo: HisRepoRemote }
  }
}

export const inject = ['remote']

/** 最简代码仓树组件：列分支，点击分支列该分支的 tree。 */
function HisRepoPanel({ ctx }: { ctx: ClientContext }): JSX.Element {
  const [branches, setBranches] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [tree, setTree] = useState<Array<{ path: string; kind: string }>>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const bs = await ctx.remote.hisRepo.branches()
      const cur = await ctx.remote.hisRepo.currentBranch()
      if (!alive) return
      setBranches(bs)
      setCurrent(cur)
      const t = await ctx.remote.hisRepo.tree({ branch: cur })
      if (alive) setTree(t)
    })()
    return () => { alive = false }
  }, [ctx])

  const pick = async (b: string) => {
    setCurrent(b)
    setTree(await ctx.remote.hisRepo.tree({ branch: b }))
  }

  return (
    <div style={{ padding: 8, fontSize: 12, fontFamily: 'monospace' }}>
      <div style={{ marginBottom: 6, color: '#888' }}>代码仓 · {current || '…'}</div>
      <select value={current} onChange={(e) => void pick(e.target.value)} style={{ width: '100%', marginBottom: 6 }}>
        {branches.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {tree.map((t) => <div key={t.path} style={{ padding: '2px 0' }}>{t.kind} {t.path}</div>)}
      </div>
    </div>
  )
}

/** 注册 slot：把 HisRepoPanel 挂到 sidebar 自定义子槽（先 root 挂载，后续接 sidebar 布局）。 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.register({
    name: 'his-repo',
    locale: undefined as never,
    children: {
      'sidebar.his-repo': { kind: 'single', scope: 'root' },
    },
    inject: () => ({ ctx }),
  }, HisRepoPanel as never), 'ui-his-repo: slot registration')
}
