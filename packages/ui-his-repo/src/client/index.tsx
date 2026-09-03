/** HIS 数据工作台 client 端 — 侧栏「切换」形态（方案 A）：官方会话浏览默认原样；切换钮进 HIS 代码仓树视图。
 *  观感：注入官方 WorkspaceBrowser/Rows 的 CSS（类名前缀 hisB_/hisR_），行 DOM 逐像素复刻官方 projectRow/sessionRow，
 *        图标几何自官方 primitives（IconFolderOpen16/IconFolderClose16/IconTriangleRightFill14 原样 path）。 */
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SIDEBAR_CSS } from './workspace-css'

interface RepoFileNode { path: string; kind: string; dirty?: string; uncommitted?: boolean }
interface RepoTree { branches: string[]; current: string; tree: RepoFileNode[] }

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: {
      register(options: { name: string; priority?: number; id?: string; order?: number; label?: string }, component: (props: never) => React.JSX.Element): () => void
      inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void
    }
  }
}

type SidebarMode = 'official' | 'his'
const modeStore = (() => {
  let mode: SidebarMode = 'official'
  const listeners = new Set<() => void>()
  return {
    get: () => mode,
    isHis: () => mode === 'his',
    toggle: () => { mode = mode === 'official' ? 'his' : 'official'; listeners.forEach((f) => f()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

function ensureCss(): void {
  if (typeof document === 'undefined') return
  const mark = 'his-repo/sidebar'
  if (document.querySelector('style[data-plugin-css="' + mark + '"]')) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@his/ui-his-repo'
  tag.dataset.pluginCss = mark
  tag.textContent = SIDEBAR_CSS
  document.head.appendChild(tag)
}

async function fetchRepoTree(branch?: string): Promise<RepoTree> {
  const out: RepoTree = { branches: [], current: '', tree: [] }
  try {
    const [b, c, t] = await Promise.all([
      fetch('/his-repo/branches').then((r) => r.json()),
      fetch('/his-repo/current-branch').then((r) => r.json()),
      fetch(branch ? '/his-repo/tree?branch=' + encodeURIComponent(branch) : '/his-repo/tree').then((r) => r.json()),
    ])
    if (b && Array.isArray(b.branches)) out.branches = b.branches
    if (c && typeof c.current === 'string') out.current = c.current
    if (t && Array.isArray(t.tree)) { out.current = t.branch ?? out.current; out.tree = t.tree }
  } catch { /* host 未就绪 */ }
  return out
}

interface DirNode { name: string; path: string; dirs: DirNode[]; files: RepoFileNode[] }
function buildTree(flat: RepoFileNode[]): DirNode {
  const root: DirNode = { name: '', path: '', dirs: [], files: [] }
  for (const f of flat) {
    const segs = f.path.split('/').filter(Boolean)
    let cur = root; let acc = ''
    for (let i = 0; i < segs.length - 1; i++) {
      acc = acc ? acc + '/' + segs[i] : segs[i]
      let next = cur.dirs.find((d) => d.path === acc)
      if (!next) { next = { name: segs[i], path: acc, dirs: [], files: [] }; cur.dirs.push(next) }
      cur = next
    }
    cur.files.push(f)
  }
  const sortDir = (d: DirNode) => { d.dirs.sort((a, b) => a.name < b.name ? -1 : 1); d.files.sort((a, b) => a.path < b.path ? -1 : 1); d.dirs.forEach(sortDir) }
  sortDir(root)
  return root
}

/** 官方图标几何（自 @deepseek-ai/dsh-client-ui-primitives，path 原样）。 */
function IconFolderOpen16({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" fill="currentColor" />
      <path opacity="0.2" d="M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z" fill="currentColor" />
    </svg>
  )
}
function IconFolderClose16({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path transform="translate(1.5 2.429)" d="M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z" fill="currentColor" />
    </svg>
  )
}
function IconTriangleRight14({ size = 14, open }: { size?: number; open: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden
      className={'hisR_arrow' + (open ? ' hisR_arrowOpen' : '')}>
      <path d="M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z" fill="currentColor" />
    </svg>
  )
}

/** footer 切换钮。 */
function ToggleAction(props: { wide: boolean }): JSX.Element {
  const isHis = useSyncExternalStore(modeStore.subscribe, modeStore.isHis)
  return (
    <button type="button" onClick={modeStore.toggle} title={isHis ? '返回会话浏览' : 'HIS 数据工作台'}
      className="hisR_projectRow"
      style={{ width: '100%', border: 'none', background: isHis ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent', color: isHis ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', justifyContent: props.wide ? 'flex-start' : 'center', padding: props.wide ? '0 8px' : 0 }}>
      <span className="hisR_slot" style={{ fontSize: 14 }}>{isHis ? '◀' : '▤'}</span>
      {props.wide ? <span className="hisR_title" style={{ fontSize: 13 }}>{isHis ? '返回会话浏览' : 'HIS 数据工作台'}</span> : null}
    </button>
  )
}

/** HIS 代码仓树视图。 */
function HisRepoView(props: { wide: boolean; expandSidebar?: () => void }): JSX.Element {
  const [repo, setRepo] = useState<RepoTree>({ branches: [], current: '', tree: [] })
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState('')

  useEffect(() => { ensureCss() }, [])
  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await fetchRepoTree()
      if (!alive) return
      setRepo(r)
      if (!r.branches.length && !r.tree.length) setError('代码仓服务未就绪')
    })()
    return () => { alive = false }
  }, [])

  const pickBranch = async (b: string) => {
    setRepo((prev) => ({ ...prev, current: b }))
    setSelected('')
    const r = await fetchRepoTree(b)
    setRepo((prev) => ({ ...prev, tree: r.tree }))
  }
  const toggleDir = (p: string) => {
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n })
  }

  const tree = useMemo(() => buildTree(repo.tree), [repo.tree])

  if (!props.wide) {
    return (
      <div className="hisB_root hisB_rail" style={{ paddingTop: 4 }}>
        <div className="hisB_sectionHeader">
          <button type="button" className="hisB_iconButton" onClick={props.expandSidebar} title="HIS 数据工作台" style={{ fontSize: 15 }}>▤</button>
        </div>
      </div>
    )
  }

  const rowBase: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'inherit' }

  const renderDir = (d: DirNode, depth: number): JSX.Element[] => {
    const isCollapsed = collapsed.has(d.path)
    const pad = 4 + depth * 14
    const out: JSX.Element[] = []
    if (d.path) {
      out.push(
        <div key={'d' + d.path} role="treeitem" aria-expanded={!isCollapsed} onClick={() => toggleDir(d.path)}
          className="hisR_projectRow" style={{ ...rowBase, paddingLeft: pad }}>
          <span className={'hisR_slot hisR_folder' + (!isCollapsed ? ' hisR_folderActive' : '')}>
            {isCollapsed ? <IconFolderClose16 /> : <IconFolderOpen16 />}
          </span>
          <span className="hisR_slot hisR_chevron"><IconTriangleRight14 open={!isCollapsed} /></span>
          <span className="hisR_projectText"><span className="hisR_title">{d.name}</span></span>
        </div>,
      )
    }
    if (!isCollapsed) {
      for (const sub of d.dirs) out.push(...renderDir(sub, depth + 1))
      for (const f of d.files) {
        const isSel = selected === f.path
        out.push(
          <div key={'f' + f.path} role="treeitem" aria-selected={isSel} onClick={() => setSelected(f.path)}
            className={'hisR_sessionRow hisR_flatSessionRowWithoutStatus' + (isSel ? ' hisR_selected' : '')} style={{ ...rowBase, paddingLeft: pad + 14 }}>
            <span className="hisR_title">{f.path.slice(f.path.lastIndexOf('/') + 1)}</span>
            {(f.uncommitted || f.dirty) ? <span className="hisR_time" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>未提交</span> : null}
          </div>,
        )
      }
    }
    return out
  }

  return (
    <div className="hisB_root">
      <div className="hisB_sectionHeader" role="presentation">
        <span className="hisB_sectionLabel" style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>代码仓</span>
        <span style={{ flex: 1 }} />
        <div className="hisB_headerActions" style={{ maxWidth: 'none' }}>
          <select value={repo.current} onChange={(e) => void pickBranch(e.target.value)} title="分支"
            style={{ height: 28, maxWidth: 120, borderRadius: 10, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontSize: 12, padding: '0 4px', fontFamily: 'inherit' }}>
            {repo.branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="button" className="hisB_iconButton" onClick={modeStore.toggle} title="返回会话浏览" style={{ fontSize: 12 }}>◀</button>
        </div>
      </div>
      <div className="hisB_listArea">
        <div className="hisB_treeBody">
          <div className="hisB_list" role="tree">
            {error ? <div className="hisB_empty" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div>
              : repo.tree.length === 0 ? <div className="hisB_empty">加载中…</div>
              : renderDir(tree, 0)}
          </div>
        </div>
      </div>
    </div>
  )
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ensureCss()
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'his-workspace-toggle', order: 90, label: '数据工作台',
  }, (props: never) => ToggleAction(props as { wide: boolean })))

  ctx.slots.inject('sidebar.workspaces', () => {
    let disposeHis: (() => void) | null = null
    const sync = () => {
      if (modeStore.isHis() && !disposeHis) {
        disposeHis = ctx.slots.register({ name: 'sidebar.workspaces', priority: -1 }, (props: never) => HisRepoView(props as { wide: boolean; expandSidebar?: () => void }))
      } else if (!modeStore.isHis() && disposeHis) {
        disposeHis(); disposeHis = null
      }
    }
    sync()
    const off = modeStore.subscribe(sync)
    return () => { off(); if (disposeHis) { disposeHis(); disposeHis = null } }
  })
}
