# Web 运行时与依赖 Patterns（框架沉淀）

> 原为 `harness/generator.md` §8-§9，v1.0 重构移入 patterns/。Generator 在实装涉及 npm 预发布依赖、反向代理后 URL 构造的 feature 时必读。

---

## 1. Alpha / Beta / RC 依赖必须 ambient `.d.ts` shim 兜底

**背景：** KOLMatrix B5 fixing-1（commit f8fca4b）暴露：

- F006 引入 `@visx/wordcloud@4.0.1-alpha.0`（唯一支持 React 19 peerDeps 的版本）
- CI run typecheck 全绿（首次 npm install 时 .d.ts 正常解析）
- Reviewer 本地 typecheck FAIL：`Cannot find module '@visx/wordcloud'` + `Parameter 'd' implicitly has an 'any' type`
- 根因：alpha tag 在 npm install / npm ci 跨循环 .d.ts resolve 不稳定（不同 Node / npm 版本可能解到不同 .d.ts 文件，甚至 0 个）

**规律：** 任何 `alpha` / `beta` / `rc` / `next` / `experimental` tag 依赖**必须同时建 ambient shim**：

```typescript
// src/types/<package>.d.ts
declare module "<package>" {
  // 镜像 upstream 公共 surface
  export type BaseDatum<T = unknown> = T;
  export interface CloudWord { /* ... */ }
  export interface WordcloudProps<T> { /* ... */ }
  export const Wordcloud: <T extends BaseDatum>(props: WordcloudProps<T>) => JSX.Element;
}
```

upstream types 加载时本地 shim 是 no-op override（runtime 不动）；upstream types 漂移 / 没解到时 shim 兜底。

**Spec 起草 checklist（Planner）：** 任何引入 alpha/beta/rc tag 依赖的 spec § dependencies 段必须 explicit 列出：

- [ ] 依赖名 + 精确版本号（含 alpha tag 后缀）
- [ ] **要求 Generator 同步建 `src/types/<package>.d.ts` ambient shim**
- [ ] shim 文件路径写入 spec acceptance（验收 = shim 文件存在 + npm ci 后 typecheck 全绿）

**Generator 实战：** 显式 param type annotation 是 belt-and-suspenders 兜底，比依赖泛型推断稳：

```typescript
// 显式 type annotation（即便 generic 推断应该够，alpha .d.ts 不可信时双保险）
fontSize={(d: WordcloudDatum) => d.value}
{(cloudWords: CloudWord[]) =>
  cloudWords.map((w: CloudWord, i: number) => ...)}
```

来源：KOLMatrix B5 fixing-1（commit f8fca4b）。

---

## 2. Next.js standalone 模式 `request.url` 的 origin 取监听地址，反代后须从 forwarded headers 推导（v0.9.21 — aigcgateway BL-IMG-PERSIST-GCS 沉淀）

**背景：** Next.js **standalone 输出模式**（`output: "standalone"`）下，route handler 里 `new URL(request.url).origin` 取的是**进程监听地址**（如 `0.0.0.0:3000` / `localhost:port`），**无视 `Host` 头**。任何据此构造对外**绝对 URL** 的代码，在反向代理（nginx / LB）后都会生成客户端不可达的地址。

**典型受害场景：**

- 签名图片 / 文件代理 URL（返回给客户端去 GET）
- webhook 回调地址、邮件 / 通知里的深链
- OAuth redirect_uri、分享链接

**规律：** 构造对外绝对 URL 必须从转发头推导公网 origin，而非 `request.url`：

```typescript
function resolveRequestOrigin(request: Request): string {
  const h = request.headers;
  const xfHost = h.get("x-forwarded-host") ?? h.get("host");
  if (xfHost) {
    const proto = h.get("x-forwarded-proto")
      ?? (xfHost.startsWith("localhost") || xfHost.startsWith("127.") ? "http" : "https");
    return `${proto}://${xfHost}`;
  }
  return process.env.NEXT_PUBLIC_GATEWAY_ORIGIN
    ?? process.env.SITE_URL
    ?? new URL(request.url).origin; // 最后兜底
}
```

**前置确认：** 反代须转发 `proxy_set_header Host $host;` + `proxy_set_header X-Forwarded-Proto $scheme;`（否则推导仍失真）。

**反面：** aigcgateway BL-IMG-PERSIST-GCS fix_round1 — 图片代理签发 URL origin=`0.0.0.0:3000` → 客户端不可达 → Evaluator FAIL → fix_round1 才加 `resolveRequestOrigin`（commit 400f2af）。

来源：aigcgateway BL-IMG-PERSIST-GCS fix_round1。

---

## 3. 付费 / 第三方模板 scaffold：首次 push 前必扫硬编码 secret（v1.0.4 — KOLMatrix DS-FOUNDATION F001 沉淀）

**背景：** 以付费 / 第三方 UI 模板为基座 scaffold（skeleton 模式）时，模板 demo 代码常内嵌作者硬编码的第三方 secret。KOLMatrix DS-FOUNDATION F001 把 Horizon UI Pro 模板 copy 入 repo，`src/components/map/MapComponent.tsx:8` 硬编码了模板作者的 Mapbox token；即便删 demo 页后该组件已无人引用，只要进了 commit，public 仓库默认开启的 GitHub push protection 就 GH013 拒推**整个 push**。

**规律：** scaffold 类 feature（copy 模板框架入库）完成、**首次 push 前必须全仓扫硬编码 secret**：

```bash
grep -rnE "pk\.[A-Za-z0-9]|sk-[A-Za-z0-9]|sk\.eyJ|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]|xox[baprs]-|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_-]?key['\"]?\s*[:=]" src/
```

命中即处理：**未使用的 demo 组件直接删**（连带减 dead code）；**在用的**换 `process.env.X` + `.env.example` 占位。

**清历史铁律：** secret 一旦进本地 commit，**未推送时必须 `git commit --amend`（或 rebase）改写该 commit** —— 新增一个"删除"commit 不够，push protection 扫的是本次 push 的**所有** commit，旧 commit 里的 secret 仍会被拦。

**前置：** `.gitignore` 补 `.env*` 应早于任何 install / scaffold（防 `.env` 误入库）。

**反面：** DS-FOUNDATION F001 首推被 GH013 拦（Mapbox token @ `MapComponent.tsx:8`）→ 删未用的 `components/map` + `git commit --amend` 才推成功（commit a04699e）。

来源：KOLMatrix DS-FOUNDATION F001。

---

## 4. 视觉回归基线的三个静默坑（v1.0.6 — KOLMatrix FE-REFACTOR + ARCH-M05 沉淀）

**共同特征：** 这三条都不会让测试变红——它们让测试**变绿得毫无意义**，或红在与根因无关的地方。引入视觉回归测试时应一次性按本节校准。

### 4.1 CDN 字体是抖动的总根源

**背景：** Playwright 每个 test 起全新 browser context、零 HTTP 缓存 → **每个用例都重新拉一次 Google Fonts**。网络抖动即 `document.fonts.ready` 挂起 / 截图超时。ARCH-M05 F017 排查中它先后伪装成「`networkidle` 等待挂起」和「多 worker 资源竞争」，三层排查才见底。

**规律：** 视觉测试**不得依赖任何外部字体 CDN**。把 woff2 与改写后的 `@font-face` CSS 入库 `tests/visual/fonts/`，用 `page.route()` 全离线回放。

```
tests/visual/fonts/          # woff2 + 改写 src: 指向本地的 CSS
  → page.route('**/fonts.googleapis.com/**', 回放本地 CSS)
  → page.route('**/fonts.gstatic.com/**',   回放本地 woff2)
```

字形与线上一致（同一份 woff2），因此基线仍有效。副产品：ARCH-M05 全套时长 60-90s → 24s。

### 4.2 容忍带是双向坑：重生用 `all`，断言用紧阈值

**背景：** FE-REFACTOR F005 两个方向都踩了同一个 `maxDiffPixelRatio`：
- **重生方向：** `--update-snapshots` 默认 `changed` 模式在容忍带内**不改写**基线 → 重生 workflow 空转，基线永远停在旧版（已修 `42d7d75` 改 `=all`）
- **断言方向：** 同一个宽容忍度让**整块 UI 出现/消失（1.44%）也不判红**

**规律：** 两个方向用**不同**的口径——**重生一律 `--update-snapshots=all`**（无条件改写），**断言用紧阈值**（`maxDiffPixels ~1500` 或 `ratio 0.001` 量级）。引入视觉测试时即按「该页面一次典型改动的像素量级」校准阈值，不要沿用框架默认值。

**落地纪律：** 阈值收紧后先**本地连跑 3 次**验证抗抖动（4.1 处理完再跑，否则测的是字体抖动），再入 CI。

**§4.2 补充（v1.0.9 — KOLMatrix M1-C F005 沉淀）——借绿的上游：没发现需要重生。** 收敛/去重类 feature（多份 token/tone/样式副本收敛为单点）声明「零漂移/等价」前，必须**逐字 diff 全部被收敛副本与 canonical 的差异**（`git show <pre-commit>:<file>` 逐份比对），任一副本与 canonical 有差即为意图变更 → 重生基线并对账。不得凭「canonical 取自其中一份」推定全体等价。反面：M1-C F005 tone 收敛只核对了 today 版（canonical 出处），未比对 campaigns 版原值（red-500 vs red-600），720px 实变被 1500px 容忍带借绿，首轮验收 PARTIAL 由 Evaluator 像素取证抓获。

### 4.3 纯 CI 环境「空数据渲染 null」会被基线静默编码为合法空白

**背景：** BL-FE-11 / FE-REFACTOR F003+F007：CI 无 DB，组件读不到数据渲染 `null`，linux 基线于是把 `HandoffCollab` 的**空区域固化成「正确」**——该组件的回归覆盖长期为零，无人察觉。截图对比永远绿，因为两边都是空白。

**规律：** 视觉基线里任何依赖数据的区块，必须 **route mock 固定夹具 + `waitFor(关键文案)` 硬断言**。`waitFor` 是关键：渲染 `null` 时它超时**硬失败**，把「静默空白」转成「响亮的红」。

**自检：** 新增基线页时问一句「如果这个区块的数据源整个消失，这条测试会红吗？」——答案是否，说明缺 `waitFor` 硬断言。

### 4.4 新增视觉用例的「CI 首推必红」是预期，且补基线不会自动复验（v1.0.7）

**背景：** KOLMatrix P2-CLEANUP F005 新增一条视觉用例后首次 push，CI **必然红**：
`Error: A snapshot doesn't exist at .../creator-drawer-linux.png, writing actual.` ——
本地重生的是 `-darwin` 基线，`-linux` 基线在 CI 跑起来之前不存在。

**两段式陷阱：**

1. **首推必红是预期**，不是回归——但 Generator 的「CI 绿才能切 verifying」纪律会在此卡住，需知道这是预期
2. **补完基线 CI 也不会自动复跑**——`update-visual-baselines` workflow 的 commit 带 `[skip ci]`，
   必须**另有一次触碰非 `paths-ignore` 路径的 push** 才能真正验证 CI 绿

**落地顺序：** 新增视觉用例 → push（CI 红，预期）→ 手动跑 `Update visual baselines` workflow →
`git pull` 取回 linux 基线 → 另推一次实质改动 → 才算验到 CI 绿。

**别被这一条骗过去：** 只看到「基线 workflow 绿了」就认为 CI 绿，是把两件事混为一谈。

**来源：** KOLMatrix FE-REFACTOR F005 / F003+F007（BL-FE-11、BL-FE-13）+ ARCH-M05 F017 + P2-CLEANUP F005（§4.4）。

### 4.5 重生前必查 :3000 无残活 dev server——`reuseExistingServer` 静默复用任何占端口进程（v1.0.11 — KOLMatrix M2-A F008 沉淀）

**背景：** Playwright `webServer.reuseExistingServer: !CI` 的语义是「端口被占就直接用」——它**不核对占端口的是谁**。M2-A F008 基线重生时，F005 期的 `next dev` 残活在 :3000（`next dev` 自动加载 .env → 持真网关凭据），手起的 standalone `EADDRINUSE` 崩溃且输出被 `/dev/null` 吞掉，于是 12 张基线**对着 dev server 拍摄**（dev 渲染 + 真网关 lazy 生成把真数据写进库），直到一条空态用例 30s 超时才暴露，返工整轮重拍。

**这是「dev vs standalone」已知坑的新触发形态：不是配置错，是端口被上一个会话的进程占着。** 三重静默叠加：占端口静默复用 + 启动失败静默吞掉 + 容忍带内差异静默借绿。

**重生序（每次重生基线前照此执行）：**

```bash
lsof -ti :3000 | xargs kill 2>/dev/null   # 1. 清残活（dev / 旧 standalone 一律杀）
lsof -ti :3000 || echo port-free           # 2. 确认真的空了
# 2.5 清测试残留（见下方「数据态优先级」）：dev 租户 pending 与 e2e append-only 标记行
# 3. 让 playwright 自起 webServer——env 在当前 shell 显式控制（如伪造网关凭据造空态）
npm run test:visual:update
# 4. 事后核 DB 无副作用写入（真网关残活会经 lazy 生成落库）
```

**自检：** 重生跑完问一句「这批截图是谁渲染的？」——答不上（没确认过端口归属）就等于没重生。

**数据态优先级裁决（v1.0.13 — KOLMatrix M4.7 复验轮二/轮三 S-RV2-5，2026-08-02 用户裁决）：**
「e2e 标记行 append-only 留不删」（M4.5 spec §9 / S-M45-1）与本节重生序的「重生前先清 dev 租户」
在本机会互斥——e2e 跑完 today 基线就翻红。**裁决：留不删只约束 e2e 脚本自身的运行期行为
（脚本不得删这些留痕，它们是协作痕迹样本）；不约束人工重生基线前的清理动作，重生序优先。**
即：跑 `test:visual:update` 之前该清就清，清完再跑 e2e 让它重新 append。
CI 不受此影响（visual job 是空库 + seed，不跑任何 `*:e2e`）。
残留的根因——基线与 dev 租户数据态耦合——未消解，已入 backlog（`BL-VISUAL-DATA-ISOLATION`）。

**新触发形态（v1.0.13 — KOLMatrix M4.7 fix_round3 实证）：`next build` 之后必须重启 standalone。**
旧进程在 :3000 活着且**能正常响应 200**，但它的 chunk 指纹指向已被新 build 覆盖的文件 →
客户端 JS 加载失败、React 不 hydrate。表现为**整套视觉基线连同交互类用例一起翻红**，
极易被误读成「我的改动打红了视觉门」。第 1 步的「一律杀」因此不只针对 dev server：
**凡跑过 `next build`，之前起的 standalone 也必须杀掉重起。**

**来源：** KOLMatrix M2-A F008（12 张基线污染返工 + proposed-learnings 2026-07-22 用户 Accept）；
数据态优先级与 build-after-serve 形态来自 M4.7-FRONTDESK（2026-08-02）。

### 4.6 基线含**相对时间标签**时，本地会随时间自然翻红（v1.0.13 — KOLMatrix M3-B F012 沉淀）

**坑：** 视觉基线里若包含「N 小时前」这类相对时间 + 长寿命本地 dev DB，
mac 基线会随「重生时刻 → 断言时刻」的自然流逝翻红。
M3-B 实测：feed 三行由 17:10 产生，20:00 重生标「2 小时前」、20:30 断言变「3 小时前」→ **4366px 差异**。

**为什么容易误判：** CI 用 fresh DB 故不受影响 → 表现为「本地红、CI 绿」，
极易被当成环境玄学而反复重生。

**做法二选一：** 基线环境用**固定夹具时间**（seed 时写死 `createdAt`），或把该区域 **mask** 掉。

### 4.7 `fullPage: false` 的视口基线对「新加在页面下方的卡」零覆盖（v1.0.13 — KOLMatrix M4.5 F006 沉淀）

**坑：** 想把新构件并进既有基线页，实测新卡落在**折叠线以下**——
基线文件更新了（diff 有变化、CI 也绿），但新卡**一个像素也没被守住**。

**规律：** 给新构件加视觉覆盖时，先确认它是否在截图范围内；
不在就**另起确定性预览页**（或该页改 `fullPage: true`），
别只更新一张看不见它的基线——那是最典型的「有钉子、零保护」。

---

## 5. Tailwind JIT 静态扫描：`className` 可达的值必须定义在 config（双域 token 分工）（v1.0.6 — KOLMatrix ARCH-M05 沉淀）

**背景：** ARCH-M05 把设计 token 收敛到 `design-tokens.ts` 后，某些渐变**静默消失**——没有报错、没有 lint 警告、tsc 全绿，只是 CSS 里根本不存在那个 class。

**根因：** Tailwind JIT 靠**静态扫描源码文本**生成 CSS。`from-[${JS常量}]` 在扫描期只是一个模板字面量，Tailwind 看不到最终值，**不生成任何 CSS**。

**规律：设计 token 有两个域，出处不同，不可互串：**

| 域 | 消费方 | token 出处 | 反例 |
|---|---|---|---|
| **CSS 域** | `className` 中可达的一切色值 / 尺寸 | **必须**定义在 `tailwind.config.js`（或 CSS 变量） | ❌ `` className={`from-[${T.brand}]`} `` → 静默无 CSS |
| **JS 域** | 图表 options（ApexCharts 等）、inline `style` | `design-tokens.ts` 等 JS 常量 | ✅ `options.colors = [T.brand]` |

**自检：** 抽取 token 常量时，逐个检查消费点落在哪个域；凡是进 `className` 的，同步在 `tailwind.config.js` 建对应键，`className` 写静态类名。

**检测：** 这类丢失 tsc / lint 抓不到，只有**视觉回归**能抓（见 §4——这也是把阈值收紧的价值之一）。

**来源：** KOLMatrix ARCH-M05（token 双域收敛）。

---

## 6. RSC 直读 DB 的页面必须显式 force-dynamic（v1.0.9 — KOLMatrix M1-C F001 沉淀）

**背景：** Next.js App Router 中无 dynamic API（不读 `params`/`searchParams`/`cookies`/`headers`）的页面，`next build` 默认**构建期静态预渲染**。RSC 里的 prisma 查询会在 build 时执行——两种结局都坏：

1. **构建环境有 DB**（本地/带 service 的 CI job）：查询成功，**数据冻结进静态 HTML**，运行时不再读库——「RSC 直读」退化为构建期快照，且 curl 上与真直读**不可分辨**（M1-C F001 首轮 SSR 实测即被快照骗过）；
2. **构建环境无 DB**（典型 CI Build job）：prisma 初始化抛错 → `Export encountered an error … exiting the build` 硬红。

**规律：** 任何 RSC 直读 DB 的页面必须显式声明：

```ts
export const dynamic = 'force-dynamic';
```

**Spec/acceptance 硬要求：** 「RSC 直读」类 feature 的 acceptance 必须含 (a) `force-dynamic` 声明；(b) **运行时改→验→复原实证**（改一行库数据 → 刷新页面立即可见 → 复原）——这是唯一能区分「真直读」与「构建期快照」的证据；(c) build 后核 `prerender-manifest.json` 不含该路由。

**注意：** 读 `await searchParams` 的页面（如动态路由详情页）天然动态不会踩此坑——这正是 M1-B 详情页未暴露、M1-C 列表页首踩的原因。

**反面：** KOLMatrix M1-C F001 列表页转 RSC 未声明 → 本地构建静态化冻结数据 + CI Build job 连红两次（`7f86062`/`5bdc47a`），`42a534a` 修复。

**来源：** KOLMatrix M1-C F001。

## 7. 工具 / handler 注册不得依赖某个「入口模块」的模块图副作用（v1.0.12 — M3-A round1 沉淀）

**坑：** 工具注册副作用只在 `/api/agent` route import `tools/index` 时触发。冷进程直打其他路由（`/api/reach/*`、`/api/actions/[id]/execute`——跨会话恢复 / 用户书签直达场景）时注册表为空 → 400/500。standalone boot 恰好预载了入口模块只是**运气不是契约**（dev 按需编译 / 未来拆包都会破）。

**规律：** 注册表类共享状态（工具注册 / handler 映射 / canvas renderer）必须在**每个消费点显式幂等注册**——唯一执行入口（如 `executeTool`）自带 `ensureXxxRegistered()`，而不是假设某入口模块先被 import。幂等注册成本为一次 Set 查询，远低于跨会话 500 的排查成本。

```ts
export async function executeTool(name, input, ctx) {
  ensureNativeToolsRegistered(); // 消费点自带，不依赖模块图
  ...
}
```

**来源：** KOLMatrix M3-A-REACH-CRM round1（fix_round1 修复：executeTool 自带幂等注册，任何路由冷进程直达不缺工具）。

## 8. 模块循环导入**只在生产构建期炸**（vitest / dev 全绿）（v1.0.13 — KOLMatrix M4.5 F004 沉淀）

**坑：** `tools/propose-plan.ts` 从 `./index` 导入 `ensureNativeToolsRegistered`，
而 `index.ts` 反向 import 该工具并在模块顶层调用注册——
vitest 与 `next dev` 下模块求值顺序**恰好安全**，只有 `next build` 的 prerender 阶段 TDZ 崩
（`ReferenceError: Cannot access 'l' before initialization`）。

**规律：** **装配入口**（把所有实现聚合起来并在顶层执行副作用的模块）
**不得被它聚合的成员反向 import**；需要「确保已初始化」的场景交给唯一执行入口（同 §7）。

**落地：** 目录级扫描的回归测试（KOLMatrix：`tests/unit/tool-module-cycles.test.ts`），新成员自动纳入。

**纪律：** 此类失效**延迟暴露**，本地全绿不能作为通过依据——**改动模块图后必须本地跑一次 `npm run build`**。

---

## 版本历史

| 日期 | 修订 | 来源 |
|---|---|---|
| 2026-07-09 | v1.0 重构：自 `harness/generator.md` §8-§9 原文迁出成独立 pattern 文件 | 框架 v1.0 目录分层 |
| 2026-07-14 | §3 付费/第三方模板 scaffold 首推前 secret 预扫（含 `--amend` 清历史铁律） | KOLMatrix DS-FOUNDATION F001 |
| 2026-07-21 | §4 视觉回归基线三个静默坑（CDN 字体抖动 / 容忍带双向 / 空数据基线）+ §5 Tailwind JIT 双域 token 分工 | KOLMatrix FE-REFACTOR + ARCH-M05 |
| 2026-07-22 | §4.4 新增视觉用例 CI 首推必红且补基线不自动复验（`[skip ci]` 陷阱） | KOLMatrix P2-CLEANUP F005 |
| 2026-07-22 | §4.2 补充（收敛声明须逐份 diff 副本——借绿的上游）+ §6 RSC 直读 DB 页面必须 force-dynamic | KOLMatrix M1-C F005 / F001（v1.0.9） |
| 2026-07-22 | §4.5 重生前必查 :3000 无残活 dev server（v1.0.11） | KOLMatrix M2-A F008 |
| 2026-07-25 | §7 注册不得依赖入口模块图副作用——消费点显式幂等注册（v1.0.12） | KOLMatrix M3-A round1 冷进程注册表空 |
| 2026-08-02 | §4.5 数据态优先级裁决（重生序优先于 append-only）+ build 后须重启 standalone · §4.6 相对时间标签基线自然翻红 · §4.7 `fullPage:false` 对折叠线以下零覆盖 · §8 模块循环只在 build 期炸（v1.0.13）| KOLMatrix M3-B F012 / M4.5 F004·F006 / M4.7-FRONTDESK |
