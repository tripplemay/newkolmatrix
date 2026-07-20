# Horizon UI Pro 模板组件 Port 约定（FE-REFACTOR F006）

> **用户拍板（2026-07-20，FE-REFACTOR spec §1）：** 模板 `admin/` 页面级组件采用**逐个 port、保留模板结构**策略——保留原始命名与目录层级，后续模板升级 diff 成本最低；"逐个" = M0.5 起各页用到时随需 port，不做一次性批量搬运。

## 1. 适用范围

- **模板原件（只读基线）：** `~/project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main/src/components/`
- **待 port 主体：** 模板 `components/admin/` 下 **124 个页面级组件**（数据表格 CheckTable/ColumnsTable/ComplexTable、统计卡、步骤器 Stepper、搜索表格、图表包装等），项目当前一个未 port（FE-AUDIT F001 矩阵 `never-ported=124`）
- **已在库的模板库存**（dead-in-repo 78 个）不适用本指南的"拷贝"步骤，只需按 [template-inventory.md](template-inventory.md) 登记表接线（wire）

## 2. Port 约定（拍板落地）

1. **保留模板原始命名与目录结构**：模板 `components/admin/main/others/Stepper.tsx` → 项目 `src/components/admin/main/others/Stepper.tsx`。不改名、不扁平化、不并入 `common/`
2. **逐个 port**：哪个页面 feature 需要哪个组件，就在该 feature 的 commit 里 port 哪个（含其模板内部依赖，如子组件/variables 数据文件——demo 数据文件仅在组件硬依赖时随带，port 后立即换成真实数据源）
3. **`common/` 与 `admin/` 的边界**：`common/` 存放项目自建抽象（Badge/ChatBubble/SurfaceCard 等）；`admin/` 存放模板 port 件。**模板已提供的能力禁止在 common/ 重新发明**（FE-AUDIT F001 教训：如 stat 卡应 port `card/MiniStatistics` 而非新抽 `common/StatCard`）
4. **fork 修改要留痕**：port 后如需改动（品牌替换/接数据/修模板缺陷），在文件头注释标注改动点与理由（对齐 navbar/sidebar 两个既有 fork 的做法）

## 3. 每次 port 的适配检查清单

- [ ] **secret 预扫**：grep 组件内硬编码 token/key（模板 `MapComponent.tsx` 曾含 Mapbox token，framework v1.0.4 教训）
- [ ] **token 合规**：不引入新 hardcoded hex；色值走 `tailwind.config.js` 色板 / `brand-*` CSS 变量（对照 `design-draft/horizon-tokens.md`）
- [ ] **微字号**：<15px 一律用命名刻度 `text-mini/micro/compact`（F005），不散落 arbitrary 值
- [ ] **shadow 词表**：不引入 `shadow-sm/md`（模板生产代码零次词表）；可点卡片 hover 统一 `hover:shadow-xl`（用户拍板）
- [ ] **dark: 完整**：浅色默认下深色变体保持可用（`X dark:Y` 双写）
- [ ] **文案**：demo 英文文案换业务中文时保持元素语义（不替换指标类型/图标/区块）
- [ ] **可达性接线**：port 完成 = 从 `src/app/**` 传递可达（被真实页面 import）；port 而不接线会进入 dead-in-repo 统计
- [ ] **依赖核对**：`react-icons` / ApexCharts 包装等模板依赖项目已具备；新增 npm 依赖需在 feature 内声明理由

## 4. 验证

```bash
node scripts/test/fe-audit-component-matrix.mjs   # port+接线后：used-as-is/forked 增加，never-ported 减少
npx tsc --noEmit && npx next lint
```

矩阵脚本是 port 进度的客观计数器：M0.5 各批次 verifying 时 Evaluator 可复跑对账。
