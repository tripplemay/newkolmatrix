# M2-B-CREATORS F004 复验记录 — creators 页接真 + mock 退役 + CI 视觉夹具

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **结论：** **PASS**（首轮 PARTIAL 两处指向面全部消失，无新回归）
- **复验对象：** fix commit `7cebb52` @ HEAD（working tree clean，`git status` 空）
- **复验方式：** 逐字复现首轮 steps_to_reproduce（audit-methodology §5-§6）+ diff 实物比读 +
  L1 本地实跑（lint/tsc/358 tests）+ dev DB 数据层直调脚本重跑 + CI 实跑证据（HEAD 五 job）。
  端口纪律遵守：未起任何 server（:3000 归 READINESS）；未修改任何产品代码。

---

## 首轮 PARTIAL 指向面逐点判定

### 指向 1：`src/lib/data/mock/index.ts` creators.ts 行未翻牌退役标注 — ✅ 已消失

逐字复现首轮复现步骤 1：

- `cat src/lib/data/mock/index.ts` → 第 17 行现为
  `| ~~creators.ts~~ | F013 | 已退役（M2-B F004/F005：创作者库+抽屉 RSC 接真，视图契约迁 lib/display/creator-format.ts）|`
  ——与 today/projects/env-match/knowledge 四行退役标注同构（删除线 + 已退役 + 去向注记）。
- `git log --oneline -1 -- src/lib/data/mock/index.ts` → `7cebb52`（本批 fix commit；
  首轮时为 M2-A `0b81a18`）。diff 实证：仅 1 行表格行替换，注释层变更，无运行时导出变化
  （文件仍 `export {}`）。
- 去向注记真实性：`src/lib/display/creator-format.ts` 在场（首轮已验 `CRED_GRADE_THRESHOLDS`
  等视图契约居此），注记与实物一致。

### 指向 2：ui-inventory 未登记 spec §3 P10 截断提示行 — ✅ 已消失

逐字复现首轮复现步骤 2：

- `grep -n "P10\|截断\|前 100\|LIST_LIMIT" docs/specs/ARCH-M05-ui-inventory.md` →
  首轮零命中，现 L86（V9 行）命中：**截断提示行（M2-B F004，spec §3 P10 布局变更小注：
  LIST_LIMIT=100 followers 降序，截断时表下一行次要文本「按粉丝量显示前 N 位（库内共 M 位）…」
  ——不让前 100 冒充全量，D2 数据诚实；仅截断时条件渲染）**。
- V9 标题同步 `16 元素` → `17 元素（M2-B F004 布局变更小注 +1）`——新元素计数与登记方式
  符合 spec §3 P10 末句「随 F004 落地并在 ui-inventory 备注登记」+「布局变更小注（新元素）」。
- **登记 vs 实物一致性核对**（防清单漂移换方向复发）：
  - `src/lib/creators/page-data.ts:17` `LIST_LIMIT = 100` + `:131` `take: LIST_LIMIT + 1`
    followers 降序 → 与登记「LIST_LIMIT=100 followers 降序」一致；
  - `src/components/creators/CreatorsClient.tsx:307-309` `{listTruncated && (...)}` 条件渲染 +
    文案「按粉丝量显示前 {rows.length} 位（库内共 {totalCount}…」→ 与登记逐字对齐。
- 同行顺带登记的 M2-B 接真语义（P5 库级恒待核 / 历史合作 null→— / credibility 分级 /
  筛选真值域）与首轮 PASS 面判定（§3/§4）逐项相符，未引入新漂移。

---

## 回归面核查（无新回归）

1. **fix commit F004 变更范围**：`git show 7cebb52` 中 F004 相关仅 2 个文档文件
   （ui-inventory 2 行 + mock/index.ts 1 行），零产品代码触碰——文档修复不可能引入
   运行时回归，以下为实证兜底。
2. **本地套件**（HEAD `7cebb52`）：`next lint` ✔ 0 warnings；`tsc --noEmit` 零输出；
   `vitest run` **34 文件 358 测试全绿**（1.82s；首轮 356 → +2，增量属 F001/F002/F006
   修复面用例）。
3. **F004 数据层直调脚本重跑**：`scripts/test/m2b-f004-pagedata-verify.ts` 全断言 ✅——
   基线态 2526（2524 CSV + 2 夹具，dataSource crawl:1/user_upload:2525）、VK-FULL 深字段
   齐备 score 93→A、VK-NULL 全 null、P5 全行恒待核、KPI 4 卡（total=2526 全量真值/premium=1）、
   筛选值域与服务端过滤、恶意 URL 回落、LIST_LIMIT=100 截断（rows=100/truncated=true）、
   sentinel 改→验→复原（totalCount 2527→2526）。DB 终态 = 验前态，零残留（D-H 清态）。
4. **CI 实证**：HEAD `7cebb52` run 29988592828 五 job 全 success
   （Lint / Build / **Visual regression** / Typecheck / Unit + integration tests）——
   CI 干净容器重新 seed 夹具 + creators.png/creator-drawer 基线比对绿，证明修复 commit
   未引入视觉/渲染回归。Node 20 deprecation annotation 属已知环境噪音（L1 排除）。
5. **夹具隔离性**：`scripts/seed/visual-kols.ts:47` credibility 为硬编码固定值——
   fix commit 中 F002 `deriveCredibility` 五因子改动结构性不影响视觉锚点确定性
   （DB 实测 + CI visual 绿双重佐证）。

## 关键验证命令

```bash
git log --oneline -1 -- src/lib/data/mock/index.ts        # 7cebb52（本批 fix）
grep -n "P10\|截断\|LIST_LIMIT" docs/specs/ARCH-M05-ui-inventory.md   # L86 命中（首轮零）
npx next lint && npx tsc --noEmit && npm run test:unit     # 0 warn / silent / 358 pass
node --env-file=.env --import tsx scripts/test/m2b-f004-pagedata-verify.ts  # 全断言 ✅
gh run view 29988592828 --json conclusion                  # success（五 job 含 Visual）
```

## 测试产物

- 本报告；复用首轮 Evaluator 脚本 `scripts/test/m2b-f004-pagedata-verify.ts`（幂等含自清理）
- DB 终态：Kol=2526，sentinel 零残留——D-H 清态确认
