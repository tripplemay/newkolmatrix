# 模板组件库存登记表（dead-in-repo 78 个 · FE-REFACTOR F006）

> **来源：** FE-AUDIT F001 import 图传递可达性矩阵（`scripts/test/fe-audit-component-matrix.mjs` 可复跑重生成）。
> **原则（FE-AUDIT F001 §6，用户批准入 spec）：** 这 78 个不是历史遗留垃圾，而是**已付费模板的库存**——M0.5 恰要消费其中一部分。**本批不删任何组件**；处置动作只有「登记」与后续批次按登记表「接线 / 评估删除」。
> 数量对账：白名单 RTL 13 + 认证储备 6 + M0.5 采纳候选 25 + demo 专用 34 = 78。

## A. 白名单 RTL（13 个 · 不计债，标 unused 即可）

FE-AUDIT spec §4 D6.4：项目无 RTL 需求，保留不接线。

`navbar/RTL` · `sidebar/RTL` · `sidebar/componentsrtl/{Links, SidebarCard}` · `rtlProvider/RtlProvider` · `rtl/dashboard/{CheckTable, ComplexTable, DailyTraffic, PieCard, Tasks, TotalSpent, WeeklyRevenue, Widget}`

## B. 认证批次储备（6 个 · 保留，M5 认证批次直接可用）

`auth/variants/{CenteredAuthLayout, DefaultAuthLayout, PricingAuthLayout}/index` · `footer/{FooterAuthCentered, FooterAuthDefault}` · `navbar/NavbarAuth`

### B.1 M5-AUTH-RLS F002 port 登记（2026-08-04，spec D-10 §2.1）

| 项目落点 | 模板实源（只读基线 `db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main/`） | 形态 |
|---|---|---|
| `src/app/login/page.tsx` | `src/app/auth/sign-in/default/page.tsx` | **port + fork**（删第三方登录钮、文案中文化、接真 signIn） |
| `src/app/signup/page.tsx` | `src/app/auth/sign-up/default/page.tsx` | **port + fork**（删第三方登录钮、姓名两列→团队名/称呼、接 F005 注册端点） |
| `src/components/auth/variants/DefaultAuthLayout/index.tsx` | 同路径（仓内既有库存） | **接线，零改动**（B 组从 dead-in-repo 转为可达） |
| `src/components/footer/FooterAuthDefault.tsx` | 同路径（仓内既有库存） | **接线 + fork**：版权署名 Horizon UI → KOLMatrix（品牌替换）；四条 vendor 链接目标未改，待产品页就位后重指 |
| `src/components/fields/InputField.tsx` · `src/components/checkbox/index.tsx` | 同路径（C 组库存） | **接线，零改动** |

> fork 改动点逐条写在各文件头注释（port-guide §2.4 留痕要求）。**未引入任何新 UI 库、未新增 Chakra 面**（spec §2.2）；
> 第三方登录（Google）钮按 spec §2.3「本批无 OAuth」删除，其余卡片布局 / 输入态样式原样保留。
>
> **品牌区两处按 port-guide §2.4「品牌替换」改**（结构零改动，只换品牌内容，两处均在文件头留痕）：
> ① 右侧渐变面板原铺模板素材 `public/img/auth/auth.png`（图上印着 Horizon UI logo 与 horizon-ui.com 引流位）
> → 换成仓内既有 KOLMatrix 记号（KM 方块 + KOL/Matrix 双字重，与 sidebar 品牌区同款，未新建素材）；
> ② 页脚版权署名 Horizon UI → KOLMatrix。**页脚四条 vendor 链接（Support / License / Terms of Use / Blog，
> 指向 simmmple.com 与 blog.horizon-ui.com）未改**——本批无对应产品页，删即「简化模板区块」（§2.3 禁）；
> 待产品支持页 / 条款页就位后重指，此项已在 F002 commit 正文与交接中登记待裁。
>
> **port 后矩阵实测（`node scripts/test/fe-audit-component-matrix.mjs` 复跑对账）：**
> used-as-is 6 → **8**（+InputField、checkbox）· forked-modified 5 → **7**（+DefaultAuthLayout、FooterAuthDefault）·
> dead-in-repo 77 → **73**。（本文件开头的 78 是 FE-AUDIT F001 时点快照，此后多批已陆续接线；以复跑值为准。）

## C. M0.5 采纳候选（25 个 · 保留并优先复用，禁止在 common/ 重新发明）

| 组 | 组件 | M0.5 消费点（预判） |
|---|---|---|
| 图表 ×6 | `charts/{BarChart, LineChart, LineAreaChart, PieChart, CircularProgress, CircularProgressMini}` | Insight 环节 / 度量看板（ApexCharts 包装） |
| 表单字段 ×4 | `fields/{InputField, SwitchField, TagsField, TextField}` | Brief 表单兜底层 / 设置 |
| 卡片件 ×2 | `card/{MiniStatistics, CardMenu}` | 统计卡（**已实测全仓零引用，用到 stat 卡先复用它**）/ 卡片菜单 |
| 交互原语 ×5 | `checkbox` · `switch` · `progress` · `tooltip` · `popover` | 列表批选 / 开关 / 进度 / 悬浮说明 |
| 日历 ×2 | `calendar/{EventCalendar, MiniCalendar}` | 排期 / 交付时间线 |
| 图像 ×2 | `image/{Avatar, Image}` | KOL 头像 / 素材缩略 |
| 通用展示 ×4 | `dataDisplay/{Event, OrderStep, SessionBadge, TimelineItem}` | 时间线 / 步骤态 / 会话徽标 |

## D. demo 专用（34 个 · 与业务无关，后续批次可评估删除；删除前须复跑矩阵确认仍零引用）

- **demo 操作钮 ×4**：`actions/{ActionButtons, Follow, SeeStory, SetUp}`（NFT/社交 demo）
- **demo 卡片 ×3**：`card/{NftCard, Course, Mastercard}`
- **demo 数据行 ×2**：`dataDisplay/{Transaction, Transfer}`（信用卡流水 demo）
- **杂项 ×2**：`fixedPlugin/FixedPlugin`（浮动主题钮，Configurator 已在 navbar）· `sidebar/components/SidebarCard`（模板推广卡）
- **图标 ×23**：`icons/{ClockIcon, ClockIcon1, CloseIcon, DarkmodeIcon, DashCurveDown, DashCurveUp, DotIcon, EtherLogoOutline, HorizonLogo, KanbanIcon, MarketIcon, MasterCardIcon, NotificationIcon, ProfileIcon, SearchIcon, SignIn, TablesIcon, ThemsIcon, VideoIcon, WidgetIcon/{ChartIcon, DollarIcon, PDFIcon}, visaIcon}`
  - 注：`SearchIcon / NotificationIcon / ProfileIcon / ClockIcon` 等通用图标虽归 demo 组，删除评估时若 M0.5 IA 需要（navbar 搜索/通知位）应改判入 C 组，以当时矩阵复跑为准

## 维护

- 任何 port / 接线 / 删除动作后复跑 `node scripts/test/fe-audit-component-matrix.mjs`，本表随之更新（谁动谁更新）
- 模板 `admin/` 下 124 个 **never-ported**（未入库）组件不在本表——port 流程见 [template-port-guide.md](template-port-guide.md)
