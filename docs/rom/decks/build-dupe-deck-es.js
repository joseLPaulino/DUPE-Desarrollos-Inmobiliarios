'use strict';
/**
 * HCLTech — DUPE Desarrollos Inmobiliarios
 * Plataforma Agéntica de Negocios — Presentación en Español
 * node build-dupe-deck-es.js
 */

const pptxgen = require('pptxgenjs');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

// ══════════════════════════════════════════════════════════════════════════════
// PALETA DE COLORES HCLTech
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
// SVG → PNG (deferred)
// ══════════════════════════════════════════════════════════════════════════════
const _deferred = [];
function addSvgImage(slide, svgStr, x, y, w, h) {
  const tmp = path.join(os.tmpdir(), `hcl_svg_${Date.now()}_${Math.random().toString(36).slice(2)}.svg`);
  fs.writeFileSync(tmp, svgStr);
  const p = sharp(tmp, { density:220 })
    .resize(3840, 2160, { fit:'contain', background:{r:15,g:10,b:42,alpha:1} })
    .png({ compressionLevel:6 }).toBuffer();
  _deferred.push({ slide, x, y, w, h, p });
}
function xe(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// PORTADA — generar title_bg.png si no existe
// ══════════════════════════════════════════════════════════════════════════════
const TITLE_BG = path.join(__dirname, 'title_bg.png');
if (!fs.existsSync(TITLE_BG)) {
  const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F0A2A"/>
      <stop offset="45%" stop-color="#2D1870"/>
      <stop offset="75%" stop-color="#5F1EBE"/>
      <stop offset="100%" stop-color="#0F5FDC"/>
    </linearGradient></defs>
    <rect width="3840" height="2160" fill="url(#g)"/>
    ${Array.from({length:28},(_,r)=>Array.from({length:50},(_,c)=>
      `<circle cx="${c*80+40}" cy="${r*80+40}" r="1.2" fill="#FFFFFF" opacity="0.06"/>`
    ).join('')).join('')}
  </svg>`;
  sharp(Buffer.from(gradSvg),{density:220}).resize(3840,2160,{fit:'fill'})
    .png({compressionLevel:6}).toFile(TITLE_BG, err=>{ if(err){console.error(err);process.exit(1);} });
}

// ══════════════════════════════════════════════════════════════════════════════
// PRESENTACIÓN
// ══════════════════════════════════════════════════════════════════════════════
const pres = new pptxgen();
pres.layout  = 'LAYOUT_16x9';
pres.author  = 'HCLTech AI Labs';
pres.company = 'HCLTech';
pres.title   = 'DUPE Desarrollos Inmobiliarios — Plataforma Agéntica de Negocios';

// ── Helpers de cromo ─────────────────────────────────────────────────────────
function addBranding(slide) {
  slide.addText([
    { text:'HCL',  options:{ bold:true, color:C.white } },
    { text:'Tech', options:{ bold:true, color:C.purpleAc } },
  ],{ x:0.28, y:0.14, w:1.6, h:0.34, fontSize:16, fontFace:'Arial', valign:'middle' });
  slide.addText('| Supercharging Progress™',{
    x:1.82, y:0.14, w:3, h:0.34, fontSize:8, fontFace:'Arial', color:C.purpleLt, valign:'middle' });
}
function addFooter(slide, n) {
  slide.addShape(pres.ShapeType.rect,{x:0,y:5.44,w:10,h:0.19,fill:{color:C.card},line:{color:C.card,width:0}});
  slide.addShape(pres.ShapeType.rect,{x:0,  y:5.435,w:3.3,h:0.012,fill:{color:C.purple},  line:{color:C.purple,  width:0}});
  slide.addShape(pres.ShapeType.rect,{x:3.3,y:5.435,w:3.4,h:0.012,fill:{color:C.blue},    line:{color:C.blue,    width:0}});
  slide.addShape(pres.ShapeType.rect,{x:6.7,y:5.435,w:3.3,h:0.012,fill:{color:C.purpleAc},line:{color:C.purpleAc,width:0}});
  if(n) slide.addText(String(n),{x:0.22,y:5.45,w:0.3,h:0.18,fontSize:7,fontFace:'Arial',color:C.muted,valign:'middle'});
  slide.addText('Copyright © 2026 HCLTech  |  Confidencial',{
    x:0.58,y:5.45,w:5,h:0.18,fontSize:6.5,fontFace:'Arial',color:C.muted,valign:'middle'});
  slide.addText([
    { text:'HCL',  options:{ bold:true, color:C.blue } },
    { text:'Tech', options:{ bold:true, color:C.purple } },
  ],{x:8.85,y:5.44,w:1.0,h:0.19,fontSize:11,fontFace:'Arial',valign:'middle',align:'right'});
}
function addHeader(slide, title, sub) {
  slide.addShape(pres.ShapeType.rect,{x:0.28,y:0.56,w:0.055,h:sub?0.64:0.42,fill:{color:C.purple},line:{color:C.purple,width:0}});
  slide.addText(title,{x:0.40,y:0.54,w:9.2,h:0.42,fontSize:22,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
  if(sub) slide.addText(sub,{x:0.40,y:0.98,w:9.2,h:0.22,fontSize:10,fontFace:'Arial',color:C.purpleAc,italic:true,valign:'middle'});
}

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 1 — PORTADA
// ══════════════════════════════════════════════════════════════════════════════
(function slide01() {
  const s = pres.addSlide();
  s.addImage({ path:TITLE_BG, x:0, y:0, w:10, h:5.63 });
  s.addText([
    { text:'HCL',  options:{ bold:true, color:C.white } },
    { text:'Tech', options:{ bold:true, color:C.purpleLt } },
  ],{x:0.38,y:0.22,w:1.7,h:0.40,fontSize:20,fontFace:'Arial',valign:'middle'});
  s.addText('| Supercharging Progress™',{x:2.02,y:0.22,w:3.5,h:0.40,fontSize:9,fontFace:'Arial',color:C.purpleLt,valign:'middle'});
  s.addText('DUPE Desarrollos Inmobiliarios',{x:0.38,y:1.28,w:9,h:0.65,fontSize:38,fontFace:'Arial',bold:true,color:C.white});
  s.addText('Plataforma Agéntica de Negocios',{x:0.38,y:1.92,w:9,h:0.52,fontSize:26,fontFace:'Arial',bold:true,color:C.purpleLt});
  s.addShape(pres.ShapeType.rect,{x:0.38,y:2.52,w:4.0,h:0.055,fill:{color:C.blueLt},line:{color:C.blueLt,width:0}});
  s.addText('Arquitectura L1 Multi-Agente · Estimado ROM · Propuesta HCLTech AI Labs',{
    x:0.38,y:2.66,w:9,h:0.36,fontSize:12,fontFace:'Arial',color:C.purpleLt,italic:true});

  // Insignia ROM
  s.addShape(pres.ShapeType.roundRect,{x:0.38,y:3.20,w:4.8,h:1.12,fill:{color:'FFFFFF',transparency:85},line:{color:C.amber,width:1.5},rectRadius:0.08});
  s.addText('ESTIMADO ROM',{x:0.50,y:3.26,w:4.6,h:0.22,fontSize:7.5,fontFace:'Arial',color:C.amber,charSpacing:2,bold:true});
  s.addText('14–18',{x:0.50,y:3.46,w:2.0,h:0.60,fontSize:38,fontFace:'Arial',bold:true,color:C.amber,valign:'middle'});
  s.addText('días de pod  ·  ~7–8 semanas calendario\nPod agéntico de 3 roles  ·  Solución MVP',{
    x:2.54,y:3.50,w:2.50,h:0.55,fontSize:9,fontFace:'Arial',color:C.white,valign:'middle'});
  s.addText('Jose Paulino · Arquitecto Senior de Soluciones IA, HCLTech AI Labs  ·  Junio 2026  ·  CONFIDENCIAL',{
    x:0.38,y:4.80,w:9.2,h:0.22,fontSize:7.5,fontFace:'Arial',color:C.purpleLt});
  addFooter(s, null);
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 1: Portada

Bienvenida y contexto:
• Presentar la propuesta de HCLTech AI Labs para DUPE Desarrollos Inmobiliarios.
• Esta presentación cubre la arquitectura L1 de la Plataforma Agéntica de Negocios y el estimado ROM (Rough Order of Magnitude).
• El objetivo de hoy es alinear el entendimiento del problema, validar la arquitectura propuesta y confirmar los supuestos de trabajo.
• La plataforma reemplazará todos los procesos manuales de Excel de DUPE con un sistema integrado y automatizado.

Puntos clave a enfatizar:
• Dos módulos: Gestión Financiera y Gestión de Cobros — integrados bajo una sola plataforma agéntica.
• El estimado ROM es 14–18 días de pod en ~7–8 semanas calendario.
• Clasificación: Solución MVP (no un PoC desechable — DUPE necesita un sistema operativo real desde el primer día).`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 2 — LA OPORTUNIDAD
// ══════════════════════════════════════════════════════════════════════════════
(function slide02() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'La Oportunidad', 'Dos módulos. Una plataforma agéntica. Cero seguimiento manual.');
  addFooter(s, 2);

  // Cita
  s.addShape(pres.ShapeType.rect,{x:0.28,y:1.32,w:9.44,h:0.76,fill:{color:C.cardMid},line:{color:C.purple,width:1.2}});
  s.addShape(pres.ShapeType.rect,{x:0.28,y:1.32,w:0.07,h:0.76,fill:{color:C.purpleAc},line:{color:C.purpleAc,width:0}});
  s.addText('"Manejamos todo en Excel — presupuestos, flujo de caja, cobros — y no tenemos visibilidad en tiempo real del estado de nuestros proyectos."',{
    x:0.44,y:1.36,w:9.0,h:0.68,fontSize:10.5,fontFace:'Arial',color:C.purpleLt,italic:true,valign:'middle'});

  const cols = [
    { label:'Problema Actual', color:C.fail, x:0.28, items:[
      'Presupuesto y flujo de caja en hojas de Excel desconectadas',
      'Conciliación bancaria 100% manual — partidas asignadas a mano',
      'Oficiales envían mensajes de WhatsApp/correo individualmente',
      'Sin escalación automática de morosidad a gerencia o legal',
      'Reporte gerencial semanal compilado manualmente de múltiples archivos',
    ]},
    { label:'Enfoque Agéntico', color:C.blueAc, x:3.58, items:[
      'Orquestador coordina módulos de Finanzas y Cobros de extremo a extremo',
      'Agente de Conciliación empareja transacciones bancarias automáticamente',
      'Agente de Notificaciones despacha WhatsApp + correo según plan de pagos',
      'Lógica de escalación en Día +1, +6, +16 sin seguimiento manual',
      'Agente de Reportes compila y envía reporte PDF semanal automáticamente',
    ]},
    { label:'Valor Entregado', color:C.green, x:6.88, items:[
      'Tiempo del oficial liberado de captura manual hacia revisión de excepciones',
      'Meta: 90%+ de transacciones conciliadas automáticamente',
      'Cero recordatorios de pago omitidos — cada cuota monitoreada',
      'Gerencia notificada antes de que la cartera se deteriore',
      'Dashboard ejecutivo en tiempo real reemplaza compilación semanal',
    ]},
  ];
  cols.forEach(col => {
    s.addShape(pres.ShapeType.rect,{x:col.x,y:2.16,w:3.22,h:0.28,fill:{color:col.color},line:{color:col.color,width:0}});
    s.addText(col.label,{x:col.x+0.08,y:2.16,w:3.10,h:0.28,fontSize:9,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
    col.items.forEach((item,i) => {
      const y = 2.48 + i * 0.50;
      s.addShape(pres.ShapeType.rect,{x:col.x,y,w:3.22,h:0.48,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
      s.addShape(pres.ShapeType.rect,{x:col.x,y,w:0.05,h:0.48,fill:{color:col.color},line:{color:col.color,width:0}});
      s.addText('◆ '+item,{x:col.x+0.10,y:y+0.02,w:3.05,h:0.44,fontSize:8.5,fontFace:'Arial',color:C.light,valign:'middle'});
    });
  });

  s.addShape(pres.ShapeType.rect,{x:0.28,y:4.98,w:0.22,h:0.24,fill:{color:C.purpleAc},line:{color:C.purpleAc,width:0}});
  s.addText('Historia de Usuario  ',{x:0.38,y:5.11,w:1.5,h:0.24,fontSize:7,fontFace:'Arial',bold:true,color:C.purpleAc});
  s.addText('Como oficial de cobros de DUPE, quiero que el sistema concilie transacciones y envíe recordatorios automáticamente para enfocarme en excepciones y relaciones con clientes.',{
    x:1.82,y:5.11,w:7.7,h:0.24,fontSize:7.5,fontFace:'Arial',color:C.light,italic:true,valign:'middle'});
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 2: La Oportunidad

Problema central:
• DUPE maneja proyectos inmobiliarios de 24–48 meses y 100–480+ unidades completamente en Excel.
• No existe integración entre finanzas, conciliación bancaria y cobros.
• El equipo de cobros envía mensajes individuales de WhatsApp y correo sin automatización.

Énfasis clave:
• Columna izquierda (PROBLEMA): son los puntos de dolor confirmados en el cuestionario completado por DUPE.
• Columna central (ENFOQUE): estos son los agentes y capacidades que HCLTech construirá.
• Columna derecha (VALOR): métricas de éxito concretas que mediremos en el MVP.

Preguntar al cliente: "¿Reconocen estos problemas como sus principales puntos de dolor? ¿Hay algo que consideran prioritario que no está aquí?"`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 3 — FLUJO DEL PROCESO DE EXTREMO A EXTREMO
// ══════════════════════════════════════════════════════════════════════════════
(function slide03() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Flujo del Proceso — De Extremo a Extremo', 'Desde la fuente de datos hasta el output del negocio · qué construimos vs. qué orquestamos');
  addFooter(s, 3);

  const boxes = [
    { x:8,   label:'Extracto\nBancario',        sub:'CSV/TXT\nBanco Popular',     badge:'ORQUESTAR', bc:'#3C91FF', bg:'#1A0D4A' },
    { x:140, label:'Parser de\nArchivo',         sub:'Transacciones\nestructuradas', badge:'CONSTRUIR', bc:'#00C853', bg:'#0A1F0A' },
    { x:272, label:'Agente de\nConciliación',    sub:'Partida ↔\ntransacción',     badge:'CONSTRUIR', bc:'#00C853', bg:'#0A1F0A' },
    { x:404, label:'Módulo\nFinanciero',         sub:'Presupuesto ·\nCash Flow',   badge:'CONSTRUIR', bc:'#00C853', bg:'#0A1F0A' },
    { x:536, label:'Módulo de\nCobros',          sub:'Planes de\npago · Cuotas',  badge:'CONSTRUIR', bc:'#00C853', bg:'#0A1F0A' },
    { x:668, label:'Notificaciones\nAutomáticas',sub:'WhatsApp\n+ Correo',         badge:'CONSTRUIR', bc:'#00C853', bg:'#0A1F0A' },
    { x:800, label:'Dashboard\nGerencial',       sub:'KPIs · Alertas\n· Reportes', badge:'CONSTRUIR', bc:'#00C853', bg:'#0A1F0A' },
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 300">
    <defs><marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#3C91FF"/>
    </marker></defs>
    ${boxes.map((b,i)=>`
      <rect x="${b.x}" y="50" width="112" height="170" rx="8" fill="${xe(b.bg)}" stroke="${xe(b.bc)}" stroke-width="1.5"/>
      <text font-family="Arial" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">
        ${b.label.split('\n').map((ln,li)=>`<tspan x="${b.x+56}" dy="${li===0?'82':14}">${xe(ln)}</tspan>`).join('')}
      </text>
      <text font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">
        ${b.sub.split('\n').map((ln,li)=>`<tspan x="${b.x+56}" dy="${li===0?'130':12}">${xe(ln)}</tspan>`).join('')}
      </text>
      <rect x="${b.x+8}" y="192" width="96" height="18" rx="4" fill="${xe(b.bc)}" opacity="0.9"/>
      <text x="${b.x+56}" y="205" font-family="Arial" font-size="8.5" font-weight="bold" fill="#0F0A2A" text-anchor="middle">${xe(b.badge)}</text>
      ${i<boxes.length-1?`<line x1="${b.x+112}" y1="135" x2="${b.x+126}" y2="135" stroke="#3C91FF" stroke-width="2" marker-end="url(#arr)"/>`:''}
    `).join('')}
    <rect x="8" y="256" width="904" height="28" rx="6" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="1.2"/>
    <text x="460" y="275" font-family="Arial" font-size="11" font-weight="bold" fill="#8C69F0" text-anchor="middle">Orquestador Agéntico · propietario del estado del flujo, invocación de agentes, enrutamiento de excepciones y auditoría</text>
  </svg>`;
  addSvgImage(s, svg, 0.18, 1.22, 9.64, 4.00);
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 3: Flujo del Proceso

Explicar el flujo de izquierda a derecha:
1. El oficial descarga el extracto bancario de Banco Popular (CSV/TXT) y lo carga al sistema.
2. El Parser convierte el archivo en transacciones estructuradas (fecha, monto, descripción, referencia).
3. El Agente de Conciliación empareja cada transacción con su partida presupuestaria correspondiente.
4. Los datos fluyen al Módulo Financiero para actualizar presupuesto, cash flow y contabilidad.
5. El Módulo de Cobros maneja los planes de pago y cuotas de cada cliente.
6. Las Notificaciones Automáticas se despachan según el calendario del plan de pagos.
7. El Dashboard Gerencial consolida todo en tiempo real con KPIs y alertas semaforizadas.

Aclaración clave:
• CONSTRUIR (verde) = HCLTech desarrolla desde cero.
• ORQUESTAR (azul) = sistemas externos que integramos sin reemplazar.
• El Orquestador Agéntico coordina todo el flujo de principio a fin.`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 4 — MODELO MULTI-AGENTE (HUB-AND-SPOKE)
// ══════════════════════════════════════════════════════════════════════════════
(function slide04() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Modelo Multi-Agente de Orquestación', 'Agentes especializados invocados como herramientas controladas por el Orquestador');
  addFooter(s, 4);

  const agents = [
    { name:'Agente de\nConciliación',    color:'#3C91FF', angle:-90,  resp:'Empareja transacciones bancarias a partidas; puntúa confianza; aprende de decisiones del oficial' },
    { name:'Agente de\nNotificaciones',  color:'#00C853', angle:-18,  resp:'Escanea planes de pago diariamente; despacha WhatsApp y correo; registra estado de entrega' },
    { name:'Agente de\nInteligencia Fin.',color:'#8C69F0', angle:54,  resp:'Monitorea ejecución vs. presupuesto; calcula desviaciones; asigna estado semaforizado por partida' },
    { name:'Enrutador de\nEscalación',   color:'#EF5350', angle:126,  resp:'Activa alertas al oficial (Día +1), notificación a gerencia (Día +6), bandera legal (Día +16)' },
    { name:'Agente de\nReportes',        color:'#FFA726', angle:198,  resp:'Compila reporte gerencial PDF semanal; genera Balance General, Estado de Resultados, Flujo de Efectivo' },
  ];

  const cx=220, cy=185, R=130;
  const spokes = agents.map(a => {
    const rad = a.angle * Math.PI/180;
    const bx = cx + R * Math.cos(rad), by = cy + R * Math.sin(rad);
    const sx = cx + 56 * Math.cos(rad), sy = cy + 56 * Math.sin(rad);
    const ex = cx + (R-38) * Math.cos(rad), ey = cy + (R-38) * Math.sin(rad);
    return `
      <line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${a.color}" stroke-width="1.5" stroke-dasharray="4,2"/>
      <rect x="${bx-52}" y="${by-28}" width="104" height="56" rx="8" fill="#1E0D4A" stroke="${a.color}" stroke-width="1.5"/>
      ${a.name.split('\n').map((ln,li)=>`<text x="${bx}" y="${by-4+li*14}" font-family="Arial" font-size="10" font-weight="bold" fill="${a.color}" text-anchor="middle">${xe(ln)}</text>`).join('')}`;
  }).join('');

  const hubSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 455 375">
    ${spokes}
    <ellipse cx="${cx}" cy="${cy}" rx="56" ry="56" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="2.5"/>
    <text x="${cx}" y="${cy-8}"  font-family="Arial" font-size="10" font-weight="bold" fill="#FFFFFF" text-anchor="middle">Orquestador</text>
    <text x="${cx}" y="${cy+7}"  font-family="Arial" font-size="10" font-weight="bold" fill="#8C69F0" text-anchor="middle">Agéntico</text>
  </svg>`;
  addSvgImage(s, hubSvg, 0.10, 1.20, 4.72, 4.10);

  s.addShape(pres.ShapeType.rect,{x:5.0,y:1.20,w:4.72,h:0.34,fill:{color:C.purple},line:{color:C.purple,width:0}});
  s.addText('Responsabilidades de los Agentes',{x:5.08,y:1.20,w:4.56,h:0.34,fontSize:9,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
  agents.forEach((a,i) => {
    const y = 1.58 + i * 0.66;
    s.addShape(pres.ShapeType.rect,{x:5.0,y,w:4.72,h:0.62,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
    s.addShape(pres.ShapeType.rect,{x:5.0,y,w:0.05,h:0.62,fill:{color:a.color},line:{color:a.color,width:0}});
    s.addText(a.name.replace('\n',' '),{x:5.08,y:y+0.03,w:4.55,h:0.22,fontSize:8.5,fontFace:'Arial',bold:true,color:a.color,valign:'middle'});
    s.addText(a.resp,{x:5.08,y:y+0.25,w:4.55,h:0.34,fontSize:7.5,fontFace:'Arial',color:C.light,valign:'middle'});
  });
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 4: Modelo Multi-Agente

Concepto clave para explicar al cliente:
• El Orquestador es el "director de orquesta" — no ejecuta tareas, sino que coordina qué agente hace qué y cuándo.
• Cada agente especializado tiene un rol acotado, herramientas específicas y salidas estructuradas.
• Este diseño garantiza que la plataforma sea auditable, predecible y extensible.

Agentes y sus responsabilidades:
1. Agente de Conciliación → Módulo Financiero (conciliación bancaria diaria).
2. Agente de Notificaciones → Módulo de Cobros (WhatsApp + correo automático).
3. Agente de Inteligencia Financiera → Dashboard ejecutivo (alertas y KPIs en tiempo real).
4. Enrutador de Escalación → Gestión de morosidad (Día +1/+6/+16 overdue).
5. Agente de Reportes → Reporte semanal PDF y estados financieros bajo demanda.

Pregunta para el cliente: "¿Hay algún proceso que no vean representado aquí que consideran crítico para el MVP?"`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 5 — FLUJO DE DATOS (SWIMLANE)
// ══════════════════════════════════════════════════════════════════════════════
(function slide05() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Arquitectura Agéntica — Flujo de Datos', 'Cada agente especializado opera en su carril; los artefactos se transfieren a través del Orquestador');
  addFooter(s, 5);

  const LX=148, SW=154, LH=45, HH=28;
  const stages = ['1  INGERIR','2  CONCILIAR','3  PROCESAR','4  NOTIFICAR','5  QA + REVISAR'];
  const stageColors = ['#8CC8FA','#00C853','#8C69F0','#FFA726','#3C91FF'];
  const agentRows = [
    { label:['Orquestador','Agéntico'],    color:C.purpleAc, bg:'150A38', stage:-1 },
    { label:['Agente de','Conciliación'],  color:'3C91FF',   bg:'0B1525', stage:1 },
    { label:['Agente de','Notificaciones'],color:'00C853',   bg:'0B1525', stage:3 },
    { label:['Intel. Financiera'],         color:'8C69F0',   bg:'0B1525', stage:2 },
    { label:['Enrutador de','Escalación'], color:'EF5350',   bg:'0B1525', stage:3 },
    { label:['Agente de','Reportes'],      color:'FFA726',   bg:'0B1525', stage:4 },
  ];
  const activities = [
    null,
    { stage:1, act:'Empareja\nTransacciones', sub:'banco → partida' },
    { stage:3, act:'Despacha\nNotificaciones', sub:'WA · correo · estado' },
    { stage:2, act:'Monitorea\nPresupuesto',   sub:'KPIs · alertas' },
    { stage:3, act:'Escala\nMorosidad',        sub:'Día +1/+6/+16' },
    { stage:4, act:'Genera\nReportes',         sub:'PDF · Excel' },
  ];

  const totalH = HH + agentRows.length * LH;
  const totalW = 920;
  const stageX = si => LX + si * SW;
  const laneY  = li => HH + li * LH;
  const parts = [];
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="#0F0A2A"/>`);
  stages.forEach((_,i) => {
    if(i%2===0) parts.push(`<rect x="${stageX(i)}" y="0" width="${SW}" height="${totalH}" fill="#1A0D3E" opacity="0.5"/>`);
  });
  agentRows.forEach((ln,li) => {
    const y = laneY(li);
    parts.push(`<rect x="0" y="${y}" width="${LX}" height="${LH}" fill="#${ln.bg}"/>`);
    parts.push(`<rect x="0" y="${y}" width="4" height="${LH}" fill="#${ln.color}"/>`);
    ln.label.forEach((txt,ti) => {
      parts.push(`<text x="74" y="${y+LH/2+(ti-ln.label.length/2+0.5)*13}" font-family="Arial" font-size="8.5" font-weight="bold" fill="#${ln.color}" text-anchor="middle">${xe(txt)}</text>`);
    });
  });
  for(let li=0;li<=agentRows.length;li++) parts.push(`<line x1="0" y1="${laneY(li)}" x2="${totalW}" y2="${laneY(li)}" stroke="#1E0D4A" stroke-width="0.8"/>`);
  parts.push(`<line x1="${LX}" y1="0" x2="${LX}" y2="${totalH}" stroke="#2D1870" stroke-width="1.2"/>`);
  stages.forEach((_,si) => { if(si>0) parts.push(`<line x1="${stageX(si)}" y1="0" x2="${stageX(si)}" y2="${totalH}" stroke="#2D1870" stroke-width="0.7"/>`); });
  parts.push(`<rect x="0" y="0" width="${totalW}" height="${HH}" fill="#1E0D4A"/>`);
  parts.push(`<text x="74" y="18" font-family="Arial" font-size="8" fill="#546E7A" text-anchor="middle">AGENTE</text>`);
  stages.forEach((st,i) => {
    parts.push(`<text x="${stageX(i)+SW/2}" y="18" font-family="Arial" font-size="9" font-weight="bold" fill="${stageColors[i]}" text-anchor="middle">${xe(st)}</text>`);
  });
  // Orquestador span
  const orcY = laneY(0);
  parts.push(`<rect x="${LX+4}" y="${orcY+5}" width="${SW*5-8}" height="${LH-10}" rx="4" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="1" stroke-dasharray="5,3" opacity="0.8"/>`);
  parts.push(`<text x="${LX+(SW*5)/2}" y="${orcY+LH/2+4}" font-family="Arial" font-size="8.5" fill="#8C69F0" text-anchor="middle">Coordina estado del flujo · invoca agentes · enruta excepciones · mantiene auditoría</text>`);
  // Activity boxes
  activities.forEach((a,idx) => {
    if(!a) return;
    const x = stageX(a.stage) + 4;
    const y = laneY(idx) + 4;
    const w = SW-8, h = LH-8;
    const cc = agentRows[idx].color;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#0B1525" stroke="#${cc}" stroke-width="1.5"/>`);
    a.act.split('\n').forEach((ln,li) => parts.push(`<text x="${x+w/2}" y="${y+h/2-4+li*13}" font-family="Arial" font-size="8.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${xe(ln)}</text>`));
    parts.push(`<text x="${x+w/2}" y="${y+h-6}" font-family="Arial" font-size="7.5" fill="#${cc}" text-anchor="middle">${xe(a.sub)}</text>`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}">${parts.join('')}</svg>`;
  addSvgImage(s, svg, 0.15, 1.20, 9.70, 4.05);
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 5: Flujo de Datos (Swimlane)

Cómo leer este diagrama:
• Las filas (carriles) representan cada agente especializado.
• Las columnas representan las etapas del flujo: Ingerir → Conciliar → Procesar → Notificar → QA + Revisar.
• El Orquestador Agéntico (fila superior) coordina todo el flujo — no ejecuta, sino que dirige.

Puntos de énfasis:
• INGERIR: El extracto bancario entra al sistema vía carga manual.
• CONCILIAR: El Agente de Conciliación empareja transacciones con partidas en tiempo real.
• PROCESAR: La Inteligencia Financiera actualiza el dashboard de presupuesto y cash flow.
• NOTIFICAR: El Agente de Notificaciones y el Enrutador de Escalación se activan según calendario.
• QA + REVISAR: El Agente de Reportes compila y valida antes de entregar a gerencia.`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 6 — TABLA DE RESPONSABILIDADES DE AGENTES
// ══════════════════════════════════════════════════════════════════════════════
(function slide06() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Responsabilidades de los Agentes Especializados', 'Cada agente tiene un rol definido, herramientas acotadas y un esquema de salida estructurado');
  addFooter(s, 6);

  const agentTable = [
    { agent:'Orquestador\nAgéntico',       color:C.purple,
      role:'Propietario del estado del flujo para ambos módulos; enruta eventos a agentes especializados; gestiona colas de excepciones y auditoría.',
      out: 'Transiciones de estado, cronograma de agentes, enrutamiento de excepciones, log de auditoría.' },
    { agent:'Agente de\nConciliación',     color:C.blueAc,
      role:'Parsea archivos de extracto bancario; puntúa confianza de emparejamiento transacción-partida; enruta ítems de baja confianza a cola de revisión del oficial; aprende de sus decisiones.',
      out: 'Decisiones de emparejamiento, cola de excepciones, reglas de conciliación actualizadas.' },
    { agent:'Agente de\nNotificaciones',   color:C.green,
      role:'Lee planes de pago diariamente; determina qué notificaciones están programadas; despacha WhatsApp + correo; registra estado de entrega y respuestas de clientes.',
      out: 'Notificaciones enviadas, acuses de recibo, log de mensajes bidireccionales.' },
    { agent:'Inteligencia\nFinanciera',    color:C.purpleAc,
      role:'Compara ejecución vs. presupuesto y cash flow proyectado; calcula métricas de desviación; asigna estado semaforizado (rojo/amarillo/verde) por partida.',
      out: 'KPIs del dashboard, alertas por partida, pronósticos de déficit, alertas de hitos.' },
    { agent:'Enrutador de\nEscalación',   color:C.fail,
      role:'Monitorea antigüedad de cuotas vencidas; activa escalación en umbrales definidos: dashboard del oficial (Día +1), notificación a gerencia (Día +6), bandera legal (Día +16).',
      out: 'Eventos de escalación, alertas a gerencia, banderas de referimiento legal.' },
    { agent:'Agente de\nReportes',        color:C.amber,
      role:'Compila estados financieros y reporte gerencial semanal desde datos estructurados; formatea y despacha PDF según calendario o bajo demanda.',
      out: 'Reporte PDF semanal, Balance General, Estado de Resultados, Flujo de Efectivo.' },
  ];

  const cols = [
    { label:'Agente',         x:0.28, w:2.40 },
    { label:'Rol / Propósito', x:2.72, w:3.60 },
    { label:'Salidas Principales', x:6.36, w:3.36 },
  ];
  cols.forEach(c => {
    s.addShape(pres.ShapeType.rect,{x:c.x,y:1.28,w:c.w-0.04,h:0.30,fill:{color:C.purple},line:{color:C.purple,width:0}});
    s.addText(c.label,{x:c.x+0.08,y:1.28,w:c.w-0.12,h:0.30,fontSize:9,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
  });
  agentTable.forEach((row,i) => {
    const y = 1.62 + i * 0.52;
    s.addShape(pres.ShapeType.rect,{x:0.28,y,w:9.44,h:0.50,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
    s.addShape(pres.ShapeType.rect,{x:0.28,y,w:0.05,h:0.50,fill:{color:row.color},line:{color:row.color,width:0}});
    s.addText(row.agent,{x:0.36,y:y+0.03,w:2.30,h:0.44,fontSize:8.5,fontFace:'Arial',bold:true,color:row.color,valign:'middle'});
    s.addText(row.role,{x:2.72,y:y+0.03,w:3.56,h:0.44,fontSize:7.5,fontFace:'Arial',color:C.light,valign:'middle'});
    s.addText(row.out,{x:6.36,y:y+0.03,w:3.30,h:0.44,fontSize:7.5,fontFace:'Arial',color:C.purpleLt,italic:true,valign:'middle'});
  });
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 6: Responsabilidades de Agentes

Esta diapositiva es la referencia técnica del cliente para entender qué hace cada agente.

Puntos clave:
• Cada agente tiene un alcance acotado — no hay agentes con responsabilidades ilimitadas.
• Las "Salidas Principales" son los artefactos concretos que produce cada agente y que se pueden auditar.
• El Orquestador es el único agente que tiene visibilidad completa del flujo — los demás solo ven su propio carril.

Si el cliente pregunta sobre personalización:
• El Agente de Conciliación aprende de las decisiones de los oficiales — mejora con el tiempo.
• El Agente de Notificaciones usa plantillas aprobadas por Meta para WhatsApp — no puede enviar mensajes fuera de plantilla.
• El Agente de Reportes puede configurarse para diferentes frecuencias y formatos de reporte.`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 7 — MODELO DE CONCILIACIÓN BANCARIA (BANCO POPULAR)
// ══════════════════════════════════════════════════════════════════════════════
(function slide07() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Modelo de Conciliación Bancaria', 'Banco Popular · emparejamiento automático con aprendizaje continuo · revisión solo de excepciones');
  addFooter(s, 7);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 320">
    <defs>
      <marker id="a1" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#3C91FF"/></marker>
      <marker id="a2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#00C853"/></marker>
      <marker id="a3" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#EF5350"/></marker>
    </defs>

    <!-- Fuente: Banco Popular -->
    <rect x="10" y="110" width="130" height="80" rx="8" fill="#1A0D4A" stroke="#3C91FF" stroke-width="1.5"/>
    <text x="75" y="143" font-family="Arial" font-size="11" font-weight="bold" fill="#3C91FF" text-anchor="middle">Banco Popular</text>
    <text x="75" y="160" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">CSV / TXT</text>
    <text x="75" y="175" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Descarga manual</text>
    <line x1="140" y1="150" x2="175" y2="150" stroke="#3C91FF" stroke-width="2" marker-end="url(#a1)"/>

    <!-- Parser -->
    <rect x="175" y="110" width="130" height="80" rx="8" fill="#0A1F0A" stroke="#00C853" stroke-width="1.5"/>
    <text x="240" y="143" font-family="Arial" font-size="11" font-weight="bold" fill="#00C853" text-anchor="middle">Parser</text>
    <text x="240" y="160" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Fecha · Monto</text>
    <text x="240" y="175" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Descripción · Ref.</text>
    <line x1="305" y1="150" x2="340" y2="150" stroke="#3C91FF" stroke-width="2" marker-end="url(#a1)"/>

    <!-- Agente de Conciliación -->
    <rect x="340" y="90" width="160" height="120" rx="8" fill="#1E0D4A" stroke="#8C69F0" stroke-width="2"/>
    <text x="420" y="118" font-family="Arial" font-size="11" font-weight="bold" fill="#8C69F0" text-anchor="middle">Agente de</text>
    <text x="420" y="133" font-family="Arial" font-size="11" font-weight="bold" fill="#8C69F0" text-anchor="middle">Conciliación</text>
    <text x="420" y="152" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Puntaje de confianza</text>
    <text x="420" y="165" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">ALTA / MEDIA / BAJA</text>
    <text x="420" y="180" font-family="Arial" font-size="8.5" fill="#546E7A" text-anchor="middle">Almacén de reglas</text>
    <text x="420" y="193" font-family="Arial" font-size="8.5" fill="#546E7A" text-anchor="middle">Descripción → Partida</text>

    <!-- Flecha ALTA confianza -->
    <line x1="500" y1="130" x2="560" y2="100" stroke="#00C853" stroke-width="2" marker-end="url(#a2)"/>
    <text x="530" y="108" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">ALTA</text>

    <!-- Auto-match -->
    <rect x="560" y="50" width="145" height="70" rx="8" fill="#0A1F0A" stroke="#00C853" stroke-width="1.5"/>
    <text x="632" y="79" font-family="Arial" font-size="11" font-weight="bold" fill="#00C853" text-anchor="middle">Auto-emparejado</text>
    <text x="632" y="95" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Partida actualizada</text>
    <text x="632" y="109" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Dashboard actualizado</text>
    <line x1="705" y1="85" x2="780" y2="85" stroke="#00C853" stroke-width="1.5" marker-end="url(#a2)"/>

    <!-- Almacén de Reglas -->
    <rect x="780" y="50" width="130" height="70" rx="8" fill="#150A38" stroke="#8C69F0" stroke-width="1.5"/>
    <text x="845" y="79" font-family="Arial" font-size="10" font-weight="bold" fill="#8C69F0" text-anchor="middle">Almacén de</text>
    <text x="845" y="93" font-family="Arial" font-size="10" font-weight="bold" fill="#8C69F0" text-anchor="middle">Reglas</text>
    <text x="845" y="110" font-family="Arial" font-size="8" fill="#546E7A" text-anchor="middle">Aprende · mejora</text>

    <!-- Flecha BAJA/MEDIA confianza -->
    <line x1="500" y1="175" x2="560" y2="220" stroke="#EF5350" stroke-width="2" marker-end="url(#a3)"/>
    <text x="532" y="213" font-family="Arial" font-size="9" font-weight="bold" fill="#EF5350" text-anchor="middle">BAJA/MEDIA</text>

    <!-- Cola de excepciones -->
    <rect x="560" y="195" width="145" height="70" rx="8" fill="#1A0A0A" stroke="#EF5350" stroke-width="1.5"/>
    <text x="632" y="223" font-family="Arial" font-size="11" font-weight="bold" fill="#EF5350" text-anchor="middle">Cola del Oficial</text>
    <text x="632" y="239" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Revisión de excepciones</text>
    <text x="632" y="253" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Plazo: 5 días h. cierre mes</text>

    <!-- Oficial decide → reglas -->
    <line x1="705" y1="230" x2="780" y2="120" stroke="#FFA726" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#a2)"/>
    <text x="770" y="185" font-family="Arial" font-size="8.5" fill="#FFA726" text-anchor="middle">Aprende de</text>
    <text x="770" y="197" font-family="Arial" font-size="8.5" fill="#FFA726" text-anchor="middle">decisiones</text>

    <!-- Pregunta abierta -->
    <rect x="10" y="268" width="900" height="42" rx="6" fill="#1E0D4A" stroke="#FFA726" stroke-width="1.2"/>
    <text x="460" y="285" font-family="Arial" font-size="10" font-weight="bold" fill="#FFA726" text-anchor="middle">PREGUNTA PARA DUPE: ¿Puede compartir un archivo de extracto real de Banco Popular</text>
    <text x="460" y="301" font-family="Arial" font-size="10" fill="#FFA726" text-anchor="middle">para validar el formato y los campos disponibles? (Requerido en el Día 1 del proyecto)</text>
  </svg>`;
  addSvgImage(s, svg, 0.18, 1.22, 9.64, 4.00);
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 7: Modelo de Conciliación Bancaria

Explicar el flujo de conciliación:
1. El oficial descarga el extracto bancario de Banco Popular (CSV o TXT desde el netbanking) y lo carga al sistema una vez al día.
2. El Parser extrae los campos clave: fecha, monto, descripción, referencia.
3. El Agente de Conciliación puntúa el emparejamiento de cada transacción con una partida presupuestaria.

Lógica de decisión:
• ALTA confianza → emparejamiento automático; partida y dashboard se actualizan inmediatamente.
• BAJA/MEDIA confianza → la transacción va a la cola de revisión del oficial.
• El oficial resuelve la excepción → el sistema aprende la regla y la aplica a transacciones futuras similares.

Beneficio clave del aprendizaje:
• En el primer mes, habrá más excepciones (el sistema no conoce los patrones de DUPE todavía).
• Con el tiempo, la tasa de auto-emparejamiento mejora — meta: 90%+ en el mes 3.

PREGUNTA CRÍTICA A HACER AL CLIENTE AHORA:
"¿Pueden compartir un archivo de extracto real de Banco Popular para que podamos diseñar el parser desde el Día 1? ¿El formato incluye un código de referencia o concepto que identifique el tipo de transacción?"`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 8 — FLUJO DE COBROS AUTOMATIZADO
// ══════════════════════════════════════════════════════════════════════════════
(function slide08() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Flujo de Cobros Automatizado', 'WhatsApp como canal principal · correo como respaldo · escalación automática por días de mora');
  addFooter(s, 8);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 310">
    <defs>
      <marker id="at" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#3C91FF"/></marker>
    </defs>

    <!-- Línea de tiempo base -->
    <line x1="60" y1="130" x2="870" y2="130" stroke="#2D1870" stroke-width="2.5"/>

    <!-- D-5 -->
    <circle cx="120" cy="130" r="14" fill="#1E0D4A" stroke="#00C853" stroke-width="2"/>
    <text x="120" y="135" font-family="Arial" font-size="10" font-weight="bold" fill="#00C853" text-anchor="middle">D-5</text>
    <rect x="60" y="50" width="120" height="72" rx="6" fill="#0A1F0A" stroke="#00C853" stroke-width="1.2"/>
    <text x="120" y="70" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">Recordatorio</text>
    <text x="120" y="84" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">📱 WhatsApp</text>
    <text x="120" y="97" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">✉ Correo (respaldo)</text>
    <text x="120" y="110" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">al cliente</text>
    <line x1="120" y1="122" x2="120" y2="116" stroke="#00C853" stroke-width="1.2"/>

    <!-- D0 -->
    <circle cx="270" cy="130" r="14" fill="#2D1870" stroke="#8CC8FA" stroke-width="2"/>
    <text x="270" y="135" font-family="Arial" font-size="10" font-weight="bold" fill="#8CC8FA" text-anchor="middle">D0</text>
    <rect x="210" y="50" width="120" height="72" rx="6" fill="#150A38" stroke="#8CC8FA" stroke-width="1.2"/>
    <text x="270" y="70" font-family="Arial" font-size="9" font-weight="bold" fill="#8CC8FA" text-anchor="middle">Vencimiento</text>
    <text x="270" y="84" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Fecha de cuota</text>
    <text x="270" y="97" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Sistema monitorea</text>
    <text x="270" y="110" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">sin acción manual</text>
    <line x1="270" y1="122" x2="270" y2="116" stroke="#8CC8FA" stroke-width="1.2"/>

    <!-- PAGO REGISTRADO (debajo) -->
    <rect x="210" y="148" width="120" height="50" rx="6" fill="#0A1F0A" stroke="#00C853" stroke-width="1.2"/>
    <text x="270" y="168" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">Pago recibido</text>
    <text x="270" y="183" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Auto-conciliado</text>
    <text x="270" y="196" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Recibo enviado</text>

    <!-- D+1 -->
    <circle cx="430" cy="130" r="14" fill="#1A0D4A" stroke="#FFA726" stroke-width="2"/>
    <text x="430" y="135" font-family="Arial" font-size="10" font-weight="bold" fill="#FFA726" text-anchor="middle">D+1</text>
    <rect x="370" y="50" width="120" height="72" rx="6" fill="#1A1000" stroke="#FFA726" stroke-width="1.2"/>
    <text x="430" y="70" font-family="Arial" font-size="9" font-weight="bold" fill="#FFA726" text-anchor="middle">Alerta Oficial</text>
    <text x="430" y="84" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Dashboard del</text>
    <text x="430" y="97" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">oficial actualizado</text>
    <text x="430" y="110" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">visible en pantalla</text>
    <line x1="430" y1="122" x2="430" y2="116" stroke="#FFA726" stroke-width="1.2"/>

    <!-- D+6 -->
    <circle cx="610" cy="130" r="14" fill="#1A0A0A" stroke="#EF5350" stroke-width="2"/>
    <text x="610" y="135" font-family="Arial" font-size="10" font-weight="bold" fill="#EF5350" text-anchor="middle">D+6</text>
    <rect x="550" y="50" width="120" height="72" rx="6" fill="#1A0808" stroke="#EF5350" stroke-width="1.2"/>
    <text x="610" y="70" font-family="Arial" font-size="9" font-weight="bold" fill="#EF5350" text-anchor="middle">Notificación</text>
    <text x="610" y="84" font-family="Arial" font-size="9" font-weight="bold" fill="#EF5350" text-anchor="middle">Gerencial</text>
    <text x="610" y="97" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">📱 WA + correo</text>
    <text x="610" y="110" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">a la gerencia</text>
    <line x1="610" y1="122" x2="610" y2="116" stroke="#EF5350" stroke-width="1.2"/>

    <!-- D+16 -->
    <circle cx="800" cy="130" r="14" fill="#1A0808" stroke="#EF5350" stroke-width="2.5"/>
    <text x="800" y="135" font-family="Arial" font-size="10" font-weight="bold" fill="#EF5350" text-anchor="middle">D+16</text>
    <rect x="738" y="50" width="124" height="72" rx="6" fill="#1A0808" stroke="#EF5350" stroke-width="2"/>
    <text x="800" y="70" font-family="Arial" font-size="9" font-weight="bold" fill="#EF5350" text-anchor="middle">Bandera Legal</text>
    <text x="800" y="84" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">Referimiento a</text>
    <text x="800" y="97" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">firma de abogados</text>
    <text x="800" y="110" font-family="Arial" font-size="7.5" fill="#EF5350" text-anchor="middle">⚑ Acción requerida</text>
    <line x1="800" y1="122" x2="800" y2="116" stroke="#EF5350" stroke-width="1.2"/>

    <!-- Leyenda de canales -->
    <rect x="60" y="225" width="800" height="70" rx="6" fill="#150A38" stroke="#2D1870" stroke-width="1"/>
    <text x="460" y="245" font-family="Arial" font-size="9" font-weight="bold" fill="#8C69F0" text-anchor="middle">CANALES DE NOTIFICACIÓN</text>
    <rect x="80" y="255" width="12" height="12" rx="2" fill="#00C853"/>
    <text x="98" y="265" font-family="Arial" font-size="8.5" fill="#B0BEC5">WhatsApp Business (Meta Cloud API) · Canal principal · Confirmación de lectura</text>
    <rect x="80" y="273" width="12" height="12" rx="2" fill="#3C91FF"/>
    <text x="98" y="283" font-family="Arial" font-size="8.5" fill="#B0BEC5">Correo electrónico (cobros@dupedesa.com · SendGrid) · Respaldo si falla WhatsApp</text>
  </svg>`;
  addSvgImage(s, svg, 0.18, 1.22, 9.64, 4.00);
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 8: Flujo de Cobros Automatizado

Explicar la línea de tiempo:
• D-5: 5 días ANTES del vencimiento → el sistema envía automáticamente un recordatorio al cliente por WhatsApp (canal principal) y correo (respaldo).
• D0: Fecha de vencimiento de la cuota → el sistema monitorea si el pago fue registrado. Si sí → auto-conciliación y recibo. Si no → inicia el contador de mora.
• D+1: 1 día de mora → el dashboard del oficial muestra la cuenta en rojo. No hay acción manual requerida — el sistema lo hace visible.
• D+6: 6 días de mora → notificación automática a gerencia por WhatsApp y correo.
• D+16: 16 días de mora → el sistema levanta una bandera de referimiento legal. La acción de externarlo a la firma de abogados puede ser manual (por gerencia) o automatizada (a confirmar con el cliente).

Canales:
• WhatsApp es el canal principal por efectividad y preferencia del cliente dominicano.
• El correo es el respaldo automático si el mensaje de WhatsApp falla en la entrega.
• Todas las notificaciones usan plantillas pre-aprobadas por Meta (requisito de WhatsApp Business).

PUNTO CRÍTICO: La cuenta de WhatsApp Business debe ser registrada con Meta INMEDIATAMENTE. El proceso de verificación toma 1-3 semanas y bloquea el demo de notificaciones si no se inicia ya.

PREGUNTA PARA EL CLIENTE: "En el Día +16, ¿quieren que el sistema envíe automáticamente una notificación a la firma de abogados, o prefieren que sea una acción manual que gerencia activa desde el portal?"`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 9 — PANEL EJECUTIVO (PREGUNTA ABIERTA DE KPIs)
// ══════════════════════════════════════════════════════════════════════════════
(function slide09() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Panel Ejecutivo — Módulo Financiero', 'Visibilidad en tiempo real del estado financiero de cada proyecto');
  addFooter(s, 9);

  // Tarjetas KPI placeholder (x3 financiero + x3 cobros)
  const kpiCards = [
    { label:'KPI FINANCIERO #1', sub:'¿Cuál es el más importante\npara la gerencia?', color:C.amber, x:0.28, y:1.28 },
    { label:'KPI FINANCIERO #2', sub:'Ejemplo: Presupuesto\nejecutado vs. proyectado', color:C.purpleAc, x:3.48, y:1.28 },
    { label:'KPI FINANCIERO #3', sub:'Ejemplo: Saldo disponible\nen cuenta bancaria', color:C.blueAc, x:6.68, y:1.28 },
  ];
  kpiCards.forEach(k => {
    s.addShape(pres.ShapeType.roundRect,{x:k.x,y:k.y,w:2.96,h:1.10,fill:{color:C.card},line:{color:k.color,width:1.5},rectRadius:0.08});
    s.addText(k.label,{x:k.x+0.10,y:k.y+0.12,w:2.76,h:0.26,fontSize:8,fontFace:'Arial',bold:true,color:k.color,align:'center',valign:'middle'});
    s.addText(k.sub,{x:k.x+0.10,y:k.y+0.40,w:2.76,h:0.56,fontSize:9,fontFace:'Arial',color:C.light,align:'center',valign:'middle'});
  });

  // Semáforo de partidas
  s.addShape(pres.ShapeType.rect,{x:0.28,y:2.52,w:4.40,h:0.30,fill:{color:C.cardMid},line:{color:C.purple,width:0.8}});
  s.addText('Semáforo de Partidas — Ejecución vs. Presupuesto',{x:0.36,y:2.52,w:4.24,h:0.30,fontSize:9,fontFace:'Arial',bold:true,color:C.purpleLt,valign:'middle'});
  const parts2 = [
    { label:'Construcción Fase 1', pct:72, color:C.green },
    { label:'Materiales y Equipos', pct:95, color:C.amber },
    { label:'Gastos Financieros',   pct:112, color:C.fail },
    { label:'Honorarios Profesionales', pct:45, color:C.green },
    { label:'Imprevistos',          pct:88, color:C.amber },
  ];
  parts2.forEach((p,i) => {
    const y = 2.86 + i * 0.38;
    s.addShape(pres.ShapeType.rect,{x:0.28,y,w:4.40,h:0.34,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
    s.addShape(pres.ShapeType.rect,{x:0.28,y,w:0.05,h:0.34,fill:{color:p.color},line:{color:p.color,width:0}});
    s.addText(p.label,{x:0.36,y:y+0.05,w:2.80,h:0.24,fontSize:8,fontFace:'Arial',color:C.light,valign:'middle'});
    s.addText(`${p.pct}%`,{x:3.50,y:y+0.05,w:0.60,h:0.24,fontSize:9,fontFace:'Arial',bold:true,color:p.color,align:'right',valign:'middle'});
    // mini-bar
    s.addShape(pres.ShapeType.rect,{x:4.16,y:y+0.10,w:0.44,h:0.14,fill:{color:C.cardLt},line:{color:C.cardLt,width:0}});
    s.addShape(pres.ShapeType.rect,{x:4.16,y:y+0.10,w:Math.min(p.pct/100,1)*0.44,h:0.14,fill:{color:p.color},line:{color:p.color,width:0}});
  });

  // Panel de cobros
  s.addShape(pres.ShapeType.rect,{x:4.82,y:2.52,w:4.90,h:0.30,fill:{color:C.cardMid},line:{color:C.blueAc,width:0.8}});
  s.addText('Indicadores de Cartera — Módulo de Cobros',{x:4.90,y:2.52,w:4.74,h:0.30,fontSize:9,fontFace:'Arial',bold:true,color:C.purpleLt,valign:'middle'});
  const cobrosKpis = [
    { label:'% Cartera Sana',            val:'?', sub:'a definir con cliente', color:C.green },
    { label:'Tasa de Cobro del Mes',      val:'?', sub:'a definir con cliente', color:C.blueAc },
    { label:'Cartera Vencida Total',      val:'?', sub:'a definir con cliente', color:C.fail },
    { label:'Eficiencia por Oficial',     val:'?', sub:'a definir con cliente', color:C.amber },
  ];
  cobrosKpis.forEach((k,i) => {
    const y = 2.86 + i * 0.38;
    s.addShape(pres.ShapeType.rect,{x:4.82,y,w:4.90,h:0.34,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
    s.addShape(pres.ShapeType.rect,{x:4.82,y,w:0.05,h:0.34,fill:{color:k.color},line:{color:k.color,width:0}});
    s.addText(k.label,{x:4.90,y:y+0.05,w:3.40,h:0.24,fontSize:8,fontFace:'Arial',color:C.light,valign:'middle'});
    s.addText(k.val,{x:8.34,y:y+0.02,w:1.30,h:0.30,fontSize:16,fontFace:'Arial',bold:true,color:k.color,align:'center',valign:'middle'});
  });

  // Pregunta abierta
  s.addShape(pres.ShapeType.roundRect,{x:0.28,y:4.82,w:9.44,h:0.36,fill:{color:C.cardMid},line:{color:C.amber,width:1.5},rectRadius:0.06});
  s.addText('❓  PREGUNTA PARA DUPE: ¿Cuáles son los 3 KPIs financieros más importantes para la gerencia? Los valores "?" serán definidos en la sesión de descubrimiento.',{
    x:0.40,y:4.84,w:9.20,h:0.32,fontSize:8.5,fontFace:'Arial',color:C.amber,bold:true,valign:'middle'});
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 9: Panel Ejecutivo

Esta diapositiva presenta el PROTOTIPO del dashboard ejecutivo. Los valores con "?" son intencionalmente vacíos — esta es una pregunta de descubrimiento que se responde aquí en la presentación.

PAUSA Y PREGUNTA PARA EL CLIENTE:
"¿Cuáles son los 3 KPIs financieros más importantes para ustedes como gerencia? Por ejemplo:
  - Presupuesto ejecutado vs. proyectado por partida
  - Saldo disponible en cuenta bancaria conciliado al día
  - Cash flow acumulado mes a mes vs. proyectado
  - Rentabilidad del proyecto (margen de utilidad)"

Panel izquierdo — Módulo Financiero:
• El semáforo de partidas muestra cada línea presupuestaria con su % de ejecución.
• VERDE: dentro del presupuesto (<90%), AMARILLO: cerca del límite (90-100%), ROJO: excedido (>100%).
• Se puede hacer drill-down desde cualquier partida hasta el movimiento bancario individual que la compone.

Panel derecho — Módulo de Cobros:
• Los 4 KPIs de cartera se calculan automáticamente desde los planes de pago y pagos registrados.
• "Eficiencia por oficial" compara el desempeño de cada oficial de cobros por proyecto.
• Estos datos se actualizan en tiempo real — no requieren compilación manual.

Para la gerencia móvil:
• La vista del portal gerencial es mobile-first (optimizada para teléfono).
• Acceso de solo lectura y escritura para gerencia; solo lectura para oficiales.`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 10 — FLUJO DE ORQUESTACIÓN CONTROLADA
// ══════════════════════════════════════════════════════════════════════════════
(function slide10() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Flujo de Orquestación Controlada — Módulo de Cobros', 'Máquina de estados desde el registro de venta hasta el cierre de la cuota');
  addFooter(s, 10);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 300">
    <defs>
      <marker id="af" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#3C91FF"/></marker>
      <marker id="ag" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#00C853"/></marker>
      <marker id="ar" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#EF5350"/></marker>
    </defs>

    <!-- ESTADO 1: Registro de Venta -->
    <rect x="10" y="100" width="110" height="60" rx="6" fill="#0A1F0A" stroke="#00C853" stroke-width="1.5"/>
    <text x="65" y="124" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">Registro</text>
    <text x="65" y="139" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">de Venta</text>
    <text x="65" y="153" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">Cliente · Unidad · Precio</text>
    <line x1="120" y1="130" x2="148" y2="130" stroke="#3C91FF" stroke-width="1.5" marker-end="url(#af)"/>

    <!-- ESTADO 2: Generación del Plan -->
    <rect x="150" y="100" width="120" height="60" rx="6" fill="#1A0D4A" stroke="#8C69F0" stroke-width="1.5"/>
    <text x="210" y="122" font-family="Arial" font-size="9" font-weight="bold" fill="#8C69F0" text-anchor="middle">Generación</text>
    <text x="210" y="136" font-family="Arial" font-size="9" font-weight="bold" fill="#8C69F0" text-anchor="middle">del Plan</text>
    <text x="210" y="150" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">8–16 cuotas automáticas</text>
    <line x1="270" y1="130" x2="298" y2="130" stroke="#3C91FF" stroke-width="1.5" marker-end="url(#af)"/>

    <!-- ESTADO 3: Aprobación (PREGUNTA) -->
    <rect x="300" y="88" width="130" height="84" rx="6" fill="#1A1000" stroke="#FFA726" stroke-width="2"/>
    <text x="365" y="110" font-family="Arial" font-size="9" font-weight="bold" fill="#FFA726" text-anchor="middle">❓ APROBACIÓN</text>
    <text x="365" y="125" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">¿Solo gerencia?</text>
    <text x="365" y="139" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">¿Oficial + gerencia?</text>
    <text x="365" y="153" font-family="Arial" font-size="8.5" fill="#B0BEC5" text-anchor="middle">¿Automático?</text>
    <text x="365" y="165" font-family="Arial" font-size="7.5" fill="#FFA726" text-anchor="middle">Confirmar con DUPE</text>
    <line x1="430" y1="130" x2="458" y2="130" stroke="#3C91FF" stroke-width="1.5" marker-end="url(#af)"/>

    <!-- ESTADO 4: Plan Activo -->
    <rect x="460" y="100" width="110" height="60" rx="6" fill="#0A1F0A" stroke="#00C853" stroke-width="1.5"/>
    <text x="515" y="124" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">Plan</text>
    <text x="515" y="138" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">Activo</text>
    <text x="515" y="153" font-family="Arial" font-size="7.5" fill="#546E7A" text-anchor="middle">Calendario de cobros</text>
    <line x1="570" y1="130" x2="598" y2="130" stroke="#3C91FF" stroke-width="1.5" marker-end="url(#af)"/>

    <!-- ESTADO 5: Monitoreo / Notificaciones -->
    <rect x="600" y="100" width="110" height="60" rx="6" fill="#1A0D4A" stroke="#3C91FF" stroke-width="1.5"/>
    <text x="655" y="122" font-family="Arial" font-size="9" font-weight="bold" fill="#3C91FF" text-anchor="middle">Monitoreo</text>
    <text x="655" y="136" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">D-5: WA + correo</text>
    <text x="655" y="150" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">D+1/+6/+16: escalación</text>
    <line x1="710" y1="130" x2="738" y2="130" stroke="#3C91FF" stroke-width="1.5" marker-end="url(#af)"/>

    <!-- ESTADO 6: Pago + Cierre -->
    <rect x="740" y="100" width="110" height="60" rx="6" fill="#0A1F0A" stroke="#00C853" stroke-width="1.5"/>
    <text x="795" y="122" font-family="Arial" font-size="9" font-weight="bold" fill="#00C853" text-anchor="middle">Pago</text>
    <text x="795" y="136" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Auto-conciliado</text>
    <text x="795" y="150" font-family="Arial" font-size="9" fill="#B0BEC5" text-anchor="middle">Recibo enviado</text>

    <!-- Bucle: Monitoreo → próxima cuota -->
    <path d="M655,160 Q655,220 515,220 Q375,220 365,210" fill="none" stroke="#546E7A" stroke-width="1.2" stroke-dasharray="5,3" marker-end="url(#af)"/>
    <text x="510" y="240" font-family="Arial" font-size="8" fill="#546E7A" text-anchor="middle">Siguiente cuota del plan</text>

    <!-- Orquestador bar -->
    <rect x="10" y="268" width="840" height="25" rx="5" fill="#1E0D4A" stroke="#5F1EBE" stroke-width="1"/>
    <text x="430" y="284" font-family="Arial" font-size="9" font-weight="bold" fill="#8C69F0" text-anchor="middle">Orquestador Agéntico · propietario del estado · invoca agentes · registra auditoría en cada transición</text>
  </svg>`;
  addSvgImage(s, svg, 0.18, 1.22, 9.64, 4.00);
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 10: Flujo de Orquestación

Esta diapositiva muestra la máquina de estados del Módulo de Cobros — cómo fluye el proceso desde la venta hasta el cierre de cada cuota.

Explicar los estados:
1. REGISTRO DE VENTA: El equipo de ventas registra la unidad, el cliente, la fecha de compra y el precio.
2. GENERACIÓN DEL PLAN: El sistema calcula automáticamente el plan de pagos (8–16 cuotas) basado en la fecha de compra vs. la fecha programada de entrega.
3. APROBACIÓN (PREGUNTA ABIERTA): ¿Quién aprueba el plan antes de activarlo?
4. PLAN ACTIVO: El calendario de cobros está activo en el sistema.
5. MONITOREO: El sistema envía recordatorios y gestiona la escalación automáticamente.
6. PAGO + CIERRE: El oficial registra el pago; el sistema lo concilia con la cuota y envía el recibo.

PAUSA Y PREGUNTA CRÍTICA PARA EL CLIENTE:
"En el Estado 3 — APROBACIÓN — ¿quién tiene autoridad para aprobar el plan de pagos antes de que se active?
  a) Solo la gerencia general
  b) El oficial de cobros lo propone y la gerencia aprueba
  c) Se activa automáticamente basado en los parámetros del contrato (sin aprobación manual)"

La respuesta a esta pregunta define si necesitamos un flujo de aprobación con notificación a gerencia o si el sistema puede activar el plan de forma determinista.

Punto técnico importante:
• El Orquestador registra cada transición de estado en el log de auditoría con timestamp.
• Esto garantiza trazabilidad completa de cada plan de pagos y cada cuota.`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 11 — CONSTRUIR vs. ORQUESTAR
// ══════════════════════════════════════════════════════════════════════════════
(function slide11() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Construir vs. Orquestar — Límite del Alcance', 'HCLTech construye la capa de control agéntico · los servicios externos se integran como herramientas');
  addFooter(s, 11);

  const buildItems = [
    'Orquestador Agéntico',
    'Agente de Conciliación + Almacén de Reglas',
    'Agente de Notificaciones de Cobros',
    'Agente de Inteligencia Financiera',
    'Enrutador de Escalación',
    'Agente de Reportes',
    'Parser de Extracto Bancario (determinista)',
    'Base de datos PostgreSQL multi-proyecto',
    'Dashboards con control de acceso por rol',
    'Almacén de auditoría y trazabilidad',
  ];
  const wrapItems = [
    'WhatsApp Business API (Meta Cloud)',
    'Correo electrónico transaccional (SendGrid)',
    'Extracto bancario Banco Popular (carga manual CSV/TXT)',
    'Generación de PDF / Excel (bibliotecas)',
    'Formatos de extracto de los bancos de DR',
  ];

  [[C.green,'CONSTRUIR — HCLTech Desarrolla',buildItems,0.28],
   [C.blueAc,'ORQUESTAR — Servicios Externos Controlados',wrapItems,5.08]].forEach(([col,label,items,x])=>{
    s.addShape(pres.ShapeType.rect,{x,y:1.28,w:4.54,h:0.32,fill:{color:col},line:{color:col,width:0}});
    s.addText(label,{x:x+0.10,y:1.28,w:4.34,h:0.32,fontSize:9,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
    items.forEach((item,i)=>{
      const y=1.64+i*0.40;
      s.addShape(pres.ShapeType.rect,{x,y,w:4.54,h:0.38,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
      s.addShape(pres.ShapeType.rect,{x,y,w:0.05,h:0.38,fill:{color:col},line:{color:col,width:0}});
      s.addText('◆ '+item,{x:x+0.12,y:y+0.02,w:4.32,h:0.34,fontSize:8.5,fontFace:'Arial',color:C.light,valign:'middle'});
    });
  });
  s.addShape(pres.ShapeType.rect,{x:4.87,y:1.22,w:0.06,h:3.90,fill:{color:C.cardMid},line:{color:C.cardMid,width:0}});
  s.addText('HCLTech construye y entrega este límite →',{x:0.28,y:4.90,w:4.54,h:0.20,fontSize:7.5,fontFace:'Arial',color:C.green,italic:true});
  s.addText('← Estos servicios se integran, no se reemplazan',{x:5.08,y:4.90,w:4.54,h:0.20,fontSize:7.5,fontFace:'Arial',color:C.blueAc,italic:true});
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 11: Construir vs. Orquestar

Esta diapositiva es importante para la gestión de expectativas del cliente sobre el alcance comercial.

Columna VERDE (CONSTRUIR):
• Todo esto es código nuevo desarrollado por el equipo de HCLTech.
• Incluye los 5 agentes especializados, el orquestador, los módulos de finanzas y cobros, los dashboards, y la base de datos.
• Al finalizar el MVP, este código se entrega a DUPE para operación y mantenimiento.

Columna AZUL (ORQUESTAR):
• Estos son servicios externos que integramos — no los reemplazamos ni los construimos.
• Meta Cloud API (WhatsApp): proveedor externo; DUPE necesita abrir la cuenta de WhatsApp Business.
• SendGrid: servicio de correo externo; DUPE necesita el dominio cobros@dupedesa.com.
• Banco Popular: el sistema no conecta directamente al banco — el oficial descarga el archivo manualmente.
• PDF/Excel: usamos bibliotecas open source (ReportLab, openpyxl) — sin costo de licencia adicional.

Mensaje clave para el cliente:
"Lo que HCLTech construye es el cerebro agéntico. Los canales de comunicación (WhatsApp, correo) y el banco son servicios que DUPE ya usa — los conectamos a través de integraciones controladas."`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 12 — ESTIMADO ROM
// ══════════════════════════════════════════════════════════════════════════════
(function slide12() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Estimado ROM — Solución MVP', '14–18 días de pod  ·  ~7–8 semanas calendario  ·  Pod agéntico de 3 roles');
  addFooter(s, 12);

  const cards = [
    { label:'Días de Pod',           value:'14–18',    color:C.amber },
    { label:'Semanas Calendario',    value:'~7–8',     color:C.blueLt },
    { label:'Pod Agéntico',          value:'3 roles',  color:C.green },
    { label:'Contingencia',          value:'+3–5 días',color:C.purple },
  ];
  cards.forEach((card,i) => {
    const x = 0.28 + i * 2.42;
    s.addShape(pres.ShapeType.roundRect,{x,y:1.28,w:2.28,h:1.24,fill:{color:C.card},line:{color:card.color,width:1.5},rectRadius:0.08});
    s.addText(card.value,{x,y:1.34,w:2.28,h:0.72,fontSize:card.value.length>6?24:32,fontFace:'Arial',bold:true,color:card.color,align:'center',valign:'middle'});
    s.addText(card.label,{x,y:2.06,w:2.28,h:0.40,fontSize:8,fontFace:'Arial',color:C.light,align:'center',valign:'middle'});
  });

  const workstreams = [
    { label:'Gravel track — entorno, base de datos, CI/CD',                          weight:'Medio' },
    { label:'Módulo Financiero — presupuesto, cash flow, conciliación, contabilidad', weight:'Alto' },
    { label:'Módulo de Cobros — planes de pago, notificaciones, escalación',          weight:'Alto' },
    { label:'Dashboards — cola del oficial, portal gerencial, estados financieros',   weight:'Alto' },
    { label:'Integraciones — parser bancario, WhatsApp, correo, PDF/Excel',           weight:'Medio' },
    { label:'Validación, pruebas, revisión SME, preparación del demo',                weight:'Alto' },
  ];

  s.addShape(pres.ShapeType.rect,{x:0.28,y:2.66,w:7.40,h:0.26,fill:{color:C.purple},line:{color:C.purple,width:0}});
  s.addText('Área de Trabajo',{x:0.36,y:2.66,w:5.50,h:0.26,fontSize:8.5,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
  s.addText('Peso',{x:5.90,y:2.66,w:1.70,h:0.26,fontSize:8.5,fontFace:'Arial',bold:true,color:C.white,align:'center',valign:'middle'});

  workstreams.forEach((ws,i) => {
    const y = 2.94 + i * 0.30;
    s.addShape(pres.ShapeType.rect,{x:0.28,y,w:7.40,h:0.28,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
    s.addText(ws.label,{x:0.36,y:y+0.02,w:5.44,h:0.24,fontSize:8,fontFace:'Arial',color:C.light,valign:'middle'});
    s.addText(ws.weight,{x:5.90,y:y+0.02,w:1.70,h:0.24,fontSize:8,fontFace:'Arial',
      color:ws.weight==='Alto'?C.amber:C.blueLt,align:'center',valign:'middle'});
  });

  const totalY = 2.94 + workstreams.length * 0.30;
  s.addShape(pres.ShapeType.rect,{x:0.28,y:totalY,w:7.40,h:0.30,fill:{color:C.cardLt},line:{color:C.amber,width:0.8}});
  s.addText('Línea Base Recomendada — MVP',{x:0.36,y:totalY+0.02,w:5.44,h:0.26,fontSize:9,fontFace:'Arial',bold:true,color:C.white,valign:'middle'});
  s.addText('14–18 días de pod',{x:5.90,y:totalY+0.02,w:1.70,h:0.26,fontSize:9,fontFace:'Arial',bold:true,color:C.amber,align:'center',valign:'middle'});
  s.addText('Base ROM: una ruta de Solución MVP acotada · unidad comercial pod agéntico · no es un compromiso de producción final',{
    x:0.28,y:totalY+0.36,w:9.44,h:0.18,fontSize:7,fontFace:'Arial',color:C.muted,italic:true});
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 12: Estimado ROM

Contexto del estimado:
• ROM = Rough Order of Magnitude — es una estimación de orden de magnitud, no un precio fijo.
• El estimado usa la unidad comercial "día de pod" de HCLTech: un día de pod = un día completo del equipo agéntico de 3 roles (Arquitecto de Contexto + Ingeniero de Valor + Ingeniero de Calidad).
• 14–18 días de pod en ~7–8 semanas calendario (considerando disponibilidad del cliente, revisiones y tiempos de integración).

Cómo explicar los números al cliente:
• "No les estamos cotizando horas individuales. Les estamos cotizando un equipo de alto rendimiento operando en conjunto, con agentes de IA absorbiendo el trabajo repetitivo."
• Los 14–18 días de pod equivalen internamente a ~42–54 persona-días de trabajo (3 roles × pod days).

Contingencia (+3–5 días de pod):
• Se activa si: hay múltiples formatos de extracto bancario, plantillas de WhatsApp son rechazadas por Meta y hay que rediseñarlas, o el alcance se amplía a proyectos turísticos (USD) desde el inicio.

Opción Gold PoC (opcional, antes del MVP):
• 4–5 días de pod, 1 semana calendario.
• Propósito: probar el flujo de notificaciones de WhatsApp y el agente de conciliación con datos sintéticos ANTES de empezar el reloj del MVP.
• Entrega: demo ejecutivo y aprobación del MVP.`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// DIAPOSITIVA 13 — SUPUESTOS Y CIERRE
// ══════════════════════════════════════════════════════════════════════════════
(function slide13() {
  const s = pres.addSlide();
  s.background = { color:C.bg };
  addBranding(s);
  addHeader(s, 'Supuestos de Trabajo y Decisiones Pendientes', 'Ítems a confirmar antes de iniciar la planificación del sprint MVP');
  addFooter(s, 13);

  const assumptions = [
    'Extractos bancarios disponibles como descarga CSV/TXT de Banco Popular (netbanking)',
    'Un solo número de WhatsApp Business para todos los proyectos (recomendado por HCLTech)',
    'Correo enviado desde dominio compartido (cobros@dupedesa.com) via SendGrid',
    'Plan de cuentas definido por HCLTech; aprobado por gerencia en Semana 1',
    'MVP alcanza solo proyectos de interés social (RD$); proyectos turísticos (USD) en Piloto',
    'Avance físico de obra ingresado manualmente como % por la gerencia',
  ];
  const decisions = [
    'Proporcionar archivo de extracto real de Banco Popular (Día 1 del proyecto)',
    'Registrar cuenta de WhatsApp Business con Meta — iniciar INMEDIATAMENTE',
    '¿Alcance del MVP: solo interés social o también turístico (USD)?',
    '¿Quién aprueba el plan de pagos al registrar una venta?',
    '¿Notificación a firma de abogados automática o manual en Día +16?',
    '¿Entorno cloud: HCLTech-provisto o cuenta propia de DUPE?',
  ];

  [[C.green,'Supuestos Confirmados',assumptions,0.28],
   [C.amber,'Decisiones Pendientes',decisions,5.22]].forEach(([col,label,items,x])=>{
    s.addShape(pres.ShapeType.rect,{x,y:1.28,w:4.44,h:0.30,fill:{color:C.card},line:{color:col,width:1.2}});
    s.addShape(pres.ShapeType.rect,{x,y:1.28,w:0.06,h:0.30,fill:{color:col},line:{color:col,width:0}});
    s.addText(label,{x:x+0.12,y:1.28,w:4.24,h:0.30,fontSize:9,fontFace:'Arial',bold:true,color:col,valign:'middle'});
    items.forEach((item,i)=>{
      const y=1.62+i*0.52;
      s.addShape(pres.ShapeType.rect,{x,y,w:4.44,h:0.50,fill:{color:i%2===0?C.card:C.cardMid},line:{color:C.card,width:0}});
      s.addText((col===C.green?'✔':'◆')+'  '+item,{x:x+0.10,y:y+0.03,w:4.26,h:0.44,fontSize:8.5,fontFace:'Arial',color:C.light,valign:'middle'});
    });
  });

  s.addShape(pres.ShapeType.rect,{x:0.28,y:4.94,w:9.44,h:0.24,fill:{color:C.cardMid},line:{color:C.purple,width:0.8}});
  s.addText('Próximo Paso: Confirmar el alcance · designar el representante de DUPE · agendar el kick-off del MVP · iniciar registro de WhatsApp Business  ·  Jose Paulino · jose.paulino@hcltech.com',{
    x:0.38,y:4.96,w:9.24,h:0.20,fontSize:7.5,fontFace:'Arial',color:C.purpleLt,italic:true,valign:'middle'});
  s.addNotes(`NOTAS DEL PRESENTADOR — Diapositiva 13: Cierre

Esta es la diapositiva de cierre y llamada a la acción.

Recorrer los supuestos (columna verde):
• Estos supuestos fueron derivados de las respuestas al cuestionario. Si alguno es incorrecto, necesitamos discutirlo hoy antes de cerrar el alcance.
• Enfatizar Supuesto A5 (plan de cuentas): HCLTech propondrá un catálogo basado en el estándar de bienes raíces de RD — la gerencia lo revisa y aprueba en la Semana 1 del proyecto.

Recorrer las decisiones pendientes (columna ámbar):
1. Extracto bancario → CRÍTICO para el Día 1. Sin este archivo, el parser no puede diseñarse.
2. WhatsApp Business → CRÍTICO inmediato. La verificación con Meta toma 1-3 semanas.
3. Alcance del MVP → ¿solo RD$ o también USD desde el inicio?
4. Aprobación del plan de pagos → respuesta de esta presentación (Diapositiva 10).
5. Notificación legal → respuesta de esta presentación (Diapositiva 8).
6. Entorno cloud → necesitamos definir si HCLTech provisiona o si DUPE tiene cuenta.

Llamada a la acción clara:
• "Con las decisiones de hoy, podemos cerrar el alcance y enviar la propuesta formal en 48 horas."
• "La acción más urgente es iniciar el registro de WhatsApp Business — es la única que está fuera de nuestro control."

Contacto: Jose Paulino · jose.paulino@hcltech.com`);
})();

// ══════════════════════════════════════════════════════════════════════════════
// ESCRIBIR ARCHIVO — resolver promesas SVG→PNG primero
// ══════════════════════════════════════════════════════════════════════════════
const OUTPUT = path.join(__dirname, 'client', 'DUPE_Agentic_Business_Platform_HCLTech_v1_ES.pptx');
const outDir = path.dirname(OUTPUT);
if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });

Promise.all(_deferred.map(d => d.p.then(buf => ({ ...d, buf }))))
  .then(resolved => {
    resolved.forEach(({ slide, x, y, w, h, buf }) => {
      slide.addImage({ data:'data:image/png;base64,'+buf.toString('base64'), x, y, w, h });
    });
    return pres.writeFile({ fileName:OUTPUT });
  })
  .then(() => console.log('✅  Escrito:', OUTPUT))
  .catch(e  => { console.error('❌', e); process.exit(1); });
