# 模板组件库存登记表（dead-in-repo 78 个 · FE-REFACTOR F006）

> **来源：** FE-AUDIT F001 import 图传递可达性矩阵（`scripts/test/fe-audit-component-matrix.mjs` 可复跑重生成）。
> **原则（FE-AUDIT F001 §6，用户批准入 spec）：** 这 78 个不是历史遗留垃圾，而是**已付费模板的库存**——M0.5 恰要消费其中一部分。**本批不删任何组件**；处置动作只有「登记」与后续批次按登记表「接线 / 评估删除」。
> 数量对账：白名单 RTL 13 + 认证储备 6 + M0.5 采纳候选 25 + demo 专用 34 = 78。

## A. 白名单 RTL（13 个 · 不计债，标 unused 即可）

FE-AUDIT spec §4 D6.4：项目无 RTL 需求，保留不接线。

`navbar/RTL` · `sidebar/RTL` · `sidebar/componentsrtl/{Links, SidebarCard}` · `rtlProvider/RtlProvider` · `rtl/dashboard/{CheckTable, ComplexTable, DailyTraffic, PieCard, Tasks, TotalSpent, WeeklyRevenue, Widget}`

## B. 认证批次储备（6 个 · 保留，M5 认证批次直接可用）

`auth/variants/{CenteredAuthLayout, DefaultAuthLayout, PricingAuthLayout}/index` · `footer/{FooterAuthCentered, FooterAuthDefault}` · `navbar/NavbarAuth`

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
