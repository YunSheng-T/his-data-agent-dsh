// model_create / alter_field(新增) 断言：新建模型能力全链路
// 用法：node assert-model-create.mjs
// 覆盖：命名惯例（分层前缀推断/补齐/非法拒绝）、重名拒绝、字段标准校验、
//       dt 自动追加、alter_field 加字段、绑标准→提版本→DDL→发布→锚定摘要全链。
import { provider as modeling } from '../../packages/domain-tools-modeling/provider-mock.js'
import { buildDefinitions } from '../../packages/domain-tools-modeling/definitions.js'

const checks = []
const check = (label, ok, extra = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(String(e.message)) } }

// ---- Definition 层 ----
const defs = buildDefinitions(modeling)
const createDef = defs.find((d) => d.name === 'model_create')
check('model_create 已注册且 risk=workspace-write', !!createDef && createDef.risk === 'workspace-write')
check('model_create 必填 model+cn', ['model', 'cn'].every((k) => createDef.parameters.required.includes(k)))

// ---- 新建：分层前缀自动推断 + dt 自动追加 + 标准直绑 ----
const r1 = modeling.createModel({
  model: 'dim_data_dictionary.model', cn: '数据字典 · 维表',
  fields: [
    { n: 'dict_type_cd', t: 'string', c: '字典类型' },
    { n: 'dict_code', t: 'STRING', c: '字典代码值' },
    { n: 'status', t: 'STRING', c: '启用状态', std: 'std/FLAG_YN v1' },
  ],
})
check('新建成功返回 v0.1 未发布', r1.version === 'v0.1' && r1.published === false)
check('分层从前缀推断为 DIM', r1.layer === 'DIM')
check('dt 分区字段自动追加且免绑', r1.fieldCount === 4, `fields=${r1.fieldCount}`)
check('直绑标准生效（FLAG_YN）', r1.bindingRate === '1/4', r1.bindingRate)

// ---- 命名惯例守卫 ----
check('重名拒绝', throws(() => modeling.createModel({ model: 'dim_data_dictionary', cn: 'x' }), /模型已存在/))
check('无分层信息拒绝', throws(() => modeling.createModel({ model: 'tax_dict', cn: 'x' }), /无法识别分层/))
check('非法分层拒绝', throws(() => modeling.createModel({ model: 'tax_dict', cn: 'x', layer: 'ODSX' }), /非法分层/))

// ---- 显式 layer 自动补前缀 ----
const r2 = modeling.createModel({ model: 'tax_dict_bak', cn: '备份', layer: 'dwd' })
check('显式 layer 自动补前缀', r2.file === 'dwd_tax_dict_bak.model', r2.file)

// ---- 字段直绑未知标准拒绝（与 bindStd 同口径） ----
check('未知标准拒绝', throws(() => modeling.createModel({ model: 'dwd_x1', cn: 'x', fields: [{ n: 'a', t: 'STRING', c: 'a', std: 'std/NOPE v9' }] }), /不在标准库/))

// ---- alter_field 加字段（upsert）----
const r3 = modeling.alterField({ model: 'dim_data_dictionary.model', field: 'dict_name', type: 'STRING', comment: '字典名称/含义' })
check('alter_field 加字段返回 added', r3.added === true)
const fields1 = modeling.readFields('dim_data_dictionary.model').fields
const dtIdx = fields1.findIndex((f) => f.n === 'dt')
const nameIdx = fields1.findIndex((f) => f.n === 'dict_name')
check('新字段插到 dt 之前', nameIdx !== -1 && dtIdx === nameIdx + 1, `dict_name@${nameIdx} dt@${dtIdx}`)
check('加字段缺 type 拒绝', throws(() => modeling.alterField({ model: 'dim_data_dictionary.model', field: 'zzz' }), /必须给 type/))

// ---- 后续链路：起草标准 → 绑标准 → 提版本 → DDL → 发布 → 锚定 ----
modeling.createStdDraft({ stdName: 'DICT_NAME', cn: '字典名称', definition: '数据字典条目的中文名称', valueType: 'STRING' })
modeling.bindStd({ model: 'dim_data_dictionary.model', field: 'dict_name', std: 'std/DICT_NAME v0-draft' })
const r4 = modeling.commitModel({ model: 'dim_data_dictionary.model', message: '补字典名称字段并绑标准' })
check('新建模型可提版本到 v0.2', r4.version === 'v0.2', r4.version)
const ddl = modeling.genDdl('dim_data_dictionary.model').ddl
check('DDL 含新字段与标准注释', ddl.includes('dict_name STRING') && ddl.includes('标准引用: std/DICT_NAME v0-draft'))
check('DDL 分区字段不重复', (ddl.match(/\bdt\b/g) || []).length === 1)
const r5 = modeling.registerAsset({ model: 'dim_data_dictionary.model' })
check('新模型可发布为资产', r5.asset.model === 'dim_data_dictionary' && r5.asset.qualityGate === 'passed')
const anchor = modeling.anchorSummary('dim_data_dictionary.model')
check('锚定摘要可见新模型（绑定率 2/5）', anchor.name === 'dim_data_dictionary' && anchor.bindingRate === '2/5', anchor.bindingRate)

const passed = checks.filter(Boolean).length
console.log(`\n== model-create: ${passed}/${checks.length} 通过 ==`)
process.exit(passed === checks.length ? 0 : 1)
