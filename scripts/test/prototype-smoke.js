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
const canvas = mkEl(), msgs = mkEl();
const els = { '#canvas': canvas, '#msgs': msgs };
// 单角色架构：角色切换器已删。switchTo 保留为空操作 —— 调用点留在原地，
// 让「这条断言曾经在测角色」这件事在 diff 里看得见。
const switchTo = () => {};
// IA 收敛后侧栏只剩 4 项 —— 环节不再是导航项，只存在于项目空间内部
const navs = ['dashboard', 'games', 'campaigns', 'insight'].map((n) => {
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

const getStage = (cid) => global.__stageOf && global.__stageOf(cid);
// 新 IA：环节只能从项目空间进入 —— 没有「去 Match 页」这回事了
const goStage = (cid, n) =>
  click({ 'data-camp': cid, 'data-stage-jump': String(n) });
const scopeToGsea = () => goStage('gsea', 4);

const ACCESS = {
  lead: ['dashboard', 'games', 'campaigns', 'insight'],
  bd: ['dashboard', 'games', 'campaigns'],
  finance: ['dashboard', 'campaigns', 'insight'],
};

console.log('— 单角色 × 全部页面（侧栏 4 项）—');
navs.forEach((nv) => run(`→ ${nv.dataset.nav}`, () => nv.onclick()));

console.log('\n— 四个项目 × 六环节（P0-1 串台防线）—');
['gsea', 'hsr', 'zzz', 'sky'].forEach((cid) => {
  for (let st = 1; st <= 6; st++)
    run(`${cid} 环节 0${st}`, () =>
      click({ 'data-camp': cid, 'data-stage-jump': String(st) }),
    );
});

console.log('\n— 关键动作 —');
switchTo('bd');
click({ 'data-setscope': 'gsea' });
goStage('gsea', 3);
run('选组合方案 a', () => click({ 'data-plan': 'a' }));
run('展开审计', () => click({ 'data-audit': '1' }));
run('推翻规则 0（做实）', () => click({ 'data-overrule': '0' }));
run('恢复规则 0', () => click({ 'data-overrule': '0' }));
run('抽样审计', () => click({ 'data-sample': '1' }), true);
run('切库规模 m10', () => click({ 'data-lib': 'm10' }));
run('切库规模 m30', () => click({ 'data-lib': 'm30' }));
run('切库规模 now', () => click({ 'data-lib': 'now' }));
run('知识库上传（做实）', () => {
  goStage('gsea', 1);
  click({ 'data-upload': '1' });
});
run('标记终稿可发布', () => click({ 'data-mark-pub': 'hsr' }));
run('回收未领取 key', () => click({ 'data-reclaim': 'gsea' }));
run('采纳复盘', () => click({ 'data-retro': 'sky' }));
run('KOL 档案', () => click({ 'data-profile': '1' }));
// 「返回锚点」已删 —— 心流不再跳出项目，就不需要跳回来的锚点
run('驾驶舱（待办闭环后）', () => navs[0].onclick());

// ---- 交接链回归：提交 → 待批 → 退回 → 重提 → 批准 ----
/* 「交接链（提交→待批→退回→重提→批准）」整段已删。
   它测的是【人→人】的审批流 —— 组织层级的产物、传统 SaaS 最典型的特征，
   与「服务中小团队的 AI-native 工具」这个定位相反，已随三角色体系一并拆除。
   取代它的是下面的【AI→人】闸门断言。 */

console.log('\n— AI → 人 的闸门（拆掉角色后，这才是真正要守的那条线）—');
/* 单角色下「谁批谁」不存在了，但「AI 能做什么 / 人必须拍板什么」这条线更重要。
   闸门的本质从来不是上级审批下级，是【不可逆的对外动作必须有人拍板】。 */
const gateTitle = () => (els['#modal-t'] && els['#modal-t']._html) || '';
const gateBody = () => (els['#modal-p'] && els['#modal-p']._html) || '';
const clearGate = () => {
  if (els['#modal-t']) els['#modal-t']._html = '';
  if (els['#modal-p']) els['#modal-p']._html = '';
};
const gated = (name, fire, mustSay) => {
  try {
    clearGate();
    fire();
    if (!gateTitle())
      return fails.push(`${name} → 没有闸门，AI 直接做了对外不可逆的动作`);
    if (mustSay && !mustSay.test(gateTitle() + gateBody()))
      return fails.push(`${name} → 闸门没说清利害（应含 ${mustSay}）`);
    console.log(`  ✓ ${name.padEnd(30)} 有闸门「${gateTitle()}」`);
  } catch (e) {
    fails.push(`${name} → ${e.constructor.name}: ${e.message}`);
  }
};
(() => {
  if (global.__resetForTest) global.__resetForTest();
  goStage('gsea', 3);
  clearGate();
  click({ 'data-plan': 'a' });                 // 组合 = 内部决策，可改，不该有闸门
  if (gateTitle())
    fails.push('选组合弹了闸门 —— 内部可改的决策不该挡（闸门只挡对外不可逆）');
  else console.log('  ✓ 选组合（内部可改）不弹闸门 —— 闸门只挡对外不可逆');
  goStage('gsea', 4);
  gated('发单封邀约（对外）', () => click({ 'data-send-one': 'gsea|0' }), /不可撤销/);
  goStage('gsea', 4);
  gated('批量发邀约（对外）', () => click({ 'data-bulk': 'gsea' }), /不可撤销/);
  goStage('gsea', 4);
  const m = canvas._html.match(/data-gate="terms" data-ri="(\d+)"/);
  if (m)
    gated('发出报价（对外承诺）', () =>
      click({ 'data-gate': 'terms', 'data-ri': m[1], 'data-cid': 'gsea' }));
  gated('分发 key（对外）', () => {
    goStage('gsea', 5);
    click({ 'data-gate': 'keys', 'data-cid': 'gsea' });
  });
  // 放款的闸门在 E2E ⑨ 测（它需要完整前置：交付合规 + 标记可发布）。
  // 这里改测反面：条件不满足时 gatePayout 连闸门都不开 —— 它不是「弹窗问你确不确定」，
  // 而是先校验前置。这比有闸门更强：不该发生的事根本走不到确认那一步。
  (() => {
    clearGate();
    click({ 'data-gate': 'payout', 'data-cid': 'gsea', 'data-kol': 'AyuGaming', 'data-amt': '$1,800' });
    if (gateTitle())
      fails.push('交付未完成却弹出了放款确认框 —— 前置校验应该更早拦住');
    else console.log('  ✓ 放款前置未满足时不弹闸门 —— 不该发生的事走不到确认那一步');
  })();
  gated('对外分享周报链接', () => {
    navs.find((x) => x.dataset.nav === 'insight').onclick();
    click({ 'data-say': '生成本周周报' });
    click({ 'data-share-report': '1' });
  });
})();

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
/* RE-GAP-002 的正面断言：复审探针发现「Lead 直接选方案 → Reach 草稿 0 封」，
   即组合 owner 的核心路径整条不可用，只有「BD 超阈值 → Lead 批」这条偶然可走。 */
biz('RE-GAP-002 Lead（组合 owner）直接拍板 → 组合立即生效，Reach 起草', () => {
  if (global.__resetForTest) global.__resetForTest();
  switchTo('lead');
  goStage('gsea', 3);
  click({ 'data-plan': 'a' });                   // Lead 无需审批
  if (!/已选/.test(canvas._html)) return 'Lead 选完方案没有标记「已选」';
  goStage('gsea', 4);
  if (/组合待批准|尚未生效/.test(canvas._html))
    return 'Lead 是组合 owner，自己拍板却被挡在「待批准」—— 没有人能批准 owner 自己';
  const n = (canvas._html.match(/data-rel="/g) || []).length;
  if (!n) return 'Lead 直接选定组合后 Reach 起草 0 封 —— 组合没生效';
  if (n !== 14) return `草稿 ${n} 封，与方案 a 的 14 位不符`;
  return true;
});

biz('RE-GAP-002 BD 选阈值内组合（$7,400 < $8,000）→ 直接生效，不走审批', () => {
  if (global.__resetForTest) global.__resetForTest();
  switchTo('bd');
  goStage('gsea', 3);
  click({ 'data-plan': 'c' });                   // $7,400，额度内
  goStage('gsea', 4);
  if (/组合待批准/.test(canvas._html))
    return '$7,400 在 BD 的 $8,000 额度内却仍要审批 —— 那阈值就没有意义';
  const n = (canvas._html.match(/data-rel="/g) || []).length;
  if (!n) return '阈值内直接生效失败，Reach 起草 0 封';
  switchTo('lead'); navs[0].onclick();
  if (/组合方案/.test(canvas._html)) return '$7,400 不该出现在 Lead 待批队列';
  return true;
});


/* ===== IA 收敛（用户实测推翻方案 C）+ 角色化驾驶舱 ===== */
biz('IA 侧栏不再把「环节」和「项目」并列（环节不是可以去的地方）', () => {
  const navNames = navs.map((n) => n.dataset.nav);
  const stageNavs = navNames.filter((x) =>
    ['brief', 'match', 'reach', 'delivery'].includes(x),
  );
  if (stageNavs.length)
    return `侧栏仍有环节顶级入口：${stageNavs.join('/')} —— 这在结构上宣告「环节是空间、项目是筛选器」`;
  return true;
});

biz('IA 环节只能从项目空间进入（不存在跨项目环节页）', () => {
  if (global.__resetForTest) global.__resetForTest();
  switchTo('bd');
  goStage('gsea', 3);
  click({ 'data-plan': 'c' });          // 先定组合 —— 没组合就没有关系可推进
  goStage('gsea', 4);
  const inProj = canvas._html;
  if (!/data-rel="/.test(inProj)) return '项目内 04 没有渲染关系推进面';
  if (/data-setscope/.test(inProj))
    return '环节面里还有作用域切换器 —— 项目又被降格成筛选器了';
  if (/data-goto=/.test(inProj))
    return '环节面里还有跳出去的入口（工作流交叉的来源）';
  return true;
});

biz('IA 侧栏「项目」回列表，不是回上次那个项目', () => {
  switchTo('bd');
  goStage('gsea', 4);
  navs.find((n) => n.dataset.nav === 'campaigns').onclick();
  if (!/data-camp="hsr"/.test(canvas._html))
    return '点侧栏「项目」没回到项目列表（只看到上次那个项目）';
  return true;
});




biz('驾驶舱有「我的关系推进」（跨项目 · 一段关系 = 一个作业单元）', () => {
  if (global.__resetForTest) global.__resetForTest();
  switchTo('bd');
  goStage('gsea', 3);
  click({ 'data-plan': 'c' });          // $7,400 额度内 → 直接生效
  navs[0].onclick();
  const h = canvas._html;
  if (!/我的关系推进/.test(h)) return '驾驶舱没有关系推进概览';
  if (!/该谁动|等你动/.test(h)) return '关系概览没有按「该谁动」组织';
  return true;
});


/* 「作用域切换的对象级守卫」用例已删 —— data-setscope 随 IA 收敛一起消失了，
   攻击面不存在了就不该再留一条测它的断言（那会变成永远绿的空转）。
   对象级守卫仍由下面这条覆盖：驾驶舱 / 项目列表 / data-camp 直达。 */

// GAP-005 ③ Lead 不该能执行 BD 的动作

// GAP-004 ① 待批组合不得被下游消费

// GAP-004 ② 报价阈值必须执行

// GAP-004 ③ 批量发信阈值

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
biz('GAP-007 草稿 = 唯一创作者（非复制同一批凑数）', () => {
  if (global.__resetForTest) global.__resetForTest();
  switchTo('bd'); goStage('gsea', 3);
  click({ 'data-plan': 'a' });
  switchTo('lead'); navs[0].onclick();
  (canvas._html.match(/data-approve="(AP-\d+)"/g) || [])
    .map((x) => x.match(/AP-\d+/)[0]).forEach((id) => click({ 'data-approve': id }));
  switchTo('bd'); goStage('gsea', 4);
  const names = (canvas._html.match(/data-rel="([^"]+)"/g) || [])
    .map((x) => x.slice(10, -1));
  if (!names.length) return 'Reach 没有草稿';
  const dup = names.filter((x, i) => names.indexOf(x) !== i);
  if (dup.length) return `草稿含重复创作者（复制凑数）：${[...new Set(dup)].slice(0,3).join('、')}`;
  if (names.some((x) => /\(\d\)/.test(x))) return `创作者名带 (2)(3) 后缀 —— 是复制出来的假人`;
  return true;
});

// GAP-007 单封发送不得让全部变已发送
biz('GAP-007 单封发送不影响其它草稿（非全局 emailsSent 布尔）', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (/let emailsSent=false/.test(src) && /emailsSent=true/.test(src))
    return '发送状态是全局布尔，单封发送会让全部草稿变已发送';
  return true;
});

/* ===================================================================
   黄金路径断言（审查 §11 冻结门槛 5）
   Brief 可改 → 组合审批 → 对应人数邮件 → 回复信号 → 报价审批
   → 交付检查 → finance 放款 → Insight 周报
   =================================================================== */
console.log('\n— 黄金路径（审查 §11 冻结门槛）—');

// GAP-006 Brief 可用自然语言真改状态（不是提示或 data-noop）
biz('GAP-006 Brief 预算可经对话真修改（改后画布同步）', () => {
  switchTo('bd');
  navs.find((n) => n.dataset.nav === 'campaigns').onclick();
  click({
    'data-say':
      '帮我给《鸣潮》推北美市场，预算1.2万美金，找动作RPG向中腰部游戏区创作者，建个活动',
  });
  if (!/12,000|1\.2万/.test(canvas._html)) return '草稿里找不到原预算 $12,000';
  click({ 'data-say': '预算改成1.5万' });
  if (!/15,000|1\.5万/.test(canvas._html))
    return '「预算改成1.5万」没有真的改状态（GAP-006 假动作）';
  return true;
});

// GAP-006 知识卡人工修正必须落状态且标注来源
biz('GAP-006 Brief 字段修正后画布标注「人工修正」+ 显示 diff', () => {
  switchTo('bd');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'campaigns').onclick();
  click({ 'data-say': '预算改成1.5万' });
  const h = canvas._html;
  if (!/人工修正/.test(h)) return '改完没有标注「人工修正」来源';
  if (!/12,000[\s\S]{0,80}15,000|→[\s\S]{0,40}15,000/.test(h))
    return '没有展示 diff（原值 → 新值）';
  return true;
});

// GAP-008 信号驱动 CRM：发送 → 送达/退信 → 回复 → CRM 自动推进
biz('GAP-008 CRM 由信号推进（真行为：发一封 → 状态从未触达变化）', () => {
  if (global.__resetForTest) global.__resetForTest();
  switchTo('bd'); goStage('gsea', 3);
  click({ 'data-plan': 'a' });
  switchTo('lead'); navs[0].onclick();
  (canvas._html.match(/data-approve="(AP-\d+)"/g) || [])
    .map((x) => x.match(/AP-\d+/)[0]).forEach((id) => click({ 'data-approve': id }));
  switchTo('bd'); goStage('gsea', 4);
  const before = canvas._html;
  if (!/未触达/.test(before)) return 'CRM 面板初始不是「未触达」';
  click({ 'data-send-one': 'gsea|0' });
  const ok = els['#modal-ok']; if (ok && ok.onclick) ok.onclick();
  goStage('gsea', 4);
  if (!/已触达|已送达|已读|洽谈中/.test(canvas._html))
    return '发送后 CRM 状态没有被信号推进';
  if (!/信号自动推导/.test(canvas._html)) return 'CRM 未标注推导方式';
  return true;
});


// GAP-009 周报必须是画布 artifact + 分享闸门
biz('GAP-009 周报生成到画布（非仅聊天摘要）', () => {
  switchTo('lead');
  scopeToGsea();
  navs.find((n) => n.dataset.nav === 'insight').onclick();
  canvas._html = '';
  click({ 'data-say': '生成本周周报' });
  if (canvas._html.length < 400)
    return '点「生成本周周报」后画布无 artifact，只有聊天气泡';
  if (!/周报/.test(canvas._html)) return '画布上没有周报内容';
  return true;
});
biz('GAP-009 对外分享有人类闸门 + 可撤销', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (!/gateShare|data-share/.test(src)) return '周报对外分享没有闸门';
  if (!/撤销分享|revokeShare/.test(src)) return '分享链接不可撤销';
  return true;
});

// 黄金路径端到端：交付检查 → 放款条件满足

/* 端到端黄金路径：一次走完，验跨模块状态真的串起来（不是各自孤立的结构） */
console.log('\n— 端到端黄金路径 · 单角色一个人走完（拆掉审批后的真实动线）—');
(() => {
  const step = (n, fn) => {
    try {
      const r = fn();
      if (r === true) console.log(`  ✓ ${n}`);
      else fails.push(`[E2E] ${n} → ${r}`);
    } catch (e) {
      fails.push(`[E2E] ${n} → ${e.constructor.name}: ${e.message}`);
    }
  };
  const confirm = () => {
    const ok = els['#modal-ok'];
    if (ok && ok.onclick) ok.onclick();
  };

  if (global.__resetForTest) global.__resetForTest();

  step('① 选 $9,800 组合 → 立即生效（没有第二个人要批）', () => {
    goStage('gsea', 3);
    clearGate();
    click({ 'data-plan': 'a' });
    if (gateTitle()) return '选组合弹了闸门 —— 内部可改的决策不该挡';
    goStage('gsea', 4);
    if (/待批准|尚未生效/.test(canvas._html)) return '组合被挡在待批准，但没人能批';
    return true;
  });

  step('② 组合生效 → 关系面 = 14 位唯一真人（非复制凑数）', () => {
    const names = (canvas._html.match(/data-rel="([^"]+)"/g) || []).map((x) => x.slice(10, -1));
    if (names.length !== 14) return `关系数 ${names.length}，与方案 a 的 14 位不符`;
    if (new Set(names).size !== names.length) return '关系里有重复创作者（复制凑数）';
    if (names.some((x) => /\(\d\)/.test(x))) return '创作者名带 (2)(3) 后缀 —— 是假人';
    return true;
  });

  step('③ 发一封 → 闸门拦下 → 确认后信号推进 CRM', () => {
    clearGate();
    click({ 'data-send-one': 'gsea|0' });
    if (!gateTitle()) return 'AI 直接把邮件发出去了 —— 对外动作必须停在人面前';
    if (!/不可撤销/.test(gateBody())) return '闸门没说清「对外不可撤销」';
    confirm();
    goStage('gsea', 4);
    if (!/已触达|已送达|已读|洽谈中/.test(canvas._html)) return 'CRM 没被信号推进';
    if (!/信号自动推导|信号推导/.test(canvas._html)) return 'CRM 没标注推导方式';
    return true;
  });

  step('④ 批量发 → 闸门列出全部收件人（说清利害，不是分级审批）', () => {
    clearGate();
    click({ 'data-bulk': 'gsea' });
    if (!gateTitle()) return '批量发送没有闸门';
    if (!/不可撤销/.test(gateBody())) return '批量闸门没说清不可撤销';
    const listed = (gateBody().match(/ · /g) || []).length;
    if (listed < 5) return '批量闸门没列出收件人 —— 用户不知道自己在给谁发';
    confirm();
    goStage('gsea', 4);
    const untouched = (canvas._html.match(/未触达/g) || []).length;
    if (untouched) return `批量发完仍有 ${untouched} 个「未触达」→ 批量绕过了 signal 入口`;
    return true;
  });

  step('⑤ 报价 → 闸门（对外承诺）→ 确认发出', () => {
    goStage('gsea', 4);
    const ris = [...canvas._html.matchAll(/data-gate="terms" data-ri="(\d+)"/g)].map((m) => m[1]);
    if (!ris.length) return '拿不到条款确认入口';
    ris.forEach((ri) => {
      clearGate();
      click({ 'data-gate': 'terms', 'data-ri': ri, 'data-cid': 'gsea' });
      if (!gateTitle()) throw new Error('报价没有闸门 —— 对外承诺必须人拍板');
      confirm();
    });
    return true;
  });

  step('⑥ 条款谈定 → 04 出口条件满足 → 推进到 05 交付', () => {
    goStage('gsea', 4);
    if (!/data-advance/.test(canvas._html)) return '拿不到推进按钮';
    clearGate();
    click({ 'data-advance': '1' });
    confirm();
    if (getStage('gsea') !== 5) return `推进失败，gsea 仍在环节 ${getStage('gsea')}`;
    return true;
  });

  step('⑦ #ad 披露未过 → 放款被挡（合规是硬前置，不因有按钮就放行）', () => {
    goStage('gsea', 5);
    if (/data-gate="payout"/.test(canvas._html)) return '#ad 未过却已放行放款';
    if (!/披露/.test(canvas._html)) return '没说明是披露合规卡住了';
    return true;
  });

  step('⑧ 复核 #ad + 标记终稿可发布', () => {
    const m = canvas._html.match(/data-check-ok="(gsea\|\d+)"/);
    if (!m) return '拿不到「复核通过」入口 —— #ad 是没有动作能改的死状态';
    click({ 'data-check-ok': m[1] });
    goStage('gsea', 5);
    if (!/data-mark-pub/.test(canvas._html)) return '拿不到「标记终稿可发布」';
    clearGate();
    click({ 'data-mark-pub': 'gsea' });
    confirm();
    return true;
  });

  step('⑨ 放款 → 闸门 → 真的变成「已放款」', () => {
    goStage('gsea', 5);
    const m = canvas._html.match(/data-gate="payout" data-cid="gsea" data-kol="([^"]+)" data-amt="([^"]+)"/);
    if (!m) return '交付合规已过，仍拿不到放款按钮 —— 资金路径不可执行';
    clearGate();
    click({ 'data-gate': 'payout', 'data-cid': 'gsea', 'data-kol': m[1], 'data-amt': m[2] });
    if (!gateTitle()) return '放款没有闸门 —— 钱打出去不可撤销';
    if (!/不可撤销/.test(gateBody())) return '放款闸门没说清不可撤销';
    confirm();
    goStage('gsea', 5);
    if (!/已放款/.test(canvas._html)) return '点了放款但状态没变成「已放款」';
    return true;
  });

  step('⑩ 周报 artifact → 对外分享需闸门 → 链接可撤销', () => {
    navs.find((n) => n.dataset.nav === 'insight').onclick();
    canvas._html = '';
    click({ 'data-say': '生成本周周报' });
    if (!/数据口径/.test(canvas._html)) return '周报缺数据口径';
    if (!/data-share-report/.test(canvas._html)) return '周报没有分享闸门入口';
    clearGate();
    click({ 'data-share-report': '1' });
    if (!gateTitle()) return '对外分享没有闸门';
    confirm();
    navs.find((n) => n.dataset.nav === 'insight').onclick();
    if (!/data-revoke-share/.test(canvas._html)) return '分享后不可撤销';
    return true;
  });
})();

/* ===== 单角色架构（拆掉三角色 + 人→人审批）=====
   这 4 条曾被我自己在重写 E2E 时用行切片误删，而测试反而更绿了 ——
   断言少一条，绿色就多一分。绿色不是证据。 */
biz('审批链的痕迹已彻底消失（不是藏起来，是没有）', () => {
  if (global.__resetForTest) global.__resetForTest();
  const seen = [];
  navs.forEach((nv) => { nv.onclick(); seen.push(canvas._html); });
  ['gsea', 'hsr', 'zzz', 'sky'].forEach((cid) => {
    for (let st = 1; st <= 6; st++) { goStage(cid, st); seen.push(canvas._html); }
  });
  goStage('gsea', 3);
  seen.push(canvas._html);
  click({ 'data-plan': 'a' });
  goStage('gsea', 4);
  seen.push(canvas._html);
  navs[0].onclick();
  seen.push(canvas._html);
  const all = seen.join('');
  const ghosts = ['提交审批', '待批准', '待批组合', '退回并注明原因', '重新提交',
    '审批额度', '交接单', 'AP-0', '需要你决策的交接', '责任转移'];
  const found = ghosts.filter((g) => all.includes(g));
  if (found.length) return `审批链残影仍在界面上：${found.join('、')}`;
  if (/data-approve|data-return|data-resubmit|data-role=/.test(all))
    return '审批/角色切换的交互钩子仍在 DOM 里';
  return true;
});

biz('阈值已删：$9,800 组合直接生效（没有第二个人可以批）', () => {
  if (global.__resetForTest) global.__resetForTest();
  goStage('gsea', 3);
  click({ 'data-plan': 'a' });        // $9,800
  goStage('gsea', 4);
  if (/组合待批准|尚未生效/.test(canvas._html))
    return '$9,800 组合被挡在「待批准」—— 但已经没有人能批它了，这是死路';
  if (!/data-rel="/.test(canvas._html)) return '组合没生效，关系面是空的';
  return true;
});

biz('单角色：六环节没有任何「待他人」占位（含已生效组合的关系行）', () => {
  if (global.__resetForTest) global.__resetForTest();
  const blocked = [];
  const scan = (cid, st) => {
    goStage(cid, st);
    if (/待.{1,8}(推进|处理|采纳|放款|审核|发送|批)/.test(canvas._html))
      blocked.push(`${cid}:0${st}`);
  };
  // 必须先让组合生效 —— 否则 04 是「组合还没生效」空态，关系行根本不渲染，
  // 这条断言就会扫过 24 个面板却从没走到它声称覆盖的代码（上一版正是如此）。
  ['gsea', 'hsr'].forEach((cid) => {
    goStage(cid, 3);
    const m = canvas._html.match(/data-plan="(\w+)"/);
    if (m) click({ 'data-plan': m[1] });
  });
  ['gsea', 'hsr', 'zzz', 'sky'].forEach((cid) => {
    for (let st = 1; st <= 6; st++) scan(cid, st);
  });
  if (!/data-rel="/.test((goStage('gsea', 4), canvas._html)))
    return '断言没走到关系行 —— 它没覆盖到自己声称覆盖的代码';
  if (blocked.length) return `这些环节还挂着「待他人」占位：${blocked.join(' ')}`;
  return true;
});

biz('否定式护栏从「角色数据边界」改为「AI 行为边界」', () => {
  const scope = (els['#copilot-scope'] && els['#copilot-scope']._html) || '';
  if (!scope) return '没有护栏声明';
  if (/数据边界|字段权限|角色/.test(scope))
    return '护栏还在讲角色的数据边界 —— 单角色下该讲的是「AI 不替你做什么」';
  if (!/不会替你做/.test(scope)) return '护栏没有声明「我不会替你做什么」';
  return true;
});

console.log('\n— IA 分层（组织 / 游戏 / 项目）—');

biz('IA 游戏是一级导航实体', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (!/data-nav="games"/.test(src)) return '导航里没有「游戏」入口';
  return true;
});

biz('IA 游戏页列出所有游戏 + 其下项目数', () => {
  switchTo('lead');
  const g = navs.find((n) => n.dataset.nav === 'games');
  if (!g) return '测试桩没有 games 导航';
  g.onclick();
  const h = canvas._html;
  if (!/原神/.test(h) || !/崩坏|崩铁/.test(h)) return '游戏页没有列出游戏';
  if (!/个项目|项目数/.test(h))
    return '游戏卡没有显示其下项目数（1 游戏 : N campaign 关系不可见）';
  return true;
});

biz('IA Brief 跟着项目走（进哪个项目就是哪个项目的知识，不串台）', () => {
  switchTo('lead');
  goStage('gsea', 1);
  const a = canvas._html;
  if (!/东南亚/.test(a)) return 'gsea 的 Brief 没有本项目知识';
  goStage('hsr', 1);
  // 只查知识区（scopeBar 的项目切换按钮本就会列出所有项目名，不算串台）
  const b = canvas._html.slice(canvas._html.indexOf('本项目可用的知识'));
  if (!b) return '找不到知识区';
  if (/东南亚|女性向/.test(b))
    return '切到崩铁项目，知识区仍出现东南亚 Q2 的项目级知识（串台）';
  if (/设定集_v3|元素反应|提瓦特/.test(b))
    return '切到崩铁项目，知识区仍是原神的游戏级知识（串台）';
  if (!/回流|日韩|星穹铁道/.test(b)) return '崩铁项目的知识没有出现';
  return true;
});

biz('IA 知识为单一视图 + 来源徽标（非三张平铺等大卡）', () => {
  switchTo('lead');
  click({ 'data-setscope': 'gsea' });
  goStage('gsea', 1);
  const h = canvas._html;
  if (!/继承自/.test(h)) return '知识卡没有「继承自 XXX」来源徽标';
  if (!/本项目/.test(h)) return '知识卡没有区分「本项目」与继承';
  return true;
});

biz('IA 组织级默认折叠（一年动一次的东西不该占 1/3 篇幅）', () => {
  const src = require('fs').readFileSync(P, 'utf8');
  if (!/orgOpen|org-collapse|data-toggle-org/.test(src))
    return '组织级没有折叠机制';
  return true;
});

biz('IA 项目列表显示所属游戏', () => {
  switchTo('lead');
  navs.find((n) => n.dataset.nav === 'campaigns').onclick();
  if (!/原神/.test(canvas._html)) return '项目卡没有显示所属游戏';
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
leak('gsea 交付面不含 hsr 数据', () => goStage('gsea', 5), HSR_ONLY);
leak('hsr 交付面不含 gsea 数据', () => goStage('hsr', 5), GSEA_ONLY);
leak('gsea 沟通面不含 hsr 数据', () => goStage('gsea', 4), HSR_ONLY);
leak('hsr 组合面不含 gsea 数据', () => goStage('hsr', 3), GSEA_ONLY);

console.log('');
if (fails.length) {
  console.log(`✗ ${fails.length} 处失败：`);
  fails.forEach((f) => console.log('   ' + f));
  process.exit(1);
}
console.log('✓ 全部通过 —— 无运行时异常；每页每环节有产出；无跨项目串台');
