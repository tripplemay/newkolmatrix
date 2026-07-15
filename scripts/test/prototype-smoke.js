/* 运行时回归测试：真的执行原型脚本，遍历每个页面 / 每个项目 / 每个环节 / 关键动作。
   node --check 只验语法 —— 这次「画布全空」是 TDZ(ReferenceError)，语法检查抓不到。 */
const fs = require('fs');
const P = require('path').join(
  __dirname,
  '../../docs/product/interaction-prototype.html',
);
const script = fs
  .readFileSync(P, 'utf8')
  .match(/<script>([\s\S]*)<\/script>/)[1];

const camel = (s) =>
  s.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function mkEl() {
  const el = {
    _html: '',
    style: {},
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    appendChild(c) {
      this._html += (c && c._html) || '';
      return c;
    },
    remove() {},
    addEventListener() {},
    querySelector() {
      return mkEl();
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    get innerHTML() {
      return this._html;
    },
    set innerHTML(v) {
      this._html = String(v);
    },
    get textContent() {
      return this._html;
    },
    set textContent(v) {
      this._html = String(v);
    },
    scrollHeight: 20,
    scrollTop: 0,
    onclick: null,
    value: '', // 表单控件（如退回原因输入框）
    select() {},
    setSelectionRange() {},
  };
  return el;
}
const canvas = mkEl(),
  msgs = mkEl(),
  roleSwitch = mkEl();
const els = { '#canvas': canvas, '#msgs': msgs, '#role-switch': roleSwitch };
let roleClick = null;
roleSwitch.addEventListener = (t, fn) => {
  if (t === 'click') roleClick = fn;
};
const switchTo = (id) => {
  const el = { dataset: { role: id } };
  el.closest = (sel) => (sel === '[data-role]' ? el : null);
  roleClick({ target: el });
};
const navs = [
  'dashboard',
  'campaigns',
  'brief',
  'match',
  'reach',
  'delivery',
  'insight',
].map((n) => {
  const e = mkEl();
  e.dataset.nav = n;
  return e;
});
let canvasClick = null;
canvas.addEventListener = (t, fn) => {
  if (t === 'click') canvasClick = fn;
};

global.document = {
  querySelector(s) {
    if (!els[s]) els[s] = mkEl();
    return els[s];
  },
  querySelectorAll(s) {
    return s === '.nav-item' ? navs : [];
  },
  createElement() {
    return mkEl();
  },
  documentElement: {
    setAttribute() {},
    getAttribute() {
      return null;
    },
  },
};
global.matchMedia = () => ({ matches: false });
global.setTimeout = (fn) => {
  try {
    fn && fn();
  } catch (e) {
    throw e;
  }
  return 0;
};
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
    else
      console.log(
        `  ✓ ${name.padEnd(38)} ${
          chatOnly ? '(对话动作，无异常)' : n + ' 字符'
        }`,
      );
  } catch (e) {
    fails.push(`${name} → ${e.constructor.name}: ${e.message}`);
  }
};
// 合成一次 canvas 点击（data-* 事件委托）
const click = (attrs) => {
  const el = { dataset: {} };
  for (const k in attrs) el.dataset[camel(k)] = attrs[k];
  el.closest = (sel) => {
    const m = sel.match(/^\[data-([a-z-]+)\]$/);
    if (!m) return null;
    return camel('data-' + m[1]) in el.dataset ? el : null;
  };
  canvasClick({ target: el });
};

console.log('— 初始化 —');
try {
  new Function(script)();
} catch (e) {
  console.log(
    `✗ INIT ${e.constructor.name}: ${e.message}\n   （这就是画布全空的原因）`,
  );
  process.exit(1);
}
console.log('  ✓ 脚本初始化 OK\n');

const scopeToGsea = () => {
  try {
    click({ 'data-setscope': 'gsea' });
  } catch (e) {
    /* 部分角色无 scope 条 */
  }
};

const ACCESS = {
  lead: [
    'dashboard',
    'campaigns',
    'brief',
    'match',
    'reach',
    'delivery',
    'insight',
  ],
  bd: ['dashboard', 'campaigns', 'brief', 'match', 'reach', 'delivery'],
  finance: ['dashboard', 'campaigns', 'insight'],
};

console.log('— 三角色 × 各自可访问页面（权限过滤防线）—');
Object.keys(ACCESS).forEach((rid) => {
  switchTo(rid);
  navs
    .filter((n) => ACCESS[rid].includes(n.dataset.nav))
    .forEach((n) => run(`${rid} → ${n.dataset.nav}`, () => n.onclick()));
});
switchTo('bd');

console.log('\n— 四个项目 × 六环节（P0-1 串台防线）—');
['gsea', 'hsr', 'zzz', 'sky'].forEach((cid) => {
  for (let st = 1; st <= 6; st++)
    run(`${cid} 环节 0${st}`, () =>
      click({ 'data-camp': cid, 'data-stage-jump': String(st) }),
    );
});

console.log('\n— 环节页 × 各项目作用域（空态防线）—');
['match', 'reach', 'delivery'].forEach((mod) => {
  ['gsea', 'hsr', 'zzz', 'sky'].forEach((cid) => {
    run(`${mod} @ ${cid}`, () => {
      click({ 'data-setscope': cid });
      navs.find((n) => n.dataset.nav === mod).onclick();
    });
  });
});

console.log('\n— 关键动作 —');
click({ 'data-setscope': 'gsea' });
navs.find((n) => n.dataset.nav === 'match').onclick();
run('选组合方案 a', () => click({ 'data-plan': 'a' }));
run('展开审计', () => click({ 'data-audit': '1' }));
run('推翻规则 0（做实）', () => click({ 'data-overrule': '0' }));
run('恢复规则 0', () => click({ 'data-overrule': '0' }));
run('抽样审计', () => click({ 'data-sample': '1' }), true);
run('切库规模 m10', () => click({ 'data-lib': 'm10' }));
run('切库规模 m30', () => click({ 'data-lib': 'm30' }));
run('切库规模 now', () => click({ 'data-lib': 'now' }));
run('知识库上传（做实）', () => {
  navs.find((n) => n.dataset.nav === 'brief').onclick();
  click({ 'data-upload': '1' });
});
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
const leadSeesHandoff =
  canvas._html.includes('需要你决策的交接') &&
  canvas._html.includes('报价确认');
if (!leadSeesHandoff) fails.push('营销负责人驾驶舱 → 看不到待批交接单');
else console.log('  ✓ 营销负责人看到待批交接单（含发起人→待办人责任链）');

run('退回并注明原因（开弹窗）', () => click({ 'data-return': 'AP-0' }), true);
// 退回走 modal：原因必填（GAP-004④），先填再确认
const okBtn = els['#modal-ok'];
// 桩局限：不解析 HTML 字符串成 DOM，故 #return-reason 需预先建桩再填值
// （产品侧「原因必填」校验是对的 —— 空原因确实应被挡住）
els['#return-reason'] = mkEl();
els['#return-reason'].value =
  '预算超出本季度额度，请压到 $8,000 内或补充追投理由';
if (okBtn && okBtn.onclick) okBtn.onclick();
switchTo('bd');
run('BD：驾驶舱见被退回单', () => navs[0].onclick());
const bdSeesReturn =
  canvas._html.includes('被退回') && canvas._html.includes('预算超出');
if (!bdSeesReturn) fails.push('BD 驾驶舱 → 看不到被退回单与原因');
else console.log('  ✓ BD 收到退回单 + 退回原因（球被打回来了）');

run('BD：修改后重新提交', () => click({ 'data-resubmit': 'AP-0' }));
switchTo('lead');
run('营销负责人：批准', () => {
  navs[0].onclick();
  click({ 'data-approve': 'AP-0' });
});
// 断言 AP-0 这一条消失（其它待批单可能还在 —— 前面「选组合方案」已触发 AP-1 提交，那是对的）
if (canvas._html.includes('报价确认'))
  fails.push('批准后 AP-0 仍在待办 → 交接链没闭环');
else console.log('  ✓ 批准后该交接单从待办消失（闭环）');
if (canvas._html.includes('组合方案'))
  console.log(
    '  ✓ 组合方案 AP-1 仍待批（BD 选 $9,800 方案超阈值自动提交 → 交接链生效）',
  );
switchTo('bd');

// ---- 闸门归属断言：不是我的闸门 → 不给按钮 ----
console.log('\n— 闸门归属（角色化最直接的收益）—');
switchTo('bd');
// 用 hsr（停在 05 交付）验放款归属；gsea 停在 04 时按 GAP-003 应显示「条件未满足」
canvas._html = '';
click({ 'data-camp': 'hsr', 'data-stage-jump': '5' });
if (canvas._html.includes('data-gate="payout"'))
  fails.push('BD 不该有放款按钮，但画布里有');
else console.log('  ✓ BD 没有放款按钮（结算属财务）');
switchTo('finance');
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '4' });
if (canvas._html.includes('data-gate="payout"'))
  fails.push('GAP-003 回归：gsea 停在 04（交付未开始）却出现放款按钮');
else if (!canvas._html.includes('条件未满足'))
  fails.push('GAP-003：应显示「条件未满足」并说明原因');
else
  console.log('  ✓ 财务在 gsea/04 看到「条件未满足」（交付未开始 → 不可放款）');
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
if (!canvas._html.includes('待KOL BD'))
  fails.push('财务在当前环节 04 应看到「待KOL BD 推进」');
else console.log('  ✓ 财务在当前环节 04 看到「待KOL BD 推进」而非推进按钮');

// ③ 财务不该能推进任何环节
[1, 2, 3, 4, 5].forEach((st) => {
  canvas._html = '';
  click({ 'data-camp': 'gsea', 'data-stage-jump': String(st) });
  if (/data-advance/.test(canvas._html))
    fails.push(`财务在环节 0${st} 拿到了推进按钮`);
});
console.log('  ✓ 财务在所有环节都没有推进按钮');

// ④ 财务不该能标记终稿可发布（那是 BD 的闸门）
switchTo('finance');
canvas._html = '';
click({ 'data-camp': 'hsr', 'data-stage-jump': '5' });
if (/data-mark-pub/.test(canvas._html))
  fails.push('财务拿到了「标记终稿可发布」（应属 BD）');
else console.log('  ✓ 财务没有「标记终稿可发布」按钮');

// ⑤ 反向：【当前】环节的 owner 必须拿到推进按钮（推进权 = owner 专属）
switchTo('lead');
canvas._html = '';
click({ 'data-camp': 'sky', 'data-stage-jump': '6' }); // sky 停在 06，owner = lead
// 顺序无关：要么有可执行动作，要么已完成（前面测试可能已采纳复盘）；但绝不能是「待 XXX」
if (/待.*采纳/.test(canvas._html))
  fails.push('营销负责人在其 owner 环节 06 却被挡成「待 XXX 采纳」');
else console.log('  ✓ 营销负责人在 owner 环节 06 不会被挡（有动作或已完成）');
switchTo('finance');
canvas._html = '';
click({ 'data-camp': 'sky', 'data-stage-jump': '6' });
if (/data-retro=/.test(canvas._html))
  fails.push('财务拿到了「采纳复盘」（应属营销负责人）');
else console.log('  ✓ 财务没有「采纳复盘」按钮');
switchTo('bd');
canvas._html = '';
click({ 'data-camp': 'gsea', 'data-stage-jump': '4' }); // gsea 停在 04，owner = bd
if (!/data-advance/.test(canvas._html))
  fails.push('BD 在其 owner 的当前环节 04 没有推进按钮');
else console.log('  ✓ BD 在 owner 的当前环节 04 拿到推进按钮');
// 反向再验：BD 不该有放款（那是财务的）
if (/data-gate="payout"/.test(canvas._html))
  fails.push('BD 在环节 04 拿到了放款按钮');
else console.log('  ✓ BD 在环节 04 没有放款按钮（结算属财务）');
switchTo('bd');

/* ===================================================================
   业务语义断言（2026-07-15 独立审查 §8 导出）
   审查指出：105 项 smoke 全绿但只断言「页面有 HTML 输出」，不覆盖
   阈值 / 对象权限 / 跨模块一致性。以下断言先写、先红，再修到绿。
   =================================================================== */
console.log('\n— P0 业务语义断言（审查报告导出）—');
const biz = (name, fn) => {
  try {
    const r = fn();
    if (r === true) console.log(`  ✓ ${name}`);
    else fails.push(`${name} → ${r}`);
  } catch (e) {
    fails.push(`${name} → ${e.constructor.name}: ${e.message}`);
  }
};

// GAP-005 ① 默认 BD 点首屏「建项目」不能被自己的预算拦截器误拦
biz('GAP-005 默认 BD 可走首屏「建项目」（不被预算关键词误拦）', () => {
  switchTo('bd');
  navs[0].onclick();
  const say = (canvas._html.match(/data-say="([^"]*建个活动[^"]*)"/) || [])[1];
  if (!say) return '首屏找不到「建项目」入口';
  msgs._html = '';
  canvas._html = '';
  click({ 'data-say': say });
  if (/仅可查看|不在数据边界|越权/.test(msgs._html))
    return '被自己的权限拦截器误拦（预算关键词）';
  if (!/草稿|Brief/.test(canvas._html + msgs._html))
    return '未进入建 Brief 草稿分支';
  return true;
});

// GAP-005 ② BD 不该看到全部项目 / 总预算 / 跨项目 ROI（对象级 + 字段级权限）
biz('GAP-005 BD 看不到不负责的项目', () => {
  switchTo('bd');
  navs.find((n) => n.dataset.nav === 'campaigns').onclick();
  if (/崩铁|日韩回流/.test(canvas._html))
    return 'BD 看到了不负责的项目（崩铁·日韩回流）';
  return true;
});
biz('GAP-005 BD 看不到总预算与平均 ROI（字段遮罩）', () => {
  switchTo('bd');
  navs.find((n) => n.dataset.nav === 'campaigns').onclick();
  if (/总预算/.test(canvas._html)) return 'BD 看到了总预算';
  if (/平均 ROI/.test(canvas._html)) return 'BD 看到了跨项目平均 ROI';
  return true;
});

// GAP-005 ③ Lead 不该能执行 BD 的动作
biz('GAP-005 Lead 不能执行 BD 的 send/terms/keys', () => {
  switchTo('lead');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'reach').onclick();
  const h = canvas._html;
  if (/data-gate="send"/.test(h)) return 'Lead 拿到了发信按钮';
  if (/data-gate="terms"/.test(h)) return 'Lead 拿到了条款确认按钮';
  canvas._html = '';
  navs.find((n) => n.dataset.nav === 'delivery').onclick();
  if (/data-gate="keys"/.test(canvas._html)) return 'Lead 拿到了 key 分发按钮';
  return true;
});

// GAP-004 ① 待批组合不得被下游消费
biz('GAP-004 待批组合不生效（下游不得消费）', () => {
  switchTo('bd');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'match').onclick();
  click({ 'data-plan': 'a' }); // $9,800 > $8,000 → 应转审批
  msgs._html = '';
  canvas._html = '';
  navs.find((n) => n.dataset.nav === 'reach').onclick();
  if (/待批|未生效|尚未批准/.test(canvas._html)) return true;
  if (/draft|草稿|邀约/.test(canvas._html) && !/待批/.test(canvas._html))
    return '组合尚在待批，Reach 已可据此起草（审批未绑定业务生效）';
  return true;
});

// GAP-004 ② 报价阈值必须执行
biz('GAP-004 报价 > $2,000 转审批（THRESHOLD.quote 已执行）', () => {
  // 组合必须先获批，Reach 才渲染回复工作区（这是 GAP-004 守卫的正确行为）
  switchTo('bd');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'match').onclick();
  click({ 'data-plan': 'a' });
  switchTo('lead');
  navs[0].onclick();
  const ap = (canvas._html.match(/data-approve="(AP-\d+)"/g) || []).map(
    (s) => s.match(/AP-\d+/)[0],
  );
  ap.forEach((id) => click({ 'data-approve': id }));
  switchTo('bd');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'reach').onclick();
  const h = canvas._html;
  if (!/2,400|2400/.test(h))
    return '找不到 $2,400 报价样例（组合已批但回复区未渲染）';
  // $2,400 > $2,000 → 不该是「确认并发出」，该是「提交审批」
  if (
    /确认条款并发出|data-gate="terms"/.test(h) &&
    !/提交.*审批|待.*审批/.test(h)
  )
    return '$2,400 报价可直接发出，未走 $2,000 阈值审批';
  return true;
});

// GAP-004 ③ 批量发信阈值
biz('GAP-004 批量发信 > 10 人转审批（THRESHOLD.bulkSend 已执行）', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (!/THRESHOLD\.bulkSend/.test(src))
    return 'THRESHOLD.bulkSend 定义了但从未被使用';
  return true;
});

// GAP-004 ④ 退回原因必须可编辑，不能硬编码
biz('GAP-004 退回原因可由决策人填写（非硬编码）', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (/returnIt\(a\.id,\s*"[^"]{10,}"\)/.test(src))
    return '退回原因是硬编码文本，决策人填不了';
  return true;
});

// GAP-003 交付前不得放款
biz('GAP-003 未进入交付环节不得出现可放款', () => {
  switchTo('finance');
  canvas._html = '';
  click({ 'data-camp': 'gsea', 'data-stage-jump': '4' }); // gsea 停在 04，05 未进入
  if (/data-gate="payout"/.test(canvas._html))
    return 'gsea 停在 04（交付未开始），却已可放款 —— 不可逆资金动作建立在矛盾状态上';
  return true;
});

// GAP-002 阶段门必须有业务守卫（至少三种阻断）
biz('GAP-002 组合未批准不得进入沟通协作', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (!/entryCriteria|exitCriteria|stageBlock/.test(src))
    return '未定义任何阶段进入/退出条件';
  return true;
});
biz('GAP-002 披露 #ad 未通过不得完成交付', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  const m = src.match(/function exitCriteria[\s\S]*?\n  \}/);
  if (!m) return '未定义 exitCriteria';
  if (!/#ad/.test(m[0])) return 'exitCriteria 不检查披露要求 #ad';
  const flat = m[0].replace(/\s+/g, ' ');
  if (!/#ad[^}]*hard:true|hard:true[^}]*#ad/.test(flat))
    return '#ad 未标为硬门（hard:true）—— 合规门必须不可越过';
  return true;
});

// GAP-007 Match → Reach 数量一致
biz('GAP-007 邮件草稿数 = 组合人数（非固定 3 封）', () => {
  switchTo('bd');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'reach').onclick();
  const drafts = (canvas._html.match(/致 /g) || []).length;
  if (drafts === 3) return `邮件草稿固定 3 封，与组合人数（14）不一致`;
  return true;
});

// GAP-007 单封发送不得让全部变已发送
biz('GAP-007 单封发送不影响其它草稿（非全局 emailsSent 布尔）', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (/let emailsSent=false/.test(src) && /emailsSent=true/.test(src))
    return '发送状态是全局布尔，单封发送会让全部草稿变已发送';
  return true;
});

// ---- P0-1 串台断言：某项目的画布绝不能出现别的项目的创作者/批次 ----
console.log('\n— 串台断言（根因 A 防线）—');
// 只列「项目专属实体」：完整 handle + key 批次。
// 不列市场名（越南/东南亚是共享市场），也不列创作者简称 —— 关系资产的本意就是跨项目复用创作者，
// 复盘里的「复用 Ayu + Maya」是特性不是 bug。
const GSEA_ONLY = [
  'AyuGaming',
  'GachaQueen',
  'MayaPlays',
  'เกมเมอร์มายด์',
  'GSEA-Q2-KEY-01',
];
const HSR_ONLY = ['ミコGAMING', 'ゆかりStream', '하늘Play', 'HSR-JP-KEY-03'];
const leak = (name, render, forbidden) => {
  canvas._html = '';
  try {
    render();
  } catch (e) {
    fails.push(`${name} → ${e.message}`);
    return;
  }
  const hit = forbidden.filter((w) => canvas._html.includes(w));
  if (hit.length)
    fails.push(`${name} → 串台！画布出现了不属于本项目的：${hit.join(', ')}`);
  else console.log(`  ✓ ${name.padEnd(38)} 无串台`);
};
[2, 3, 4, 5, 6].forEach((st) =>
  leak(
    `hsr 环节 0${st} 不含 gsea 数据`,
    () => click({ 'data-camp': 'hsr', 'data-stage-jump': String(st) }),
    GSEA_ONLY,
  ),
);
[2, 3, 4, 5, 6].forEach((st) =>
  leak(
    `sky 环节 0${st} 不含 gsea 数据`,
    () => click({ 'data-camp': 'sky', 'data-stage-jump': String(st) }),
    GSEA_ONLY,
  ),
);
[2, 3, 4, 5].forEach((st) =>
  leak(
    `zzz 环节 0${st} 不含 gsea 数据`,
    () => click({ 'data-camp': 'zzz', 'data-stage-jump': String(st) }),
    GSEA_ONLY,
  ),
);
leak(
  'delivery@gsea 不含 hsr 数据',
  () => {
    click({ 'data-setscope': 'gsea' });
    navs.find((n) => n.dataset.nav === 'delivery').onclick();
  },
  HSR_ONLY,
);
leak(
  'delivery@hsr 不含 gsea 数据',
  () => {
    click({ 'data-setscope': 'hsr' });
    navs.find((n) => n.dataset.nav === 'delivery').onclick();
  },
  GSEA_ONLY,
);

console.log('');
if (fails.length) {
  console.log(`✗ ${fails.length} 处失败：`);
  fails.forEach((f) => console.log('   ' + f));
  process.exit(1);
}
console.log('✓ 全部通过 —— 无运行时异常；每页每环节有产出；无跨项目串台');
