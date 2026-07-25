import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1512, height: 982 } });
await p.goto('http://127.0.0.1:3000/preview/agent-loop', { waitUntil: 'networkidle' });
await p.getByTestId('action-plan-card-draft').waitFor();
await p.screenshot({ path: '/tmp/g4-agent-loop.png', fullPage: true });
console.log('shot ok');
await b.close();
