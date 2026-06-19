# DUPE Agentic Business Platform — Guía de Demostración Ejecutiva

**Preparado por:** Jose Paulino, HCLTech AI Labs  
**Versión:** MVP Demo — Junio 2026  
**Datos:** ⚗️ SINTÉTICOS — Todo el contenido fue generado para demostración. No representa operaciones reales.

---

## Antes de comenzar

1. Confirma que Docker está corriendo: abre Docker Desktop y verifica que los contenedores `dupe-api` y `dupe-db` estén en verde.
2. Abre el navegador en **http://localhost:5173**
3. Verás el banner amarillo en la parte superior de cada página: **"DATOS SINTÉTICOS DE DEMOSTRACIÓN"** — eso confirma que estás en modo demo.

### Datos de demostración disponibles
| Dato | Cantidad |
|------|----------|
| Proyectos | 3 (Residencial Las Palmas, Coral Bay Resort, Vista Verde) |
| Clientes | 15 |
| Planes de pago | 12+ |
| Cuotas por plan | 8–16 |
| Ejecuciones presupuestarias | Múltiples por partida |
| Meses de flujo de caja | 24 meses |
| Notificaciones enviadas (simuladas) | Varias |

---

## PANTALLA 1 — Dashboard Ejecutivo (`/dashboard`)

**Propósito:** Primera pantalla que ve el ejecutivo cada mañana. Semáforo de salud del portafolio completo.

### Lo que ves en la parte superior (KPI strip)
| Tarjeta | Qué mide | Haz clic |
|---------|----------|----------|
| Proyectos Activos | Cuántos proyectos están en el sistema | → va a Proyectos |
| Unidades Totales | Suma de apartamentos en todos los proyectos | → va a Proyectos |
| Cuotas Vencidas | Total de cuotas impagadas en todo el portafolio | → va a Cola de Vencidas |
| Tasa de Cobro | % de lo facturado que ha sido cobrado | → va a Portal de Cobros |

> **Prueba:** Haz clic en la tarjeta "Cuotas Vencidas" — debe llevarte directamente a la lista de cuotas pendientes.

### Selector de proyecto (columna izquierda)
- Escribe en el campo de búsqueda para filtrar proyectos — funciona con 100+ proyectos.
- Haz clic en un proyecto para activarlo. El panel derecho se actualiza en tiempo real.

### Panel derecho — por proyecto
1. **Encabezado del proyecto** — nombre, presupuesto total, barra de avance físico
2. **Estado de Cobranza** — planes activos, tasa de cobro, cuotas vencidas con desglose de escalación (Oficial / Gerencia / Legal)
3. **Gráfico de Ejecución Presupuestaria** — barras por partida, coloreadas por semáforo (verde/ámbar/rojo)
4. **Flujo de Caja acumulado** — sparkline de 18 meses

> **Prueba:** Selecciona "Coral Bay Resort" (proyecto turístico en USD) — observa que los montos cambian a dólares automáticamente.

---

## PANTALLA 2 — Proyectos (`/projects`)

**Propósito:** Control total de cada proyecto sin abrir Excel. Todo lo que el ejecutivo necesita saber de un proyecto en una sola pantalla.

### Resumen de portafolio (tira superior)
- Total proyectos, unidades, en construcción, presupuesto total DOP

### Lista de proyectos (columna izquierda)
- Cada ficha muestra: nombre, tipo, unidades, estado, barra de avance
- Haz clic en cualquier proyecto para abrir el panel de detalle

### Panel de detalle del proyecto (columna derecha)
Cuando seleccionas un proyecto ves todo esto en una sola vista:

#### Encabezado oscuro
- Estado (Construcción / Planificación / Completado)
- Semáforo de presupuesto general
- Barra de avance físico en tiempo real
- Fechas clave: inicio, entrega estimada, días restantes (se pone rojo si quedan < 90 días)

#### Ejecución Presupuestaria (tabla izquierda)
- Lista de todas las partidas del presupuesto
- Porcentaje ejecutado con barra de color
- Semáforo: 🟢 OK (<90%) · 🟡 Alerta (90–110%) · 🔴 Crítico (>110%)
- El botón "Ver presupuesto completo" te lleva a la página de Presupuesto

> **Prueba:** Busca una partida en rojo — eso significa que ese rubro está consumiendo más del presupuesto asignado.

#### Cobranza del Proyecto
- Planes activos, tasa de cobro, cuotas vencidas
- Desglose de escalación (quién debe actuar: oficial, gerencia, legal)

#### Inventario de Unidades
- Cuántas unidades vendidas vs. disponibles
- Precio de lista de cada unidad
- Tabla con número de unidad, piso, metros cuadrados, precio, estado

#### Flujo de Caja — 12 meses
- Mini gráfico del flujo acumulado
- Clic en "Ver detalle" → va a la página de Flujo de Caja completo

#### Acciones rápidas
- Botones directos a: Registrar Pago, Portal de Cobros, Cuotas Vencidas, Flujo de Caja, Predicciones IA, Conciliación, Importar Excel

---

## PANTALLA 3 — Portal de Cobros (`/collections`)

**Propósito:** Ver todos los planes de pago de un proyecto, drill-down hasta el nivel de cuota individual, y enviar recordatorios simulados.

### Resumen de cobranza (tira superior)
- Planes activos, total cobrado, saldo pendiente, cuotas vencidas

### Buscar clientes
- Escribe el nombre del cliente en el campo de búsqueda
- Filtra por nombre completo, número de unidad, o ID

### Tabla de planes (expandible)
- Cada fila muestra: cliente, unidad, fecha de venta, total del plan, cobrado (con mini barra), balance, estado
- Haz clic en cualquier fila para expandirla

### Vista expandida de cuotas
Cuando expandas un plan, verás:
- Información del cliente: nombre completo, email, teléfono/WhatsApp
- Montos cobrados y balance del plan
- **Tabla de cuotas** con: número, fecha de vencimiento, monto, estado (Pagada / Vencida / Pendiente), escalación

#### Botones de recordatorio (por cuota)
Para cada cuota pendiente o vencida:
- **📱 WhatsApp** — simula envío de mensaje al número registrado del cliente
- **✉️ Email** — simula envío de email al correo del cliente
- Aparece un toast de confirmación: "WhatsApp enviado a [número] — recordatorio de cuota #N"
- En producción, estos botones llaman a Meta Cloud API y SendGrid reales

> **Prueba:**
> 1. Selecciona el proyecto "Residencial Las Palmas"
> 2. Haz clic en la primera fila de la tabla para expandirla
> 3. Presiona el botón "WhatsApp" en una cuota vencida
> 4. Observa el toast de confirmación verde

---

## PANTALLA 4 — Cuotas Vencidas (`/overdue`)

**Propósito:** Cola de acción inmediata. Lista priorizada de todas las cuotas con días de retraso, por proyecto y nivel de escalación.

### Filtros
- Filtrar por nivel de escalación: Oficial (D+1) / Gerencia (D+6) / Legal (D+16)

### Columnas de la tabla
- Cliente, unidad, proyecto, días vencida, monto pendiente, nivel de escalación
- Código de color: ámbar → naranja → rojo según urgencia

> **Decisión que soporta:** El gerente ve qué cuentas ya deberían estar en manos del abogado (D+16) vs. cuáles el oficial puede resolver con una llamada.

---

## PANTALLA 5 — Entrada de Datos (`/data-entry`)

**Propósito:** Registro manual de operaciones: transacciones bancarias, pagos de cuotas, y ejecución de presupuesto.

### Tab 1 — Transacción Bancaria
Para registrar un ingreso o egreso que no llegó vía extracto bancario:
1. Selecciona tipo: Ingreso 💰 o Egreso 💸
2. Escribe la descripción
3. Monto y fecha
4. Código de partida (opcional — para asociar al presupuesto)
5. Referencia (número de cheque, transferencia, etc.)
6. Clic en "Registrar Transacción"

> **Prueba:** Registra un egreso de RD$ 50,000 en la partida GAS-001 con referencia "CHQ-0042"

### Tab 2 — Pago de Cuota
Para registrar un pago recibido de un cliente:
1. **Selecciona el cliente** desde el dropdown (muestra nombre + unidad)
2. **Selecciona la cuota** desde el segundo dropdown (solo muestra cuotas pendientes; las pagadas no aparecen)
3. El monto se pre-llena automáticamente desde el plan
4. Ajusta la fecha si el pago fue en un día diferente
5. Clic en "Registrar Pago"

> **Prueba:**
> 1. Selecciona cualquier cliente del dropdown
> 2. Observa que el segundo dropdown solo muestra sus cuotas pendientes
> 3. Selecciona una cuota — el monto se pre-carga
> 4. Registra el pago

### Tab 3 — Ejecución Presupuestal
Para registrar que se gastó dinero contra el presupuesto:
1. Selecciona la partida del dropdown (muestra código + nombre + % ejecutado actual)
2. El sistema muestra el semáforo actual de esa partida
3. Si intentas registrar más del 110% del presupuesto → el sistema **bloquea** el registro y muestra un error (guardia automática)
4. Ingresa el monto, descripción, e ingresado por
5. Clic en "Registrar Ejecución"

> **Prueba de guardia:** Intenta registrar un monto enorme en una partida pequeña — debes ver el error "Presupuesto excedería 110%"

---

## PANTALLA 6 — Flujo de Caja (`/finance/cashflow`)

**Propósito:** Proyección de ingresos y egresos del proyecto, mes a mes, en horizonte de 24–48 meses.

### Gráficos disponibles
- **Área acumulada** — muestra el saldo acumulado; si baja de cero, el proyecto necesita inyección de capital
- **Barras comparativas** — ingresos vs. egresos por mes
- **Tabla de datos** — todos los meses con ingresos, egresos, neto del mes, y acumulado

> **Decisión que soporta:** El ejecutivo ve cuándo el proyecto tendrá los meses más tensos de caja y puede planificar con anticipación.

---

## PANTALLA 7 — Predicciones IA (`/finance/predictions`)

**Propósito:** El agente de inteligencia financiera analiza tendencias y emite alertas tempranas.

### Qué hace el agente
- Analiza la tasa de cobro histórica y proyecta ingresos futuros
- Detecta partidas que van en trayectoria de exceder el 110%
- Identifica clientes con patrón de pago tardío antes de que venzan
- Emite alertas de semáforo con nivel de confianza

> **Nota:** Las predicciones son generadas por el modelo sobre datos sintéticos. En producción, la precisión mejora con 6+ meses de datos reales.

---

## PANTALLA 8 — Conciliación Bancaria (`/finance/reconciliation`)

**Propósito:** Subir el extracto bancario del día y que el sistema intente conciliar automáticamente las transacciones contra las partidas del presupuesto.

### Proceso
1. Descargar el extracto del banco en formato CSV/TXT (desde el netbanking del banco)
2. Subir el archivo en esta pantalla
3. El agente de conciliación intenta hacer el match automático
4. Las transacciones sin match quedan en una cola para que el oficial las clasifique manualmente
5. Cada decisión manual se guarda en el "rule store" — la próxima vez que aparezca la misma descripción, el sistema la clasifica automáticamente

> **Para demostración:** Sube cualquier archivo CSV con columnas de fecha, descripción y monto. El sistema procesará lo que pueda.

---

## PANTALLA 9 — Presupuesto (`/finance/budget`)

**Propósito:** Vista detallada del presupuesto por proyecto: partidas, subpartidas, presupuestado vs. ejecutado.

### Cómo leer la tabla
- Columna verde: ejecución normal (< 90%)
- Columna ámbar: en alerta (90–110%)
- Columna roja: excedido — requiere autorización de gerencia (> 110%)

---

## PANTALLA 10 — Importar Excel (`/finance/import`)

**Propósito:** Cargar el modelo financiero DUPE (los archivos Excel que actualmente usa el equipo) para inicializar el flujo de caja del sistema.

### Proceso
1. Selecciona el proyecto destino
2. Selecciona el tipo: Social (RD$) o Turístico (USD)
3. Sube el archivo Excel de DUPE
4. El sistema parsea las hojas "FLUJO MENSUAL" y "PRESUPUESTO" automáticamente
5. Los datos quedan disponibles inmediatamente en Flujo de Caja y Presupuesto

---

## Resumen de decisiones que soporta la plataforma

| Decisión | Pantalla |
|----------|----------|
| ¿Cómo está el portafolio esta mañana? | Dashboard |
| ¿Qué pasa específicamente con Proyecto X? | Proyectos → seleccionar proyecto |
| ¿Quién me debe y cuánto? | Portal de Cobros |
| ¿A quién llamo hoy por pago vencido? | Cuotas Vencidas |
| ¿Tenemos suficiente caja el próximo mes? | Flujo de Caja |
| ¿Qué partida se está saliendo del presupuesto? | Proyectos → Ejecución Presupuestaria |
| ¿El banco ya acreditó el pago de ayer? | Conciliación Bancaria |
| ¿Cuándo se va a complicar la cobranza? | Predicciones IA |
| Registrar un pago recibido hoy | Entrada de Datos → Pago de Cuota |

---

## Para resetear los datos de demo

Si los datos se ven vacíos o inconsistentes, ejecuta en la terminal:

```bash
docker compose down -v && docker compose up --build
```

Esto borra la base de datos y vuelve a cargar todos los datos sintéticos. Tarda ~60 segundos.

---

*DUPE Agentic Business Platform — HCLTech AI Labs · Jose Paulino · Junio 2026*
