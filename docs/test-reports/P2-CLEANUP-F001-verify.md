# P2-CLEANUP F001 验收报告 — 创作者抽屉遮罩点击关闭（BL-FE-15）+ 文件头注释改真

- **批次：** P2-CLEANUP（status = verifying，fix_rounds = 0）
- **Feature：** F001（仅本条，fan-out 分片）
- **Evaluator：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-21
- **判定：** **PASS**
- **被测 commit：** `7ab3170` fix(P2-CLEANUP-F001)（`git log 7ab3170..HEAD -- src/components/creators/CreatorDrawer.tsx` 为空 → 批内无后续改动，被测即终态）
- **环境：** standalone 生产产物（`.next/BUILD_ID = WiBy2Jow4S8z5M7i6aBTG`，构建时间 07-21 06:25 晚于 F001 commit 05:22），`PORT=3101 node scripts/serve-standalone.mjs`，未重建（遵从并行验收约束）。走 standalone 不走 `next dev` — `framework/patterns/testing-env-patterns.md` §7。
- **产物验真：** 构建 chunk 内含本次修复，非源码空对账 —
  `grep -o 'containerProps:{style:{[^}]*}}' .next/static/chunks/app/admin/creators/page-eb3bad6640a59faf.js`
  → `containerProps:{style:{zIndex:110,height:"100vh"}}`

---

## 1. 逐条 acceptance 对照

| # | acceptance 条款 | 判定 | 依据 |
|---|---|---|---|
| A1 | 按 D3 修法**①**（`containerProps.style` 补高度）恢复遮罩点击关闭 | PASS | diff 仅 `{ zIndex: 110 }` → `{ zIndex: 110, height: '100vh' }`；运行时 `inlineHeight=100vh`、容器 `h=900/844` = 视口高（G1） |
| A2 | 修法①不生效才退 FIX-4 自写 scrim；**两套不得并存** | PASS | 全文件 `grep "fixed inset-0"` **0 命中**（CopilotPanel FIX-4 参照实现用的正是该模式）；scrim 仅 Chakra 原生 `<DrawerOverlay>` 一处（`:309`） |
| A3 | **同 commit** 改真文件头 `:3` 假陈述，并写明最终采纳哪条修法 | PASS | 同一 commit `7ab3170` 两文件；旧文「Esc + 遮罩关闭为 Drawer 自带」删除，新文分列四条关闭路径并写明「须经 containerProps.style 显式给回 100vh」；commit message 明写「采纳 spec D3 修法①…未退 FIX-4 自写 scrim」 |
| A4 | 不得引入 `ChakraProvider` | PASS | `grep -rn "ChakraProvider" src/` 仅 3 处**注释**命中（Avatar:22、CreatorDrawer:6/312），零代码引用 |
| A5 | 现存三条关闭路径不得回归：X 钮 / Esc / dw-foot | PASS | G6-B / G6-C / G6-D 桌面+移动各一遍全绿（详见 §2） |
| A6 | 关闭后不残留遮挡层 | PASS | G5a 关闭后 `.chakra-modal__content-container` DOM 计数 = 0；G5b 下层表格行**真点击**可重开抽屉（非仅 hit-test） |
| A7 | lint + tsc 绿 | PASS | `npx tsc --noEmit` exit 0 无输出；`npx next lint` → `✔ No ESLint warnings or errors` |

**spec §4 附加口径：**

| # | 条款 | 判定 | 依据 |
|---|---|---|---|
| S1 | 四条关闭路径**逐条浏览器实测**，桌面与移动视口各一遍 | PASS | 独立探针 24/24（1440×900 + 390×844） |
| S2 | 关闭后下层交互可用 | PASS | G5b |
| S3 | UI 实测走 standalone 不走 `next dev` | PASS | 见环境栏 |
| S4 | **文件头注释真实性**（文档新鲜度 clause） | PASS | 逐句坐实，见 §3 |

---

## 2. 独立实测（Evaluator 自写探针，不复用 Generator 断言口径）

脚本：`/Users/yixingzhou/project/newkolmatrix/scripts/test/p2-cleanup-f001-eval-probe.mjs`
命令：`BASE=http://127.0.0.1:3101 node scripts/test/p2-cleanup-f001-eval-probe.mjs`

```
[桌面 1440x900]
  PASS  G1 content-container 高度 ≈ 视口高（修复生效） — h=900 w=1440 z=110 inlineHeight=100vh pos=fixed
  PASS  G2 遮罩点击坐标落在抽屉本体之外（稳定态几何） — drawer.x=920 drawer.w=520 遮罩带宽=920px clickAt=(460,450)
  PASS  G2b 该坐标命中的是遮罩/容器层 — hit=div|chakra-modal__content-container css-1oxhx2p
  PASS  G4 点击抽屉内部不关闭（语义未被扩大） — clickAt=(1180,450)
  PASS  G3 活性证明：容器高度归 0 后遮罩点击失效（本断言能抓到回归） — killedHeight=0px drawerStillOpen=true
  PASS  G6-A 遮罩点击关闭（稳定态）
  PASS  G5a 关闭后 DOM 无 content-container 残留 — count=0
  PASS  G5b 关闭后下层表格行仍可点击（真交互，抽屉可重开）
  PASS  G6-B X 钮关闭
  PASS  G6-C Esc 关闭
  PASS  G6-D dw-foot「加入某项目匹配」关闭
  PASS  桌面 无 page error

[移动 390x844]
  PASS  G1 content-container 高度 ≈ 视口高（修复生效） — h=844 w=390 z=110 inlineHeight=100vh pos=fixed
  PASS  G2 遮罩点击坐标落在抽屉本体之外（稳定态几何） — drawer.x=16 drawer.w=374 遮罩带宽=16px clickAt=(8,422)
  PASS  G2b 该坐标命中的是遮罩/容器层 — hit=div|chakra-modal__content-container css-1oxhx2p
  PASS  G4 点击抽屉内部不关闭（语义未被扩大） — clickAt=(203,422)
  PASS  G3 活性证明：容器高度归 0 后遮罩点击失效（本断言能抓到回归） — killedHeight=0px drawerStillOpen=true
  PASS  G6-A 遮罩点击关闭（稳定态）
  PASS  G5a 关闭后 DOM 无 content-container 残留 — count=0
  PASS  G5b 关闭后下层表格行仍可点击（真交互，抽屉可重开）
  PASS  G6-B X 钮关闭
  PASS  G6-C Esc 关闭
  PASS  G6-D dw-foot「加入某项目匹配」关闭
  PASS  移动 无 page error

=== Evaluator F001 probe: 24 passed, 0 failed ===
```

**活性证明（G3，框架 v1.0.6「检测器活性证明」精神）：** 全绿断言若不能证伪则不可采信。G3 在运行时把 `.chakra-modal__content-container` 的 height 改回 `0px`（**仅 DOM 运行时操作，不改产品代码、不重建产物**），复现修复前状态 → 同一坐标的遮罩点击**不再关闭抽屉**（`drawerStillOpen=true`）；恢复 `100vh` 后立即恢复关闭能力。两视口均成立。这证明 G6-A 的通过确实由本次修复导致，而非探针恒真。

**Generator 探针交叉复跑：** `BASE=http://127.0.0.1:3101 node scripts/test/p2-cleanup-f001-drawer-close.mjs` → `12 passed, 0 failed`（结论一致，但见 O1）。

---

## 3. 文件头注释真实性逐句核（spec §4「注释真实性」/ 文档新鲜度 clause）

| 注释断言（CreatorDrawer.tsx:4-7, 317-318） | 核验方式 | 结果 |
|---|---|---|
| 「关闭四路径：X 钮 / Esc（Drawer 自带）/ 遮罩点击 / dw-foot 副作用型」 | 四路径 × 两视口浏览器实测 | **真**（G6-A~D）。Esc 确为 Drawer 自带：源码无 `closeOnEsc` 显式 prop，走 Chakra 默认值 |
| 「承载 `closeOnOverlayClick` 的是 `.chakra-modal__content-container`」 | G3 反证：只改该容器高度即可开关遮罩点击能力 | **真** |
| 「高度取 Chakra `$100vh` token，无 ChakraProvider 时不解析」 | 运行时枚举 styleSheets 取该元素的 height 声明 | **真** —— `.css-1oxhx2p { height: var(--chakra-vh) }`，`--chakra-vh` 无 Provider 时未定义 |
| 「实测 height=0px（width 1440 正常）」 | 运行时 `style.removeProperty('height')` 后读回 computed | **真** —— 去掉 inline 高度：`{h:0, w:1440, computedH:"0px"}`；带修复：`{h:900, w:1440, computedH:"900px"}` |
| 「故须经 containerProps.style 显式给回 100vh」（= 采纳修法①） | diff + 运行时 inline 值 | **真** |

原 `:3` 假陈述「Esc + 遮罩关闭为 Drawer 自带」已删除，无残留。

---

## 4. 观察项（不影响本 feature 判定，建议记入 soft-watch）

- **O1（Generator 探针稳健性，非产品缺陷）：** `scripts/test/p2-cleanup-f001-drawer-close.mjs` 打开抽屉后立即点击，未等 Slide 过渡稳定；其遮罩点击坐标取 `viewport.width * 0.12`。移动 390×844 稳定态下抽屉占 x=16~390（`min(520px,96vw)` = 374.4px），x≈47 实际**落在抽屉本体内**，该用例是靠"抢在滑入动画完成前点击"（t≈0 时抽屉 x=363）才命中遮罩的。功能结论不受影响（本报告 G6-A 在稳定态、坐标由几何反推，两视口均绿），且该断言仍能抓到回归（G3 已证）；但作为长期回归守门，建议下批次把坐标改为由 `boundingBox()` 反推并加过渡稳定等待。实测证据：过渡采样 `[{t:0,x:363},{t:200,x:71},{t:400,x:18},{t:700,x:16}]`。
- **O2（既有设计，非本批引入）：** 移动 390 宽视口下遮罩可点区仅左侧 **16px** 条带（源于 ARCH-M05 既定的 `!w-[min(520px,96vw)]`）。遮罩点击关闭在此宽度下技术成立但触达面积极小，是否调整属产品口径，建议入需求池评估，不作为 F001 缺陷。
- **O3（提示）：** 修复用 `100vh` 而非 `100dvh`；与抽屉本体既有的 `!h-screen`（同为 100vh）一致，未引入新的不一致。移动端浏览器动态工具栏场景下二者行为差异已知，本批不构成回归。

---

## 5. 结论

**F001 = PASS。** 7 条 acceptance + 4 条 spec §4 附加口径全部满足，无一条降级。修复采纳 D3 修法①且未与 FIX-4 scrim 并存，未引入 ChakraProvider，三条既有关闭路径零回归，关闭后无遮挡层残留，lint + tsc 绿。遮罩点击关闭能力经**活性证明**确证由本次修复带来（容器高度归 0 即失效、复原即恢复），非探针恒真。文件头注释五项事实陈述逐句经浏览器实测坐实，`:3` 假陈述已清除。

---

## 附：Evaluator 边界声明

本次验收仅新增测试产物 `scripts/test/p2-cleanup-f001-eval-probe.mjs` 与本报告；未修改任何产品代码（`src/` / 配置 / `package.json` 均未动，`git status` 可核）。未重建 `.next` 产物（并行验收共用）。所有断言基于代码实物、构建产物 grep 与浏览器实测输出，未采信任何实现方叙述。
