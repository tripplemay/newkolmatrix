# P2-CLEANUP F003 · Avatar colorMode 脱节 — 开工前审计请求

> **发起者：** Andy (Generator)
> **日期：** 2026-07-21
> **触发：** F003 开工前勘查推翻 spec §2 F003 的事实前提，按 pre-impl 审计 → 裁决工作范式
> **状态：** 等待裁决，**未收到前不实现 F003**（F004 不受阻，继续推进）

## 1. 背景

spec `P2-CLEANUP-spec.md` §2 F003 的立项理由是：

> Avatar 的 Chakra `colorMode` 脱节 —— 与 `body.dark` 是两套互不相通的状态，**不修则等于持久化一个半坏的深色**（F003）

acceptance 要求：「深色下 Avatar 边框跟随；浅色态与改造前像素一致」。

开工前核实 `src/components/image/Avatar.tsx` 时撞到两条与该前提冲突的实物事实。

## 2. 审计发现

### 发现 1：该组件全仓零引用（是死代码，与 D6 三件同类）

```
$ grep -rn "components/image\|ChakraNextAvatar\|NextAvatar" src/ scripts/ tests/
src/components/image/Avatar.tsx:12:export function NextAvatar({
src/components/image/Avatar.tsx:40:export const ChakraNextAvatar = chakra(NextAvatar, {
```

`NextAvatar` / `ChakraNextAvatar` 的**唯一命中就是定义处自身**，无任何消费点。

生产在用的头像是另一套：`components/creators/creator-ui` 的 `CreatorAvatar`（`CreatorDrawer.tsx:319` 等），
不经 `image/Avatar.tsx`，也不读 Chakra `colorMode`。

→ 「不修则等于持久化一个半坏的深色」的前提不成立：**它不渲染，深色下用户看不到它**。
其性质与 spec D6 明确「本批不改不删」的 `Configurator.tsx` / `RTL.tsx` / `FixedPlugin.tsx` 同类——
都是 Horizon 模板遗留的无消费点组件。

### 发现 2：即便渲染，`borderColor` 也从不产出样式（换 hook 无法满足 acceptance）

`Avatar.tsx:26-31` 把 `border` / `borderColor` 交给 `./Image`：

```tsx
{...(showBorder ? { border: '2px', borderColor: colorMode === 'dark' ? 'navy.700' : 'white' } : {})}
```

而 `image/Image.tsx:19-30` 是**纯 div 包装**，不是 Chakra 组件：

```tsx
export function Image(props: { [x: string]: any }) {
  const { src, alt, className, nextProps = {}, ...rest } = props;
  return <div className={`relative overflow-hidden ${className}`} {...rest}>
```

`border` / `borderColor`（连同 `width="2"` / `height="20"`）被 spread 到一个**原生 `<div>`** 上，
以 DOM 属性而非样式落地。外层 `chakra(NextAvatar)` 的样式转换只作用于 `ChakraNextAvatar` 自身收到的 props，
不触及 NextAvatar 内部硬编码传给 `Image` 的这几个。

→ F003 acceptance「深色下 Avatar 边框跟随」**不是换个 `useColorMode` 就能达成的**：
边框根本没渲染出来。要真达成须连带改 `Image` 的样式通道（把 border 走 `className`），
这已超出「统一状态源」的 F003 范围，且改的仍是一个零引用组件。

## 3. 决议请求

**Q：F003 如何处置？**

| 方案 | 内容 | 代价 | 风险 |
|---|---|---|---|
| **A（建议）** | **F003 降级为「归档不实现」**：按 D6 同一口径处理——不改不删，把两条发现登记进 `docs/dev/template-inventory.md` 死代码段，F003 在 features.json 标 `descoped` 并在本文件留裁决记录 | 最小 | 无。零引用组件的状态源脱节对用户不可见 |
| B | 只换状态源（`@chakra-ui/system` → `hooks/useColorMode`），**不碰 `Image`** | 小 | acceptance「深色下边框跟随」**仍不成立**（边框本就不渲染）→ Evaluator 会判 PARTIAL/FAIL。等于为验收而做一个不产生效果的改动 |
| C | 换状态源 **+ 改 `Image` 的 border 通道**，让边框真跟随 | 中 | 为零引用组件扩大改动面；`Image` 是模板共享件，改它需回归其它潜在消费点（当前也无）；与 D6「死代码不碰」相抵触 |
| D | 顺手**删掉** `image/Avatar.tsx`（+ 视情况 `Image.tsx`） | 小 | 与 D6「本批不改不删死代码」直接冲突，须先改 D6 |

**Generator 倾向 A。** 理由：F003 的立项理由已被实物证伪；B 是明知不产生效果仍为交付而交付；
C/D 都在扩大对零引用模板代码的改动面，与本批「为 M1 让出干净起点」的目标背离——
真正该做的是把这类模板残留统一登记，留待专门的死代码清理批次一次性处置。

## 4. 裁决段

> **裁决者：** 用户（2026-07-21）
> **结论：方案 C** —— 换状态源 + 修边框通道，让深色下边框真跟随。未采纳 Generator 倾向的 A。

### 4.1 落地实现（Generator，裁决后）

- **状态源**：`Avatar.tsx` 改引 `hooks/useColorMode`，弃 `@chakra-ui/system` 自带 `useColorMode`（spec D2）。
  `chakra()` 包装保留，未引入 `ChakraProvider`。
- **边框通道**：改走 `className` 静态 Tailwind 类（`border-2` + `border-navy-700` / `border-white`），
  弃失效的 `border` / `borderColor` 样式 props。构建产物 CSS 已实测发出这两个类
  （web-runtime-patterns §5 双域：`className` 可达值必须是静态类名）。

### 4.2 与裁决措辞的一处偏离（须知情）

裁决选项 C 的措辞是「换状态源 **+ 改 `Image` border 通道**」，实装**未修改 `Image.tsx`**。

原因：复核后确认 `Image` 自身的 `className` 通道本就正常（`Image.tsx:26` 会把 `className` 拼进 div）。
缺陷不在 `Image` 里，而在 `Avatar` **发错了通道**——把样式 props 发给了一个非 Chakra 的纯 div 包装件。
从 `Avatar` 侧改发 `className` 即达成 C 要的结果（边框真渲染、真跟随深色），且不动 `Image` 这个
模板共享件，爆炸半径更小、与 D6 精神一致。

**若裁决者本意是要连 `Image` 一起改造**（例如让它识别样式 props），请驳回本段，Generator 按原措辞重做。

### 4.3 acceptance 中一条措辞的实物修正

F003 acceptance 含「浅色态与改造前像素一致」。实物上改造前边框**根本不渲染**，故 C 方案必然改变
`showBorder` 时的渲染——这正是 C 的目的。实际像素影响为零：该组件全仓零引用（发现 1），
且 `showBorder` 是 opt-in 默认关闭，任何现存视觉基线都不含它。

### 4.4 回归证据

`scripts/test/p2-cleanup-f003-avatar-colormode.mjs`，7 断言全绿：
A 弃孤儿 colorMode / B 改读统一状态源 / C 弃失效样式 props 通道 /
D 构建产物 CSS 确含 `.border-navy-700` + `.border-white`（边框真发出）/
E 活性证明（`border-navy-700` 全仓仅 Avatar 一处静态用法，故 D 只可能由本 feature 供能）。
