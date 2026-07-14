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

## 版本历史

| 日期 | 修订 | 来源 |
|---|---|---|
| 2026-07-09 | v1.0 重构：自 `harness/generator.md` §8-§9 原文迁出成独立 pattern 文件 | 框架 v1.0 目录分层 |
| 2026-07-14 | §3 付费/第三方模板 scaffold 首推前 secret 预扫（含 `--amend` 清历史铁律） | KOLMatrix DS-FOUNDATION F001 |
