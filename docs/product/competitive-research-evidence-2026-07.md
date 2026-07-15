# 竞品调研 · 证据底稿（2026-07-14）

> **本文档的角色：** **只放经验证的事实与来源**——不放结论、不排优先级、不改路线图。
> 结论与行动**分两层**落在：
> - **数据层** → [`gap-data-layer.md`](./gap-data-layer.md)（KOL 数据从哪来、多少、多深、多合规、多少钱）
> - **产品功能层** → [`gap-product-layer.md`](./gap-product-layer.md)（产品做什么、怎么交互、工作流完整度）
>
> **方法：** deep-research 多 agent 工作流 —— 6 个搜索角度并行 → 抓取 **23 个一手来源** → 提取 **115 条**可证伪论断 → **25 条**进入 3 票对抗验证 → **23 条存活 / 2 条被否决** → 合成 9 条。
> **时效：** 全部为 2026-07-14 实时抓取。定价、库规模、API 准入名单随时变动，引用须注明抓取日期。
> **口径：** 「官网宣称」与「第三方验证」逐条区分——几乎所有规模与效果数字均为官网宣称、未经审计。
> **调研工件：** run `wf_afa7a42b-1bf` · 106 agents · 663 tool calls

---

## F0 · 游戏垂类库规模基准（confidence: high，投票 3-0 ×4）

**事实：** 游戏垂类同赛道创作者网络规模为 KOLMatrix（~2500 种子）的 **20-40 倍**。

- **Lurkit**：「90k+ verified creators」（首页两处）/「100k+ verified creators」/「900+ publishers and studios」；FAQ 明确「Lurkit **manually verifies** every creator」
- **Keymailer**：「The Keymailer network includes **55,000 gaming influencers who have opted-in** to receive offers」「2.4 billion audience reach」「Trusted by 20,000 organizations」「200 new titles each month」
- **数据模式差异**：对手为「创作者主动入驻 + 人工验证」，我们为第三方爬取（Apify + AI 富化）。Cloutboost 第三方文章独立佐证 Keymailer 的 opt-in 模式（「creators voluntarily join... rather than having their data harvested」）
- **渠道覆盖**：Lurkit 追踪 Twitch / YouTube / YouTube Shorts / TikTok（**无 Instagram**），与我们四平台高度重合

**算术核实：** 55,000 / 2,500 ≈ 22x；90,000–100,000 / 2,500 = 36–40x
**口径：** 全部为官网宣称。Lurkit 站内 90k+ 与 100k+ **自相矛盾**；Keymailer「20,000 机构」可能含免费注册者而非付费客户。
**来源：** lurkit.gg · keymailer.co · support.lurkit.com

---

## F1 · 通用平台库规模与外购成本锚点（high，3-0 ×3）

- **HypeAuditor**：「**227.8M+** Total accounts in our database」「15k New influencers added daily」（Instagram/YouTube/TikTok/X/**Twitch** 五平台）
- **Modash**：「Access profiles and data of **380M+** influencers across Instagram, TikTok, and YouTube」（**无 Twitch**）
- **Modash 公开 API 定价**：Discovery API **$16,200/年起**（$0.45/credit × 3000/月 × 12，算术精确吻合）；Raw API **$10,000/年起**（$0.02/request × 40,000/月）；「we currently don't offer any monthly or pay-as-you-go plans」（年付承诺、无月付）

**佐证：** GitHub 存在第三方项目实际集成 `api.modash.io` 的代码证据。
**口径：** Modash 站内不同页面出现 **250M / 350M / 380M 不一致**；HypeAuditor 自家博客承认索引账号 ≠ 全部可搜索（质量过滤）。
**来源：** hypeauditor.com · modash.io/influencer-marketing-api · modash.io/influencer-marketing-api/pricing

---

## F2 · 受众人口统计 + 假粉/可信度评分 = 行业 table-stakes 且已商品化（high，3-0 ×3 + 2-0）

- **GRIN**：把 0-100 可信度评分做成覆盖 IG/TikTok/YT/FB 四平台的**免费获客工具**（免费、无需账号）。逐字：「assigns a **credibility score from 0 to 100**」；信号含「engagement rate relative to follower count, follower growth patterns, audience composition, and liker credibility」
- **HypeAuditor**：「**95.5%** Of all known fraud activity detected」「Vet influencers... using **35+ metrics**」「age-gender split, location」「**Pre-launch performance forecast**」
- **Modash API**：达人报告示例响应实际含 `"credibility": 0.7675`；docs.modash.io v1.5.0 佐证 `audience.credibility` 与 `ages`/`genders`/`geo` 并列

**table-stakes 判断的跨厂商佐证：** Traackr / CreatorIQ / Upfluence / Influencity 均内置同类能力；2026 年第三方盘点列出 7-21 个此类工具。
**边界：** 受众画像为**全行业标配**；发布前预测为**头部普遍但非人人都有**（Modash 无）。
**口径：** HypeAuditor 95.5% 为**自报基准**且有 Trustpilot 用户争议。
**来源：** grin.co/influencer-marketing-tools/fake-influencer-tool · hypeauditor.com · modash.io · docs.modash.io

---

## F3 · AI 化趋势：「AI-native」标签已不再独占（high，3-0 + 2-0）

- **GRIN Gia**（2025-05-20 发布，通稿称「**first agentic AI** solution」）：逐字「Gia, **automatically screens every creator** for authenticity, audience quality, and brand fit」「Proprietary data from **$1B+ in transactions**」「**180 performance attributes**」；宣称已主动为 70 万+创作者打分；CEO 定位「she's actually doing it」= 执行型 Agent
- **HypeAuditor**：页面标题即「**100% AI-Powered** Influencer Marketing Platform」；Discover 区块含「AI search」，Campaign 区块含「**One-click AI outreach**」「AI companion」；2025-12 推出对话式 AI 同事 **HypeAgent**（beta）
- **横向佐证**：CreatorIQ（Creator Graph + AI 发现 + 预测分析）、Aspire（AI 图像识别 + lookalike）均以 AI 为卖点
- 行业报告称约 **59-60%** 营销人员已用 AI 做创作者发现

**逻辑说明：** 「不再独占」只需一个反例即成立，实际存在多个。
**口径：** Gia 全部数字为官网宣称，未经第三方验证。Gia 发布有 BusinessWire / Yahoo Finance 通稿佐证。
**来源：** grin.co · grin.ai · hypeauditor.com · netinfluencer.com（2025-12-17 报道 HypeAgent beta，CEO Alexander Frolov 受访）

---

## F4 · 平台原生 · YouTube Creator Partnerships（high，3-0 ×4）

YouTube 于 **2026-03-23 NewFronts** 宣布将 BrandConnect 重塑为集中式平台。四段逐字原文：

1. 「We're evolving our tools into a centralized platform - **YouTube Creator Partnerships** (formerly known as BrandConnect) – integrated directly into **YouTube Studio** for creators, and **Google Ads and Display & Video 360** for advertisers」
2. 「With access to more than **3 million creators** within the YouTube Partner Program」
3. 「**In the coming months**, **Gemini** will be able to analyze billions of data points – including audience similarity, organic brand mentions, and subscriber growth」
4. 「through our expanded **YouTube Creator Partnerships API**, **select partners** can bring these exact capabilities into their own tools」

**API 准入：** netinfluencer.com（2026-06-02）报道 **17 家**获准伙伴名录（CreatorIQ、Sprout Social、Meltwater、impact.com、Later、Aspire 等），并称「strictly controlled and selective... **no self-serve pathway**」；数据仅覆盖选择共享的 YPP 创作者。
**口径：** Gemini 匹配为**官方路线图**（"coming months"），宣布时未落地、截至本报告未验证实际上线。「一方数据」为分析性表述（原文未用 first-party 一词）。3M / 2500 ≈ **1200x**。
**第三方佐证：** Tubefilter / Marketing Brew / TheWrap / Hello Partner 均报道。
**来源：** blog.youtube/news-and-events/youtube-creator-partnerships-newfronts-2026 · business.google.com/us/ad-solutions/youtube-ads/cp-api-directory · netinfluencer.com

---

## F5 · 平台原生 · TikTok 封堵第三方追踪（**confidence: medium**，投票 2-1 分票）

**Brandwatch Influence 2026-02-17 公告**逐字：「We will no longer be allowed to **detect campaign posts on TikTok using keyword detection**, so users will have to send orders to the TikTok accounts...」；文中明确归因于「**to stay compliant with TikTok's terms**」（平台方强制，非厂商产品决策）；旧数据源已采集的帖子**将被隐藏**；非 TTCM 账号失去支持。

**生态佐证：** TikTok 官方反爬博客；2026 年爬虫失效报告；主流平台（Captiv8 / Influential / Whalar / CreatorIQ）转向官方一方 API。

**⚠️ 证据局限（引用须谨慎）：** 关键词禁令的一手记载**仅此一份厂商帮助文档**，未找到第二家厂商文档或 TikTok 官方页面直接声明该禁令。「全行业被迫迁移」是**有生态佐证的合理推断，而非多厂商证实**。引用建议表述为「Brandwatch 文档证实 + 生态佐证」。
**来源：** influence-help.brandwatch.com/en/articles/12414758 · tiktok.com/privacy/blog/how-we-combat-scraping

---

## F6 · 平台原生 · Twitch 一方入口 + 伙伴执行（high，3-0 ×2）

Twitch 官方博客（**2025-02-25**，Mike Minton 署名）逐字：「we're introducing a **sponsorships tab directly within your Creator Dashboard**」「we're working with **StreamElements as our first partner**」「Your **payouts will then be handled through StreamElements**, separate from your Twitch payout」「Partners can check this out now, and **Affiliates will unlock access on March 11**」。2025-12 将运营 7 年的 Bounty Board 退役并入该标签页。

**模式：** 「一方入口 + 伙伴执行支付」混合 —— 第三方工具在 Twitch 生态的**执行/结算层仍有明确 partner 空间**。
**⚠️ 范围限定：** 「外包支付」**仅对 StreamElements 渠道成立**。Twitch 同期自营 Bounty Board（2018-05 至 2025-12），并于 2025-12 转为自营 Open Invitation Campaigns（计划 2026 初向 Affiliate 开放）——**不能推广为「Twitch 整体无自建执行/支付能力」**。
**第三方佐证：** Tubefilter（确认这是第三方伙伴首次嵌入 Twitch 平台）/ Marketing Dive / GamesBeat / Dexerto / Streams Charts。
**来源：** blog.twitch.tv/en/2025/02/25/expanding-your-sponsorship-opportunities-on-twitch

---

## F7 · 游戏垂类已内置合同/支付/key 分发/绩效计费（high，3-0 ×2）

**Lurkit 首页逐字：**
- 「Lurkit **handles contracts, payments & talent negotiations**, securing lower rates for you」
- 「Effortlessly distribute **thousands of game keys** to targeted creators for optimal reach」（Key Campaigns）
- 「**Performance-based** paid creator campaigns」（Paid Quests）
- 「Design **missions with specific KPIs** such as views, hours watched, or clicks generated」（Missions & Rewards）

**支付确为产品化而非话术：** support.lurkit.com 文档证实**竞价 → 资金托管 escrow → Stripe 结算 → 内容审核通过后放款**全流程。
**key 分发 = 成熟品类：** Cloutboost 对比文《KeyMailer vs. Lurkit vs. Terminals vs. Woovit》证明由 **4+ 家平台**构成独立品类。
**细节保留：** 合同/谈判部分为「产品 + 托管服务」**混合形态**（Lurkit 亦可作为 agency 延伸）；**支付为纯产品能力**。
**来源：** lurkit.gg · support.lurkit.com/how-does-payment-work-for-quests · lurkit.gg/solutions/key-campaigns

---

## F8 · Keymailer→Partnier：从工具扩展为「平台+托管服务」（high，3-0）

- **重品牌**：partnier.com/rebrand 逐字「Keymailer is rebranding where publishers login – from Keymailer.co to **Partnier.com**... continue logging in at Keymailer.co **until Q4 2025**」
- **规模宣称**：Partnier 首页「powers engagement of **2,400+ press, 55,000+ influencers, 275,000+ creators and 500,000+ players**」（275k+500k=775k，与 Playtester.net 宣称内部一致）
- **服务线**：Game.Press（自述「accredited gaming press network... reaching over **3 billion readers**」）、Playtester.net（**775,000** 创作者与测试者的 playtest）、**JustInfluencers 公开定价**（挑战 **$10/创作者起**、内容集成 **$999+**、红人电竞 **$1,499+**、头部红人 **$5,000+**）、由玩法素材制作预告片、与 **Steam 主题活动/促销同步**的 campaign、创作者忠诚计划、「**Complete Publishing Partner**」托管服务

**第三方佐证：** influencer-hero.com《Top 10 Partnier (Formerly Keymailer) Alternatives [Updated 2025]》；2026 年 G2 / Trustpilot 在 Partnier 名下的活跃条目证明重品牌已生效运营。
**口径：** 触达规模数字均为官网宣称。
**来源：** keymailer.co · partnier.com/rebrand · game.press

---

## ✗ 被否决的论断（**不得在任何文档中引用**）

| 论断 | 投票 | 说明 |
|---|---|---|
| 「Keymailer 首页与定价页完全没有任何 AI/Agent/智能匹配宣称，该垂类头部仍非 AI-native」 | **1-2 否决** | 不得据此声称该对手非 AI 化 |
| 「Brandwatch 经 TTCM API 为授权账号提供受众地域/人口统计/完播率/创作者报价等一方数据点」 | **0-3 否决** | 不得引用 |

---

## ⚠️ 覆盖缺口（诚实声明 —— 影响结论可信度）

存活证据集中在：**游戏垂类（Lurkit/Keymailer）+ 3 家通用平台（Modash/HypeAuditor/GRIN 局部）+ 三大平台原生市场**。

**以下调研目标无任何存活的一手验证，涉及它们的判断一律视为「待补证」：**
- CreatorIQ / Aspire / Traackr / Upfluence / Captiv8 / Kolsquare 等**综合平台的六环节能力矩阵、定价**
- **EMV 等测量/归因标准**
- **支付合同合规细节**
- **亚太玩家（AnyMind AnyTag / iKala Kolr / Partipost）** ← 对出海游戏客户最相关，完全缺位
- Matchmade / Cloutboost 等其余游戏垂类玩家
- **Agentio 等 2025-2026 AI-native 新玩家**

---

## 开放问题（可选第二轮定向调研）

1. 综合头部（CreatorIQ/Aspire/Traackr/Upfluence）的六环节能力、定价与 **EMV 测量标准**——EMV 是否构成我们测量环节的额外 table-stakes 缺口？
2. **亚太/东南亚玩家 + AI-native 新玩家**的能力、定价与游戏客户渗透——对出海游戏厂商最相关的区域对标缺位
3. **YouTube Creator Partnerships API 的准入标准与商务条款**——现有获准名单均为大厂且无自助通道，我们体量是否存在现实入选路径，还是只能退回创作者逐一 OAuth 授权？
4. Modash/HypeAuditor 外购数据在**游戏垂类**的质量——Modash 无 Twitch、游戏创作者的受众画像与 credibility 准确度均未验证；buy 路径能否真正满足垂类需求，还是需要「外购通用 + 自建垂类信号」混合方案？
