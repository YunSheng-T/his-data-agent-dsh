// Definition 层契约 —— 建模域 11 个工具的接口定义（接口 + JSON Schema + risk 标注）
// 本层先定稿、保持稳定；Provider 层（provider-mock.js）是可替换的替身。
// risk 词表：read | workspace-write | commit | publish | knowledge-write
// （审批策略插件只认标注，未标注 fail-closed）

const S = (type, extra = {}) => ({ type, ...extra })
const MODEL_ARG = { model: S('string', { description: '模型文件名，如 dwd_tax_declaration.model' }) }

const jsonOut = {
  schema: { type: 'object' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

export function buildDefinitions(p) {
  return [
    {
      name: 'model_read_fields',
      risk: 'read',
      description: '读取数据模型的字段清单、数据标准绑定状态与绑定率（只读）',
      parameters: { type: 'object', properties: { ...MODEL_ARG }, required: ['model'] },
      output: jsonOut,
      execute: (args) => p.readFields(args.model),
    },
    {
      name: 'model_lint',
      risk: 'read',
      description: '扫描模型问题：未绑定标准的字段（区分库中有候选/无候选）、类型与标准不一致（只读）',
      parameters: { type: 'object', properties: { ...MODEL_ARG }, required: ['model'] },
      output: jsonOut,
      execute: (args) => p.lintModel(args.model),
    },
    {
      name: 'std_ref_scan',
      risk: 'read',
      description: '扫描模型未绑定字段并在数据标准库中匹配候选标准（只读，结果注明标准库版本）',
      parameters: { type: 'object', properties: { ...MODEL_ARG }, required: ['model'] },
      output: jsonOut,
      execute: (args) => p.scanStdRefs(args.model),
    },
    {
      name: 'std_search',
      risk: 'read',
      description: '按关键词检索数据标准库（只读）',
      parameters: { type: 'object', properties: { keyword: S('string', { description: '检索词：标准代码/中文名/规则' }) }, required: ['keyword'] },
      output: jsonOut,
      execute: (args) => p.searchStd(args.keyword),
    },
    {
      name: 'std_create_draft',
      risk: 'knowledge-write',
      description: '在数据标准库创建标准草案（写入·gated，只到 draft 态；正式发布走平台人工审定流）',
      parameters: {
        type: 'object',
        properties: {
          stdName: S('string', { description: '标准代码（std/ 前缀可省略）' }),
          cn: S('string', { description: '标准中文名' }),
          definition: S('string', { description: '标准定义/规则' }),
          domain: S('string', { description: '所属域' }),
          valueType: S('string', { description: '值类型，如 STRING/DECIMAL(14,2)' }),
        },
        required: ['stdName', 'definition'],
      },
      output: jsonOut,
      execute: (args) => p.createStdDraft(args),
    },
    {
      name: 'model_bind_std',
      risk: 'workspace-write',
      description: '把模型字段绑定到数据标准（工作区写入·未提交态，需 model_commit 才生效）',
      parameters: {
        type: 'object',
        properties: { ...MODEL_ARG, field: S('string'), std: S('string', { description: '标准引用，如 std/DECL_STATUS v1' }) },
        required: ['model', 'field', 'std'],
      },
      output: jsonOut,
      execute: (args) => p.bindStd(args),
    },
    {
      name: 'model_alter_field',
      risk: 'workspace-write',
      description: '修改字段类型或说明（工作区写入·未提交态）',
      parameters: {
        type: 'object',
        properties: { ...MODEL_ARG, field: S('string'), type: S('string', { description: '新类型' }), comment: S('string', { description: '新说明' }) },
        required: ['model', 'field'],
      },
      output: jsonOut,
      execute: (args) => p.alterField(args),
    },
    {
      name: 'model_commit',
      risk: 'commit',
      description: '提交模型工作区修改，生成新版本（写入·gated，版本化）',
      parameters: {
        type: 'object',
        properties: { ...MODEL_ARG, message: S('string', { description: '版本说明' }) },
        required: ['model'],
      },
      output: jsonOut,
      execute: (args) => p.commitModel(args),
    },
    {
      name: 'ddl_gen',
      risk: 'read',
      description: '从模型当前版本生成建表 DDL，逐列携带数据标准引用注释（只读）',
      parameters: { type: 'object', properties: { ...MODEL_ARG }, required: ['model'] },
      output: jsonOut,
      execute: (args) => p.genDdl(args.model),
    },
    {
      name: 'asset_register',
      risk: 'publish',
      description: '把模型发布为数据资产进资产目录（写入·gated，需质量门通过）',
      parameters: { type: 'object', properties: { ...MODEL_ARG }, required: ['model'] },
      output: jsonOut,
      execute: (args) => p.registerAsset(args),
    },
    {
      name: 'lineage_attach',
      risk: 'publish',
      description: '登记血缘关系到资产目录（写入·gated）',
      parameters: {
        type: 'object',
        properties: { from: S('string'), to: S('string'), type: S('string', { description: '血缘类型，默认 derive' }) },
        required: ['from', 'to'],
      },
      output: jsonOut,
      execute: (args) => p.attachLineage(args),
    },
  ]
}
