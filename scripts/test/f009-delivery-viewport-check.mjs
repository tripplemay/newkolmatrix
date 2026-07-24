// F009 两视口实测：1512（基线视口）+ 1280（窄屏）——核 V7 元素在场 + 无横向溢出。
import { chromium } from 'playwright';

const VIEWPORTS = [
  { width: 1512, height: 982, name: 'wide-1512' },
  { width: 1280, height: 800, name: 'narrow-1280' },
];

const MUST_HAVE = [
  '创作者 / 交付',
  '内容',
  'Key',
  '合同',
  '托管',
  '#ad',
  '放款',
  '还没有交易——报价经确认后自动生成交付条件台账',
  '没有 AI 推荐卡',
  '不提供绕过入口',
];

// 反向 guardrail：这些一律不得出现（KPI / 图表 / 推荐卡 / 批量放款）。
// 注意：底部 shield 宣示句本身含「没有 AI 推荐卡」字样——检查前先剔除该句，
// 否则宣示句会把自己判成违规（宣示 ≠ 存在）。
const SHIELD_SENTENCE =
  '这里 没有 AI 推荐卡——只有条件是否满足。放款逐笔执行，必须消费合同、托管与披露证据；缺什么显什么，不提供绕过入口。';
const MUST_NOT = ['批量放款', '全部放款', '推荐', 'KPI'];

const browser = await chromium.launch();
let failed = false;
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto('http://127.0.0.1:3000/admin/campaigns/xg?env=delivery', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('不提供绕过入口').first().waitFor({ timeout: 30000 });
  const body = await page.textContent('body');
  for (const t of MUST_HAVE) {
    const ok = body.includes(t);
    if (!ok) failed = true;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${vp.name}] 元素在场: ${t}`);
  }
  const bodyWithoutShield = body.replace(SHIELD_SENTENCE, '').replace(/没有 AI 推荐卡/g, '');
  for (const t of MUST_NOT) {
    const bad = bodyWithoutShield.includes(t);
    if (bad) failed = true;
    console.log(`${bad ? 'FAIL' : 'PASS'} [${vp.name}] 反向 guardrail 未补: ${t}`);
  }
  // 图表/画布类元素不得出现在本环节
  const charts = await page.locator('.apexcharts-canvas, canvas, svg.recharts-surface').count();
  console.log(`${charts === 0 ? 'PASS' : 'FAIL'} [${vp.name}] 无图表元素（count=${charts}）`);
  if (charts !== 0) failed = true;
  // 横向溢出
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(`${overflow <= 0 ? 'PASS' : 'FAIL'} [${vp.name}] 无横向溢出（${overflow}px）`);
  if (overflow > 0) failed = true;
  await page.close();
}
await browser.close();
console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: ALL PASS');
process.exit(failed ? 1 : 0);
