// M4.7-FRONTDESK 验收（G4）— F008 前台 UI 浏览器实测探针（Evaluator 产物）
//
// 只读断言 + 运行时 DOM 观测，绝不修改产品代码 / 视觉基线。
//
// 前置（framework/patterns/testing-env-patterns.md §7）：UI 实测走 standalone 生产产物，
// 不走 `next dev`：
//     npx next build && PORT=3101 node scripts/serve-standalone.mjs
//     BASE=http://127.0.0.1:3101 node scripts/test/m47-g4-frontdesk-ui-probe.mjs
//
// 覆盖 F008 acceptance 的 UI 面（逐条独立取证，不采信 commit message）：
//   G1 环节页（?env=match）面板顶部身份与边界卡 = 前台（负向：不得是「匹配 Agent」）
//   G2 换一个环节（?env=insight）身份不变 → 「不随路由变」
//   G3 非项目路由（/admin/creators，旧映射为 match）同样是前台
//   G4 咨询痕迹 = 一行可展开：收起态可见「咨询了谁 / 读了几项」+ 三类不完整标记
//   G5 展开后细节：读取了哪些数据 / 步数 / 证据缺口 / 失败原因
//   G6 acceptance 逐词核对：收起或展开态是否呈现「问了什么」（问题正文）
//   G7 痕迹里的专家名 vs registry personaBoundary 名称是否同源

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3101';

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fails.push(name);
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
};
const note = (name, extra) => console.log(`  NOTE  ${name}${extra ? ` — ${extra}` : ''}`);

const browser = await chromium.launch();

/**
 * Copilot 面板顶部身份块（cop-head）。
 * 用**内联渐变 style** 定位——那是 cop-head 的唯一特征（渐变随 agentTheme），
 * 比 class 选择器稳（`b.block.text-[15px]` 会误命中页面里别的 <b>，首跑踩到）。
 */
async function panelHead(page) {
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => {
    const head = [...document.querySelectorAll('div')].find((d) =>
      (d.getAttribute('style') || '').includes('linear-gradient'),
    );
    if (!head) return null;
    const lines = head.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    return { name: lines[0] ?? '', sub: lines[1] ?? '', style: head.getAttribute('style') };
  });
  if (!out) throw new Error('cop-head 未找到');
  return out;
}

/** 页面上可见的边界卡文案（职责 / 边界 行）。 */
async function boundaryText(page) {
  const body = await page.locator('body').innerText();
  return body;
}

try {
  // ── G1/G2/G3 面板身份恒为前台 ──────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await ctx.newPage();

  for (const [route, label] of [
    ['/admin/campaigns/xg?env=match', 'G1 项目环节页 ?env=match'],
    ['/admin/campaigns/xg?env=insight', 'G2 项目环节页 ?env=insight'],
    ['/admin/creators', 'G3 创作者页（旧映射 = 匹配 Agent）'],
    ['/admin/campaigns/xg?env=reach', 'G2b 项目环节页 ?env=reach'],
  ]) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    const head = await panelHead(page);
    ok(
      head.name === '编排 Agent',
      `${label}：面板顶部身份 = 前台（编排 Agent）`,
      `实测「${head.name}」`,
    );
    ok(
      head.style.includes('#422AFB'),
      `${label}：cop-head 主题色 = 前台（#422AFB）`,
    );
    ok(
      !head.sub.includes('本环节专家'),
      `${label}：副标题不再宣称「本环节专家」`,
      `实测副标题「${head.sub}」`,
    );
    const body = await boundaryText(page);
    ok(
      body.includes('受理与综合·咨询专家·待办汇总') ||
        body.includes('不亲自执行环节工作；专家的结论可转述不可改写'),
      `${label}：边界卡文案 = 前台 registry 实物`,
    );
    ok(
      !body.includes('只做发现与匹配，不发起触达、不谈价') &&
        !body.includes('不改数据源、不替你拍板'),
      `${label}：边界卡不再是环节专家的（负向断言）`,
    );
  }

  // ── G4~G7 咨询痕迹 ───────────────────────────────────────────────────
  await page.goto(BASE + '/preview/agent-loop', { waitUntil: 'domcontentloaded' });
  await page.getByText('咨询了').first().waitFor({ timeout: 30_000 });
  const notes = page.locator('div:has(> button:has-text("咨询了"))');
  const n = await notes.count();
  ok(n === 3, '咨询痕迹三态样本在场', `count=${n}`);

  const collapsed = [];
  for (let i = 0; i < n; i++) collapsed.push((await notes.nth(i).innerText()).trim());
  console.log('  收起态实录：', JSON.stringify(collapsed));

  ok(
    collapsed.some((t) => t.includes('证据不足')),
    'G4 「证据不足」在收起态即可见',
  );
  ok(
    collapsed.some((t) => t.includes('咨询失败')),
    'G4 「咨询失败」在收起态即可见',
  );
  ok(
    collapsed.every((t) => t.includes('咨询了')),
    'G4 每行都写明「咨询了谁」',
  );

  // 展开第 2 条（证据不足态）
  await notes.nth(1).locator('button').click();
  const expanded1 = (await notes.nth(1).innerText()).trim();
  console.log('  展开态实录（证据不足）：', JSON.stringify(expanded1));
  ok(expanded1.includes('读取：'), 'G5 展开后列出「读了哪些数据」（工具名）');
  ok(expanded1.includes('步数：'), 'G5 展开后给出步数');
  ok(expanded1.includes('证据缺口'), 'G5 展开后给出证据缺口原文');

  // 展开第 3 条（失败态）
  await notes.nth(2).locator('button').click();
  const expanded2 = (await notes.nth(2).innerText()).trim();
  console.log('  展开态实录（失败）：', JSON.stringify(expanded2));
  ok(expanded2.includes('没拿到结果'), 'G5 失败态展开给出失败原因');

  // G6：acceptance 写的是「咨询了谁 · 问了什么 · 读了哪些数据」——逐词核对
  const anyQuestion = [...collapsed, expanded1, expanded2].some(
    (t) => t.includes('问了') || t.includes('问题：') || t.includes('提问'),
  );
  ok(anyQuestion, 'G6 痕迹呈现「问了什么」（acceptance 三要素之一）');

  // G7：专家名是否与 registry personaBoundary 同源
  const REGISTRY_NAMES = ['匹配 Agent', '洞察 Agent', '合规 Agent'];
  const usesRegistryNames = REGISTRY_NAMES.some((x) =>
    collapsed.some((t) => t.includes(x)),
  );
  ok(usesRegistryNames, 'G7 痕迹里的专家名 = registry personaBoundary 实物');
  note(
    'G7 实测名称',
    collapsed.map((t) => t.split('·')[0].trim()).join(' | '),
  );

  // G8：「未答完」（budgetHit）态在预览页/基线里有无覆盖
  ok(
    collapsed.some((t) => t.includes('未答完')),
    'G8 「未答完」态有确定性样本（视觉基线可覆盖）',
  );

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`\n[m47-g4-ui-probe] PASS=${pass} FAIL=${fails.length}`);
if (fails.length) {
  console.log('失败项：\n  - ' + fails.join('\n  - '));
}
process.exit(0); // 探针只报事实，不以退出码裁决
