// M2-C F002 验收探针 — 弹层交互实测（前置：standalone 已起在 :3000，伪网关凭据）。
// 视口 1：1512x982（基线视口）完整创建动线；视口 2：1024x768 弹层可用性。
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const results = [];
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} - ${name}`);

const browser = await chromium.launch();

// ---- 视口 1：桌面完整动线 ----
{
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
  await page.goto(`${BASE}/admin/campaigns`, { waitUntil: 'domcontentloaded' });
  await page.getByText('只做进入').first().waitFor({ timeout: 30000 });

  const btn = page.getByRole('button', { name: '新建项目' });
  ok('页头「新建项目」按钮可见', await btn.isVisible());
  await btn.click();

  const dialog = page.getByRole('dialog', { name: '新建项目' });
  await dialog.waitFor({ timeout: 5000 });
  ok('弹层 role=dialog 打开', await dialog.isVisible());
  ok('名称输入框在场', await dialog.locator('input').first().isVisible());
  const select = dialog.locator('select');
  ok('游戏下拉在场', await select.isVisible());
  const optCount = await select.locator('option').count();
  ok(`游戏下拉含空选项+游戏（option 数=${optCount}，期望 5=1 空 + 4 游戏）`, optCount === 5);

  // 空名提交 → toast 拦截，不发请求
  let posted = false;
  page.on('request', (r) => { if (r.url().includes('/api/projects') && r.method() === 'POST') posted = true; });
  await dialog.getByRole('button', { name: /创建并进入 Brief/ }).click();
  await page.getByText('请填写项目名').waitFor({ timeout: 5000 });
  ok('空名提交 → toast「请填写项目名」+ 未发 POST', !posted);

  // 填名创建 → 成功 toast + 跳详情
  await dialog.locator('input').first().fill('EVAL-F002-弹层动线项目');
  await dialog.locator('input').nth(1).fill('北美');
  await dialog.getByRole('button', { name: /创建并进入 Brief/ }).click();
  await page.getByText(/已创建——先在「目标 Brief」设定目标/).waitFor({ timeout: 10000 });
  ok('成功 toast 出现', true);
  await page.waitForURL(/\/admin\/campaigns\/[a-z0-9]+\?env=brief/, { timeout: 15000 });
  ok(`跳转详情 brief 起点（${page.url().replace(BASE, '')}）`, true);
  await page.close();
}

// ---- 视口 2：1024x768 弹层可用性 ----
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.goto(`${BASE}/admin/campaigns`, { waitUntil: 'domcontentloaded' });
  await page.getByText('只做进入').first().waitFor({ timeout: 30000 });
  const btn = page.getByRole('button', { name: '新建项目' });
  ok('小视口按钮可见', await btn.isVisible());
  await btn.click();
  const dialog = page.getByRole('dialog', { name: '新建项目' });
  await dialog.waitFor({ timeout: 5000 });
  const box = await dialog.boundingBox();
  ok(`小视口弹层完整入画（y=${Math.round(box.y)}, h=${Math.round(box.height)}）`,
     box.y >= 0 && box.y + box.height <= 768 && box.width <= 1024);
  // 失败 toast：注错路由造 500 → toast 显示服务端信息
  await page.route('**/api/projects', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '创建失败，请重试' }) }));
  await dialog.locator('input').first().fill('X');
  await dialog.getByRole('button', { name: /创建并进入 Brief/ }).click();
  await page.getByText('创建失败，请重试').waitFor({ timeout: 5000 });
  ok('失败 toast 显示服务端 error 信息', true);
  await page.close();
}

await browser.close();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
