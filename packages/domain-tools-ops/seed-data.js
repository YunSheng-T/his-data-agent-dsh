// @his/domain-tools-ops — 种子数据（V13 演示态）：财税域作业元数据目录
// 正式版整层替换为调度/运维平台的作业目录 API（名称/类型/路径/优先级/血缘），工具定义不动。
// 血缘边（dependsOn）是本包自检三件套与拓扑分层的事实来源：暂停=拓扑逆序、恢复=拓扑正序。

export const JOB_CATALOG = [
  // ---- 编排目标：6 个非核心离线作业（三层血缘） ----
  { name: 'dws_tax_daily', cn: '财税日汇总', type: 'ETL', path: '/dws/tax/dws_tax_daily', domain: '财税', priority: 'normal', realtime: false, schedule: 'daily', dependsOn: ['dwd_tax_declaration', 'dwd_tax_payment'] },
  { name: 'dws_tax_stat_t', cn: '财税统计同步', type: 'FLASHSYNC', path: '/flashsync/dws/dws_tax_stat_t', domain: '财税', priority: 'normal', realtime: false, schedule: 'daily', dependsOn: ['dwd_tax_declaration'] },
  { name: 'dwd_tax_declaration', cn: '申报明细', type: 'ETL', path: '/dwd/tax/dwd_tax_declaration', domain: '财税', priority: 'normal', realtime: false, schedule: 'daily', dependsOn: ['ods_tax_return'] },
  { name: 'dwd_tax_payment', cn: '缴款明细', type: 'ETL', path: '/dwd/tax/dwd_tax_payment', domain: '财税', priority: 'normal', realtime: false, schedule: 'daily', dependsOn: ['ods_tax_return', 'gtax_sync_001'] },
  { name: 'ods_tax_return', cn: '申报接入', type: 'ETL', path: '/ods/tax/ods_tax_return', domain: '财税', priority: 'normal', realtime: false, schedule: 'hourly', dependsOn: [] },
  { name: 'gtax_sync_001', cn: '金税同步任务', type: 'LTS-TASK', path: '/lts/task/gtax_sync_001', domain: '财税', priority: 'normal', realtime: false, schedule: 'hourly', dependsOn: [] },
  // ---- 豁免项：不进编排清单，但参与依赖完整性检查 ----
  { name: 'ads_tax_core_report', cn: '核心交易报表', type: 'ETL', path: '/ads/tax/ads_tax_core_report', domain: '财税', priority: 'core', realtime: false, schedule: 'daily', dependsOn: ['dws_tax_daily'] },
  { name: 'rt_tax_sync', cn: '实时同步任务', type: 'FLASHSYNC', path: '/flashsync/rt/rt_tax_sync', domain: '财税', priority: 'normal', realtime: true, schedule: 'realtime', dependsOn: [] },
]
