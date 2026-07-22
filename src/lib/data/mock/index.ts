// ARCH-M05 F004 — mock 数据源目录约定（§6.7 mock 先行渲染契约）
//
// 本目录是 M0.5 六页工作台全部 mock 数据的唯一放置地。渲染只依赖字段契约，
// 不依赖数据来源——数据到位后换真值，UI 零返工。
//
// ## 放置约定（各页 mock 由对应页面 feature 自带，本 feature 只立目录）
//
// | 文件（约定名）        | 归属 feature | 服务页面 |
// |---------------------|-------------|---------|
// | ~~today.ts~~        | F006        | 已退役（M1-C F003/F005：今天页 RSC 直读真数据） |
// | ~~projects.ts~~     | F007        | 已退役（M1-B F001 详情页 + M1-C F001 列表页接真） |
// | env-brief.ts        | F008        | 策略环节语法面 |
// | env-match.ts        | F009        | 匹配环节语法面 |
// | env-reach.ts        | F010        | 触达环节语法面 |
// | env-delivery.ts     | F011        | 交付环节语法面（反向 guardrail：无 KPI/图表） |
// | env-insight.ts      | F012        | 洞察环节语法面 |
// | creators.ts         | F013        | 创作者库 + 抽屉（V10，ProvenanceTag badge ×5） |
// | knowledge.ts        | F014        | 知识页（V11，ProvenanceTag inline） |
// | insight.ts          | F015        | 洞察页 |
// | runs.ts             | F016        | Agent 记录页 |
//
// ## 硬规则（D2 渲染契约，违反即返工）
//
// 1. 页面组件不得内联 mock 字面量——mock 只住本目录，页面 import 后经
//    `lib/data/provenance` 的 readContractSlot / resolveProvenance 读取深字段。
// 2. 缺失字段一律写 `null`，绝不写 0 / '' 冒充实测（FR-11.17/11.18）；
//    「待核」= 字段缺失 / 契约层 null（裁决 #2，isPendingVerification 判定）。
// 3. 携带溯源的实体必须含 `{ dataSource, fieldProvenance }` 契约位（§7.5 形状），
//    使 ProvenanceTag 经 resolveProvenance 三级回退取值——永不出现裸数据点（FR-11.19）。
// 4. URL 化状态位（?env= / 筛选 / kbGame，裁决 #4）是路由状态，不入 mock。
// 5. 命名导出 camelCase（如 `export const mockCreators = [...]`），每文件一个页面域，
//    跨页共用的实体（如创作者）由消费方 import 单一出处，不复制。
//
// 本文件仅为目录约定说明，无运行时导出。

export {};
