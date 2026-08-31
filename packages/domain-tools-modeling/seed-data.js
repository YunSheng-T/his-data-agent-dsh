// 种子数据：从 prototype/index.html (V9) 的 MODELS 结构移植
// 财税域三个模型 + 数据标准库 v2.4

export const MODELS = {
  'dim_taxpayer.model': {
    file: 'dim_taxpayer.model', name: 'dim_taxpayer', cn: '纳税主体 · 维表',
    domain: '财税域', layer: 'DIM', version: 'v1.2', published: true,
    fields: [
      { n: 'taxpayer_id', t: 'STRING', c: '纳税人识别号', std: 'std/TAXPAYER_ID v2', pk: true },
      { n: 'taxpayer_nm', t: 'STRING', c: '主体名称', std: null },
      { n: 'reg_type_cd', t: 'STRING', c: '登记注册类型', std: 'std/REG_TYPE v1' },
      { n: 'tax_auth_cd', t: 'STRING', c: '主管税务机关', std: 'std/TAX_AUTH v3' },
      { n: 'industry_cd', t: 'STRING', c: '国民经济行业代码', std: 'std/INDUSTRY_GB v1' },
      { n: 'credit_grade', t: 'STRING', c: '纳税信用等级', std: 'std/CREDIT_GRADE v1' },
      { n: 'open_dt', t: 'STRING', c: '开业日期', std: null },
      { n: 'close_dt', t: 'STRING', c: '注销日期（可空）', std: null },
    ],
    versions: [
      { v: 'v1.2', n: '补信用等级字段 · 已发布', t: '07-18' },
      { v: 'v1.1', n: '行业标准对齐国标', t: '06-30' },
      { v: 'v1.0', n: '初版', t: '06-02' },
    ],
  },
  'dwd_tax_declaration.model': {
    file: 'dwd_tax_declaration.model', name: 'dwd_tax_declaration', cn: '申报记录 · 事实表',
    domain: '财税域', layer: 'DWD', version: 'v1.0', published: false,
    fields: [
      { n: 'decl_id', t: 'STRING', c: '申报ID', std: null, pk: true, skip: '业务主键 · 免绑' },
      { n: 'taxpayer_id', t: 'STRING', c: '纳税人识别号', std: 'std/TAXPAYER_ID v2' },
      { n: 'tax_type_cd', t: 'STRING', c: '税种代码', std: 'std/TAX_TYPE_CODE v3' },
      { n: 'decl_status_cd', t: 'STRING', c: '申报状态', std: null, hit: 'std/DECL_STATUS v1' },
      { n: 'incentive_type_cd', t: 'STRING', c: '税收优惠类型', std: null, hit: null },
      { n: 'decl_amt', t: 'DECIMAL(10,2)', c: '申报金额', std: null, hit: 'std/AMOUNT v1', fixType: 'DECIMAL(14,2)' },
      { n: 'overdue_flag', t: 'STRING', c: '逾期标识', std: null, hit: 'std/FLAG_YN v1' },
      { n: 'decl_ts', t: 'TIMESTAMP', c: '申报时间', std: null, hit: 'std/BIZ_TS v2' },
      { n: 'dt', t: 'STRING', c: '月分区 yyyyMM', std: null, skip: '分区字段 · 规范免绑' },
    ],
    versions: [{ v: 'v1.0', n: '初版 · 需求 FIN-3302', t: '08-15' }],
  },
  'dwd_tax_payment.model': {
    file: 'dwd_tax_payment.model', name: 'dwd_tax_payment', cn: '缴款流水 · 事实表',
    domain: '财税域', layer: 'DWD', version: 'v4', published: false,
    release: 'REL-0820', // 设计基线（dbscript 实现 v3→v4 增量）
    fields: [
      { n: 'pay_id', t: 'STRING', c: '缴款ID', std: null, pk: true, skip: '业务主键 · 免绑' },
      { n: 'decl_id', t: 'STRING', c: '关联申报', std: null },
      { n: 'taxpayer_id', t: 'STRING', c: '纳税人识别号', std: 'std/TAXPAYER_ID v2' },
      { n: 'pay_channel_cd', t: 'STRING', c: '缴款渠道', std: 'std/PAY_CHANNEL v2' },
      { n: 'pay_amt', t: 'DECIMAL(14,2)', c: '缴款金额', std: 'std/AMOUNT v1' },
      { n: 'tax_rate', t: 'DECIMAL(10,4)', c: '缴款税率（设计 v4 增量）', std: null },
      { n: 'pay_fee', t: 'DECIMAL(14,2)', c: '手续费（设计 v4 增量）', std: null },
      { n: 'pay_ts', t: 'TIMESTAMP', c: '缴款时间', std: 'std/BIZ_TS v2' },
      { n: 'dt', t: 'STRING', c: '月分区 yyyyMM', std: null, skip: '分区字段 · 规范免绑' },
    ],
    versions: [
      { v: 'v4', n: 'v3→v4 增量：新增 tax_rate/pay_fee（dbscript 实现）', t: '08-22' },
      { v: 'v1.0', n: '初版', t: '08-15' },
    ],
  },
}

// 数据标准库 v2.4（名称来自原型中的 std/ 引用）
export const STD_LIB = {
  version: 'v2.4',
  standards: [
    { code: 'std/TAXPAYER_ID', version: 'v2', cn: '纳税人识别号', valueType: 'STRING', rule: '统一社会信用代码/纳税人识别号', status: 'published' },
    { code: 'std/REG_TYPE', version: 'v1', cn: '登记注册类型', valueType: 'STRING', rule: '市监登记注册类型代码表', status: 'published' },
    { code: 'std/TAX_AUTH', version: 'v3', cn: '主管税务机关', valueType: 'STRING', rule: '税务机关代码（国家税务总局）', status: 'published' },
    { code: 'std/INDUSTRY_GB', version: 'v1', cn: '国民经济行业代码', valueType: 'STRING', rule: 'GB/T 4754 国民经济行业分类', status: 'published' },
    { code: 'std/CREDIT_GRADE', version: 'v1', cn: '纳税信用等级', valueType: 'STRING', rule: 'A/B/M/C/D 五级', status: 'published' },
    { code: 'std/TAX_TYPE_CODE', version: 'v3', cn: '税种代码', valueType: 'STRING', rule: '征收项目代码表', status: 'published' },
    { code: 'std/DECL_STATUS', version: 'v1', cn: '申报状态', valueType: 'STRING', rule: '01已申报/02申报失败/03已作废', status: 'published' },
    { code: 'std/AMOUNT', version: 'v1', cn: '金额', valueType: 'DECIMAL(14,2)', rule: '单位：元，保留两位小数', status: 'published' },
    { code: 'std/FLAG_YN', version: 'v1', cn: '是否标识', valueType: 'STRING', rule: 'Y/N 二值', status: 'published' },
    { code: 'std/BIZ_TS', version: 'v2', cn: '业务时间戳', valueType: 'TIMESTAMP', rule: 'yyyy-MM-dd HH:mm:ss', status: 'published' },
    { code: 'std/PAY_CHANNEL', version: 'v2', cn: '缴款渠道', valueType: 'STRING', rule: '01三方协议/02银行端查询/03第三方支付', status: 'published' },
  ],
  drafts: [],
}

export const ASSET_CATALOG = { assets: [], lineage: [] }
