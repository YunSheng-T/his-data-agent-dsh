# 本体（Ontology）参考 · Palantir Foundry 核心概念

> 探索记录（goal round）：为「数据开发本体」方案设计前，先对齐"本体"的正统含义。
> 来源：Palantir 官方文档 + 社区技术解读。

## 一、Palantir 对本体的定义

> "An Ontology is a categorization of the world."（本体是对世界的一种分类）

Palantir Foundry 里，Ontology 是一个「操作层（operational layer）」——它坐落于已接入的数字资产（数据集、模型、API）之上，把底层资产与现实世界的实体/业务对象连接起来。它不是孤立的知识图谱或只读语义层，而是「语义 + 行为 + 治理」的统一，能驱动执行、闭环反馈、可演化。

## 二、本体的三类要素

1. 语义型（静态）元素：Object 类型、Link 类型（关系）、属性（Property）、接口（Interface/多态/继承）
2. 动力型（行为）元素：操作（Action）、函数（Function）、写回（Writeback）
3. 横切治理：细粒度权限、安全、版本控制、审计、协作变更

## 三、核心概念（本体真正的"能力"）

| 概念 | 是什么 | 例子 |
|---|---|---|
| Object Type | 业务实体/对象的类型定义 | 订单、客户、任务、设备、作业、模型 |
| Property | 对象的属性（带类型/元数据/默认值） | 订单金额、状态 |
| Link Type | 对象之间的语义关系（1:N / N:1 / M:N） | 订单→属于→客户；作业→实现→模型 |
| Interface | 多个对象类型的共享结构（多态/继承） | "可审批"接口 |
| Action Type | 可执行业务操作（带参数、权限、校验、审计） | 创建订单、审批、提交作业 |
| Function | 可编程逻辑：数据转换、推理规则、决策模型 | 一致性检查、血缘查询、影响分析 |
| Writeback | 操作结果安全写回底层系统 | 提交结果写回仓 |

## 四、分层图景

数据/模型/系统层 → Kinetic/映射层（投影成本体对象） → Ontology 本体层（语义+行为+治理） → Agent/应用层（语义上下文 + Action/Function 执行） → 写回/闭环层

## 五、对 Agent 的意义

- Agent 用 Object/Link 获得结构化语义上下文（不是文档片段 RAG）
- Agent 用 Action/Function 作为「可执行操作接口」执行（安全、可审计、可写回）
- 规则/校验 → 体现在 Function 的推理逻辑 或 Ontology Process 的嵌入式治理，不是本体的核心结构

## 六、对我当前方案的纠正（关键）

偏差：我把「本体」做成了 Policy/Rule/RuleImpl 规则库（扫描规则治理元数据），偏离了本体正统含义——规则/策略只是 Function（如一致性检查）内部的校验逻辑，不是本体主体。

纠正后：数据开发的本体应该是「业务对象的语义层 + 可执行能力」：
- Object Type：作业、模型、平台、平台实例、字段、数据标准、模型版本、作业目录、租户…
- Link Type：作业→instanceOf→作业类型；作业→implements→模型；模型→hasVersion→版本；版本→hasIncrement→增量；作业→inDirectory→目录；平台→hasInstance→平台实例…
- Property：物理表名、引擎、类型、标准代码、版本号、提交号…
- Action：生成 DDL、提交作业、发布调度、绑数据标准、改字段…（可执行操作，gated 审批）
- Function：一致性检查、血缘查询、影响分析、本体扫描…（只读推理/计算）
- 治理/审计/版本：横切

「扫描规则」（Policy/Rule）的正确位置：是 Function（一致性检查/本体扫描）内部的校验规则集（或 Ontology Process 的嵌入式治理），由本体平台的 Function 承载，而非本体的核心实体。

## 七、下一步设计方向（待展开）

本体 = 对象/关系/属性/动作/函数 的语义层；Agent 通过 Action/Function 执行、通过 Object/Link 理解；扫描（一致性检查）= 一个 Function，规则是 Function 的输入/配置（来自规则/策略治理模块，但那是 Function 的配置，不是本体核心）。