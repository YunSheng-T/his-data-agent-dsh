// Mock Provider —— 宿主平台六个服务的内存替身（模型管理 / 数据标准 / 资产目录）
// P0 阶段不接真实平台 API；接口即 Definition 层契约，联调时整层替换。
// 所有返回带证据标签（evidence）：来源服务、版本、时间戳。

import { MODELS, STD_LIB, ASSET_CATALOG } from './seed-data.js'

const now = () => new Date().toISOString()

function evidence(source, version) {
  return { source, version, ts: now() }
}

// 深拷贝种子，Provider 持有自己的可变状态（工作区写入只改这里）
const state = {
  models: JSON.parse(JSON.stringify(MODELS)),
  stdLib: { ...STD_LIB, standards: [...STD_LIB.standards], drafts: [] },
  catalog: { assets: [], lineage: [] },
  // 工作区未提交缓冲：{ [modelFile]: { binds: [], alters: [] } }
  workspace: {},
}

function getModel(file) {
  const m = state.models[file]
  if (!m) throw new Error(`模型不存在: ${file}（可选：${Object.keys(state.models).join(', ')}）`)
  return m
}

function ws(file) {
  return state.workspace[file] ?? (state.workspace[file] = { binds: [], alters: [] })
}

export const provider = {
  // ---------- 模型服务（新建，gated） ----------
  createModel({ model, cn, domain, layer, fields }) {
    let file = String(model ?? '').trim()
    if (!file) throw new Error('缺少模型文件名')
    if (!file.endsWith('.model')) file += '.model'
    let name = file.slice(0, -'.model'.length)
    // 分层：显式传参优先，否则从文件名前缀推断；两者都没有则拒绝（防乱命名）
    const LAYERS = ['ODS', 'DWD', 'DWS', 'ADS', 'DIM']
    let lyr = (layer ?? '').toUpperCase()
    if (lyr && !LAYERS.includes(lyr)) throw new Error(`非法分层 ${lyr}（可选：${LAYERS.join('/')}）`)
    if (!lyr) lyr = LAYERS.find((l) => name.startsWith(l.toLowerCase() + '_')) ?? ''
    if (!lyr) throw new Error(`无法识别分层：文件名须以 ${LAYERS.map((l) => l.toLowerCase() + '_').join('/')} 前缀开头，或显式传 layer`)
    // 显式 layer 与文件名前缀不一致 → 按分层自动补齐前缀
    const prefix = lyr.toLowerCase() + '_'
    if (!name.startsWith(prefix)) { name = prefix + name; file = `${name}.model` }
    if (state.models[file]) throw new Error(`模型已存在: ${file}（改名或先 model_read_fields 查看现有模型）`)
    // 字段归一化 + 标准引用校验（与 bindStd 同一口径）
    const normFields = (fields ?? []).map((f) => {
      if (!f?.n || !f?.t) throw new Error(`字段缺 n/t: ${JSON.stringify(f)}`)
      const nf = { n: String(f.n), t: String(f.t).toUpperCase(), c: f.c ?? '', std: null }
      if (f.pk) nf.pk = true
      if (f.std) {
        const known = state.stdLib.standards.some((s) => f.std.startsWith(s.code)) || state.stdLib.drafts.some((d) => f.std.startsWith(d.code))
        if (!known) throw new Error(`标准 ${f.std} 不在标准库 ${state.stdLib.version} 或草案列表中（字段 ${nf.n}）；下一步：先调 std_create_draft 创建该标准草案，再用草案编号重新绑定`)
        nf.std = f.std
      }
      return nf
    })
    // 分区字段自动追加（口径与 genDdl 一致）
    if (!normFields.some((f) => f.n === 'dt')) normFields.push({ n: 'dt', t: 'STRING', c: '月分区 yyyyMM', std: null, skip: '分区字段 · 免绑' })
    const m = {
      file, name, cn: cn ?? '', domain: domain ?? '财税域', layer: lyr,
      version: 'v0.1', published: false,
      fields: normFields,
      versions: [{ v: 'v0.1', n: '新建模型（Agent）', t: now().slice(5, 10) }],
    }
    state.models[file] = m
    const bound = normFields.filter((f) => f.std).length
    return {
      model: name, file, cn: m.cn, domain: m.domain, layer: lyr, version: 'v0.1', published: false,
      fieldCount: normFields.length, bindingRate: `${bound}/${normFields.length}`,
      next: '后续：model_bind_std 绑标准 / model_alter_field 补字段 / model_commit 提版本 / ddl_gen 出 DDL',
      evidence: evidence('model-service', 'v0.1'),
    }
  },

  // ---------- 模型管理服务（只读） ----------
  readFields(file) {
    const m = getModel(file)
    const bound = m.fields.filter((f) => f.std).length
    return {
      model: m.name, file: m.file, cn: m.cn, domain: m.domain, layer: m.layer,
      version: m.version, published: m.published,
      versions: m.versions ?? [],
      fields: m.fields,
      jobRefs: m.jobRefs ?? [],
      bindingRate: `${bound}/${m.fields.length}`,
      evidence: evidence('model-service', m.version),
    }
  },

  lintModel(file) {
    const m = getModel(file)
    const issues = []
    for (const f of m.fields) {
      if (f.skip) continue
      if (!f.std && f.hit) issues.push({ field: f.n, kind: 'unbound-with-hit', suggest: f.hit, message: `字段 ${f.n}（${f.c}）未绑定标准，库中有候选 ${f.hit}` })
      else if (!f.std) issues.push({ field: f.n, kind: 'unbound-no-hit', message: `字段 ${f.n}（${f.c}）未绑定标准，标准库无候选，需起草新标准` })
      if (f.fixType) issues.push({ field: f.n, kind: 'type-mismatch', message: `字段 ${f.n} 类型 ${f.t} 与标准 ${f.hit} 不一致，建议改为 ${f.fixType}` })
    }
    return { model: m.name, issues, issueCount: issues.length, evidence: evidence('model-service', m.version) }
  },

  // ---------- 数据标准服务 ----------
  scanStdRefs(file) {
    const m = getModel(file)
    const candidates = m.fields
      .filter((f) => !f.std && !f.skip)
      .map((f) => ({
        field: f.n, comment: f.c, currentType: f.t,
        candidate: f.hit ?? null,
        typeFix: f.fixType ?? null,
        status: f.hit ? '库中有候选' : '库中无候选·需起草',
      }))
    return {
      model: m.name, stdLibVersion: state.stdLib.version,
      unbound: candidates.length, candidates,
      evidence: evidence('std-service', state.stdLib.version),
    }
  },

  searchStd(keyword) {
    const kw = String(keyword ?? '').toLowerCase()
    const hits = state.stdLib.standards.filter(
      (s) => s.code.toLowerCase().includes(kw) || s.cn.includes(keyword ?? '') || s.rule.includes(keyword ?? ''),
    )
    return { keyword, hits, stdLibVersion: state.stdLib.version, evidence: evidence('std-service', state.stdLib.version) }
  },

  createStdDraft({ stdName, cn, definition, domain, valueType }) {
    const code = stdName.startsWith('std/') ? stdName : `std/${stdName.toUpperCase()}`
    const draft = {
      code, version: 'v0-draft', cn: cn ?? '', rule: definition ?? '', valueType: valueType ?? 'STRING',
      domain: domain ?? '财税域', status: 'draft', createdAt: now(),
      note: '草案态 · 正式发布走平台人工审定流',
    }
    state.stdLib.drafts.push(draft)
    return { draft, stdLibVersion: state.stdLib.version, evidence: evidence('std-service', state.stdLib.version) }
  },

  // ---------- 模型服务工作区（未提交态写入） ----------
  bindStd({ model, field, std }) {
    const m = getModel(model)
    const f = m.fields.find((x) => x.n === field)
    if (!f) throw new Error(`字段不存在: ${model}.${field}`)
    if (f.skip) throw new Error(`字段 ${field} 为${f.skip}，不允许绑定`)
    const known = state.stdLib.standards.some((s) => std.startsWith(s.code)) || state.stdLib.drafts.some((d) => std.startsWith(d.code))
    if (!known) throw new Error(`标准 ${std} 不在标准库 ${state.stdLib.version} 或草案列表中；下一步：先调 std_create_draft 创建该标准草案，再用草案编号重新绑定`)
    f.std = std
    ws(model).binds.push({ field, std, ts: now() })
    const bound = m.fields.filter((x) => x.std).length
    return { model: m.name, field, std, bound: `${bound}/${m.fields.length}`, uncommitted: true, evidence: evidence('model-service-workspace', m.version) }
  },

  alterField({ model, field, type, comment }) {
    const m = getModel(model)
    const f = m.fields.find((x) => x.n === field)
    // 字段不存在 → 视为「加字段」（新字段必须给类型）
    if (!f) {
      if (!type) throw new Error(`字段不存在: ${model}.${field}；加新字段必须给 type`)
      const nf = { n: field, t: String(type).toUpperCase(), c: comment ?? '', std: null }
      const dtIdx = m.fields.findIndex((x) => x.n === 'dt')
      m.fields.splice(dtIdx === -1 ? m.fields.length : dtIdx, 0, nf) // 插到分区字段 dt 之前
      ws(model).alters.push({ field, added: true, after: { t: nf.t, c: nf.c }, ts: now() })
      return { model: m.name, field, added: true, after: { t: nf.t, c: nf.c }, uncommitted: true, evidence: evidence('model-service-workspace', m.version) }
    }
    const before = { t: f.t, c: f.c }
    if (type) f.t = String(type).toUpperCase()
    if (comment) f.c = comment
    ws(model).alters.push({ field, before, after: { t: f.t, c: f.c }, ts: now() })
    return { model: m.name, field, before, after: { t: f.t, c: f.c }, uncommitted: true, evidence: evidence('model-service-workspace', m.version) }
  },

  // ---------- 模型服务（版本化提交，gated） ----------
  commitModel({ model, message }) {
    const m = getModel(model)
    const pending = state.workspace[model]
    if (!pending || (pending.binds.length === 0 && pending.alters.length === 0)) {
      throw new Error(`模型 ${model} 工作区无未提交修改`)
    }
    const [major, minor] = m.version.replace('v', '').split('.').map(Number)
    const newVersion = `v${major}.${minor + 1}`
    m.version = newVersion
    m.versions.unshift({ v: newVersion, n: message ?? 'Agent 辅助修改', t: now().slice(5, 10) })
    delete state.workspace[model]
    const bound = m.fields.filter((x) => x.std).length
    return {
      model: m.name, version: newVersion,
      committed: { binds: pending.binds.length, alters: pending.alters.length },
      bindingRate: `${bound}/${m.fields.length}`,
      evidence: evidence('model-service', newVersion),
    }
  },

  // ---------- DDL 生成（只读） ----------
  genDdl(file) {
    const m = getModel(file)
    const cols = m.fields
      .filter((f) => f.n !== 'dt')
      .map((f) => {
        const stdRef = f.std ? ` -- 标准引用: ${f.std}` : f.skip ? ` -- ${f.skip}` : ' -- 未绑定标准'
        return `  ${f.n} ${f.t} COMMENT '${f.c}'${stdRef}`
      })
    const ddl = [
      `-- 模型: ${m.name} ${m.version} · ${m.cn}`,
      `-- 标准库: ${state.stdLib.version}`,
      `CREATE TABLE IF NOT EXISTS ${m.name} (`,
      cols.join(',\n'),
      `) PARTITIONED BY (dt STRING COMMENT '月分区 yyyyMM')`,
      `STORED AS ORC;`,
    ].join('\n')
    return { model: m.name, version: m.version, ddl, evidence: evidence('model-service', m.version) }
  },

  // ---------- 资产管理平台（gated） ----------
  registerAsset({ model }) {
    const m = getModel(model)
    if (state.catalog.assets.some((a) => a.model === m.name)) throw new Error(`资产已注册: ${m.name}`)
    const asset = { model: m.name, cn: m.cn, version: m.version, domain: m.domain, layer: m.layer, registeredAt: now(), qualityGate: 'passed' }
    state.catalog.assets.push(asset)
    m.published = true
    return { asset, evidence: evidence('asset-catalog', m.version) }
  },

  attachLineage({ from, to, type }) {
    const edge = { from, to, type: type ?? 'derive', ts: now() }
    state.catalog.lineage.push(edge)
    return { edge, evidence: evidence('asset-catalog', 'lineage') }
  },

  /** P1 跨域联动（单向）：上线时把「作业 → 模型」血缘回写资产目录，模型发布页可见作业引用 */
  attachJobRef({ model, job, dag, commitId }) {
    const m = getModel(model)
    m.jobRefs = m.jobRefs ?? []
    if (m.jobRefs.some((r) => r.job === job)) throw new Error(`作业引用已存在: ${job}`)
    const ref = { job, dag, commitId: commitId ?? null, model: m.name, modelVersion: m.version, syncedAt: now() }
    m.jobRefs.push(ref)
    state.catalog.lineage.push({ from: job, to: m.name, type: 'etl-produce', ts: now() })
    return { ref, jobRefsOnModel: m.jobRefs.length, evidence: evidence('asset-catalog', m.version) }
  },

  // ---------- 测试/调试出口（不暴露给模型） ----------
  _state: state,
}

// 锚定摘要作为 Provider 方法（供 workspace-anchor 经 ctx.hisModeling 服务调用）
provider.anchorSummary = function anchorSummary(file) {
  const m = state.models[file]
  if (!m) return { file, error: `模型不存在（可选：${Object.keys(state.models).join(', ')}）` }
  const bound = m.fields.filter((f) => f.std).length
  return {
    file, name: m.name, cn: m.cn, space: '建模空间', domain: m.domain, layer: m.layer,
    version: m.version, published: m.published,
    fieldCount: m.fields.length,
    bindingRate: `${bound}/${m.fields.length}`,
    unbound: m.fields.filter((f) => !f.std && !f.skip).map((f) => f.n),
    stdLibVersion: state.stdLib.version,
  }
}

