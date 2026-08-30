// @his/domain-tools-ontology — definitions.js：本体驱动扫描工具域（V14/V15）
// risk 标注沿用 P0 约定（挂在 definition 上，审批插件只认标注）：
//   classify/policies/rules/match_increment/explain 只读自动；propose gated（写本体提案/断言）。
// 设计（SQL扫描本体接入设计 v1.4）：本体是定义层（扫什么、为什么），扫描引擎是执行层（怎么扫）。
// 场景锚定数据库脚本平台（dbscript）；ETL 内 SQL 片段随 ETL 作业整体扫描，不走本场景。

const S = (type, extra = {}) => ({ type, ...extra })
const PATH_ARG = { path: S('string', { description: '仓内相对路径，如 dbscript/alter_dwd_tax_payment_v4.sql' }) }
const jsonOut = { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] }

/** 极简 AST 特征检测（演示）：ALTER ADD COLUMNS → 表结构变更；UPDATE/INSERT INTO → DML 订正 */
function detectAst(text) {
  if (/ADD\s+COLUMNS/i.test(text)) return { alterAddColumns: true }
  if (/\b(UPDATE|INSERT\s+INTO)\b/i.test(text)) return { dml: true }
  return {}
}

export function buildDefinitions(p, { repo } = {}) {
  const readText = (path) => {
    if (!repo) return null
    return repo.readWorking(path) ?? repo.readCommitted(repo.currentBranch(), path)
  }
  return [
    {
      name: 'ontology_classify', risk: 'read',
      description: '本体作业分类（只读）：输入作业路径/内容，输出作业类型本体节点 + 置信度 + 分类信号明细（分包→元数据→AST 三级）与排除项；分类失败/冲突 → fail-closed 转人工归类',
      parameters: {
        type: 'object',
        properties: {
          ...PATH_ARG,
          engine: S('string', { description: '作业引擎，如 Hive SQL' }),
          ast: S('object', { description: '可选：已解析的 AST 特征（alterAddColumns/dml），缺省由工具从文件内容检测' }),
        },
        required: ['path'],
      },
      output: jsonOut,
      execute: (args) => p.classify({ ...args, ast: args.ast ?? detectAst(readText(args.path) ?? '') }),
    },
    {
      name: 'ontology_policies', risk: 'read',
      description: '本体策略解析（只读）：输入作业类型节点 + 上下文，输出适用策略集（含继承链合并 / 子类型覆盖 / 租户条件过滤）——回答"这类作业该套哪些治理策略"',
      parameters: {
        type: 'object',
        properties: {
          jobType: S('string', { description: '作业类型本体节点 id，如 schema-change' }),
          tenant: S('string', { description: '租户，默认 finance' }),
        },
        required: ['jobType'],
      },
      output: jsonOut,
      execute: (args) => p.policies(args.jobType, { ...args }),
    },
    {
      name: 'ontology_rules', risk: 'read',
      description: '本体规则装配（只读）：输入策略节点，输出规则清单：规则语义、严重度、生效阶段、执行器标识(RuleImpl)、适用对象——规则只声明不执行，执行归扫描引擎',
      parameters: {
        type: 'object',
        properties: { policies: S('array', { items: S('string'), description: '策略 id 列表' }) },
        required: ['policies'],
      },
      output: jsonOut,
      execute: (args) => p.rules(args.policies),
    },
    {
      name: 'ontology_match_increment', risk: 'read',
      description: '版本区间增量匹配（只读）：物理表名推导 implements + DevOps 最近发布即基线(releaseBaseline) + 双侧(设计增量↔代码增量)结构化比对 → 四态事实(MATCH/AHEAD/BEHIND/DIVERGE)。一致性规则消费该事实做细粒度判定',
      parameters: {
        type: 'object',
        properties: {
          ...PATH_ARG,
          physicalTable: S('string', { description: '作业 SQL 目标物理表,如 dwd_tax_payment' }),
          currentVersion: S('string', { description: '当前模型版本，默认 v4' }),
          baselineRelease: S('string', { description: '上次发布即基线，默认 REL-0820' }),
        },
        required: ['path', 'physicalTable'],
      },
      output: jsonOut,
      execute: (args) => p.matchIncrement(args, args),
    },
    {
      name: 'ontology_explain', risk: 'read',
      description: '发现归因（只读）：输入 finding，输出完整归因链（规则 ← 策略 ← 作业类型 ← 分类依据）与匹配事实（一致性类）；scan.explain 内部调它组装可解释报告',
      parameters: {
        type: 'object',
        properties: { finding: S('string', { description: 'finding id，如 F-101' }) },
        required: ['finding'],
      },
      output: jsonOut,
      execute: (args) => p.explain(args.finding),
    },
    {
      name: 'ontology_propose', risk: 'knowledge-write',
      description: '本体提案/断言回写（写入·gated）：提交规则/类型/参数修订提案，或回写归类确认(instanceOf 断言)/DIVERGE 裁决结论，返回提案号与治理流程状态。本体 schema 变更不在工具域内（fail-closed 只能在本体平台治理界面）',
      parameters: {
        type: 'object',
        properties: {
          kind: S('string', { description: 'proposal | assertion' }),
          payload: S('object', { description: '提案/断言内容，如 { type:"rule", ... } 或 { instanceOf: "schema-change" }' }),
          approvalNote: S('string', { description: '审批卡话术：写清"在确认什么"' }),
        },
        required: ['kind', 'payload', 'approvalNote'],
      },
      output: jsonOut,
      execute: (args) => p.propose({ kind: args.kind, payload: args.payload }),
    },
  ]
}
