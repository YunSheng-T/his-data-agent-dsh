// @his/workspace-repo — 种子仓：财税域 ETL 工程（与 P0 种子模型呼应）
// .etl = ETL 作业（Hive SQL 引擎）；.dag = 调度作业（yaml，ref: 指向 .etl）
// 两者分离管理、分离提交、分离审计（V9 设计定稿）。

export const SEED_FILES = {
  'etl/ods/ods_tax_declare_load.etl': `-- @job: ods_tax_declare_load
-- @engine: hive-sql
-- @source: 税务核心库.tax_declare_buf
-- @target: ods.ods_tax_declare_di
-- 申报数据 ODS 接入（日增量）
INSERT OVERWRITE TABLE ods.ods_tax_declare_di PARTITION(dt='\${bizdate}')
SELECT
  declare_id        AS decl_id,        -- 申报ID
  taxpayer_no       AS taxpayer_id,    -- 纳税人识别号
  tax_item_code     AS tax_type_cd,    -- 税种代码
  declare_status    AS decl_status_cd, -- 申报状态
  declare_amount    AS decl_amt,       -- 申报金额
  declare_time      AS decl_ts         -- 申报时间
FROM 税务核心库.tax_declare_buf
WHERE dt = '\${bizdate}';
`,

  'etl/dwd/dwd_tax_declaration.etl': `-- @job: dwd_tax_declaration
-- @engine: hive-sql
-- @source: ods.ods_tax_declare_di
-- @target: dwd.dwd_tax_declaration  （模型版本 v1.0 → 治理后 v1.1）
-- 申报记录明细层：逐列注释携带数据标准引用（建模空间绑定状态的真实映射）
INSERT OVERWRITE TABLE dwd.dwd_tax_declaration PARTITION(dt='\${bizdate}')
SELECT
  decl_id,                                            -- 申报ID（业务主键 · 免绑）
  taxpayer_id,                                        -- 纳税人识别号 @std/TAXPAYER_ID v2
  tax_type_cd,                                        -- 税种代码 @std/TAX_TYPE_CODE v3
  decl_status_cd,                                     -- 申报状态（治理旅程中绑定 @std/DECL_STATUS v1）
  incentive_type_cd,                                  -- 税收优惠类型（草案标准）
  CAST(decl_amt AS DECIMAL(14,2))          AS decl_amt,      -- 申报金额 @std/AMOUNT v1（类型对齐）
  NVL(overdue_flag, 'N')                   AS overdue_flag,  -- 逾期标识 @std/FLAG_YN v1
  decl_ts                                             -- 申报时间 @std/BIZ_TS v2
FROM ods.ods_tax_declare_di
WHERE dt = '\${bizdate}';
`,

  'dag/dwd_tax_declaration.dag': `# @job: dwd_tax_declaration 调度作业
# ref 指向独立的 .etl 文件 —— 两文件分离提交、分离审计
ref: etl/dwd/dwd_tax_declaration.etl
cron: "17 2 * * *"          # 每日 02:17（避开整点/半点拥塞）
depends:
  - dag/ods_tax_declare_load.dag
retry:
  maxAttempts: 3
  intervalSeconds: 300
alert:
  channel: 财税域值班群
  on: [failure, timeout]
timeout: 1800
`,

  'dag/ods_tax_declare_load.dag': `# @job: ods_tax_declare_load 调度作业
ref: etl/ods/ods_tax_declare_load.etl
cron: "11 1 * * *"          # 每日 01:11
depends: []
retry:
  maxAttempts: 2
  intervalSeconds: 180
alert:
  channel: 财税域值班群
  on: [failure]
timeout: 900
`,

  'dbscript/alter_dwd_tax_payment_v4.sql': `-- alter_dwd_tax_payment_v4.sql · dwd_tax_payment 模型 v4 变更脚本（数据库脚本平台）
-- 目标表: dwd_tax_payment · 设计来源: 模型 v3→v4 增量 · 执行窗口: 发布 REL-0905 前
ALTER TABLE dwd_tax_payment ADD COLUMNS (
  tax_rate  DOUBLE  COMMENT '缴款税率（本次新增 · 开发中）'
);
-- 待补：pay_fee DECIMAL(14,2)（设计 v4 已含 · 待开发事项，随下批脚本）
`,


  'svc/tax_payment_query_api.svc': `-- tax_payment_query_api.svc · 缴款记录查询 API（数据服务平台）
-- 模式: SQL -> API 消费作业 · 方法: GET · 路径: /tax/payment/query · 限流 100 QPS · 鉴权 token
SELECT
  pay_id        -- 缴款ID
, decl_id       -- 关联申报
, pay_fee       -- 手续费
, tax_rate      -- 缴款税率
, dt            -- 月分区
FROM dwd_tax_payment
WHERE decl_id = :decl_id      -- 参数化 · 防注入
  AND dt = :dt;
`,
}

/** V10 平台化补种：未接入平台分包（etl_legacy/）只读演示——照常可见，但不可锚定不可写 */
export const SEED_EXTRAS = {
  'etl_legacy/ods/legacy_tax_sync.etl': `-- @job: legacy_tax_sync
-- @engine: hive-sql
-- @source: 老核心.tax_sync_buf
-- @target: ods.legacy_tax_sync_di
-- 【遗留 ETL 平台作业 · 未接入 Agent 工作范围 · 仅只读浏览】
INSERT OVERWRITE TABLE ods.legacy_tax_sync_di PARTITION(dt='\${bizdate}')
SELECT sync_id, taxpayer_no, sync_status, sync_time
FROM 老核心.tax_sync_buf
WHERE dt = '\${bizdate}';
`,
}
