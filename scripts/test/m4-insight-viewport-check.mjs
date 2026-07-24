// M4-INSIGHT F009/F010 两视口实测：1512（基线视口）+ 1280（窄屏）——
// 核 V8（?env=insight）/ V12（/admin/insight）元素在场 + 反向 guardrail + 无横向溢出。
// 用法：先起 server（build + serve-standalone 或 dev），再 `node scripts/test/m4-insight-viewport-check.mjs`
import { chromium } from 'playwright';

const VIEWPORTS = [
  { width: 1512, height: 982, name: 'wide-1512' },
  { width: 1280, height: 800, name: 'narrow-1280' },
];

const PAGES = [
  {
    name: 'V8 项目对照账本',
    url: 'http://127.0.0.1:3000/admin/campaigns/xg?env=insight',
    anchor: '证据缺口',
    mustHave: [
      '指标',
      '原目标',
      '实际',
      '差异', // 对照表 4 列
      '目标曝光',
      'ROI',
      '证据缺口', // eyebrow
      '触达（reach）无回传源，本期无法计入', // gaprow 真值
      'Agent 复盘草案', // retro 卡 dlbl
      '生成对外分享报告', // 🚪 红 gate
      '待接入', // M5 图卡占位（渠道/受众）
    ],
    // 反向 guardrail：不得新增 KPI/推荐卡等原型外区块
    mustNot: ['推荐组合', '本季总触达', 'KPI'],
  },
  {
    name: 'V12 跨项目洞察',
    url: 'http://127.0.0.1:3000/admin/insight',
    anchor: '生成对外分享报告',
    mustHave: [
      '本季总触达',
      '总花费',
      '综合 ROI',
      '有效转化', // KPI ×4
      '生成对外分享报告', // 🚪 红 gate
      '采纳为周报',
    ],
    mustNot: ['推荐组合'],
  },
];

const browser = await chromium.launch();
let failed = false;
for (const spec of PAGES) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    await page.goto(spec.url, { waitUntil: 'domcontentloaded' });
    await page.getByText(spec.anchor).first().waitFor({ timeout: 30000 });
    const body = await page.textContent('body');
    for (const t of spec.mustHave) {
      const ok = body.includes(t);
      if (!ok) failed = true;
      console.log(`${ok ? 'PASS' : 'FAIL'} [${spec.name} ${vp.name}] 元素在场: ${t}`);
    }
    for (const t of spec.mustNot) {
      const bad = body.includes(t);
      if (bad) failed = true;
      console.log(
        `${bad ? 'FAIL' : 'PASS'} [${spec.name} ${vp.name}] 反向 guardrail 未补: ${t}`,
      );
    }
    // 无横向溢出（页面级横滚 = 布局破损）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    if (overflow) failed = true;
    console.log(
      `${overflow ? 'FAIL' : 'PASS'} [${spec.name} ${vp.name}] 无横向溢出`,
    );
    await page.close();
  }
}
await browser.close();
if (failed) {
  console.error('❌ m4-insight viewport check FAILED');
  process.exit(1);
}
console.log('✅ m4-insight viewport check PASS（两页 × 两视口）');
