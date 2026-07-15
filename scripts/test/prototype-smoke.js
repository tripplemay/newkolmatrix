/* 运行时回归测试：真的执行原型脚本，遍历每个页面 / 每个项目 / 每个环节 / 关键动作。
   node --check 只验语法 —— 这次「画布全空」是 TDZ(ReferenceError)，语法检查抓不到。 */
const fs = require('fs');
const P = require('path').join(__dirname, '../../docs/product/interaction-prototype.html');
const script = fs.readFileSync(P, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];

const camel = s => s.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function mkEl() {
  const el = { _html: '', style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false } },
    appendChild(c){ this._html += (c && c._html) || ''; return c }, remove(){},
    addEventListener(){}, querySelector(){ return mkEl() }, querySelectorAll(){ return [] },
    closest(){ return null }, focus(){}, setAttribute(){}, getAttribute(){ return null },
    get innerHTML(){ return this._html }, set innerHTML(v){ this._html = String(v) },
    get textContent(){ return this._html }, set textContent(v){ this._html = String(v) },
    scrollHeight: 20, scrollTop: 0, onclick: null };
  return el;
}
const canvas = mkEl(), msgs = mkEl(), roleSwitch = mkEl();
const els = { '#canvas': canvas, '#msgs': msgs, '#role-switch': roleSwitch };
let roleClick = null;
roleSwitch.addEventListener = (t, fn) => { if (t === 'click') roleClick = fn; };
const switchTo = id => {
  const el = { dataset: { role: id } };
  el.closest = sel => sel === '[data-role]' ? el : null;
  roleClick({ target: el });
};
const navs = ['dashboard','campaigns','brief','match','reach','delivery','insight']
  .map(n => { const e = mkEl(); e.dataset.nav = n; return e; });
let canvasClick = null;
canvas.addEventListener = (t, fn) => { if (t === 'click') canvasClick = fn; };

global.document = {
  querySelector(s){ if (!els[s]) els[s] = mkEl(); return els[s] },
  querySelectorAll(s){ return s === '.nav-item' ? navs : [] },
  createElement(){ return mkEl() },
  documentElement: { setAttribute(){}, getAttribute(){ return null } },
};
global.matchMedia = () => ({ matches: false });
global.setTimeout = fn => { try { fn && fn() } catch (e) { throw e } return 0 };
global.clearTimeout = () => {};
global.window = global;

const fails = [];
// chatOnly：纯对话动作，本就不重渲染画布，只验不抛异常
const run = (name, fn, chatOnly) => {
  canvas._html = '';
  try {
    fn();
    const n = canvas._html.length;
    if (!chatOnly && n < 120) fails.push(`${name} → 画布几乎为空（${n} 字符）`);
    else console.log(`  ✓ ${name.padEnd(38)} ${chatOnly ? '(对话动作，无异常)' : n + ' 字符'}`);
  } catch (e) { fails.push(`${name} → ${e.constructor.name}: ${e.message}`); }
};
// 合成一次 canvas 点击（data-* 事件委托）
const click = attrs => {
  const el = { dataset: {} };
  for (const k in attrs) el.dataset[camel(k)] = attrs[k];
  el.closest = sel => { const m = sel.match(/^\[data-([a-z-]+)\]$/); if (!m) return null;
    return (camel('data-' + m[1]) in el.dataset) ? el : null; };
  canvasClick({ target: el });
};

console.log('— 初始化 —');
try { new Function(script)(); }
catch (e) { console.log(`✗ INIT ${e.constructor.name}: ${e.message}\n   （这就是画布全空的原因）`); process.exit(1); }
console.log('  ✓ 脚本初始化 OK\n');

const ACCESS = {
  lead:    ['dashboard','campaigns','brief','match','reach','delivery','insight'],
  bd:      ['dashboard','campaigns','brief','match','reach','delivery'],
  finance: ['dashboard','campaigns','insight'],
};

console.log('— 三角色 × 各自可访问页面（权限过滤防线）—');
Object.keys(ACCESS).forEach(rid => {
  switchTo(rid);
  navs.filter(n => ACCESS[rid].includes(n.dataset.nav))
      .forEach(n => run(`${rid} → ${n.dataset.nav}`, () => n.onclick()));
});
switchTo('bd');

console.log('\n— 四个项目 × 六环节（P0-1 串台防线）—');
['gsea','hsr','zzz','sky'].forEach(cid => {
  for (let st = 1; st <= 6; st++) run(`${cid} 环节 0${st}`, () => click({ 'data-camp': cid, 'data-stage-jump': String(st) }));
});

console.log('\n— 环节页 × 各项目作用域（空态防线）—');
['match','reach','delivery'].forEach(mod => {
  ['gsea','hsr','zzz','sky'].forEach(cid => {
    run(`${mod} @ ${cid}`, () => { click({ 'data-setscope': cid }); navs.find(n => n.dataset.nav === mod).onclick(); });
  });
});

console.log('\n— 关键动作 —');
click({ 'data-setscope': 'gsea' });
navs.find(n => n.dataset.nav === 'match').onclick();
run('选组合方案 a', () => click({ 'data-plan': 'a' }));
run('展开审计', () => click({ 'data-audit': '1' }));
run('推翻规则 0（做实）', () => click({ 'data-overrule': '0' }));
run('恢复规则 0', () => click({ 'data-overrule': '0' }));
run('抽样审计', () => click({ 'data-sample': '1' }), true);
run('切库规模 m10', () => click({ 'data-lib': 'm10' }));
run('切库规模 m30', () => click({ 'data-lib': 'm30' }));
run('切库规模 now', () => click({ 'data-lib': 'now' }));
run('知识库上传（做实）', () => { navs.find(n => n.dataset.nav === 'brief').onclick(); click({ 'data-upload': '1' }); });
run('标记终稿可发布', () => click({ 'data-mark-pub': 'hsr' }));
run('回收未领取 key', () => click({ 'data-reclaim': 'gsea' }));
run('采纳复盘', () => click({ 'data-retro': 'sky' }));
run('KOL 档案', () => click({ 'data-profile': '1' }));
run('返回锚点', () => click({ 'data-backto': 'gsea:4' }));
run('驾驶舱（待办闭环后）', () => navs[0].onclick());

// ---- 交接链回归：提交 → 待批 → 退回 → 重提 → 批准 ----
console.log('\n— 交接链（角色体系）—');
switchTo('lead');
run('营销负责人：驾驶舱见待批交接', () => navs[0].onclick());
const leadSeesHandoff = canvas._html.includes('需要你决策的交接') && canvas._html.includes('报价确认');
if (!leadSeesHandoff) fails.push('营销负责人驾驶舱 → 看不到待批交接单');
else console.log('  ✓ 营销负责人看到待批交接单（含发起人→待办人责任链）');

run('退回并注明原因（开弹窗）', () => click({ 'data-return': 'AP-0' }), true);
// 退回走 modal，需点确认
const okBtn = els['#modal-ok'];
if (okBtn && okBtn.onclick) okBtn.onclick();
switchTo('bd');
run('BD：驾驶舱见被退回单', () => navs[0].onclick());
const bdSeesReturn = canvas._html.includes('被退回') && canvas._html.includes('预算超出');
if (!bdSeesReturn) fails.push('BD 驾驶舱 → 看不到被退回单与原因');
else console.log('  ✓ BD 收到退回单 + 退回原因（球被打回来了）');

run('BD：修改后重新提交', () => click({ 'data-resubmit': 'AP-0' }));
switchTo('lead');
run('营销负责人：批准', () => { navs[0].onclick(); click({ 'data-approve': 'AP-0' }); });
// 断言 AP-0 这一条消失（其它待批单可能还在 —— 前面「选组合方案」已触发 AP-1 提交，那是对的）
if (canvas._html.includes('报价确认')) fails.push('批准后 AP-0 仍在待办 → 交接链没闭环');
else console.log('  ✓ 批准后该交接单从待办消失（闭环）');
if (canvas._html.includes('组合方案')) console.log('  ✓ 组合方案 AP-1 仍待批（BD 选 $9,800 方案超阈值自动提交 → 交接链生效）');
switchTo('bd');

// ---- 闸门归属断言：不是我的闸门 → 不给按钮 ----
console.log('\n— 闸门归属（角色化最直接的收益）—');
switchTo('bd');
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '4' });
const bdHtml = canvas._html;
if (bdHtml.includes('data-gate="payout"')) fails.push('BD 不该有放款按钮，但画布里有');
else if (!bdHtml.includes('待财务放款')) fails.push('BD 应看到「待财务放款」，但没有');
else console.log('  ✓ BD 看到「待财务放款」而非放款按钮');
switchTo('finance');
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '4' });
if (!canvas._html.includes('data-gate="payout"')) fails.push('财务应有放款按钮，但没有');
else console.log('  ✓ 财务拿到放款按钮');
switchTo('bd');

// ---- 权限守卫回归（用户实测发现的 bug：财务能在六环节选组合方案）----
console.log('\n— 权限守卫（用户实测 bug 的防线）—');
switchTo('finance');
// ① 财务不该能从画布里的 data-goto 溜进 match（守卫必须在 renderModule，不能只在侧栏）
canvas._html = '';
click({ 'data-goto': 'match', 'data-scope': 'gsea' });
if (canvas._html.includes('组合方案') && canvas._html.includes('data-plan'))
  fails.push('财务经 data-goto 进入了 Match 页 → 权限守卫没装在 renderModule');
else console.log('  ✓ 财务无法经 data-goto 溜进 Match');

// ② 财务看六环节 03（智能匹配）：可以看，但不能有「选择此方案」按钮
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '3' });
const fin3 = canvas._html;
if (/data-plan=/.test(fin3)) fails.push('财务在六环节 03 里拿到了可点的方案卡');
else console.log('  ✓ 财务在环节 03 看不到可选的方案卡');
// 「待 XXX 推进」只出现在【当前】环节（过去的环节没人推进）—— gsea 停在 04，owner=bd
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '4' });
if (!canvas._html.includes('待KOL BD')) fails.push('财务在当前环节 04 应看到「待KOL BD 推进」');
else console.log('  ✓ 财务在当前环节 04 看到「待KOL BD 推进」而非推进按钮');

// ③ 财务不该能推进任何环节
[1, 2, 3, 4, 5].forEach(st => {
  canvas._html = '';
  click({ 'data-camp': 'gsea', 'data-stage-jump': String(st) });
  if (/data-advance/.test(canvas._html)) fails.push(`财务在环节 0${st} 拿到了推进按钮`);
});
console.log('  ✓ 财务在所有环节都没有推进按钮');

// ④ 财务不该能标记终稿可发布（那是 BD 的闸门）
switchTo('finance');
canvas._html = '';
click({ 'data-camp': 'hsr', 'data-stage-jump': '5' });
if (/data-mark-pub/.test(canvas._html)) fails.push('财务拿到了「标记终稿可发布」（应属 BD）');
else console.log('  ✓ 财务没有「标记终稿可发布」按钮');

// ⑤ 反向：【当前】环节的 owner 必须拿到推进按钮（推进权 = owner 专属）
switchTo('lead');
canvas._html = '';
click({ 'data-camp': 'sky', 'data-stage-jump': '6' });    // sky 停在 06，owner = lead
// 顺序无关：要么有可执行动作，要么已完成（前面测试可能已采纳复盘）；但绝不能是「待 XXX」
if (/待.*采纳/.test(canvas._html)) fails.push('营销负责人在其 owner 环节 06 却被挡成「待 XXX 采纳」');
else console.log('  ✓ 营销负责人在 owner 环节 06 不会被挡（有动作或已完成）');
switchTo('finance');
canvas._html = '';
click({ 'data-camp': 'sky', 'data-stage-jump': '6' });
if (/data-retro=/.test(canvas._html)) fails.push('财务拿到了「采纳复盘」（应属营销负责人）');
else console.log('  ✓ 财务没有「采纳复盘」按钮');
switchTo('bd');
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '4' });   // gsea 停在 04，owner = bd
if (!/data-advance/.test(canvas._html)) fails.push('BD 在其 owner 的当前环节 04 没有推进按钮');
else console.log('  ✓ BD 在 owner 的当前环节 04 拿到推进按钮');
// 反向再验：BD 不该有放款（那是财务的）
if (/data-gate="payout"/.test(canvas._html)) fails.push('BD 在环节 04 拿到了放款按钮');
else console.log('  ✓ BD 在环节 04 没有放款按钮（结算属财务）');
switchTo('bd');

// ---- P0-1 串台断言：某项目的画布绝不能出现别的项目的创作者/批次 ----
console.log('\n— 串台断言（根因 A 防线）—');
// 只列「项目专属实体」：完整 handle + key 批次。
// 不列市场名（越南/东南亚是共享市场），也不列创作者简称 —— 关系资产的本意就是跨项目复用创作者，
// 复盘里的「复用 Ayu + Maya」是特性不是 bug。
const GSEA_ONLY = ['AyuGaming', 'GachaQueen', 'MayaPlays', 'เกมเมอร์มายด์', 'GSEA-Q2-KEY-01'];
const HSR_ONLY  = ['ミコGAMING', 'ゆかりStream', '하늘Play', 'HSR-JP-KEY-03'];
const leak = (name, render, forbidden) => {
  canvas._html = '';
  try { render(); } catch (e) { fails.push(`${name} → ${e.message}`); return; }
  const hit = forbidden.filter(w => canvas._html.includes(w));
  if (hit.length) fails.push(`${name} → 串台！画布出现了不属于本项目的：${hit.join(', ')}`);
  else console.log(`  ✓ ${name.padEnd(38)} 无串台`);
};
[2, 3, 4, 5, 6].forEach(st =>
  leak(`hsr 环节 0${st} 不含 gsea 数据`, () => click({ 'data-camp': 'hsr', 'data-stage-jump': String(st) }), GSEA_ONLY));
[2, 3, 4, 5, 6].forEach(st =>
  leak(`sky 环节 0${st} 不含 gsea 数据`, () => click({ 'data-camp': 'sky', 'data-stage-jump': String(st) }), GSEA_ONLY));
[2, 3, 4, 5].forEach(st =>
  leak(`zzz 环节 0${st} 不含 gsea 数据`, () => click({ 'data-camp': 'zzz', 'data-stage-jump': String(st) }), GSEA_ONLY));
leak('delivery@gsea 不含 hsr 数据', () => { click({ 'data-setscope': 'gsea' }); navs.find(n => n.dataset.nav === 'delivery').onclick(); }, HSR_ONLY);
leak('delivery@hsr 不含 gsea 数据', () => { click({ 'data-setscope': 'hsr' }); navs.find(n => n.dataset.nav === 'delivery').onclick(); }, GSEA_ONLY);

console.log('');
if (fails.length) { console.log(`✗ ${fails.length} 处失败：`); fails.forEach(f => console.log('   ' + f)); process.exit(1); }
console.log('✓ 全部通过 —— 无运行时异常；每页每环节有产出；无跨项目串台');
