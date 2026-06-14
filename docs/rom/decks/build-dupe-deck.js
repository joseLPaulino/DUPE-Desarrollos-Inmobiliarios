'use strict';
/**
 * HCLTech Agentic Solution Architect — Generic Deck Builder
 *
 * Fill in CONFIG below for each new engagement, then run:
 *   npm install pptxgenjs sharp
 *   node build-deck.js
 *
 * Requires Node.js ≥ 18, pptxgenjs ≥ 3.12, sharp ≥ 0.33
 * Pre-renders SVG diagrams to 4K PNG via sharp for cross-viewer compatibility.
 */

const pptxgen = require('pptxgenjs');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG — Fill this in for each engagement
// ══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
  // ── Engagement identity ──────────────────────────────────────────────────
  client:        'DUPE Desarrollos Inmobiliarios',
  solution:      'Agentic Business Platform',
  engagement:    'MVP Solution',
  presenter:     'Jose Paulino · Senior AI Solution Architect, HCLTech AI Labs',
  date:          'June 2026',
  year:          '2026',

  // ── Output path ─────────────────────────────────────────────────────────
  outputPath:    './client/DUPE_Agentic_Business_Platform_HCLTech_v1.pptx',

  // ── ROM numbers ─────────────────────────────────────────────────────────
  rom: {
    podDays:      '14–18',
    elapsedWeeks: '~7–8',
    podRole:      '3-role agentic pod',
    contingency:  '+3–5 pod days',
    engType:      'MVP Solution',
  },

  // ── Slide 2 — Opportunity ────────────────────────────────────────────────
  slide2: {
    headerTitle: 'The Opportunity',
    headerSub:   'Two modules. One agentic platform. Zero manual chasing.',
    quote:       '"We manage everything in Excel — budgets, cash flow, collections — and there is no real-time visibility into our projects."',
    userStory:   'As a DUPE finance officer, I want the system to reconcile bank transactions and send payment reminders automatically so that I can focus on exceptions and client relationships.',
    problems: [
      'Budget & cash flow tracked in disconnected Excel workbooks',
      'Bank reconciliation is 100% manual — transactions assigned by hand',
      'Collections officers track due dates individually and send messages manually',
      'No automated delinquency escalation to management or legal',
      'Weekly management report compiled manually from multiple spreadsheets',
    ],
    agenticApproach: [
      'Orchestrator coordinates Finance + Collections modules end-to-end',
      'Reconciliation Agent auto-matches bank transactions with rule learning',
      'Collections Notification Agent dispatches WhatsApp + email on schedule',
      'Escalation logic at Day +1, +6, and +16 overdue — no manual tracking',
      'Reporting Agent compiles and sends weekly PDF report automatically',
    ],
    value: [
      'Officer time freed from manual data entry to exception review only',
      '90%+ transaction auto-match target from learned reconciliation rules',
      'Zero missed payment reminders — every installment tracked automatically',
      'Management notified before portfolio health deteriorates',
      'Real-time executive dashboard replaces end-of-week report compilation',
    ],
  },

  // ── Agents — hub-and-spoke (Slide 4) and swimlane (Slide 5) ─────────────
  agents: [
    { name: 'Reconciliation\nAgent',             color: '#3C91FF', angle: -90,
      responsibility: 'Auto-matches bank transactions to budget partidas; scores confidence; builds rule store from officer-accepted matches',
      stage: 0, activity: 'Match Transactions',    actSub: 'bank file → partida' },
    { name: 'Collections\nNotification Agent',   color: '#00C853', angle: -30,
      responsibility: 'Scans payment plans daily; dispatches WhatsApp + email notifications; captures delivery status and client replies',
      stage: 1, activity: 'Send Notifications',    actSub: 'WhatsApp · email · schedule' },
    { name: 'Financial\nIntelligence Agent',     color: '#8C69F0', angle: 30,
      responsibility: 'Monitors budget execution vs. projected; computes deviation metrics; raises traffic-light alerts on dashboard',
      stage: 2, activity: 'Monitor & Alert',       actSub: 'KPIs · deviations · alerts' },
    { name: 'Reporting\nAgent',                  color: '#FFA726', angle: 90,
      responsibility: 'Compiles weekly management PDF report; generates Balance General, Estado de Resultados, Flujo de Efectivo on demand',
      stage: 3, activity: 'Generate Reports',      actSub: 'PDF · Excel · statements' },
    { name: 'Escalation\nRouter',                color: '#EF5350', angle: 150,
      responsibility: 'Triggers officer dashboard alerts at Day +1, management notifications at Day +6, legal referral flag at Day +16 overdue',
      stage: 1, activity: 'Escalate Delinquency',  actSub: 'officer · mgmt · legal' },
  ],

  // ── Slide 6 — Agent responsibilities table ───────────────────────────────
  agentTable: [
    { agent: 'Agentic\nOrchestrator',            color: '#5F1EBE',
      role: 'Owns workflow state for both modules; routes events to specialist agents; manages exception queues and audit trail.',
      out:  'State transitions, agent schedule, exception routing, audit log.' },
    { agent: 'Reconciliation\nAgent',            color: '#3C91FF',
      role: 'Parses uploaded bank statement files; scores transaction-to-partida match confidence; routes low-confidence items to officer queue; learns from officer decisions.',
      out:  'Match decisions, exception queue, updated rule store.' },
    { agent: 'Collections\nNotification Agent',  color: '#00C853',
      role: 'Reads payment plan schedules daily; determines which notifications are due (pre-due, overdue); dispatches WhatsApp + email; logs delivery and read status.',
      out:  'Sent notifications, delivery receipts, two-way message log.' },
    { agent: 'Financial\nIntelligence Agent',    color: '#8C69F0',
      role: 'Compares executed spend and income vs. projected budget and cash flow; computes deviation metrics; assigns traffic-light status per partida.',
      out:  'Dashboard KPIs, partida alerts, deficit forecasts, milestone alerts.' },
    { agent: 'Escalation\nRouter',               color: '#EF5350',
      role: 'Monitors overdue installment age; triggers escalation at defined thresholds: officer dashboard (Day +1), management notification (Day +6), legal flag (Day +16).',
      out:  'Escalation events, management alerts, legal referral flags.' },
    { agent: 'Reporting\nAgent',                 color: '#FFA726',
      role: 'Assembles financial statements and weekly management report from structured data; formats and dispatches PDF on schedule or on demand.',
      out:  'Weekly PDF report, Balance General, Estado de Resultados, Flujo de Efectivo.' },
  ],

  // ── Slide 11 — Build vs. Wrap ────────────────────────────────────────────
  slide11: {
    build: [
      'Agentic Orchestrator',
      'Reconciliation Agent + Rule Store',
      'Collections Notification Agent',
      'Financial Intelligence Agent',
      'Escalation Router',
      'Reporting Agent',
      'Bank Statement Parser (deterministic)',
      'Multi-tenant PostgreSQL data store',
      'Role-based dashboards (officer + management)',
      'Audit / lineage store',
    ],
    wrap: [
      'WhatsApp Business API (Meta Cloud)',
      'Transactional Email (SendGrid)',
      'Bank netbanking (manual CSV/TXT upload)',
      'PDF / Excel generation libraries',
      'DR bank statement file formats',
    ],
  },

  // ── Slide 12 — ROM workstreams ───────────────────────────────────────────
  workstreams: [
    { label: 'Gravel track — environment, schema, CI/CD',                   weight: 'Medium' },
    { label: 'Financial Module — budget, cash flow, reconciliation, accounting', weight: 'High' },
    { label: 'Collections Module — payment plans, notifications, escalation', weight: 'High' },
    { label: 'Dashboards — officer queue, mgmt portal, financial statements', weight: 'High' },
    { label: 'Integration wrappers — bank parser, WhatsApp, email, PDF/Excel', weight: 'Medium' },
    { label: 'Validation, testing, SME review, demo hardening',              weight: 'High' },
  ],

  // ── Slide 13 — Assumptions and Decisions ────────────────────────────────
  slide13: {
    assumptions: [
      'Bank statements available as CSV/TXT download from DR netbanking',
      'Single WhatsApp Business number used across all projects (recommended)',
      'Email sent from shared domain (cobros@dupedesa.com) via SendGrid',
      'Chart of accounts defined by HCLTech; approved by management in Week 1',
      'MVP scoped to social interest project type (RD$); tourist type in Pilot',
      'Physical construction progress entered manually as % milestone completion',
    ],
    decisions: [
      'Provide sample bank statement file (actual format) — Day 1 requirement',
      'Register WhatsApp Business Account with Meta — initiate immediately',
      'Confirm project type scope: social interest only, or tourist too in MVP?',
      'Confirm whether legal firm notification is automated or manual flag',
      'Name DUPE product owner, collections officer SME, and management sponsor',
      'Confirm cloud environment (HCLTech-provisioned VPS vs. DUPE cloud account)',
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// COLOUR PALETTE  (from HCLTech template theme1.xml)
// ══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:'0F0A2A', bgLight:'F5F5FA', card:'1E0D4A', cardMid:'2D1870', cardLt:'3D2490',
  purple:'5F1EBE', purpleAc:'8C69F0', purpleLt:'B9C8FF',
  blue:'0F5FDC', blueAc:'3C91FF', blueLt:'8CC8FA',
  nearWht:'DCE6F0', green:'00C853', amber:'FFA726',
  fail:'EF5350', pass:'66BB6A', white:'FFFFFF', black:'000000',
  light:'B0BEC5', muted:'7B90A8', dark:'1A1A2E',
};

// ══════════════════════════════════════════════════════════════════════════════
// SVG → PNG rasteriser (deferred to avoid z-order issues)
// ══════════════════════════════════════════════════════════════════════════════
const _deferred = [];
function addSvgImage(slide, svgStr, x, y, w, h) {
  const tmp = path.join(os.tmpdir(), `hcl_svg_${Date.now()}_${Math.random().toString(36).slice(2)}.svg`);
  fs.writeFileSync(tmp, svgStr);
  const p = sharp(tmp, { density: 220 })
    .resize(3840, 2160, { fit:'contain', background:{r:15,g:10,b:42,alpha:1} })
    .png({ compressionLevel:6 }).toBuffer();
  _deferred.push({ slide, x, y, w, h, p });
}

function xe(s) {   // XML-safe string for SVG text
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// PRE-RENDER TITLE BACKGROUND (gradient PNG — must exist before pres is built)
// ══════════════════════════════════════════════════════════════════════════════
const TITLE_BG = path.join(__dirname, 'title_bg.png');
if (!fs.existsSync(TITLE_BG)) {
  const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#0F0A2A"/>
        <stop offset="45%"  stop-color="#2D1870"/>
        <stop offset="75%"  stop-color="#5F1EBE"/>
        <stop offset="100%" stop-color="#0F5FDC"/>
      </linearGradient>
    </defs>
    <rect width="3840" height="2160" fill="url(#g)"/>
    ${Array.from({length:28}, (_,r) => Array.from({length:50}, (_,c) =>
      `<circle cx="${c*80+40}" cy="${r*80+40}" r="1.2" fill="#FFFFFF" opacity="0.06"/>`
    ).join('')).join('')}
  </svg>`;
  sharp(Buffer.from(gradSvg), {density:220})
    .resize(3840, 2160, {fit:'fill'}).png({compressionLevel:6})
    .toFile(TITLE_BG, err => { if (err) { console.error('title_bg error:', err); process.exit(1); } });
}

// ══════════════════════════════════════════════════════════════════════════════
// PRESENTATION SETUP
// ══════════════════════════════════════════════════════════════════════════════
const pres = new pptxgen();
pres.layout  = 'LAYOUT_16x9';
pres.author  = 'HCLTech AI Labs';
pres.company = 'HCLTech';
pres.title   = `${CONFIG.client} ${CONFIG.solution}`;

// ──────────────────────────────────────────────────────────────────────────────
// SHARED CHROME HELPERS
// ──────────────────────────────────────────────────────────────────────────────
function addBranding(slide, darkBg) {
  slide.addText([
    { text:'HCL',  options:{ bold:true, color: darkBg ? C.white : C.blue } },
    { text:'Tech', options:{ bold:true, color: darkBg ? C.purpleAc : C.purple } },
  ], { x:0.28, y:0.14, w:1.6, h:0.34, fontSize:16, fontFace:'Arial', valign:'middle' });
  slide.addText('| Supercharging Progress™', {
    x:1.82, y:0.14, w:3, h:0.34, fontSize:8, fontFace:'Arial',
    color: darkBg ? C.purpleLt : C.muted, valign:'middle',
  });
}

function addFooter(slide, n, darkBg) {
  const textColor = darkBg ? C.muted : '9090A8';
  slide.addShape(pres.ShapeType.rect, { x:0, y:5.44, w:10, h:0.19,
    fill:{color: darkBg ? C.card : 'EBEBF5'}, line:{color: darkBg ? C.card : 'EBEBF5', width:0} });
  slide.addShape(pres.ShapeType.rect, { x:0,   y:5.435, w:3.3, h:0.012, fill:{color:C.purple},   line:{color:C.purple,  width:0} });
  slide.addShape(pres.ShapeType.rect, { x:3.3, y:5.435, w:3.4, h:0.012, fill:{color:C.blue},     line:{color:C.blue,    width:0} });
  slide.addShape(pres.ShapeType.rect, { x:6.7, y:5.435, w:3.3, h:0.012, fill:{color:C.purpleAc}, line:{color:C.purpleAc,width:0} });
  if (n) slide.addText(String(n), { x:0.22, y:5.45, w:0.3, h:0.18,
    fontSize:7, fontFace:'Arial', color:textColor, valign:'middle' });
  slide.addText(`Copyright © ${CONFIG.year} HCLTech  |  Confidential`, {
    x:0.58, y:5.45, w:5, h:0.18, fontSize:6.5, fontFace:'Arial', color:textColor, valign:'middle' });
  slide.addText([
    { text:'HCL',  options:{ bold:true, color:C.blue } },
    { text:'Tech', options:{ bold:true, color:C.purple } },
  ], { x:8.85, y:5.44, w:1.0, h:0.19, fontSize:11, fontFace:'Arial', valign:'middle', align:'right' });
}

function addHeader(slide, title, sub, darkBg) {
  const tc = darkBg ? C.white : C.dark;
  const sc = darkBg ? C.purpleAc : C.blue;
  slide.addShape(pres.ShapeType.rect, { x:0.28, y:0.56, w:0.055, h: sub ? 0.64 : 0.42,
    fill:{color:C.purple}, line:{color:C.purple, width:0} });
  slide.addText(title, { x:0.40, y:0.54, w:9.2, h:0.42,
    fontSize:22, fontFace:'Arial', bold:true, color:tc, valign:'middle' });
  if (sub) slide.addText(sub, { x:0.40, y:0.98, w:9.2, h:0.22,
    fontSize:10, fontFace:'Arial', color:sc, italic:true, valign:'middle' });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ══════════════════════════════════════════════════════════════════════════════
(function slide01() {
  const s = pres.addSlide();
  s.addImage({ path: TITLE_BG, x:0, y:0, w:10, h:5.63 });

  s.addText([
    { text:'HCL',  options:{ bold:true, color:C.white } },
    { text:'Tech', options:{ bold:true, color:C.purpleLt } },
  ], { x:0.38, y:0.22, w:1.7, h:0.40, fontSize:20, fontFace:'Arial', valign:'middle' });
  s.addText('| Supercharging Progress™', { x:2.02, y:0.22, w:3.5, h:0.40,
    fontSize:9, fontFace:'Arial', color:C.purpleLt, valign:'middle' });

  s.addText(CONFIG.client, { x:0.38, y:1.28, w:8, h:0.65,
    fontSize:44, fontFace:'Arial', bold:true, color:C.white });
  s.addText(CONFIG.solution, { x:0.38, y:1.92, w:8.5, h:0.52,
    fontSize:28, fontFace:'Arial', bold:true, color:C.purpleLt });

  s.addShape(pres.ShapeType.rect, { x:0.38, y:2.52, w:4.0, h:0.055,
    fill:{color:C.blueLt}, line:{color:C.blueLt, width:0} });
  s.addText('Multi-agent architecture and ROM estimate', {
    x:0.38, y:2.66, w:7.5, h:0.36, fontSize:13, fontFace:'Arial',
    color:C.purpleLt, italic:true });

  // ROM badge
  s.addShape(pres.ShapeType.roundRect, { x:0.38, y:3.20, w:4.4, h:1.12,
    fill:{color:'FFFFFF', transparency:85}, line:{color:C.amber, width:1.5}, rectRadius:0.08 });
  s.addText('ROM ESTIMATE', { x:0.50, y:3.26, w:4.2, h:0.22,
    fontSize:7.5, fontFace:'Arial', color:C.amber, charSpacing:2, bold:true });
  s.addText(CONFIG.rom.podDays, { x:0.50, y:3.46, w:1.90, h:0.60,
    fontSize:38, fontFace:'Arial', bold:true, color:C.amber, valign:'middle' });
  s.addText(
    `pod days  ·  ${CONFIG.rom.elapsedWeeks} elapsed weeks\n${CONFIG.rom.podRole}  ·  ${CONFIG.rom.engType}`,
    { x:2.44, y:3.50, w:2.20, h:0.55, fontSize:9, fontFace:'Arial', color:C.white, valign:'middle' });

  s.addText(`${CONFIG.presenter}  ·  ${CONFIG.date}  ·  CONFIDENTIAL`, {
    x:0.38, y:4.80, w:9, h:0.22, fontSize:7.5, fontFace:'Arial', color:C.purpleLt });

  addFooter(s, null, true);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — THE OPPORTUNITY
// ══════════════════════════════════════════════════════════════════════════════
(function slide02() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, CONFIG.slide2.headerTitle, CONFIG.slide2.headerSub, true);
  addFooter(s, 2, true);

  // Quote
  s.addShape(pres.ShapeType.rect, { x:0.28, y:1.32, w:9.44, h:0.76,
    fill:{color:C.cardMid}, line:{color:C.purple, width:1.2} });
  s.addShape(pres.ShapeType.rect, { x:0.28, y:1.32, w:0.07, h:0.76,
    fill:{color:C.purpleAc}, line:{color:C.purpleAc, width:0} });
  s.addText(CONFIG.slide2.quote, { x:0.44, y:1.36, w:9.0, h:0.68,
    fontSize:10.5, fontFace:'Arial', color:C.purpleLt, italic:true, valign:'middle' });

  // Three columns
  const cols = [
    { label:'Problem Today',      color:C.fail,   x:0.28, items: CONFIG.slide2.problems },
    { label:'Agentic Approach',   color:C.blueAc, x:3.58, items: CONFIG.slide2.agenticApproach },
    { label:'Value Delivered',    color:C.green,  x:6.88, items: CONFIG.slide2.value },
  ];
  cols.forEach(col => {
    s.addShape(pres.ShapeType.rect, { x:col.x, y:2.16, w:3.22, h:0.28,
      fill:{color:col.color}, line:{color:col.color, width:0} });
    s.addText(col.label, { x:col.x+0.08, y:2.16, w:3.10, h:0.28,
      fontSize:9, fontFace:'Arial', bold:true, color:C.white, valign:'middle' });
    col.items.forEach((item, i) => {
      const y = 2.48 + i * 0.50;
      s.addShape(pres.ShapeType.rect, { x:col.x, y, w:3.22, h:0.48,
        fill:{color: i%2===0 ? C.card : C.cardMid}, line:{color:C.card, width:0} });
      s.addShape(pres.ShapeType.rect, { x:col.x, y, w:0.05, h:0.48,
        fill:{color:col.color}, line:{color:col.color, width:0} });
      s.addText('◆ '+item, { x:col.x+0.10, y:y+0.02, w:3.05, h:0.44,
        fontSize:8.5, fontFace:'Arial', color:C.light, valign:'middle' });
    });
  });

  // User story
  s.addShape(pres.ShapeType.rect, { x:0.28, y:4.98, w:0.22, h:0.24,
    fill:{color:C.purpleAc}, line:{color:C.purpleAc, width:0} });
  s.addText('User Story  ', { x:0.38, y:5.11, w:1.1, h:0.24,
    fontSize:7, fontFace:'Arial', bold:true, color:C.purpleAc });
  s.addText(CONFIG.slide2.userStory, { x:1.42, y:5.11, w:8.1, h:0.24,
    fontSize:7.5, fontFace:'Arial', color:C.light, italic:true, valign:'middle' });
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — END-TO-END PROCESS FLOW
// ══════════════════════════════════════════════════════════════════════════════
(function slide03() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'End-to-End Process Flow', 'From source to business output — build vs. wrap boundaries', true);
  addFooter(s, 3, true);

  // Process boxes — customise these for your engagement
  const boxes = [
    { x:8,   label:'Source\nSystem',         sub:'Engineering\nsource / input',    badge:'WRAP',  bc:'#3C91FF', bg:'#1A0D4A' },
    { x:140, label:'Extraction /\nIngestion', sub:'Metadata\nextraction',           badge:'WRAP',  bc:'#3C91FF', bg:'#1A0D4A' },
    { x:272, label:'Validation\nGate',        sub:'Readiness\ncheck',              badge:'BUILD', bc:'#00C853', bg:'#0A1F0A' },
    { x:404, label:'Domain\nTool Layer',      sub:'Processing\ntool / API',        badge:'WRAP',  bc:'#3C91FF', bg:'#1A0D4A' },
    { x:536, label:'AI Scripting\n& Mapping', sub:'Target contract\nmapping',      badge:'BUILD', bc:'#00C853', bg:'#0A1F0A' },
    { x:668, label:'Output\nWriter',          sub:'Deterministic\ngeneration',     badge:'BUILD', bc:'#00C853', bg:'#0A1F0A' },
    { x:800, label:'Business\nReview',        sub:'Approve / correct\nfeed rules', badge:'WRAP',  bc:'#3C91FF', bg:'#1A0D4A' },
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 300">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#3C91FF"/>
      </marker>
    </defs>
    ${boxes.map((b,i) => `
      <rect x="${b.x}" y="50" width="112" height="170" rx="8" fill="${xe(b.bg)}" stroke="${xe(b.bc)}" stroke-width="1.5"/>
      <text font-family="Arial" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">
        ${b.label.split('\n').map((ln,li) => `<tspan x="${b.x+56}" dy="${li===0?`${50+28+(b.label.split('\n').length>2?-10:0)}`:14}">${xe(ln)}</tspan>`).join('')}
      </text>
      <text font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">
        ${b.sub.split('\n').map((ln,li) => `<tspan x="${b.x+56}" dy="${li===0?'145':12}">${xe(ln)}</tspan>`).join('')}
      </text>
      <rect x="${b.x+8}" y="192" width="96" height="18" rx="4" fill="${xe(b.bc)}" opacity="0.9"/>
      <text x="${b.x+56}" y="205" font-family="Arial" font-size="9" font-weight="bold" fill="#0F0A2A" text-anchor="middle">${xe(b.badge)}</text>
      ${i<boxes.length-1 ? `<line x1="${b.x+112}" y1="135" x2="${b.x+126}" y2="135" stroke="#3C91FF" stroke-width="2" marker-end="url(#arr)"/>` : ''}
    `).join('')}
    <rect x="8" y="256" width="904" height="28" rx="6" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="1.2"/>
    <text x="460" y="275" font-family="Arial" font-size="11" font-weight="bold" fill="#8C69F0" text-anchor="middle">Orchestrator Agent &#xB7; owns workflow state, agent invocation, exception routing, and audit coordination</text>
    <rect x="264" y="4" width="128" height="38" rx="5" fill="#00C853" opacity="0.12" stroke="#00C853" stroke-width="1"/>
    <text x="328" y="21" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">NEW: Required</text>
    <text x="328" y="35" font-family="Arial" font-size="9" fill="#00C853" text-anchor="middle">Validation Gate</text>
    <line x1="328" y1="42" x2="328" y2="50" stroke="#00C853" stroke-width="1.2" stroke-dasharray="3,2"/>
  </svg>`;

  addSvgImage(s, svg, 0.18, 1.22, 9.64, 4.00);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — HUB-AND-SPOKE MULTI-AGENT MODEL
// ══════════════════════════════════════════════════════════════════════════════
(function slide04() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'Multi-Agent Orchestration Model', 'Specialist agents invoked as callable tools by the Orchestrator', true);
  addFooter(s, 4, true);

  const cx=220, cy=175, R=130;
  const spokes = CONFIG.agents.map(a => {
    const rad = a.angle * Math.PI / 180;
    const bx = cx + R * Math.cos(rad), by = cy + R * Math.sin(rad);
    const sx = cx + 54 * Math.cos(rad), sy = cy + 54 * Math.sin(rad);
    const ex = cx + (R-38) * Math.cos(rad), ey = cy + (R-38) * Math.sin(rad);
    return `
      <line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${a.color}" stroke-width="1.5" stroke-dasharray="4,2"/>
      <rect x="${bx-50}" y="${by-28}" width="100" height="56" rx="8" fill="#1E0D4A" stroke="${a.color}" stroke-width="1.5"/>
      ${a.name.split('\n').map((ln,li) => `<text x="${bx}" y="${by-4+li*14}" font-family="Arial" font-size="10" font-weight="bold" fill="${a.color}" text-anchor="middle">${xe(ln)}</text>`).join('')}`;
  }).join('');

  const hubSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 445 360">
    ${spokes}
    <ellipse cx="${cx}" cy="${cy}" rx="54" ry="54" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="2.5"/>
    <text x="${cx}" y="${cy-8}"  font-family="Arial" font-size="10" font-weight="bold" fill="#FFFFFF" text-anchor="middle">CAT / Costing</text>
    <text x="${cx}" y="${cy+7}"  font-family="Arial" font-size="10" font-weight="bold" fill="#8C69F0" text-anchor="middle">Orchestrator</text>
    <text x="${cx}" y="${cy+20}" font-family="Arial" font-size="9"  fill="#B0BEC5" text-anchor="middle">Agent</text>
  </svg>`;
  addSvgImage(s, hubSvg, 0.10, 1.20, 4.72, 4.10);

  // Right panel responsibilities
  s.addShape(pres.ShapeType.rect, { x:5.0, y:1.20, w:4.72, h:0.34,
    fill:{color:C.purple}, line:{color:C.purple, width:0} });
  s.addText('Agent Responsibilities', { x:5.08, y:1.20, w:4.56, h:0.34,
    fontSize:9, fontFace:'Arial', bold:true, color:C.white, valign:'middle' });

  CONFIG.agents.forEach((a, i) => {
    const y = 1.58 + i * 0.58;
    s.addShape(pres.ShapeType.rect, { x:5.0, y, w:4.72, h:0.55,
      fill:{color: i%2===0 ? C.card : C.cardMid}, line:{color:C.card, width:0} });
    s.addShape(pres.ShapeType.rect, { x:5.0, y, w:0.05, h:0.55,
      fill:{color:a.color}, line:{color:a.color, width:0} });
    s.addText(a.name.replace('\n',' '), { x:5.08, y:y+0.02, w:4.55, h:0.20,
      fontSize:8.5, fontFace:'Arial', bold:true, color:a.color, valign:'middle' });
    s.addText(a.responsibility, { x:5.08, y:y+0.22, w:4.55, h:0.28,
      fontSize:7.5, fontFace:'Arial', color:C.light, valign:'middle' });
  });
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — ARCHITECTURE DATA FLOW SWIMLANE
// ══════════════════════════════════════════════════════════════════════════════
(function slide05() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'Agentic Architecture — Data Flow', 'Each specialist agent operates in its lane; artifacts hand off through the Orchestrator', true);
  addFooter(s, 5, true);

  const LX=138, SW=156, LH=43, HH=26;
  const stages = ['1  INGEST','2  VALIDATE','3  PROCESS','4  MAP + WRITE','5  QA + REVIEW'];
  const stageColors = ['#8CC8FA','#00C853','#8C69F0','#B9C8FF','#FFA726'];
  const laneConfigs = [
    { label:['CAT / Costing','Orchestrator'],  color:C.purpleAc, bg:'150A38' },
    ...CONFIG.agents.map(a => ({
      label: a.name.split('\n'),
      color: a.color.replace('#',''),
      bg:    '0B1525',
    })),
  ];

  const totalH = HH + laneConfigs.length * LH;
  const totalW = 920;
  const stageX = si => LX + si * SW;
  const laneY  = li => HH + li * LH;

  const parts = [];
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="#0F0A2A"/>`);

  stages.forEach((_,i) => {
    if (i%2===0) parts.push(`<rect x="${stageX(i)}" y="0" width="${SW}" height="${totalH}" fill="#1A0D3E" opacity="0.5"/>`);
  });

  laneConfigs.forEach((ln, li) => {
    const y = laneY(li);
    parts.push(`<rect x="0" y="${y}" width="${LX}" height="${LH}" fill="#${ln.bg}"/>`);
    parts.push(`<rect x="0" y="${y}" width="4" height="${LH}" fill="#${ln.color}"/>`);
    parts.push(`<text x="70" y="${y+LH/2-5}" font-family="Arial" font-size="8.5" font-weight="bold" fill="#${ln.color}" text-anchor="middle">${xe(ln.label[0] || '')}</text>`);
    if (ln.label[1]) parts.push(`<text x="70" y="${y+LH/2+8}" font-family="Arial" font-size="8.5" font-weight="bold" fill="#${ln.color}" text-anchor="middle">${xe(ln.label[1])}</text>`);
  });

  // Lane dividers
  for (let li=0; li<=laneConfigs.length; li++) {
    parts.push(`<line x1="0" y1="${laneY(li)}" x2="${totalW}" y2="${laneY(li)}" stroke="#1E0D4A" stroke-width="0.8"/>`);
  }
  parts.push(`<line x1="${LX}" y1="0" x2="${LX}" y2="${totalH}" stroke="#2D1870" stroke-width="1.2"/>`);
  stages.forEach((_,si) => {
    if (si > 0) parts.push(`<line x1="${stageX(si)}" y1="0" x2="${stageX(si)}" y2="${totalH}" stroke="#2D1870" stroke-width="0.7"/>`);
  });

  // Header row
  parts.push(`<rect x="0" y="0" width="${totalW}" height="${HH}" fill="#1E0D4A"/>`);
  parts.push(`<text x="70" y="17" font-family="Arial" font-size="8" fill="#546E7A" text-anchor="middle">AGENT</text>`);
  stages.forEach((st, i) => {
    parts.push(`<text x="${stageX(i)+SW/2}" y="17" font-family="Arial" font-size="9" font-weight="bold" fill="${stageColors[i]}" text-anchor="middle">${xe(st)}</text>`);
  });

  // Orchestrator spans all
  const orcY = laneY(0);
  parts.push(`<rect x="${LX+4}" y="${orcY+5}" width="${SW*5-8}" height="${LH-10}" rx="4" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="1" stroke-dasharray="5,3" opacity="0.8"/>`);
  parts.push(`<text x="${LX+(SW*5)/2}" y="${orcY+LH/2+4}" font-family="Arial" font-size="8.5" fill="#8C69F0" text-anchor="middle">Coordinates workflow state &#xB7; invokes agents &#xB7; routes exceptions &#xB7; maintains audit trail</text>`);

  // Activity boxes for agents
  CONFIG.agents.forEach((a, idx) => {
    const li  = idx + 1;
    const si  = a.stage;
    const x   = stageX(si) + 4;
    const y   = laneY(li) + 4;
    const w   = SW - 8;
    const h   = LH - 8;
    const cx2 = x + w/2;
    const cy2 = y + h/2;
    const lnColor = a.color;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#0B1525" stroke="${lnColor}" stroke-width="1.5"/>`);
    parts.push(`<text x="${cx2}" y="${cy2-4}" font-family="Arial" font-size="8.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${xe(a.activity)}</text>`);
    parts.push(`<text x="${cx2}" y="${cy2+9}" font-family="Arial" font-size="7.5" fill="${lnColor}" text-anchor="middle">${xe(a.actSub)}</text>`);
  });

  // Arrows
  parts.push(`<defs>
    <marker id="aw" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="#B9C8FF" opacity="0.9"/></marker>
  </defs>`);

  for (let i=0; i<CONFIG.agents.length-1; i++) {
    const a = CONFIG.agents[i], b = CONFIG.agents[i+1];
    if (a.stage !== b.stage) {
      const x1 = stageX(a.stage) + SW - 4;
      const y1 = laneY(i+1) + LH/2;
      const x2 = stageX(b.stage) + 4;
      const y2 = laneY(i+2) + LH/2;
      const mid = stageX(a.stage+1);
      parts.push(`<path d="M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2-7},${y2}" fill="none" stroke="#B9C8FF" stroke-width="1.5" opacity="0.65" marker-end="url(#aw)"/>`);
    }
  }

  // Validation gate badge
  parts.push(`<rect x="${stageX(1)-30}" y="${HH+2}" width="62" height="20" rx="4" fill="#00C853" opacity="0.15" stroke="#00C853" stroke-width="0.8"/>`);
  parts.push(`<text x="${stageX(1)+1}" y="${HH+15}" font-family="Arial" font-size="7.5" font-weight="bold" fill="#00C853" text-anchor="middle">GATE</text>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}">${parts.join('')}</svg>`;
  addSvgImage(s, svg, 0.15, 1.20, 9.70, 4.05);
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — AGENT RESPONSIBILITIES TABLE
// ══════════════════════════════════════════════════════════════════════════════
(function slide06() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'Specialist Agent Responsibilities', 'Each agent has a defined role, bounded tools, and structured output schema', true);
  addFooter(s, 6, true);

  const cols = [
    { label:'Agent',           x:0.28, w:2.40 },
    { label:'Role / Purpose',  x:2.72, w:3.60 },
    { label:'Primary Outputs', x:6.36, w:3.36 },
  ];
  cols.forEach(c => {
    s.addShape(pres.ShapeType.rect, { x:c.x, y:1.28, w:c.w-0.04, h:0.30,
      fill:{color:C.purple}, line:{color:C.purple, width:0} });
    s.addText(c.label, { x:c.x+0.08, y:1.28, w:c.w-0.12, h:0.30,
      fontSize:9, fontFace:'Arial', bold:true, color:C.white, valign:'middle' });
  });

  CONFIG.agentTable.forEach((row, i) => {
    const y = 1.62 + i * 0.52;
    const bg = i%2===0 ? C.card : C.cardMid;
    s.addShape(pres.ShapeType.rect, { x:0.28, y, w:9.44, h:0.50, fill:{color:bg}, line:{color:C.card, width:0} });
    s.addShape(pres.ShapeType.rect, { x:0.28, y, w:0.05, h:0.50, fill:{color:row.color}, line:{color:row.color, width:0} });
    s.addText(row.agent, { x:0.36, y:y+0.03, w:2.30, h:0.44,
      fontSize:8.5, fontFace:'Arial', bold:true, color:row.color, valign:'middle' });
    s.addText(row.role, { x:2.72, y:y+0.03, w:3.56, h:0.44,
      fontSize:7.5, fontFace:'Arial', color:C.light, valign:'middle' });
    s.addText(row.out, { x:6.36, y:y+0.03, w:3.30, h:0.44,
      fontSize:7.5, fontFace:'Arial', color:C.purpleLt, italic:true, valign:'middle' });
  });
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDES 7–10 — Deep-dive slides
// Adapt these to the specific engagement. Each follows the same pattern:
// addBranding → addHeader → addFooter → addSvgImage or text content
// ══════════════════════════════════════════════════════════════════════════════
['Required Validation Step','Should Costing Tool Adapter Layer',
 'AI Scripting, Mapping, and Output','Controlled Orchestration Workflow'].forEach((title, idx) => {
  const n = 7 + idx;
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, title, 'Replace this slide with engagement-specific content', true);
  addFooter(s, n, true);
  s.addText(`[ Deep-dive diagram for: ${title} ]\n\nAdapt this slide with the specific SVG diagram or content for your engagement.\nSee references/deck-structure.md for what each slide should contain.`, {
    x:0.5, y:1.5, w:9, h:3.5, fontSize:14, fontFace:'Arial', color:C.muted,
    align:'center', valign:'middle', italic:true,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — BUILD VS. WRAP
// ══════════════════════════════════════════════════════════════════════════════
(function slide11() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'Build vs. Wrap — Scope Boundary', 'HCLTech builds the agentic control layer; enterprise tools are wrapped', true);
  addFooter(s, 11, true);

  // Two columns
  [[C.green, 'BUILD — HCLTech Develops', CONFIG.slide11.build, 0.28],
   [C.blueAc, 'WRAP — Orchestrated via Tool Adapters', CONFIG.slide11.wrap, 5.08]].forEach(([col, label, items, x]) => {
    s.addShape(pres.ShapeType.rect, { x, y:1.28, w:4.54, h:0.32,
      fill:{color:col}, line:{color:col, width:0} });
    s.addText(label, { x:x+0.10, y:1.28, w:4.34, h:0.32,
      fontSize:9, fontFace:'Arial', bold:true, color:C.white, valign:'middle' });
    items.forEach((item, i) => {
      const y = 1.64 + i * 0.42;
      s.addShape(pres.ShapeType.rect, { x, y, w:4.54, h:0.40,
        fill:{color: i%2===0 ? C.card : C.cardMid}, line:{color:C.card, width:0} });
      s.addShape(pres.ShapeType.rect, { x, y, w:0.05, h:0.40,
        fill:{color:col}, line:{color:col, width:0} });
      s.addText('◆ '+item, { x:x+0.12, y:y+0.02, w:4.32, h:0.36,
        fontSize:8.5, fontFace:'Arial', color:C.light, valign:'middle' });
    });
  });

  // Divider line
  s.addShape(pres.ShapeType.rect, { x:4.87, y:1.22, w:0.06, h:3.90,
    fill:{color:C.cardMid}, line:{color:C.cardMid, width:0} });
  s.addText('HCLTech builds this boundary →', { x:0.28, y:4.90, w:4.54, h:0.20,
    fontSize:7.5, fontFace:'Arial', color:C.green, italic:true });
  s.addText('← These are orchestrated, not replaced', { x:5.08, y:4.90, w:4.54, h:0.20,
    fontSize:7.5, fontFace:'Arial', color:C.blueAc, italic:true });
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — ROM ESTIMATE
// ══════════════════════════════════════════════════════════════════════════════
(function slide12() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'ROM Estimate — MVP Solution',
    `${CONFIG.rom.podDays} pod days  ·  ${CONFIG.rom.elapsedWeeks} elapsed weeks  ·  ${CONFIG.rom.podRole}`, true);
  addFooter(s, 12, true);

  // 4 big-number cards
  const cards = [
    { label:'Full Pod Days',          value:CONFIG.rom.podDays,     color:C.amber  },
    { label:'Elapsed Weeks',          value:CONFIG.rom.elapsedWeeks,color:C.blueLt },
    { label:'Agentic Pod',            value:'3-role',               color:C.green  },
    { label:'If Complexity Triggered',value:CONFIG.rom.contingency, color:C.purple },
  ];
  cards.forEach((card, i) => {
    const x = 0.28 + i * 2.42;
    s.addShape(pres.ShapeType.roundRect, { x, y:1.28, w:2.28, h:1.24,
      fill:{color:C.card}, line:{color:card.color, width:1.5}, rectRadius:0.08 });
    s.addText(card.value, { x, y:1.34, w:2.28, h:0.72,
      fontSize:card.value.length > 4 ? 30 : 38, fontFace:'Arial', bold:true,
      color:card.color, align:'center', valign:'middle' });
    s.addText(card.label, { x, y:2.06, w:2.28, h:0.40,
      fontSize:8, fontFace:'Arial', color:C.light, align:'center', valign:'middle' });
  });

  // Workstream table
  s.addShape(pres.ShapeType.rect, { x:0.28, y:2.66, w:7.40, h:0.26,
    fill:{color:C.purple}, line:{color:C.purple, width:0} });
  s.addText('Workstream', { x:0.36, y:2.66, w:5.50, h:0.26,
    fontSize:8.5, fontFace:'Arial', bold:true, color:C.white, valign:'middle' });
  s.addText('Weight', { x:5.90, y:2.66, w:1.70, h:0.26,
    fontSize:8.5, fontFace:'Arial', bold:true, color:C.white, align:'center', valign:'middle' });

  CONFIG.workstreams.forEach((ws, i) => {
    const y = 2.94 + i * 0.30;
    const bg = i%2===0 ? C.card : C.cardMid;
    s.addShape(pres.ShapeType.rect, { x:0.28, y, w:7.40, h:0.28, fill:{color:bg}, line:{color:bg, width:0} });
    s.addText(ws.label, { x:0.36, y:y+0.02, w:5.44, h:0.24,
      fontSize:8, fontFace:'Arial', color:C.light, valign:'middle' });
    s.addText(ws.weight, { x:5.90, y:y+0.02, w:1.70, h:0.24,
      fontSize:8, fontFace:'Arial',
      color: ws.weight==='High' ? C.amber : C.blueLt, align:'center', valign:'middle' });
  });

  const totalY = 2.94 + CONFIG.workstreams.length * 0.30;
  s.addShape(pres.ShapeType.rect, { x:0.28, y:totalY, w:7.40, h:0.30,
    fill:{color:C.cardLt}, line:{color:C.amber, width:0.8} });
  s.addText('Recommended MVP Baseline', { x:0.36, y:totalY+0.02, w:5.44, h:0.26,
    fontSize:9, fontFace:'Arial', bold:true, color:C.white, valign:'middle' });
  s.addText(`${CONFIG.rom.podDays} full pod days`, { x:5.90, y:totalY+0.02, w:1.70, h:0.26,
    fontSize:9, fontFace:'Arial', bold:true, color:C.amber, align:'center', valign:'middle' });

  s.addText('ROM basis: one bounded MVP Solution path · agentic pod commercial unit · not a production commitment', {
    x:0.28, y:totalY+0.36, w:9.44, h:0.18,
    fontSize:7, fontFace:'Arial', color:C.muted, italic:true });
})();

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — ASSUMPTIONS AND CLOSE
// ══════════════════════════════════════════════════════════════════════════════
(function slide13() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  addBranding(s, true);
  addHeader(s, 'Assumptions and Decisions Needed', 'Items to confirm before MVP Solution sprint planning begins', true);
  addFooter(s, 13, true);

  [[C.green, 'Key Assumptions', CONFIG.slide13.assumptions, 0.28],
   [C.amber, 'Decisions Needed', CONFIG.slide13.decisions, 5.22]].forEach(([col, label, items, x]) => {
    s.addShape(pres.ShapeType.rect, { x, y:1.28, w:4.44, h:0.30,
      fill:{color:C.card}, line:{color:col, width:1.2} });
    s.addShape(pres.ShapeType.rect, { x, y:1.28, w:0.06, h:0.30,
      fill:{color:col}, line:{color:col, width:0} });
    s.addText(label, { x:x+0.12, y:1.28, w:4.24, h:0.30,
      fontSize:9, fontFace:'Arial', bold:true, color:col, valign:'middle' });
    items.forEach((item, i) => {
      const y = 1.62 + i * 0.54;
      s.addShape(pres.ShapeType.rect, { x, y, w:4.44, h:0.50,
        fill:{color: i%2===0 ? C.card : C.cardMid}, line:{color:C.card, width:0} });
      s.addText((col===C.green ? '✔' : '◆') + '  ' + item,
        { x:x+0.10, y:y+0.03, w:4.26, h:0.44,
          fontSize:8.5, fontFace:'Arial', color:C.light, valign:'middle' });
    });
  });

  // Closing CTA
  s.addShape(pres.ShapeType.rect, { x:0.28, y:4.96, w:9.44, h:0.22,
    fill:{color:C.cardMid}, line:{color:C.purple, width:0.8} });
  s.addText(`Next Step: Confirm scope and engagement classification · Name the agentic pod · Schedule kick-off · ${CONFIG.presenter}`, {
    x:0.38, y:4.98, w:9.24, h:0.18,
    fontSize:7.5, fontFace:'Arial', color:C.purpleLt, italic:true, valign:'middle' });
})();

// ══════════════════════════════════════════════════════════════════════════════
// WRITE FILE — resolve all SVG→PNG promises first
// ══════════════════════════════════════════════════════════════════════════════
const outDir = path.dirname(CONFIG.outputPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

Promise.all(_deferred.map(d => d.p.then(buf => ({ ...d, buf }))))
  .then(resolved => {
    resolved.forEach(({ slide, x, y, w, h, buf }) => {
      slide.addImage({ data: 'data:image/png;base64,' + buf.toString('base64'), x, y, w, h });
    });
    return pres.writeFile({ fileName: CONFIG.outputPath });
  })
  .then(() => console.log('✅  Written:', CONFIG.outputPath))
  .catch(e  => { console.error('❌', e); process.exit(1); });
