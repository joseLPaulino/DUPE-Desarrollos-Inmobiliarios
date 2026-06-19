# DUPE Agentic Platform — Gap Analysis & Phased Backlog

**Client:** DUPE Desarrollos Inmobiliarios  
**Prepared by:** Jose Paulino, Senior AI Solution Architect — HCLTech AI Labs  
**Date:** June 19, 2026  
**Basis:** 5 department use-case PDFs + process diagram vs. current codebase

---

## Executive Summary

The platform currently covers **Finanzas** (4 of 5 features built) and **Cobros** (core collection cycle fully built). The remaining **3 departments — Comercial, Gestión, and Postventa — are entirely absent** from the codebase. Together they represent 18 missing features across the full client-lifecycle pipeline: from lead capture → reservation → contract signing → unit delivery → warranty.

Additionally, one cross-cutting capability (manager goal assignment + performance tracking) is missing from all 5 departments.

**Current MVP coverage: ~32% of total scope.**

---

## Coverage Matrix

| Department | Total Features | Built | Partial | Missing | Coverage |
|---|:---:|:---:|:---:|:---:|:---:|
| Finanzas | 5 | 4 | 0 | 1 | 80% |
| Cobros | 2 | 1 | 0 | 1* | 50%* |
| Comercial | 7 | 0 | 0 | 7 | 0% |
| Gestión | 6 | 0 | 0 | 6 | 0% |
| Postventa | 8 | 0 | 0 | 8 | 0% |
| **TOTAL** | **28** | **5** | **0** | **23** | **~18%** |

*Cobros "Gestión de cobros" is built; "Asignación de objetivos" (goal management) is missing.

---

## What Is Built Today

### Finanzas ✅ (4/5)
- **Presupuesto:** Budget by partida, income/expense split, 110% guard, traffic lights
- **Cash Flow:** 24–48 month projection vs. actual, breakdown by component (Construcción, Suelo, Técnicos, Jurídico, Financiero, Gestión, Comercialización)
- **Conciliación de caja:** Manual CSV/TXT upload, rule-based auto-matching, officer decision persistence
- **Seguimiento:** Dashboard KPIs, budget vs. executed per partida, traffic-light indicators, AI predictions

### Cobros ✅ (core cycle)
- Payment plan generation (8–16 installments from sale date + delivery date)
- WhatsApp + email notifications: 5 days pre-due, day-of, overdue
- Escalation Day+1 (officer), Day+6 (management), Day+16 (legal flag)
- Officer overdue queue (read-only), payment registration + receipt, deduplication guard

---

## Gap Details by Department

---

### 🔴 FINANZAS — Missing: Contabilidad

**Tarea:** Contabilidad — Registrar facturas generadas  
**Resultado esperado:** Módulo donde se registren facturas de todos los proveedores; con el registro de ingresos, se genere automáticamente el **Balance General** y **Estado de Resultados** según fechas por filtro.

**What's missing:**
- Invoice/bill registry form (proveedor, monto, partida, fecha, NCF/tax number)
- Double-entry journal auto-generation from each invoice (debit expense partida, credit accounts payable)
- Income registration entry that also posts to the ledger
- Balance General report (Activos = Pasivos + Patrimonio) by date range
- Estado de Resultados (Ingresos − Gastos = Utilidad) by date range

**Build estimate:** 4–5 pod days  
**External dependency:** None — pure internal ledger  
**Priority:** HIGH — this is a Finanzas request and Finanzas is the most built module

---

### 🔴 COBROS — Missing: Objetivo / Meta Management

**Cross-cutting** (applies to all 5 departments, listed here once)

**Resultado esperado:** Management sets numeric targets (metas) per officer. Officers see their progress vs. target. Management sees aggregate performance.

**What's missing:**
- Goal creation by manager (officer, period, metric type: amount collected, plans activated, etc.)
- Progress tracking dashboard (per officer and aggregate)
- Alert if officer falls below threshold (e.g., <70% of goal)

**Build estimate:** 2–3 pod days  
**External dependency:** None  
**Priority:** MEDIUM — requested in all 5 departments, high management value

---

### 🔴 COMERCIAL — Entirely Missing (7 features)

The client lifecycle begins here. Nothing in this department has been built.

#### C1 — Publicidad (Lead Assignment)
**Resultado:** Automated lead segmentation by project → random assignment to seller inboxes  
**What's needed:** Lead model (name, phone, email, source, project interest), random round-robin assignment to active sellers by project  
**Build estimate:** 1–2 pod days  
**External dependency:** No external API required for assignment logic; ad platform integration (Facebook/Google Ads) is out of scope for MVP — leads can be manually entered or imported via CSV  

#### C2 — Envío de información / WhatsApp BOT
**Resultado:** BOT sends project info to lead, asks qualifying questions, scores and routes to seller  
**What's needed:** Conversational WhatsApp webhook flow (different from outbound notifications), qualification criteria, seller routing logic  
**Build estimate:** 3–4 pod days  
**External dependency:** Meta webhook + WhatsApp Cloud API (same account as notifications — shared dependency). This is a BOT flow, not a notification blast. Requires scripted conversation design from DUPE.  
**Priority:** MEDIUM — BOT conversations are complex; basic lead intake form + email/WhatsApp info send can substitute for MVP

#### C3 — Contacto (Call Logging)
**Resultado:** Seller logs call outcome; advance to site visit or pre-qualification  
**What's needed:** Call log entry on lead record (date, duration, outcome, notes), status progression  
**Build estimate:** 1 pod day  
**External dependency:** No telephony integration required; manual log only  

#### C4 — Precalificación Bancaria ⚠️ EXTERNAL DEPENDENCY
**Resultado:** Enter cédula → automated credit bureau check → proceed or decline  
**External dependency:** DR credit bureau API (TransUnion, Equifax, or INACIF/CCDP). **No public API documented.** This requires vendor contract, API credentials, and integration work not scoped in MVP.  
**MVP substitute:** Manual pre-qualification form where officer records the result of a manual bureau check  
**Build estimate:** 0.5 pod days (manual form); 5+ pod days if bureau API becomes available  

#### C5 — Disponibilidad de Inventario ✅ Buildable, High Priority
**Resultado:** Sellers see ONLY available units; can toggle VENDIDO / DISPONIBLE  
**What's needed:** Unit inventory model per project (type, area m², price, floor, status), seller-filtered view, status toggle with audit log  
**Build estimate:** 2 pod days  
**External dependency:** None  
**Priority:** HIGH — prerequisite for C6 (Reserva de unidad)

#### C6 — Reserva de Unidad ✅ Buildable, High Priority
**Resultado:** Auto-generate payment plan by unit typology + seller-selected plan, send to client via email + WhatsApp, link to purchase contract  
**What's needed:** Reservation form (unit, client, plan type), payment plan engine (already built in Cobros), email + WhatsApp dispatch of plan table, reference to future contract  
**Build estimate:** 2 pod days (payment plan engine exists; need UI + dispatch)  
**External dependency:** WhatsApp notification (same channel as Cobros — already built)  
**Priority:** HIGH — directly generates collections pipeline

---

### 🔴 GESTIÓN — Entirely Missing (6 features)

#### G1 — Asignación de Cliente a Oficiales
**Resultado:** Clients who completed Comercial process → randomly assigned to a Gestión officer's inbox  
**What's needed:** Officer model, random round-robin assignment trigger on reservation completion, officer inbox (queue view)  
**Build estimate:** 1–2 pod days  
**External dependency:** None  

#### G2 — Notificación a Cliente
**Resultado:** Auto-notify client via email + WhatsApp: officer name + required documents (cédula, carta trabajo, movimientos bancarios, certificación de no vivienda)  
**What's needed:** Trigger on officer assignment, templated email + WhatsApp message, document checklist  
**Build estimate:** 1 pod day (uses existing notification infrastructure)  
**External dependency:** None — same notification channel  

#### G3 — Confección de Contrato ✅ Buildable, High Priority
**Resultado:** Enter client cédula → auto-populate name + address → generate purchase contract PDF with embedded payment plan  
**What's needed:** Client data enrichment (can use local registry or manual entry if no external API), contract template (Word/PDF), payment plan reference injection  
**External dependency:** Dominican Republic cédula lookup (JCE API — limited public access). **MVP:** officer enters name + address manually; system generates contract PDF from that data.  
**Build estimate:** 2–3 pod days (PDF generation from template)  

#### G4 — Citas ⚠️ EXTERNAL DEPENDENCY
**Resultado:** Offer client available slots from officer's calendar for contract signing  
**External dependency:** Calendar integration (Google Calendar / Outlook). Without API access, this cannot be automated.  
**MVP substitute:** Officer manually sets availability windows in the platform; system offers those slots to client via email  
**Build estimate:** 1–2 pod days (manual availability model, no calendar API)  

#### G5 — Vinculación en Fiduciaria ✅ Buildable
**Resultado:** 3-state workflow: Recolección de firma → Enviado a Fiduciaria → Cliente vinculado; time elapsed in each state visible  
**What's needed:** Status state machine on client record, timestamp on each state transition, elapsed time calculation, management view  
**Build estimate:** 1 pod day  
**External dependency:** No Fiduciaria API needed — status is manually advanced by officer  

---

### 🔴 POSTVENTA — Entirely Missing (8 features)

#### P1 — Preinspección (Digital Form) ✅ Buildable, High Priority
**Resultado:** Digital form filled by client during pre-inspection; checklist by room/area with defect selection + image upload  
**What's needed:** Room/area model per unit, defect checklist (configurable), image upload (S3 or equivalent), form submission linked to client + unit  
**Build estimate:** 3 pod days (includes image upload)  
**External dependency:** File storage (S3 or compatible) — needs cloud environment decision  

#### P2 — Notificación Proveedor (on Inspection Report)
**Resultado:** On inspection form submission → auto-send PDF report to constructor email + DUPE official  
**What's needed:** PDF report generation from inspection form, email dispatch to constructor (configured per project), copy to DUPE official  
**Build estimate:** 1–2 pod days (reuses PDF skill + notification infrastructure)  
**External dependency:** None  

#### P3 — Notificación Cliente (recepción de reporte)
**Resultado:** Auto-send PDF confirmation of report receipt to client + DUPE official  
**What's needed:** Triggered on inspection form submission, same report PDF, client email dispatch  
**Build estimate:** 0.5 pod days (P2 does most of the work)  

#### P4 — Notificación Cliente (inmueble listo)
**Resultado:** When officer changes postventa status to "Listo" → auto-send appointment availability to client  
**What's needed:** Status change trigger, officer availability slots model (from G4 MVP), email to client with slots  
**Build estimate:** 1 pod day  
**External dependency:** Shares calendar/availability model from G4  

#### P5 — Elaboración de Acta de Entrega ✅ Buildable, High Priority
**Resultado:** Auto-generate delivery certificate from contract data; start 12-month warranty countdown from document date  
**What's needed:** Acta template (PDF), data pull from purchase contract, warranty start date + expiry tracker  
**Build estimate:** 1–2 pod days  
**External dependency:** None  

#### P6 — Envío de Documentación (convivencia manual)
**Resultado:** When status = "Vivienda entregada" → auto-send living manual via WhatsApp + email  
**What's needed:** Trigger on status change, document storage for convivencia manual (PDF), dispatch via existing notification channel  
**Build estimate:** 0.5 pod days  
**External dependency:** None (uses existing notification infrastructure)  

#### P7 — Indicadores Postventa
**Resultado:** Days each client spends in each postventa state (Preinspección → Listo → Vivienda entregada); management dashboard  
**What's needed:** State entry timestamps, elapsed time calculation, aggregate dashboard (avg, min, max, outliers)  
**Build estimate:** 1 pod day  
**External dependency:** None  

---

## External Dependencies — Cannot Build Without 3rd Party

| Feature | Dependency | Status | MVP Substitute |
|---|---|---|---|
| Precalificación bancaria | DR credit bureau API | Unavailable — vendor contract needed | Manual form where officer records result |
| Citas con calendario | Google/Outlook Calendar API | Requires OAuth setup + credentials | Officer sets manual availability slots in platform |
| WhatsApp BOT conversacional | Meta Cloud API webhook (inbound) | Separate from outbound notifications — needs different config | Lead intake form + info email/WhatsApp blast |
| Integración cédula → nombre | JCE (Dominican ID registry) API | Limited/no public access | Officer enters name manually |
| Integración Fiduciaria | No known Fiduciaria API | Unavailable | Manual status state machine |

---

## Phased Delivery Plan

### Phase 1 — Complete What's Started (Est. 5–6 pod days)

Close the gaps in the two built modules before expanding scope.

| Item | Department | Est. Days |
|---|---|:---:|
| Contabilidad: Invoice registry + Balance General + Estado de Resultados | Finanzas | 4–5 |
| Meta/objetivo management (manager assigns targets, tracks performance) | Cross-cutting | 2–3 |

**Phase 1 outcome:** Finanzas 100% done. Management has full financial reporting.

---

### Phase 2 — Commercial Pipeline Core (Est. 6–7 pod days)

Enables the sales cycle to live in the platform and feeds the collections pipeline.

| Item | Department | Est. Days |
|---|---|:---:|
| Unit inventory model (type, price, status VENDIDO/DISPONIBLE) | Comercial | 2 |
| Lead intake + seller assignment (round-robin) | Comercial | 1–2 |
| Reservation + auto payment plan + email/WhatsApp dispatch | Comercial | 2 |
| Client-to-officer assignment (Gestión) | Gestión | 1 |
| Document checklist notification (email + WhatsApp) | Gestión | 1 |

**Phase 2 outcome:** Full sales-to-collections handoff works in-platform. Cobros receives plans automatically from reservations.

---

### Phase 3 — Contract & Onboarding (Est. 4–5 pod days)

Eliminates the manual contract step and closes the Gestión module.

| Item | Department | Est. Days |
|---|---|:---:|
| Contract PDF generation (from template + client data + payment plan) | Gestión | 2–3 |
| Officer availability slots (MVP calendar, no external API) | Gestión | 1 |
| Fiduciaria status state machine (3 states + time elapsed) | Gestión | 1 |

**Phase 3 outcome:** Gestión module complete. Full client lifecycle from lead to vinculada.

---

### Phase 4 — Postventa (Est. 5–6 pod days)

Closes the delivery and warranty cycle.

| Item | Department | Est. Days |
|---|---|:---:|
| Pre-inspection digital form (room/area + defect checklist + image upload) | Postventa | 3 |
| Constructor + client notification with PDF report | Postventa | 1–2 |
| Postventa status machine (Listo / Corrección / Vivienda entregada) | Postventa | 0.5 |
| Delivery acta auto-generation + 12-month warranty countdown | Postventa | 1–2 |
| Convivencia manual auto-dispatch on delivery | Postventa | 0.5 |
| Days-in-state indicators for management | Postventa | 1 |

**Phase 4 outcome:** Full client lifecycle complete. Management has indicators for all post-sale states.

---

## Total Scope Summary

| Phase | Focus | Est. Pod Days | Modules Closed |
|---|---|:---:|---|
| Phase 1 | Finanzas + Goal Management | 7–8 | Finanzas (100%), Goal mgmt |
| Phase 2 | Commercial pipeline + client assignment | 6–7 | Comercial (core), Gestión (start) |
| Phase 3 | Contract + onboarding | 4–5 | Gestión (100%) |
| Phase 4 | Post-sale delivery | 5–6 | Postventa (100%) |
| **TOTAL** | | **22–26 pod days** | **All 5 departments** |

Current MVP allocation was 14–18 pod days for Finanzas + Cobros. Full scope is approximately **40–44 total pod days** (current ~18 built + ~22–26 remaining).

---

## Recommended Immediate Actions

1. **Start Phase 1 now** — Contabilidad (invoice registry + financial statements) and goal management are self-contained, high-value, and unblock the DUPE finance team demo.

2. **Confirm scope with DUPE before Phase 2** — Unit inventory requires DUPE to provide the actual unit catalogue per project (type, area m², price). This is Day 1 data for Comercial.

3. **Resolve WhatsApp Business Account verification** — still on critical path. BOT conversations (C2) cannot proceed until Meta verifies the account. Notifications are likely already working on the same account.

4. **Decide on cloud environment** — image upload (P1 pre-inspection) requires object storage. If HCLTech provisions the environment, provision an S3-compatible bucket now.

5. **De-risk credit bureau** — DUPE must contact their DR banking partners to understand what precalificación bureau access is available before Phase 2. If no API exists, the manual substitute is the MVP path.

---

*Document location: `docs/DUPE_Gap_Analysis_June2026.md`*  
*Next artifact: Updated L1 Architecture reflecting all 5 modules*
