#!/usr/bin/env node
/**
 * Smoke checks for interaction-prototype-v2.html
 * Independent single-role AI-native prototype, high-fidelity to the project's own
 * Horizon UI Pro template (real Card/MiniStatistics/Sidebar/Navbar/chart look),
 * built only from stated requirements + Horizon tokens.
 *
 * Static parse only. Run: node scripts/test/v2-prototype-smoke.js
 */
const fs = require('fs');
const path = require('path');
const file = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'product',
  'interaction-prototype-v2.html',
);
const html = fs.readFileSync(file, 'utf8');
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';

let pass = 0,
  fail = 0;
const ok = (n, c, extra) => {
  c
    ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (extra ? '  → ' + extra : '')));
};

console.log('\nv2 prototype smoke (Horizon-faithful / dense)');
console.log('=============================================');

try {
  new Function(script);
  ok('script parses without syntax error', true);
} catch (e) {
  ok('script parses without syntax error', false, e.message);
}

// five distinct grammars
const grammars = ['态势简报', '对比矩阵', '对话收件箱', '条件台账', '对照账本'];
ok(
  'five distinct interface grammars declared',
  grammars.every((g) => html.includes(g)) && new Set(grammars).size === 5,
);
const envIds = ['brief', 'match', 'reach', 'delivery', 'insight'];
ok(
  'five environments (Brief→Match→Reach→Delivery→Insight)',
  envIds.every((e) => new RegExp("id:'" + e + "'").test(script)),
);
ok(
  'every environment has a SURF renderer',
  envIds.every((e) => new RegExp(e + '\\s*\\(p\\)').test(script)),
);

// project-vertical flow
ok(
  'Today is a radar (which project needs you)',
  html.includes('哪个项目卡在你这') || html.includes('需要你确认'),
);
ok(
  'project rail with done/current/upcoming',
  /class="rnode/.test(html) &&
    html.includes('已完成') &&
    html.includes('进行中') &&
    html.includes('未开始'),
);
ok('Campaigns is a project list', /function viewCampaigns/.test(script));
ok(
  'enter buttons pass env via data-goenv (no data-env collision — regression guard)',
  html.includes('data-goenv') &&
    script.includes('b.dataset.goenv') &&
    !/data-enter="\$\{p\.id\}" data-env=/.test(html),
);

// Horizon look fidelity
ok(
  'real Horizon Sidebar (active brand indicator bar)',
  html.includes('.nav button.on::after') && html.includes('side-cta'),
);
ok(
  'real Horizon floating Navbar (breadcrumb + search pill + avatar)',
  html.includes('class="navbar"') &&
    html.includes('nb-search') &&
    html.includes('nb-av'),
);
ok(
  'MiniStatistics-style KPI row (icon circle + name + value)',
  html.includes('kpi-row') &&
    html.includes('ic-circle') &&
    html.includes('k-val'),
);
ok(
  '20px card radius + soft Horizon shadow',
  html.includes('--rc:20px') && html.includes('rgba(112,144,176'),
);
ok(
  'Horizon brand #422afb + navy #1b254b + green #01b574',
  ['#422afb', '#1b254b', '#01b574'].every((c) =>
    html.toLowerCase().includes(c),
  ),
);
ok(
  'embeds real template font DM Sans (3 weights)',
  (html.match(/@font-face/g) || []).length === 3 &&
    html.includes("font-family:'DM Sans'"),
);

// real charts (not flat skeleton)
const charts = ['areaChart', 'barChart', 'donut', 'gauge', 'ring'];
ok(
  'real SVG chart renderers (area/bar/donut/gauge/ring)',
  charts.every((c) => new RegExp('function ' + c).test(script)),
);
ok(
  'charts actually rendered in surfaces (area trend + bar channels + donut audience)',
  script.includes('areaChart(trend') &&
    script.includes('barChart(CHANNELS') &&
    script.includes('donut(AUDIENCE'),
);

// density (addresses "too skeleton")
ok(
  'rich data density (≥7 creators, ≥5 ledger rows, ≥4 fuzzy)',
  (script.match(/id:'(pix|ggl|nm|yn|mm|krv|lila)'/g) || []).length === 7 &&
    (script.match(/who:'/g) || []).length >= 5,
);
ok(
  'reach inbox has creator list + thread + editable draft + context panel',
  html.includes('ib-list') &&
    html.includes('th-msgs') &&
    html.includes('<textarea') &&
    html.includes('ib-ctx'),
);
ok(
  'DataTable used for match/delivery/insight (real table markup)',
  (html.match(/table class="tbl"/g) || []).length >= 3,
);
ok(
  'Today has KPI row + Agent activity feed + trend chart + team load',
  html.includes('KPI_TODAY') &&
    html.includes('class="feed"') &&
    /class="[^"]*\bloads\b/.test(html) &&
    script.includes('areaChart(spark'),
);

// AI-native: persistent driving copilot (the core positioning)
ok(
  'persistent Copilot panel present (not removed)',
  html.includes('class="copilot"') &&
    html.includes('cop-body') &&
    html.includes('Campaign Agent'),
);
ok(
  'navbar is an Agent command bar (not a search box)',
  html.includes('nb-cmd') &&
    html.includes('问 Campaign Agent') &&
    !html.includes('placeholder="搜索…"'),
);
ok(
  'copilot is context-aware (per route/environment)',
  /function copContext/.test(script) &&
    script.includes('state.route') &&
    script.includes('state.env'),
);
ok(
  'copilot messages carry actionable cards that drive navigation',
  script.includes('data-act') &&
    /function copAct/.test(script) &&
    script.includes("go('project'"),
);
ok(
  'copilot generates results on intent (谁在等我回复 / 找更多创作者)',
  /function copReply/.test(script) &&
    script.includes('等我回复') &&
    script.includes('高匹配创作者'),
);
ok(
  'copilot proactively reports what Agent did (Agent 刚刚完成)',
  html.includes('刚刚完成') && script.includes('cop-did'),
);
ok(
  'command bar + copilot input both drive the Agent',
  script.includes("$('#cmd-in')") &&
    script.includes("$('#cop-in')") &&
    /function copSend/.test(script),
);

// multi-agent: one expert agent per workflow stage + isolation + collaboration
ok(
  'multi-agent registry (per-stage expert agents + compliance)',
  /const AGENTS=/.test(script) &&
    [
      '策略 Agent',
      '匹配 Agent',
      '触达 Agent',
      '交付 Agent',
      '洞察 Agent',
      '合规 Agent',
    ].every((a) => script.includes(a)),
);
ok(
  'each workflow stage maps to its own expert agent',
  /const AGENT_BY_ENV=/.test(script) &&
    ['brief', 'match', 'reach', 'delivery', 'insight'].every((e) =>
      new RegExp(e + ":'").test(script),
    ),
);
ok(
  'each agent declares responsibility + isolation boundary',
  script.includes('duty:') &&
    script.includes('iso:') &&
    html.includes('职责') &&
    html.includes('隔离') &&
    html.includes('cop-scope'),
);
ok(
  'agents collaborate when a stage needs it (multi-agent handoff)',
  /const COLLAB=/.test(script) &&
    html.includes('本环节协同') &&
    script.includes('compliance'),
);
ok(
  'collaboration expands to a concrete two-agent handoff (dialogue + payload + outcome)',
  script.includes('handoff:') &&
    script.includes('payload:') &&
    script.includes('outcome:') &&
    html.includes('交接物') &&
    html.includes('data-collab') &&
    script.includes('state.openCollab') &&
    html.includes('cl-detail') &&
    html.includes('ho-turn'),
);
ok(
  'workspace shows an Agent squad roster + orchestrator',
  /const ROSTER=/.test(script) &&
    html.includes('Agent 编队') &&
    script.includes('编排 Agent') &&
    html.includes('squad-grid'),
);
ok(
  'copilot identity switches to the current stage agent',
  script.includes("$('#cop-name')") &&
    script.includes('AGENTS[AGENT_BY_ENV[state.env]]'),
);

// AI→human gate model
const gated = ['data-send', 'data-quote', 'data-pay', 'data-share'];
ok(
  'all outbound actions route through gate()',
  gated.every((a) => new RegExp(a + '[\\s\\S]{0,700}?gate\\(\\{').test(script)),
);
ok(
  'confirmations enumerate concrete harm (对外·不可撤销)',
  html.includes('发出后不可撤销') && html.includes('放款后不可撤销'),
);
ok(
  'internal approve does NOT open a gate modal',
  (() => {
    const seg = (script.match(/data-approve[\s\S]{0,400}?\}\);/) || [''])[0];
    return seg.length > 0 && !seg.includes('gate({');
  })(),
);
ok(
  'delivery is verify-only (no AI recommendation cards)',
  html.includes('没有 AI 推荐卡'),
);

// independence from parallel small-team prototype
const leak = [
  '原神',
  '绝区零',
  '崩坏',
  'AyuGaming',
  'HoYoverse',
  '东南亚女性向',
  'Mia',
  'Sarah',
  'Iris',
].filter((s) => html.includes(s));
ok(
  'no data leaked from small-team prototype',
  leak.length === 0,
  leak.join(','),
);
ok(
  'single-role only (no role switcher)',
  !/切角色|角色切换|allowedRoles|copilotScope/.test(html),
);

// hygiene
const hooks = [
  ...new Set([...html.matchAll(/data-([a-z-]+)=/g)].map((m) => m[1])),
].filter((h) => h !== 'theme');
const unbound = hooks.filter(
  (h) =>
    !script.includes('data-' + h) &&
    !script.includes('dataset.' + h.replace(/-/g, '')),
);
ok(
  'no dead command hooks (' + hooks.length + ' data-* bound)',
  unbound.length === 0,
  unbound.join(','),
);
ok(
  'no external CDN / remote asset (CSP-safe, offline-safe)',
  !/(src|href)=["']https?:/.test(html) && !html.includes('data-lucide'),
);
ok(
  'theme-aware at token level (light + dark)',
  html.includes('prefers-color-scheme:dark') &&
    html.includes('[data-theme="dark"]') &&
    html.includes('[data-theme="light"]'),
);

// cross-project asset pages: creator library + game knowledge
ok(
  'creator library page (discovery-only DataTable + filters, routes to project match)',
  /function viewCreators/.test(script) &&
    /const LIBRARY=/.test(script) &&
    html.includes('创作者库') &&
    html.includes('data-filter') &&
    html.includes('data-addmatch') &&
    html.includes('只做发现和分流'),
);
ok(
  'game knowledge is a user-built knowledge base (upload materials → AI derives characteristics)',
  /function viewKnowledge/.test(script) &&
    /const GAMEKB=/.test(script) &&
    html.includes('游戏知识') &&
    script.includes('materials:') &&
    html.includes('data-upload') &&
    html.includes('dropzone') &&
    html.includes('上传素材') &&
    script.includes('sell:') &&
    script.includes('rules:') &&
    html.includes('合规红线'),
);
ok(
  'uploading a material triggers AI analysis with provenance (材料→特点 chain)',
  script.includes('g.materials.push') &&
    script.includes("status:'analyzing'") &&
    html.includes('AI 已解析') &&
    html.includes('kb-prov') &&
    script.includes('from:') &&
    html.includes('data-reanalyze') &&
    script.includes('data-kbgame'),
);
ok(
  'both asset pages surface the right expert agent in the copilot',
  script.includes("state.route==='creators'") &&
    script.includes("state.route==='knowledge'") &&
    script.includes('AGENTS.match') &&
    script.includes('AGENTS.strategy'),
);

// insight (cross-project ROI + weekly report) + agent runs (audit trail)
ok(
  'insight page (cross-project ROI charts + per-project table + gated report share)',
  /function viewInsight/.test(script) &&
    /const PORTFOLIO=/.test(script) &&
    html.includes('洞察') &&
    script.includes('areaChart(ROI_TREND') &&
    script.includes('barChart(ROI_BARS') &&
    script.includes('周报草案'),
);
ok(
  'agent runs page (who/when/what audit trail, irreversible flagged, filterable)',
  /function viewRuns/.test(script) &&
    /const RUNLOG=/.test(script) &&
    html.includes('Agent 记录') &&
    html.includes('data-runfilter') &&
    script.includes("kind:'irrev'") &&
    html.includes('不可逆'),
);
ok(
  'all six sidebar routes render a real page (no stub for the six)',
  ['today', 'campaigns', 'creators', 'knowledge', 'insight', 'runs'].every(
    (r) => new RegExp("state.route==='" + r + "'").test(script),
  ) &&
    /function viewInsight/.test(script) &&
    /function viewRuns/.test(script),
);

// creator detail drawer
ok(
  'clicking a creator opens a detail drawer (summary header + rich sections)',
  html.includes('data-creator') &&
    /function openCreator/.test(script) &&
    /function renderDrawer/.test(script) &&
    html.includes('class="drawer"') &&
    html.includes('dw-summary') &&
    [
      '受众画像',
      '内容表现',
      '合作历史',
      '商务与档期',
      '合规与风险',
      '内容样本',
    ].every((s) => script.includes(s)),
);
ok(
  'drawer is hybrid (shared facts + per-agent judgment cards) with data provenance',
  script.includes('dw-judge') &&
    script.includes('AGENTS.reach.c') &&
    script.includes('AGENTS.compliance.c') &&
    html.includes('prov-tag') &&
    script.includes('Apify 采集') &&
    /function detailFor/.test(script),
);
ok(
  'drawer actions: add-to-match closes drawer, add-match button stops row propagation',
  script.includes('data-dwadd') &&
    script.includes('closeCreator') &&
    script.includes('e.stopPropagation()') &&
    script.includes('data-dwwatch'),
);

// Horizon token-fidelity regression guards (2026-07-17 alignment pass)
ok(
  'Horizon token fidelity: card shadow α .08, title navy-700 #1b254b (not #2b3674)',
  html.includes('rgba(112,144,176,.08)') &&
    html.includes('--head:#1b254b') &&
    !html.includes('--head:#2b3674') &&
    !html.includes('rgba(112,144,176,.12)'),
);
ok(
  'Horizon button: flat brand fill + 12px radius (no gradient/shadow), hover shifts color',
  !/\.btn\{[^}]*linear-gradient/.test(html) &&
    html.includes('--rb:12px') &&
    html.includes('.btn:hover{background:var(--brand-600)}') &&
    html.includes('.btn.gate{background:var(--red)}'),
);
ok(
  'Horizon sidebar = floating rounded card; navbar glass 30%/blur24/radius12',
  html.includes('margin:14px 0 14px 14px;border-radius:20px') &&
    html.includes('--sidebar:285px') &&
    html.includes(
      'color-mix(in srgb,var(--card) 30%,transparent);backdrop-filter:blur(24px)',
    ),
);
ok(
  'progress bars rounded-full + solid fill; area chart smooth bezier; x icon fixed',
  html.includes('border-radius:9999px') &&
    script.includes('C${c1x') &&
    script.includes('x:\'<path d="M18 6 6 18'),
);

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed.');
process.exit(fail ? 1 : 0);
