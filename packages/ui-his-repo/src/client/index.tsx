/** HIS 数据工作台 client 端 — 侧栏「切换」形态（方案 A）：官方会话浏览默认原样；切换钮进 HIS 代码仓树视图。
 *  观感：注入官方 WorkspaceBrowser/Rows 的 CSS（类名前缀 hisB_/hisR_），行 DOM 逐像素复刻官方 projectRow/sessionRow，
 *        图标几何自官方 primitives（IconFolderOpen16/IconFolderClose16/IconTriangleRightFill14 原样 path）。 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import { Graph, Shape } from '@antv/x6'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SIDEBAR_CSS } from './workspace-css'

interface RepoFileNode { path: string; kind: string; dirty?: string; uncommitted?: boolean }
interface RepoTree { branches: string[]; current: string; tree: RepoFileNode[] }
interface ModelItem { file: string; name: string; cn: string; domain: string; layer: string; version: string; published: boolean; bound: number; total: number }
interface AnchorInfo { kind: 'model' | 'repo'; file?: string; branch?: string; dir?: string | null; path?: string | null; key: string; at: string }
interface ModelDetail { model: string; file: string; cn: string; domain: string; layer: string; version: string; published: boolean; fields: Array<{ n: string; t: string; c: string; std: string | null; pk?: boolean; skip?: string }>; bindingRate: string; ddl: string | null }

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: {
      register(options: { name: string; priority?: number; id?: string; order?: number; label?: string; children?: Record<string, { kind: string; scope: string }> }, component: (props: any) => React.JSX.Element): () => void
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

async function fetchModels(): Promise<ModelItem[]> {
  try {
    const r = await fetch('/his-repo/models').then((x) => x.json())
    return Array.isArray(r?.models) ? r.models : []
  } catch { return [] }
}

async function fetchAnchor(): Promise<AnchorInfo | null> {
  try {
    const r = await fetch('/his-repo/anchor').then((x) => x.json())
    return r?.anchor ?? null
  } catch { return null }
}

/** 锚定状态全局共享（锚定条 / ER 图 / 侧栏点模型共用，postAnchor 后同步）。 */
const anchorStore = (() => {
  let anchor: AnchorInfo | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => anchor,
    set: (a: AnchorInfo | null) => { anchor = a; listeners.forEach((fn) => fn()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

async function postAnchor(body: { file?: string; branch?: string; dir?: string | null; path?: string | null }): Promise<AnchorInfo | null> {
  try {
    const r = await fetch('/his-repo/anchor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json())
    const a = r?.anchor ?? null
    anchorStore.set(a)
    return a
  } catch { return null }
}

/** 当前高亮字段（ER 图属性级锚定：模型 + 字段）。 */
const fieldStore = (() => {
  let field: string | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => field,
    set: (f: string | null) => { field = f; listeners.forEach((fn) => fn()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

/** 工作区：当前打开文件（跨侧栏树与工作区弹窗共享的模块态）。 */
const openFileStore = (() => {
  let path: string | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => path,
    open: (p: string) => { path = p; listeners.forEach((f) => f()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

/** 工作区弹窗开关（保留，工作区内容填入中列后逐步弃用）。 */
const overlayStore = (() => {
  let open = false
  const listeners = new Set<() => void>()
  return {
    get: () => open,
    isOpen: () => open,
    open: () => { open = true; listeners.forEach((f) => f()) },
    close: () => { open = false; listeners.forEach((f) => f()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

/** 自定义三列布局状态（接管 root 槽后自持）：左 sidebar / 右 conversation 宽度与折叠。 */
const layoutStore = (() => {
  let state = { sidebarCollapsed: false, sidebarWidth: 280, convWidth: 420 }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()) },
    toggleSidebar: () => { state = { ...state, sidebarCollapsed: !state.sidebarCollapsed }; listeners.forEach((f) => f()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

interface FileContent { path: string; kind: string; text: string; parsed?: any }
async function fetchFile(p: string): Promise<FileContent | null> {
  try {
    const r = await fetch('/his-repo/file?path=' + encodeURIComponent(p)).then((x) => x.json())
    return r?.text != null ? r : null
  } catch { return null }
}
async function postFile(p: string, content: string): Promise<boolean> {
  try {
    const r = await fetch('/his-repo/file?path=' + encodeURIComponent(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }).then((x) => x.json())
    return r?.ok === true
  } catch { return false }
}

async function createFile(p: string): Promise<{ created?: boolean; reason?: string; error?: string } | null> {
  try {
    const r = await fetch('/his-repo/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: p }) }).then((x) => x.json())
    return r
  } catch { return null }
}

async function runTest(p: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/his-repo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: p }) }).then((x) => x.json())
    return r
  } catch { return null }
}

async function fetchOpsCheck(p: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch('/his-repo/ops-check?path=' + encodeURIComponent(p)).then((x) => x.json())
    return r
  } catch { return null }
}
interface LineageData { upstream: unknown[]; downstream: unknown[] }
async function fetchLineage(p: string): Promise<LineageData | null> {
  try {
    const r = await fetch('/his-repo/lineage?path=' + encodeURIComponent(p)).then((x) => x.json())
    return r
  } catch { return null }
}
interface ScanResult {
  path: string
  classify: { ok: boolean; jobType?: string; jobTypeName?: string; instance?: string; instanceName?: string; signals?: Array<{ signal: string; value: string; hit: string }> }
  policies: Array<{ id: string; name: string; goal?: string; via?: string }>
  rules: { ruleCount?: number; rules?: Array<{ id: string; name: string; severity?: string; impl?: { engine?: string } | null }> } | null
  scanPlan?: unknown
  consistency: { ok: boolean; status?: string; note?: string } | null
  findings: Array<{ id: string; severity: string; field: string; desc: string; fix?: { column: string; from?: string; to?: string } | null }>
  chain: { nodes?: Array<{ id: string; type: string; name: string; sub?: string }>; edges?: Array<{ type: string; from: string; to: string; label: string }> } | null
  anchored: { ok: boolean; anchored?: { objectType?: { type: string; typeName: string }; name?: string }; objectType?: { type: string; typeName: string }; relations?: Array<{ link: string; count: number }>; why?: string }
  scan: { design?: { pass: boolean }; sql?: { pass: boolean; dangers?: string[] }; consistency?: { pass: boolean | null; model?: string; diffs?: Array<{ field: string; issue: string }> } } | null
  scanVerdict: 'pass' | 'diff' | 'pass-unknown' | 'no-scan'
  trace: Array<{ title: string; stat?: string; hits?: Array<{ signal?: string; policy?: string; rule?: string; item?: string; value?: string; hit?: string; note?: string }>; excluded?: string[] }>
  ontVersion: string
}
async function fetchScan(p: string): Promise<ScanResult | null> {
  try {
    const r = await fetch('/his-repo/scan?path=' + encodeURIComponent(p)).then((x) => x.json())
    return r
  } catch { return null }
}

async function fetchScanStep(p: string, step: string): Promise<any> {
  try {
    return await fetch('/his-repo/scan-step?path=' + encodeURIComponent(p) + '&step=' + step).then((x) => x.json())
  } catch { return null }
}

interface ScanStepState { id: string; label: string; status: 'pending' | 'running' | 'done'; detail?: string }

async function fetchModelDetail(file: string): Promise<ModelDetail | null> {
  try {
    const r = await fetch('/his-repo/model?file=' + encodeURIComponent(file)).then((x) => x.json())
    return r?.model ? r : null
  } catch { return null }
}

/** 打开模型（ER 图）：跨侧栏模型 tab 与中列工作区共享。 */
const openModelStore = (() => {
  let file: string | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => file,
    open: (f: string) => { file = f; listeners.forEach((fn) => fn()) },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
})()

function base(path: string): string { return path.split('/').pop() || path }

/** 目录前缀 → 新建类型提示。 */
const DIR_TYPE_HINT: Record<string, string> = {
  dbscript: '新建 SQL 脚本（DDL 订正）',
  dag: '新建调度作业',
  etl: '新建 ETL 作业',
  ops: '新建运维作业',
  svc: '新建服务定义',
}

/** 按文件类型的工作区子 tab。 */
const TABS_BY_KIND: Record<string, Array<[string, string]>> = {
  etl: [['code', '代码'], ['flow', '可视化'], ['test', '测试运行'], ['lineage', '血缘']],
  dag: [['graph', '依赖图'], ['code', '配置代码']],
  ops: [['seq', '执行序列'], ['dsl', 'DSL 代码'], ['pair', '配对校验']],
  script: [['code', '代码'], ['scan', '扫描'], ['lineage', '血缘']],
  svc: [['code', '代码'], ['lineage', '血缘']],
}

/** ETL 字段映射（可视化）：来源表达式 → 转换 → 目标列 → 标准引用。 */
function FlowView({ parsed }: { parsed: any }): JSX.Element {
  const cols: Array<{ expr: string; alias?: string; funcs?: string[]; stdRef?: string | null }> = parsed?.columns ?? []
  const from = (parsed?.fromTables ?? [])[0] ?? '未知来源'
  const target = parsed?.targetTable ?? '?'
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 12 }}>
        <span style={{ color: 'var(--dsw-alias-label-secondary)' }}>{from}</span>
        <span style={{ color: 'var(--dsw-alias-label-caption)' }}>→</span>
        <span style={{ color: 'var(--dsw-alias-state-business-primary, #2b6de0)' }}>{target}{parsed?.partition ? ' · ' + parsed.partition : ''}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-caption)', fontSize: 11 }}>{cols.length} 列 · {parsed?.engine ?? 'etl'}</span>
      </div>
      <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, overflow: 'hidden' }}>
        {cols.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 12px', borderTop: i ? '1px solid var(--dsw-alias-border-l2)' : 'none', fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 11.5 }}>
            <span style={{ width: '34%', color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.expr}</span>
            {(c.funcs?.length ? <span style={{ color: 'var(--dsw-alias-state-warn-primary, #e5a24a)', fontSize: 10, flex: 'none' }}>{c.funcs.join(' · ')}</span> : null)}
            <span style={{ color: 'var(--dsw-alias-label-primary)' }}>{c.alias ?? '?'}</span>
            <span style={{ marginLeft: 'auto', color: c.stdRef ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary, #e5a24a)', fontSize: 10, flex: 'none' }}>{c.stdRef || '未绑定'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** OPS 执行序列（.ops layers → 分层作业列表）。 */
function OpsSeqView({ parsed }: { parsed: any }): JSX.Element {
  const layers: Array<{ n: number; jobs: Array<{ type: string; path: string; options?: Record<string, unknown> }> }> = parsed?.layers ?? []
  const action = parsed?.action ?? 'OPS'
  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', marginBottom: 8 }}>
        {action} · {parsed?.count ?? 0} 条命令 · {layers.length} 层
      </div>
      {layers.map((L) => (
        <div key={L.n} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>Layer {L.n} <span style={{ color: 'var(--dsw-alias-label-caption)' }}>可并行</span></div>
          <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, overflow: 'hidden' }}>
            {L.jobs.map((jb, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 12px', borderTop: i ? '1px solid var(--dsw-alias-border-l2)' : 'none', fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 11.5 }}>
                <span style={{ color: 'var(--dsw-alias-state-business-primary, #2b6de0)', flex: 'none' }}>{jb.type}</span>
                <span style={{ color: 'var(--dsw-alias-label-primary)' }}>{base(jb.path)}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-caption)', fontSize: 10, flex: 'none' }}>{Object.entries(jb.options ?? {}).map(([k, v]) => k + '=' + v).join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** DAG 依赖图（X6：上游 depends → 当前 → 无下游）。 */
function DagGraph({ path, parsed }: { path: string; parsed: any }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const graph = new Graph({ container: el, autoResize: true, background: { color: 'transparent' }, interacting: false })
    const depends: string[] = parsed?.depends ?? []
    const cur = base(path)
    const nodes: Array<{ id: string; x: number; y: number; width: number; height: number; label: string; isCur?: boolean }> = []
    const edges: Array<{ source: string; target: string }> = []
    depends.forEach((d, i) => { nodes.push({ id: 'd' + i, x: 40, y: 40 + i * 72, width: 170, height: 44, label: base(d) }) })
    nodes.push({ id: 'cur', x: 290, y: 40 + (depends.length ? (depends.length - 1) * 36 : 0), width: 170, height: 44, label: cur, isCur: true })
    depends.forEach((_d, i) => edges.push({ source: 'd' + i, target: 'cur' }))
    nodes.forEach((n) => graph.addNode({
      id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, label: n.label,
      attrs: { body: { rx: 8, ry: 8, fill: n.isCur ? '#2b6de0' : '#1b1f27', stroke: n.isCur ? '#4d86e8' : '#3a4150', strokeWidth: 1 }, label: { fill: n.isCur ? '#fff' : '#c8ccd2', fontSize: 11, fontFamily: 'ui-monospace, monospace' } },
    }))
    edges.forEach((e) => graph.addEdge({ source: e.source, target: e.target, router: { name: 'manhattan', args: { padding: 12 } }, connector: { name: 'rounded', args: { radius: 6 } }, attrs: { line: { stroke: '#4a5260', strokeWidth: 1.2, targetMarker: { name: 'block', width: 7, height: 7 } } } }))
    if (nodes.length > 1) graph.zoomToFit({ padding: 24, maxScale: 1.4 })
    return () => { graph.dispose() }
  }, [path, parsed])
  return <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 320 }} />
}

/** X6 血缘图：上游作业/源表 → 当前作业 → 下游作业，节点+箭头边。 */
function LineageGraph({ path, lineage }: { path: string; lineage: LineageData }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const graph = new Graph({
      container: el,
      autoResize: true,
      background: { color: 'transparent' },
      interacting: false,
    })
    const up: unknown = lineage?.upstream
    const down: unknown = lineage?.downstream
    const sources: Array<{ table: string; producedBy?: string[] }> = (up as { sources?: Array<{ table: string; producedBy?: string[] }> })?.sources ?? []
    const readers: string[] = (down as { readers?: string[] })?.readers ?? []
    const targetTable: string | null = (down as { targetTable?: string })?.targetTable ?? null

    const curName = base(path)
    // 节点：上游作业/表（左）、当前（中）、下游（右）
    const nodes: Array<{ id: string; x: number; y: number; width: number; height: number; label: string; isCur?: boolean }> = []
    const edges: Array<{ source: string; target: string }> = []
    const upstreamIds: string[] = []
    sources.forEach((s, i) => {
      if (s.producedBy?.length) {
        s.producedBy.forEach((p) => {
          if (!upstreamIds.includes(p)) upstreamIds.push(p)
        })
      } else if (s.table && !upstreamIds.includes('tbl:' + s.table)) upstreamIds.push('tbl:' + s.table)
    })
    // 布局：上游列 x=40，当前 x=280，下游 x=520
    const upCount = upstreamIds.length || 1
    upstreamIds.forEach((id, i) => {
      const label = id.startsWith('tbl:') ? id.slice(4) : base(id)
      nodes.push({ id, x: 40, y: 40 + i * 72, width: 160, height: 40, label })
    })
    nodes.push({ id: 'cur', x: 280, y: 40 + (upCount - 1) * 36, width: 170, height: 44, label: curName, isCur: true })
    // 上游 → 当前
    upstreamIds.forEach((id) => edges.push({ source: id, target: 'cur' }))
    // 当前 → 目标表（若有）→ 下游
    let lastId = 'cur'
    if (targetTable) {
      nodes.push({ id: 'tbl', x: 520, y: 40, width: 150, height: 40, label: targetTable })
      edges.push({ source: 'cur', target: 'tbl' })
      lastId = 'tbl'
    }
    readers.forEach((r, i) => {
      const id = 'r:' + r
      nodes.push({ id, x: 520, y: (targetTable ? 120 : 40) + i * 72, width: 160, height: 40, label: base(r) })
      edges.push({ source: lastId, target: id })
    })
    nodes.forEach((n) => {
      graph.addNode({
        id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, label: n.label,
        attrs: {
          body: { rx: 8, ry: 8, fill: n.isCur ? '#2b6de0' : '#1b1f27', stroke: n.isCur ? '#4d86e8' : '#3a4150', strokeWidth: 1 },
          label: { fill: n.isCur ? '#ffffff' : '#c8ccd2', fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' },
        },
      })
    })
    edges.forEach((e) => {
      graph.addEdge({
        source: e.source, target: e.target,
        router: { name: 'manhattan', args: { padding: 12 } },
        connector: { name: 'rounded', args: { radius: 6 } },
        attrs: { line: { stroke: '#4a5260', strokeWidth: 1.2, targetMarker: { name: 'block', width: 7, height: 7 } } },
      })
    })
    if (nodes.length > 1) graph.zoomToFit({ padding: 24, maxScale: 1.4 })
    else graph.centerContent()
    return () => { graph.dispose() }
  }, [path, lineage])
  return <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 420 }} />
}

/** ER 图（模型字段表节点，X6 HTML shape）：属性行展示类型/字段/标准绑定/PK。 */
function ErGraph({ detail }: { detail: ModelDetail }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rowH = 24, headH = 44, width = 300
    const height = headH + detail.fields.length * rowH
    let reg = false
    try { Shape.HTML.register({ shape: 'his-er-table', width, height, effect: ['data'], html: (cell: any) => erNodeHTML(cell.getData()) }); reg = true } catch { reg = true }
    const graph = new Graph({ container: el, autoResize: true, background: { color: 'transparent' }, interacting: false })
    graph.addNode({
      shape: 'his-er-table', id: 'm:' + detail.file, x: 40, y: 40, width, height, data: detail,
    })
    // 事件委托：字段行(data-his-field) → 锚定模型 + 高亮字段；头部(data-his-anchor) → 仅锚定模型
    const onClick = (e: MouseEvent) => {
      const fieldEl = (e.target as HTMLElement)?.closest?.('[data-his-field]') as HTMLElement | null
      const headEl = (e.target as HTMLElement)?.closest?.('[data-his-anchor]') as HTMLElement | null
      if (fieldEl) {
        const raw = fieldEl.getAttribute('data-his-field') || ''
        const sep = raw.indexOf('|')
        const file = sep >= 0 ? raw.slice(0, sep) : raw
        const field = sep >= 0 ? raw.slice(sep + 1) : null
        void postAnchor({ file })
        fieldStore.set(field)
        el.querySelectorAll('[data-his-field]').forEach((r) => { (r as HTMLElement).style.background = 'transparent' })
        fieldEl.style.background = 'var(--dsw-alias-interactive-bg-hover)'
      } else if (headEl) {
        const file = headEl.getAttribute('data-his-anchor')
        if (file) { void postAnchor({ file }); fieldStore.set(null) }
      }
    }
    el.addEventListener('click', onClick)
    graph.zoomToFit({ padding: 24, maxScale: 1.2 })
    return () => { el.removeEventListener('click', onClick); graph.dispose() }
  }, [detail])
  return <div key={detail.file} ref={ref} style={{ width: '100%', height: '100%', minHeight: 480 }} />
}
function erNodeHTML(d: ModelDetail): string {
  const rows = (d.fields ?? []).map((f) => {
    const badge = f.pk ? '<span style="color:#e5a24a;font-size:10px">PK</span>'
      : f.std ? '<span style="color:#3fbf6f;font-size:10px">✓ ' + f.std.replace(/</g, '&lt;') + '</span>'
      : f.skip ? '<span style="color:#7d8794;font-size:10px">免绑</span>'
      : '<span style="color:#e5484d;font-size:10px">未绑定</span>'
    return '<div data-his-field="' + d.file + '|' + f.n + '" style="display:flex;gap:8px;align-items:center;height:' + 24 + 'px;padding:0 10px;border-top:1px solid #2c323c;font-family:ui-monospace,Menlo,monospace;font-size:11px;cursor:pointer" title="点击锚定字段">'
      + '<span style="color:#9aa4b2;flex:none">' + f.t.replace(/</g, '&lt;') + '</span>'
      + '<span style="color:#c8ccd2;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + f.n.replace(/</g, '&lt;') + '</span>'
      + badge + '</div>'
  }).join('')
  return '<div style="background:#1b1f27;border:1px solid #3a4150;border-radius:10px;overflow:hidden;width:100%;height:100%">'
    + '<div data-his-anchor="' + d.file + '" style="padding:8px 10px;display:flex;gap:8px;align-items:center;cursor:pointer" title="点击锚定模型">'
    + '<span style="color:#d0d4da;font-size:13px;font-weight:600">' + (d.model || d.file).replace(/</g, '&lt;') + '</span>'
    + '<span style="color:#7d8794;font-size:10px">' + (d.cn || '').replace(/</g, '&lt;') + '</span>'
    + '<span style="margin-left:auto;color:' + (d.published ? '#3fbf6f' : '#7d8794') + ';font-size:10px">' + d.version + (d.published ? ' · 已发布' : ' · 草稿') + '</span>'
    + '</div>' + rows + '</div>'
}

/** 本体推理链图（X6 HTML shape，分层布局 Job→JobType→PlatformInstance→Policy→Rule→RuleImpl）。 */
function OntoChainGraph({ chain }: { chain: { nodes?: Array<{ id: string; type: string; name: string; sub?: string }>; edges?: Array<{ type: string; from: string; to: string; label: string }> } }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nodes = chain.nodes ?? []
    const edges = chain.edges ?? []
    try { Shape.HTML.register({ shape: 'his-onto-node', width: 168, height: 58, effect: ['data'], html: (cell: any) => ontoNodeHTML(cell.getData()) }) } catch {}
    const graph = new Graph({
      container: el,
      width: el.clientWidth || 600,
      height: 380,
      background: { color: 'transparent' },
      interacting: { nodeMovable: false, edgeMovable: false, edgeLabelMovable: false },
      mousewheel: { enabled: true, zoomAtMousePosition: true, minScale: 0.25, maxScale: 2 },
    })
    const rank: Record<string, number> = { Job: 0, JobType: 1, PlatformInstance: 2, Policy: 3, Rule: 4, RuleImpl: 5 }
    const cols: Record<string, typeof nodes> = {}
    for (const n of nodes) { (cols[n.type] ??= []).push(n) }
    const pos: Record<string, { x: number; y: number }> = {}
    const ORDER = ['Job', 'JobType', 'PlatformInstance', 'Policy', 'Rule', 'RuleImpl']
    const W = 168, H = 58, GAP = 30
    let cx = 40
    const maxColH = Math.max(1, ...ORDER.map((t) => (cols[t] || []).length * (H + GAP) - GAP))
    for (const t of ORDER) {
      const col = cols[t] || []
      if (!col.length) continue
      const colH = col.length * (H + GAP) - GAP
      let cy = 30 + Math.max(0, (maxColH - colH) / 2)
      for (const n of col) { pos[n.id] = { x: cx, y: cy }; cy += H + GAP }
      cx += W + 110
    }
    nodes.forEach((n) => { if (!pos[n.id]) pos[n.id] = { x: cx, y: 30 } })
    nodes.forEach((n) => {
      graph.addNode({ shape: 'his-onto-node', id: n.id, x: pos[n.id].x, y: pos[n.id].y, width: W, height: H, data: n })
    })
    const hasId = (id: string) => nodes.some((n) => n.id === id)
    edges.forEach((e) => {
      if (!hasId(e.from) || !hasId(e.to)) return
      graph.addEdge({
        source: e.from, target: e.to,
        router: { name: 'manhattan', args: { padding: 14 } },
        connector: { name: 'rounded', args: { radius: 6 } },
        attrs: { line: { stroke: '#4a5260', strokeWidth: 1.1, targetMarker: { name: 'block', width: 6, height: 6 } } },
        labels: [{ attrs: { label: { text: e.label, fill: '#9aa4b2', fontSize: 10, fontFamily: 'ui-monospace, monospace' }, body: { fill: 'var(--dsw-alias-bg-layer-2, #1b1f27)', stroke: 'var(--dsw-alias-border-l2)', rx: 4, ry: 4 } }, position: { distance: 0.5, offset: 14 } }],
      })
    })
    if (nodes.length) graph.zoomToFit({ padding: 24, maxScale: 1.2 })
    return () => { graph.dispose() }
  }, [chain])
  return <div ref={ref} style={{ width: '100%', height: 380, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, marginTop: 10, overflow: 'hidden', position: 'relative' }} />
}
function ontoNodeHTML(n: { type: string; name: string; sub?: string }): string {
  const isJob = n.type === 'Job', isRule = n.type === 'Rule'
  return '<div style="background:' + (isJob ? '#2b6de0' : isRule ? '#3a4150' : '#1b1f27') + ';border:1px solid ' + (isJob ? '#4d86e8' : '#3a4150') + ';border-radius:8px;width:100%;height:100%;padding:8px 10px;box-sizing:border-box">'
    + '<div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:' + (isJob ? '#cfe0ff' : '#7d8794') + '">' + n.type + '</div>'
    + '<div style="font-size:13px;line-height:1.2;color:' + (isJob ? '#ffffff' : '#d0d4da') + ';margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + n.name.replace(/</g, '&lt;') + '</div>'
    + (n.sub ? '<div style="font-size:10px;line-height:1.2;color:' + (isJob ? '#b7cdf5' : '#7d8794') + ';margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + n.sub.replace(/</g, '&lt;') + '</div>' : '')
    + '</div>'
}

const LAYER_ORDER = ['ODS', 'DIM', 'DWD', 'DWS', 'ADS']

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
/** footer 切换钮：wide 由顶部滑块接管，仅 rail（收起）态显示图标切换。 */
function ToggleAction(props: { wide: boolean }): JSX.Element {
  const isHis = useSyncExternalStore(modeStore.subscribe, modeStore.isHis)
  if (props.wide) return <></>
  return (
    <button type="button" onClick={modeStore.toggle} title={isHis ? 'HIS 数据工作台' : '工作区'}
      style={{ width: 36, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', borderRadius: 8, fontSize: 14 }}>
      {isHis ? '▤' : '◀'}
    </button>
  )
}


/** 锚定条（conversation.session.header.actions 叠加位）：显示当前锚定对象，点击下拉切换模型/代码仓。 */
function AnchorAction(): JSX.Element {
  const anchor = useSyncExternalStore(anchorStore.subscribe, anchorStore.get)
  const field = useSyncExternalStore(fieldStore.subscribe, fieldStore.get)
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<ModelItem[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [branch, setBranch] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      const [a, m, b] = await Promise.all([fetchAnchor(), fetchModels(), fetchRepoTree()])
      if (!alive) return
      anchorStore.set(a)
      setModels(m)
      setBranches(b.branches)
      setBranch(a?.branch || b.current || '')
    })()
    return () => { alive = false }
  }, [])

  const pick = async (body: { file?: string; branch?: string; dir?: string | null }) => {
    await postAnchor(body)
    setOpen(false)
  }

  const label = anchor
    ? (anchor.kind === 'model' ? '模型 ' + (anchor.file || '') + (field ? ' · ' + field : '') : '代码仓 ' + (anchor.path || anchor.dir ? (anchor.branch || '') + '/' + (anchor.path || anchor.dir || '') : (anchor.branch || '')))
    : '未锚定'

  const panelStyle: React.CSSProperties = {
    position: 'absolute', top: 34, left: 0, zIndex: 1000, minWidth: 240, maxWidth: 320, maxHeight: 400, overflow: 'auto',
    background: 'var(--dsw-alias-bg-layer-2, #1b1f27)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10,
    padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="切换锚定对象"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-button-tool-bar-fill, transparent)', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 240 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: 'var(--dsw-alias-label-caption)' }}>▾</span>
      </button>
      {open && (
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', padding: '4px 8px' }}>模型</div>
          {models.map((m) => (
            <div key={m.file} role="treeitem" onClick={() => void pick({ file: m.file })}
              className={'hisR_sessionRow hisR_flatSessionRowWithoutStatus' + (anchor?.kind === 'model' && anchor.file === m.file ? ' hisR_selected' : '')}
              style={{ width: '100%', cursor: 'pointer', fontFamily: 'inherit', paddingLeft: 8 }}>
              <span className="hisR_title">{m.name}</span>
              <span className="hisR_time" style={{ color: 'var(--dsw-alias-label-caption)' }}>{m.bound}/{m.total}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', padding: '8px 8px 4px' }}>代码仓</div>
          <div style={{ display: 'flex', gap: 6, padding: '0 8px 4px', alignItems: 'center' }}>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}
              style={{ flex: 1, height: 26, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontSize: 12, padding: '0 4px', fontFamily: 'inherit' }}>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <button type="button" onClick={() => void pick({ branch })}
              style={{ height: 26, padding: '0 10px', borderRadius: 8, border: 'none', background: 'var(--dsw-alias-button-primary-fill, #2b6de0)', color: '#fff', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
              锚定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** 工作区（中列常驻）：读 openFileStore 打开文件，代码查看/编辑 + 血缘文字列表。 */
function WorkspaceArea(): JSX.Element {
  const path = useSyncExternalStore(openFileStore.subscribe, openFileStore.get)
  const modelFile = useSyncExternalStore(openModelStore.subscribe, openModelStore.get)
  const [file, setFile] = useState<FileContent | null>(null)
  const [modelDetail, setModelDetail] = useState<ModelDetail | null>(null)
  const [modelTab, setModelTab] = useState<'er' | 'ddl'>('er')
  const [subTab, setSubTab] = useState<string>('code')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [lineage, setLineage] = useState<LineageData | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)
  const [opsCheck, setOpsCheck] = useState<Record<string, unknown> | null>(null)
  const [scanBatch, setScanBatch] = useState<{ n: number; at: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanSteps, setScanSteps] = useState<ScanStepState[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (modelFile) {
      let alive = true
      setModelDetail(null); setFile(null); setLineage(null); setScan(null); setError('')
      void (async () => {
        const d = await fetchModelDetail(modelFile)
        if (alive) setModelDetail(d)
      })()
      return () => { alive = false }
    }
    if (!path) { setFile(null); setDraft(''); setLineage(null); setScan(null); setError(''); setModelDetail(null); return }
    let alive = true
    setFile(null); setDraft(''); setLineage(null); setScan(null); setError(''); setEditing(false); setSubTab('code'); setModelDetail(null)
    void (async () => {
      const f = await fetchFile(path)
      if (!alive) return
      if (!f) { setError('文件不存在: ' + path); return }
      setFile(f); setDraft(f.text)
    })()
    return () => { alive = false }
  }, [path, modelFile])

  const save = async () => {
    if (!path) return
    const ok = await postFile(path, draft)
    if (ok) { setFile((f) => f ? { ...f, text: draft } : f); setEditing(false) }
  }
  const handleTab = (id: string) => {
    setSubTab(id)
    if (id === 'lineage' && path) { setLineage(null); void fetchLineage(path).then(setLineage) }
    if (id === 'test' && path) { setTestResult(null); void runTest(path).then(setTestResult) }
    if (id === 'pair' && path) { setOpsCheck(null); void fetchOpsCheck(path).then(setOpsCheck) }
    // scan 走「扫描」按钮（批次语义），不随 tab 自动触发
  }
  const runScan = async () => {
    if (!path) return
    setScanning(true); setScan(null)
    setScanSteps([
      { id: 'classify', label: '获取对象类型', status: 'running' },
      { id: 'policies', label: '关联策略 / 规则', status: 'pending' },
      { id: 'execute', label: '调用规则能力扫描', status: 'pending' },
    ])
    // step 1：分类 + 锚定
    const c = await fetchScanStep(path, 'classify')
    setScanSteps((prev) => prev.map((s) => s.id === 'classify'
      ? { ...s, status: 'done', detail: c?.classify?.ok ? (c.classify.instanceName + ' · ' + c.classify.jobTypeName) : '分类信号不足' }
      : s.id === 'policies' ? { ...s, status: 'running' } : s))
    // step 2：策略 / 规则
    const pol = await fetchScanStep(path, 'policies')
    setScanSteps((prev) => prev.map((s) => s.id === 'policies'
      ? { ...s, status: 'done', detail: (pol?.policies?.length ?? 0) + ' 组策略 · ' + ((pol?.rules?.ruleCount) ?? 0) + ' 条规则' }
      : s.id === 'execute' ? { ...s, status: 'running' } : s))
    // step 3：执行扫描
    const ex = await fetchScanStep(path, 'execute')
    setScanSteps((prev) => prev.map((s) => s.id === 'execute'
      ? { ...s, status: 'done', detail: '一致性 ' + (ex?.consistency?.status ?? '—') + ' · findings ' + (ex?.findings?.length ?? 0) }
      : s))
    setScan({
      path,
      classify: c?.classify, policies: pol?.policies ?? [], rules: pol?.rules ?? null,
      scanPlan: pol?.scanPlan, consistency: ex?.consistency, findings: ex?.findings ?? [],
      chain: ex?.chain, anchored: c?.anchored, scan: ex?.scan, scanVerdict: ex?.scanVerdict ?? 'no-scan',
      trace: ex?.trace ?? [], ontVersion: ex?.ontVersion ?? '',
    })
    setScanBatch((prev) => ({ n: (prev?.n ?? 0) + 1, at: new Date().toLocaleTimeString() }))
    setScanning(false)
  }

  const subTabBtn = (id: string, label: string) => (
    <button type="button" onClick={() => handleTab(id)}
      style={{ height: 26, padding: '0 10px', borderRadius: 8, border: 'none', background: subTab === id ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent', color: subTab === id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
      {label}
    </button>
  )

  if (modelFile) {
    const mTab = (id: 'er' | 'ddl', label: string) => (
      <button type="button" onClick={() => setModelTab(id)}
        style={{ height: 26, padding: '0 10px', borderRadius: 8, border: 'none', background: modelTab === id ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent', color: modelTab === id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
        {label}
      </button>
    )
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--dsw-alias-border-l2)', flex: 'none' }}>
          <span style={{ fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 13, color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 'none', maxWidth: 360 }}>{modelFile}</span>
          <span style={{ flex: 1 }} />
          {mTab('er', 'ER 图')}
          {mTab('ddl', 'DDL')}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {modelDetail
            ? modelTab === 'er'
              ? <ErGraph detail={modelDetail} />
              : <div style={{ padding: 14 }}>
                  <pre style={{ margin: 0, fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{modelDetail.ddl || '—'}</pre>
                </div>
            : <div style={{ padding: 14, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</div>}
        </div>
      </div>
    )
  }

  if (!path) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }}>
        从左侧「代码仓」树点一个文件，或「模型」里点一个模型。
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--dsw-alias-border-l2)', flex: 'none' }}>
        <span style={{ fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 13, color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 'none', maxWidth: 360 }}>
          {path}
        </span>
        <span style={{ flex: 1 }} />
        {(TABS_BY_KIND[file?.kind ?? ''] || [['code', '代码']]).map(([id, label]) => subTabBtn(id, label))}
        {subTab === 'code' && (
          editing
            ? <button type="button" onClick={() => void save()} style={{ height: 26, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--dsw-alias-button-primary-fill, #2b6de0)', color: '#fff', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>保存</button>
            : <button type="button" onClick={() => setEditing(true)} style={{ height: 26, padding: '0 12px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>编辑</button>
        )}
        {editing && <button type="button" onClick={() => { setDraft(file?.text ?? ''); setEditing(false) }} style={{ height: 26, padding: '0 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>放弃</button>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {error ? <div style={{ padding: 16, color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{error}</div>
          : subTab === 'code' || subTab === 'dsl' ? (
            <textarea value={editing ? draft : file?.text ?? ''} readOnly={subTab === 'dsl' ? true : !editing} onChange={(e) => setDraft(e.target.value)}
              style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'none', padding: 14, background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 12.5, lineHeight: 1.6 }} />
          ) : subTab === 'flow' ? (
            <FlowView parsed={file?.parsed} />
          ) : subTab === 'seq' ? (
            <OpsSeqView parsed={file?.parsed} />
          ) : subTab === 'graph' ? (
            <div style={{ padding: 8, height: '100%', boxSizing: 'border-box' }}>
              <DagGraph path={path} parsed={file?.parsed} />
            </div>
          ) : subTab === 'pair' ? (
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', marginBottom: 6 }}>配对校验</div>
              {opsCheck == null
                ? <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5 }}>校验中…</div>
                : <pre style={{ margin: 0, fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{JSON.stringify(opsCheck, null, 2)}</pre>}
            </div>
          ) : subTab === 'scan' ? (
            <div style={{ padding: 14, fontSize: 12.5 }}>
              {/* 扫描按钮 + 批次 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <button type="button" onClick={() => void runScan()} disabled={scanning}
                  style={{ height: 28, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--dsw-alias-button-primary-fill, #2b6de0)', color: '#fff', fontSize: 12.5, fontFamily: 'inherit', cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.6 : 1 }}>
                  {scanning ? '扫描中…' : '扫描'}
                </button>
                {scanBatch && <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)' }}>批次 #{scanBatch.n} · {scanBatch.at}</span>}
                <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginLeft: 'auto' }}>对当前工作区文件做本体扫描</span>
              </div>
              {/* 扫描过程步骤 */}
              {scanSteps.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {scanSteps.map((s) => (
                    <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                      <span style={{ width: 16, flex: 'none', textAlign: 'center', color: s.status === 'done' ? 'var(--dsw-alias-state-success-primary)' : s.status === 'running' ? 'var(--dsw-alias-state-business-primary, #2b6de0)' : 'var(--dsw-alias-label-caption)' }}>
                        {s.status === 'done' ? '✓' : s.status === 'running' ? '◌' : '·'}
                      </span>
                      <span style={{ color: s.status === 'pending' ? 'var(--dsw-alias-label-caption)' : 'var(--dsw-alias-label-primary)' }}>{s.label}</span>
                      {s.detail && <span style={{ marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, flex: 'none' }}>{s.detail}</span>}
                    </div>
                  ))}
                </div>
              )}
              {scan ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>本体驱动扫描</span>
                    <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                    <span style={{ marginLeft: 'auto', flex: 'none' }}>
                      {scan.scanVerdict === 'pass' && <span style={{ color: 'var(--dsw-alias-state-success-primary)', fontSize: 11, border: '1px solid currentColor', borderRadius: 6, padding: '1px 8px' }}>✓ 通过</span>}
                      {scan.scanVerdict === 'diff' && <span style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 11, border: '1px solid currentColor', borderRadius: 6, padding: '1px 8px' }}>⚠ 有差异</span>}
                      {scan.scanVerdict === 'pass-unknown' && <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, border: '1px solid currentColor', borderRadius: 6, padding: '1px 8px' }}>部分未知</span>}
                    </span>
                  </div>
                  {scan.scan && (
                    <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)', fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 8, padding: '2px 0' }}><span style={{ color: scan.scan.design?.pass ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }}>{scan.scan.design?.pass ? '✓' : '✗'}</span> 设计质量</div>
                      <div style={{ display: 'flex', gap: 8, padding: '2px 0' }}><span style={{ color: scan.scan.sql?.pass ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }}>{scan.scan.sql?.pass ? '✓' : '✗'}</span> SQL 规范 {scan.scan.sql?.dangers?.length ? '· ' + scan.scan.sql.dangers.join('、') : ''}</div>
                      <div style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                        <span style={{ color: scan.scan.consistency?.pass === true ? 'var(--dsw-alias-state-success-primary)' : scan.scan.consistency?.pass === false ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-caption)' }}>{scan.scan.consistency?.pass === true ? '✓' : scan.scan.consistency?.pass === false ? '✗' : '—'}</span>
                        一致性 {scan.scan.consistency?.model ? '· ' + scan.scan.consistency.model : ''}
                      </div>
                    </div>
                  )}
                  {scan.anchored?.ok ? (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: 'var(--dsw-alias-label-secondary)' }}>锚定对象 · {scan.anchored.objectType?.typeName}（{scan.anchored.objectType?.type}）· {scan.anchored.anchored?.name}</div>
                      {scan.anchored.why && <div style={{ color: 'var(--dsw-alias-label-caption)', fontSize: 11, marginTop: 2 }}>识别依据：{scan.anchored.why}</div>}
                    </div>
                  ) : null}
                  {scan.findings.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', margin: '10px 0 6px' }}>发现 · Findings</div>
                      {scan.findings.map((f) => (
                        <div key={f.id} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ color: f.severity.startsWith('告警') ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-warn-primary, #e5a24a)', fontSize: 11 }}>{f.severity}</span>
                            <span style={{ color: 'var(--dsw-alias-label-primary)', fontFamily: 'var(--ds-font-family-code, monospace)' }}>{f.field}</span>
                          </div>
                          <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginTop: 3 }}>{f.desc}</div>
                          {f.fix && <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, marginTop: 3 }}>建议：{f.fix.from} → {f.fix.to}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', margin: '10px 0 6px' }}>本体推理链</div>
                  {scan.chain?.nodes?.length ? <OntoChainGraph chain={scan.chain} /> : <div style={{ color: 'var(--dsw-alias-label-tertiary)' }}>—</div>}
                  {scan.trace?.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', margin: '10px 0 6px' }}>处理过程 · 解析轨迹</div>
                      {scan.trace.map((t, i) => (
                        <div key={i} style={{ borderLeft: '2px solid var(--dsw-alias-border-l2)', paddingLeft: 8, marginBottom: 6 }}>
                          <div style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t.title} <span style={{ color: 'var(--dsw-alias-label-caption)', fontSize: 11 }}>{t.stat}</span></div>
                          {(t.hits || []).map((x, j) => (
                            <div key={j} style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, padding: '1px 0' }}>{x.signal || x.policy || x.rule || x.item} {x.value ? '· ' + x.value : ''} {x.hit ? '→ ' + x.hit : ''}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)', marginTop: 10 }}>本体版本 {scan.ontVersion}</div>
                </>
              ) : <div style={{ color: 'var(--dsw-alias-label-tertiary)', padding: '20px 0', textAlign: 'center' }}>点击「扫描」按钮，对当前文件执行本体驱动扫描</div>}
            </div>
          ) : subTab === 'test' ? (
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)', marginBottom: 6 }}>dry-run 采样</div>
              {testResult == null
                ? <div style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5 }}>运行中…</div>
                : <pre style={{ margin: 0, fontFamily: 'var(--ds-font-family-code, ui-monospace, Menlo, monospace)', fontSize: 12, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{JSON.stringify(testResult, null, 2)}</pre>}
            </div>
          ) : lineage ? (
            <div style={{ padding: 8, height: '100%', boxSizing: 'border-box' }}>
              <LineageGraph path={path} lineage={lineage} />
            </div>
          ) : (
            <div style={{ padding: 14, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12.5 }}>血缘加载中…</div>
          )}
      </div>
    </div>
  )
}

/** HIS 代码仓树视图。 */
function HisRepoView(props: { wide: boolean; expandSidebar?: () => void }): JSX.Element {
  const [repo, setRepo] = useState<RepoTree>({ branches: [], current: '', tree: [] })
  const [models, setModels] = useState<ModelItem[]>([])
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState('')
  const [repoOpen, setRepoOpen] = useState(true)
  const [modelOpen, setModelOpen] = useState(false)
  const [createTarget, setCreateTarget] = useState<{ dir: string; x: number; y: number } | null>(null)
  const [createName, setCreateName] = useState('')

  useEffect(() => { ensureCss() }, [])
  // HIS 模式下隐藏官方「新会话」按钮（其上方 logoRow/下方区域不动），官方按钮固定不可插槽，用 body 类 + CSS 隐藏
  useEffect(() => {
    document.body.classList.add('his-sidebar-his')
    return () => document.body.classList.remove('his-sidebar-his')
  }, [])
  useEffect(() => {
    let alive = true
    void (async () => {
      const r = await fetchRepoTree()
      if (!alive) return
      setRepo(r)
      if (!r.branches.length && !r.tree.length) setError('代码仓服务未就绪')
    })()
    void (async () => {
      const m = await fetchModels()
      if (alive) setModels(m)
    })()
    return () => { alive = false }
  }, [])

  const pickBranch = async (b: string) => {
    setRepo((prev) => ({ ...prev, current: b }))
    setSelected('')
    const r = await fetchRepoTree(b)
    setRepo((prev) => ({ ...prev, tree: r.tree }))
  }
  const refreshTree = async () => {
    const r = await fetchRepoTree(repo.current || undefined)
    setRepo((prev) => ({ ...prev, tree: r.tree, branches: prev.branches.length ? prev.branches : r.branches }))
  }
  const confirmCreate = async () => {
    if (!createTarget || !createName.trim()) return
    const name = createName.trim()
    // dir 为空 = 顶部「新文件」：createName 直接是完整路径；否则为目录内文件名
    const target = createTarget.dir ? createTarget.dir + '/' + name : name
    const r = await createFile(target)
    if (r?.error) { /* 静默，树刷新后不出现即失败 */ }
    setCreateTarget(null); setCreateName('')
    await refreshTree()
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

  /** 代码仓文件树（depth 为相对「代码仓」文件夹的层级，1 = 顶层目录）。 */
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
          <span role="button" title="新建文件" onClick={(e) => { e.stopPropagation(); setCreateTarget({ dir: d.path, x: e.clientX, y: e.clientY }); setCreateName('') }}
            style={{ flex: 'none', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', opacity: 0.7 }}>⋮</span>
        </div>,
      )
    }
    if (!isCollapsed) {
      for (const sub of d.dirs) out.push(...renderDir(sub, depth + 1))
      for (const f of d.files) {
        const isSel = selected === f.path
        out.push(
          <div key={'f' + f.path} role="treeitem" aria-selected={isSel} onClick={() => { setSelected(f.path); openFileStore.open(f.path); void postAnchor({ branch: repo.current, path: f.path }) }}
            className={'hisR_sessionRow hisR_flatSessionRowWithoutStatus' + (isSel ? ' hisR_selected' : '')} style={{ ...rowBase, paddingLeft: pad + 14 }}>
            <span className="hisR_title">{f.path.slice(f.path.lastIndexOf('/') + 1)}</span>
            {(f.uncommitted || f.dirty) ? <span className="hisR_time" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>未提交</span> : null}
          </div>,
        )
      }
    }
    return out
  }

  const groupedModels = useMemo(() => {
    const groups: Array<{ layer: string; items: ModelItem[] }> = []
    for (const layer of LAYER_ORDER) {
      const items = models.filter((m) => (m.layer || '').toUpperCase() === layer)
      if (items.length) groups.push({ layer, items })
    }
    for (const m of models) {
      const L = (m.layer || '').toUpperCase()
      if (!LAYER_ORDER.includes(L) && !groups.some((g) => g.layer === (L || '未分层'))) {
        groups.push({ layer: L || '未分层', items: models.filter((x) => (x.layer || '').toUpperCase() === L) })
      }
    }
    return groups
  }, [models])

  /** 模型树（相对「模型」文件夹：layer 组 + 模型行）。 */
  const renderModels = (): JSX.Element[] => {
    const out: JSX.Element[] = []
    for (const g of groupedModels) {
      out.push(
        <div key={'g' + g.layer} role="treeitem" aria-expanded="true"
          className="hisR_projectRow" style={{ ...rowBase, paddingLeft: 18, cursor: 'default' }}>
          <span className="hisR_slot hisR_folder hisR_folderActive"><IconFolderOpen16 /></span>
          <span className="hisR_projectText"><span className="hisR_title">{g.layer}</span></span>
          <span className="hisR_time" style={{ color: 'var(--dsw-alias-label-caption)' }}>{g.items.length}</span>
        </div>,
      )
      for (const m of g.items) {
        out.push(
          <div key={'m' + m.file} role="treeitem" onClick={() => { setSelected(m.file); openModelStore.open(m.file); void postAnchor({ file: m.file }) }}
            className={'hisR_sessionRow hisR_flatSessionRowWithoutStatus' + (selected === m.file ? ' hisR_selected' : '')}
            style={{ ...rowBase, paddingLeft: 32 }}>
            <span className="hisR_title">{m.name}</span>
            <span className="hisR_time" style={{ color: m.published ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-tertiary)' }}>
              {m.bound}/{m.total}
            </span>
          </div>,
        )
      }
    }
    return out
  }

  /** 顶层文件夹行（代码仓 / 模型）。 */
  const folderRow = (open: boolean, onToggle: () => void, glyph: string, title: string, extra?: JSX.Element) => (
    <div role="treeitem" aria-expanded={open} onClick={onToggle}
      className="hisR_projectRow" style={{ ...rowBase, paddingLeft: 4, marginTop: 2 }}>
      <span className={'hisR_slot hisR_folder' + (open ? ' hisR_folderActive' : '')}>
        {open ? <IconFolderOpen16 /> : <IconFolderClose16 />}
      </span>
      <span className="hisR_slot hisR_chevron"><IconTriangleRight14 open={open} /></span>
      <span className="hisR_projectText"><span className="hisR_title">{title}</span></span>
      {extra}
    </div>
  )

  return (
    <div className="hisB_root">
      {/* 顶部「新文件」（官方「新会话」已在 HIS 模式隐藏，此按钮占据同位） */}
      <button type="button" className="hisB_newFile" title="新建文件（完整路径）"
        onClick={(e) => { const rc = e.currentTarget.getBoundingClientRect(); setCreateName(''); setCreateTarget({ dir: '', x: rc.left, y: rc.bottom }) }}>
        ＋ 新文件
      </button>
      <div className="hisB_listArea">
        <div className="hisB_treeBody">
          <div className="hisB_list" role="tree">

            {/* 代码仓 文件夹 */}
            {folderRow(repoOpen, () => setRepoOpen((v) => !v), '▤', '代码仓', (
              <span onClick={(e) => e.stopPropagation()}>
                <select value={repo.current} onChange={(e) => void pickBranch(e.target.value)} title="分支"
                  style={{ height: 26, maxWidth: 110, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontSize: 11, padding: '0 4px', fontFamily: 'inherit' }}>
                  {repo.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </span>
            ))}
            {repoOpen && (error ? <div className="hisB_empty" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div>
              : repo.tree.length === 0 ? <div className="hisB_empty">加载中…</div>
              : renderDir(tree, 0))}
            {/* 新建文件卡片（点击目录 ⋮ 弹出） */}
            {createTarget && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCreateTarget(null)} />
                <div style={{ position: 'fixed', left: Math.min(createTarget.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 260), top: createTarget.y + 8, zIndex: 1000, width: 250, background: 'var(--dsw-alias-bg-layer-2, #1b1f27)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 12 }}>
                  {createTarget.dir ? (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>新建到 <span style={{ fontFamily: 'var(--ds-font-family-code, monospace)', color: 'var(--dsw-alias-label-primary)' }}>{createTarget.dir}/</span></div>
                      <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)', marginTop: 2 }}>{DIR_TYPE_HINT[createTarget.dir] || '新建文件'}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>新建文件</div>
                      <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-caption)', marginTop: 2 }}>完整路径：目录/文件名.类型，如 dag/dwd_x.dag；按目录自动套模板</div>
                    </>
                  )}
                  <input autoFocus value={createName} onChange={(e) => setCreateName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void confirmCreate(); if (e.key === 'Escape') setCreateTarget(null) }}
                    placeholder={createTarget.dir ? '文件名（如 x.sql / x.dag / x.etl）' : '完整路径，如 dag/dwd_x.dag / etl/ads_x.etl'}
                    style={{ width: '100%', boxSizing: 'border-box', height: 28, marginTop: 10, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, padding: '0 8px', fontFamily: 'inherit', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => void confirmCreate()} style={{ flex: 1, height: 28, borderRadius: 8, border: 'none', background: 'var(--dsw-alias-button-primary-fill, #2b6de0)', color: '#fff', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>新建</button>
                    <button type="button" onClick={() => setCreateTarget(null)} style={{ height: 28, padding: '0 12px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>取消</button>
                  </div>
                </div>
              </>
            )}
            {/* 模型 文件夹 */}
            {folderRow(modelOpen, () => setModelOpen((v) => !v), '◇', '模型', (
              <span className="hisR_time" style={{ color: 'var(--dsw-alias-label-caption)' }}>{models.length}</span>
            ))}
            {modelOpen && (models.length === 0 ? <div className="hisB_empty">加载中…</div> : renderModels())}
          </div>
        </div>
      </div>
    </div>
  )
}

/** HIS 自定义三列框架（接管 root 槽）：左 sidebar / 中工作区 / 右 conversation。 */
function HisAppFrame(props: { renderSlot: (key: string, owner?: unknown, opts?: unknown) => React.JSX.Element }): JSX.Element {
  const layout = useSyncExternalStore(layoutStore.subscribe, layoutStore.get)
  const sw = layout.sidebarCollapsed ? 56 : layout.sidebarWidth
  return (
    <div style={{ display: 'grid', gridTemplateColumns: sw + 'px minmax(0, 1fr) ' + layout.convWidth + 'px', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--dsw-alias-bg-base)' }}>
      <div style={{ minWidth: 0, overflow: 'hidden', borderRight: '1px solid var(--dsw-alias-border-l2)' }}>
        {props.renderSlot('sidebar', { collapsed: layout.sidebarCollapsed, width: layout.sidebarWidth })}
      </div>
      <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* 中列 = HIS 工作区 */}
        <WorkspaceArea />
      </div>
      <div style={{ minWidth: 0, overflow: 'hidden', borderLeft: '1px solid var(--dsw-alias-border-l2)' }}>
        {props.renderSlot('conversation', {})}
      </div>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000 }}>
        {props.renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}

/** 侧栏品牌 mark（替换官方 DeepSeek 图标）。 */
function HisBrandMark(props: { size?: number }): JSX.Element {
  const s = props.size ?? 24
  return (
    <span style={{ width: s, height: s, borderRadius: s * 0.3, background: 'var(--dsw-alias-brand-primary, #2b6de0)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: s * 0.5, fontWeight: 700, fontFamily: 'ui-monospace, monospace', flex: 'none' }} aria-hidden>H</span>
  )
}
/** 侧栏品牌名 = 分段滑块（工作区 ↔ HIS 数据），切换 sidebar.workspaces 内容。 */
function HisBrandName(): JSX.Element {
  const isHis = useSyncExternalStore(modeStore.subscribe, modeStore.isHis)
  const setMode = (his: boolean) => { if (isHis !== his) modeStore.toggle() }
  const seg = (active: boolean, label: string, onSel: () => void) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); onSel() }}
      style={{ height: 22, padding: '0 9px', borderRadius: 7, border: 'none', background: active ? 'var(--dsw-alias-bg-layer-2, #ffffff)' : 'transparent', color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: active ? 600 : 400, transition: 'background .15s, color .15s' }}>
      {label}
    </button>
  )
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(127,127,127,.18)', borderRadius: 9, padding: 2, gap: 2 }}
      onClick={(e) => e.stopPropagation()}>
      {seg(!isHis, '工作区', () => setMode(false))}
      {seg(isHis, 'HIS 数据', () => setMode(true))}
    </div>
  )
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ensureCss()
  // 替换侧栏品牌（shadow 官方 ui-brand-official：priority -1 赢默认 0）
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, (props: any) => HisBrandMark(props as { size?: number })))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 }, () => HisBrandName()))
  // 提供 ctx.layout（官方 ui-layout 已禁，ui-sidebar/ui-conversation 依赖这 3 个方法）
  ctx.provide('layout', {
    toggleSidebar: () => layoutStore.toggleSidebar(),
    openDetails: () => {},
    closeDetails: () => {},
  })

  // 接管 root 槽：声明官方四子槽并自排三列（左 sidebar / 中工作区 / 右 conversation）
  ctx.slots.inject('root', () => ctx.slots.register({
    name: 'root',
    children: {
      'sidebar': { kind: 'single', scope: 'root' },
      'conversation': { kind: 'single', scope: 'session-maybe' },
      'details': { kind: 'single', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  }, (props: any) => HisAppFrame(props)))

  // 锚定条：会话头部 action 行叠加一个「锚定」按钮（不替换官方 header）
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'his-anchor', order: -1, label: '锚定',
  }, () => AnchorAction()))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'his-workspace-toggle', order: 90, label: '数据工作台',
  }, (props: any) => ToggleAction(props as { wide: boolean })))

  ctx.slots.inject('sidebar.workspaces', () => {
    let disposeHis: (() => void) | null = null
    const sync = () => {
      if (modeStore.isHis() && !disposeHis) {
        disposeHis = ctx.slots.register({ name: 'sidebar.workspaces', priority: -1 }, (props: any) => HisRepoView(props as { wide: boolean; expandSidebar?: () => void }))
      } else if (!modeStore.isHis() && disposeHis) {
        disposeHis(); disposeHis = null
      }
    }
    sync()
    const off = modeStore.subscribe(sync)
    return () => { off(); if (disposeHis) { disposeHis(); disposeHis = null } }
  })
}