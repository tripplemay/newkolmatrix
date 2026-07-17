const fs = require('fs');
const path = require('path');

const prototypePath = path.join(
  __dirname,
  '../../docs/product/interaction-prototype-role-first.html',
);
const html = fs.readFileSync(prototypePath, 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);

if (!match) throw new Error('Prototype script not found');

class ElementStub {
  constructor(id = '') {
    this.id = id;
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.onclick = null;
    this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name) => {
        if (this.classes.has(name)) this.classes.delete(name);
        else this.classes.add(name);
      },
      contains: (name) => this.classes.has(name),
    };
  }

  get innerHTML() {
    return this._html;
  }

  set innerHTML(value) {
    this._html = String(value);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  focus() {}
}

const ids = [
  'nav',
  'role-switch',
  'sidebar-user',
  'sidebar-project',
  'crumb',
  'assistant-head',
  'assistant-scope',
  'messages',
  'prompt-row',
  'view',
  'sidebar',
  'assistant',
  'modal-title',
  'modal-body',
  'modal-confirm',
  'modal-cancel',
  'modal-scrim',
  'toast',
  'agent-input',
  'agent-send',
];
const elements = Object.fromEntries(ids.map((id) => [`#${id}`, new ElementStub(id)]));
const body = new ElementStub('body');

global.window = global;
global.document = {
  body,
  listeners: {},
  querySelector(selector) {
    if (!elements[selector]) elements[selector] = new ElementStub(selector.slice(1));
    return elements[selector];
  },
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  },
};
global.setTimeout = (handler) => {
  if (typeof handler === 'function') handler();
  return 1;
};
global.clearTimeout = () => {};

const hook = `
window.__roleFirstTest = {
  state,
  render,
  handleAction,
  assistantReply,
  confirmModal: () => modalCallback && modalCallback()
};
render();`;
const script = match[1].replace(/\n\s*render\(\);\s*$/, `\n${hook}\n`);

new Function(script)();

const testApi = global.__roleFirstTest;
if (!testApi) throw new Error('Test hook was not installed');

const results = [];
function check(name, assertion) {
  try {
    const ok = assertion();
    if (!ok) throw new Error('assertion returned false');
    results.push({ name, ok: true });
    console.log(`  PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  FAIL ${name}: ${error.message}`);
  }
}

const view = elements['#view'];

check('Lead starts from a role-specific cockpit', () => {
  testApi.state.role = 'lead';
  testApi.state.route = 'today';
  testApi.render();
  return /营销负责人 · 责任声明/.test(view.innerHTML) && /批准 14 人创作者组合/.test(view.innerHTML);
});

check('BD cockpit excludes Lead decision ownership', () => {
  testApi.state.role = 'bd';
  testApi.state.route = 'today';
  testApi.render();
  return /创作者合作经理 · 责任声明/.test(view.innerHTML) && /处理 3 条新回复/.test(view.innerHTML);
});

check('Ops cockpit is organized around commercial controls', () => {
  testApi.state.role = 'ops';
  testApi.state.route = 'today';
  testApi.render();
  return /商务运营 · 责任声明/.test(view.innerHTML) && /确认 \$2,600 放款/.test(view.innerHTML);
});

check('Each role receives a structurally different project desk', () => {
  const expected = [
    ['lead', 'decisions', /组合决策室/],
    ['bd', 'pipeline', /创作者合作台/],
    ['ops', 'contracts', /合同与合规控制台/],
  ];
  return expected.every(([roleId, tab, pattern]) => {
    testApi.state.role = roleId;
    testApi.state.route = 'project';
    testApi.state.projectId = 'gsea';
    testApi.state.tab = tab;
    testApi.render();
    return pattern.test(view.innerHTML);
  });
});

check('Every role-specific navigation destination renders content', () => {
  const routes = {
    lead: ['today', 'projects', 'games', 'results'],
    bd: ['today', 'projects', 'network', 'conversations'],
    ops: ['today', 'projects', 'control', 'audit'],
  };
  return Object.entries(routes).every(([roleId, destinations]) =>
    destinations.every((route) => {
      testApi.state.role = roleId;
      testApi.state.route = route;
      testApi.render();
      return view.innerHTML.length > 300;
    }),
  );
});

check('Clicking the left navigation changes the route instead of hitting body role state', () => {
  testApi.state.role = 'lead';
  testApi.state.route = 'today';
  testApi.render();
  const navButton = {
    dataset: { nav: 'projects' },
    closest(selector) {
      if (selector === '#role-switch [data-role]') return null;
      if (selector === '[data-nav]') return this;
      return null;
    },
  };
  global.document.listeners.click({ target: navButton });
  return testApi.state.route === 'projects' && /选择一个项目进入完整上下文/.test(view.innerHTML);
});

check('Lead approval activates the portfolio for BD', () => {
  testApi.state.role = 'lead';
  testApi.state.route = 'project';
  testApi.state.tab = 'decisions';
  testApi.handleAction('approve-plan');
  testApi.confirmModal();
  testApi.state.role = 'bd';
  testApi.state.tab = 'pipeline';
  testApi.render();
  return testApi.state.planApproved && /已纳入组合/.test(view.innerHTML) && /\+ 13 位/.test(view.innerHTML);
});

check('BD delivery evidence unlocks the Ops payout condition', () => {
  testApi.state.role = 'bd';
  testApi.state.route = 'project';
  testApi.state.tab = 'delivery';
  testApi.handleAction('approve-delivery');
  testApi.confirmModal();
  testApi.state.role = 'ops';
  testApi.state.tab = 'payouts';
  testApi.render();
  return testApi.state.deliveryApproved && /证据完整/.test(view.innerHTML) && /确认放款/.test(view.innerHTML);
});

check('Ops can complete a gated payout without taking over content work', () => {
  testApi.handleAction('payout');
  testApi.confirmModal();
  return testApi.state.paid && /已放款/.test(view.innerHTML);
});

check('Ops Agent refuses creator contact details', () => {
  testApi.state.role = 'ops';
  return /不能读取创作者联系方式/.test(testApi.assistantReply('把创作者邮箱给我'));
});

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length} runtime checks failed.`);
  process.exit(1);
}

console.log(`\n${results.length} runtime checks passed.`);
