/** HIS 代码仓树 client 端：注册为会话视图 tab（conversation.view，仿 ui-trajectory），
 *  同源 fetch host 的 /his-repo/* JSON 端点（ctx.webServer 注册）展示分支 + 文件树。 */
import { useEffect, useState, type JSX } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation'

/** host /his-repo/* JSON 端点返回（与 src/index.ts host 端一致）。 */
interface RepoFileNode { path: string; kind: string; dirty?: string; uncommitted?: boolean }
interface RepoState { branches: string[]; current: string; tree: RepoFileNode[] }

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: {
      register(options: { name: string; id?: string; order?: number; label?: string }, component: (props: never) => React.JSX.Element): () => void
      inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void
    }
  }
}

async function fetchRepoState(branch?: string): Promise<Partial<RepoState>> {
  const out: Partial<RepoState> = {}
  try {
    const [b, c, t] = await Promise.all([
      fetch('/his-repo/branches').then((r) => r.json()),
      fetch('/his-repo/current-branch').then((r) => r.json()),
      fetch(branch ? '/his-repo/tree?branch=' + encodeURIComponent(branch) : '/his-repo/tree').then((r) => r.json()),
    ])
    if (b && Array.isArray(b.branches)) out.branches = b.branches
    if (c && typeof c.current === 'string') out.current = c.current
    if (t && Array.isArray(t.tree)) { out.current = t.branch ?? out.current; out.tree = t.tree }
  } catch { /* host 未就绪：静默，显示占位 */ }
  return out
}

/** 分支 + 文件树面板（会话视图 tab 内容）。 */
function HisRepoPanel(): JSX.Element {
  const [branches, setBranches] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [tree, setTree] = useState<RepoFileNode[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      const s = await fetchRepoState()
      if (!alive) return
      setBranches(s.branches ?? [])
      setCurrent(s.current ?? '')
      setTree(s.tree ?? [])
      if (!s.branches && !s.tree) setError('代码仓服务未就绪（host 未挂载 workspace-repo）')
    })()
    return () => { alive = false }
  }, [])

  const pick = async (b: string) => {
    setCurrent(b)
    const s = await fetchRepoState(b)
    if (s.tree) setTree(s.tree)
  }

  const rows = tree.length ? tree.map((t) => (
    <div key={t.path} style={{ padding: '2px 0 2px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <span style={{ color: t.kind === 'dir' ? '#d8a24a' : '#9aa4b2', marginRight: 6, fontFamily: 'monospace' }}>{t.kind === 'dir' ? '▸' : '·'}</span>
      {t.path}
      {t.uncommitted ? <span style={{ color: '#e5484d', marginLeft: 6 }}>未提交</span> : null}
      {t.dirty ? <span style={{ color: '#e5484d', marginLeft: 6 }}>已修改</span> : null}
    </div>
  )) : (error ? <div style={{ padding: 8, color: '#e5484d' }}>{error}</div> : <div style={{ padding: 8, color: '#888' }}>加载中…</div>)

  return (
    <div style={{ padding: '12px 16px', fontSize: 13, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, color: '#d0d4da' }}>代码仓</span>
        <select value={current} onChange={(e) => void pick(e.target.value)} style={{ flex: 1, minWidth: 0, background: '#1b1f27', color: '#d0d4da', border: '1px solid #2c323c', borderRadius: 4, padding: '3px 6px', fontSize: 12 }}>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div style={{ overflow: 'auto', flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#c8ccd2' }}>
        {rows}
      </div>
    </div>
  )
}

/** 依赖注入声明：apply 访问 ctx.slots 必须先 inject（cordis ctx 是代理，未声明即抛 without inject）。 */
export const inject = ['slots']

/** 注册会话视图 tab「代码仓」（conversation.view list 槽；chat=0 / trajectory=10 之后）。 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'his-repo',
    order: 20,
    label: '代码仓',
  }, () => HisRepoPanel()))
}
