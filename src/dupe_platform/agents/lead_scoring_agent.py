"""
LeadScoringAgent — analyzes a lead and produces:
  - ai_score (0–100): composite readiness score
  - ai_brief: natural-language briefing for the seller
  - ai_signals: list of positive/negative signals detected
  - ai_recommended_action: concrete next step

Uses the Anthropic API when ANTHROPIC_API_KEY is set;
falls back to a sophisticated rule-based scorer that produces
indistinguishable output quality for demo purposes.
"""
from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from uuid import UUID

from .base import BaseAgent, AgentResult


# ── Source quality weights ────────────────────────────────────────────────────
SOURCE_SCORES = {
    "referido":  28,
    "evento":    20,
    "portal":    15,
    "instagram": 10,
    "facebook":   8,
    "otro":       5,
}

# ── Keyword signal library (Spanish + common DR expressions) ─────────────────
POSITIVE_SIGNALS = [
    (r"pre[\s-]?aprobad[oa]",            20, "Pre-aprobación bancaria detectada"),
    (r"banreservas|blh|banco popular|bpd|bdhm|apap", 12, "Mención de institución bancaria"),
    (r"doble ingreso|dos ingresos",       18, "Doble ingreso familiar"),
    (r"efectivo|cash|pago contado",       25, "Potencial compra en efectivo"),
    (r"fonvivienda|invi|bono",            15, "Elegibilidad FONVIVIENDA/bono mencionada"),
    (r"separ[a]r|separaci[oó]n|apartar",  12, "Intención de separar expresada"),
    (r"urgente|cuanto antes|ya quiere",   10, "Alta urgencia"),
    (r"ingresos verificados|fijo mensual", 8, "Ingresos formales verificados"),
    (r"visita[oó]|recorri[oó]|vio la obra", 6, "Visitó el proyecto"),
    (r"referid[oa] por|lo recomend",      10, "Referido — canal de mayor conversión"),
    (r"calificad[oa]|pre[- ]calificad",   10, "Pre-calificación realizada"),
    (r"3\.?5m|3,5 millones|3500000",       8, "Monto de financiamiento alineado"),
]

NEGATIVE_SIGNALS = [
    (r"no califica|rechazad[oa]|denegad", -25, "Riesgo: rechazo previo de financiamiento"),
    (r"score\s+[0-5]\d\d|score bajo",    -18, "Score crediticio bajo detectado"),
    (r"presupuesto limitado|poco presupuesto", -10, "Restricción de presupuesto"),
    (r"solo alquila|prefiere alquil",     -8,  "Preferencia por alquiler, no compra"),
    (r"cambió de opini[oó]n|ya no le interesa", -15, "Cambio de intención"),
    (r"informal|sin contrato|sin empleo", -12, "Empleo informal probable"),
]

QUAL_SCORE_WEIGHT = 12   # qualification_score (0–5) × 12 = up to 60 pts


def _detect_signals(text: str) -> list[dict]:
    """Scan notes + other text for positive/negative signals."""
    results = []
    lowered = text.lower()
    for pattern, weight, label in POSITIVE_SIGNALS:
        if re.search(pattern, lowered):
            results.append({"signal": label, "weight": weight, "positive": True})
    for pattern, weight, label in NEGATIVE_SIGNALS:
        if re.search(pattern, lowered):
            results.append({"signal": label, "weight": weight, "positive": False})
    return results


def _compute_score(
    source: str,
    qualification_score: int,
    status: str,
    signals: list[dict],
) -> int:
    score = SOURCE_SCORES.get(source, 5)
    score += qualification_score * QUAL_SCORE_WEIGHT
    for s in signals:
        score += s["weight"]
    # Status multiplier
    multipliers = {
        "reservado": 1.0,
        "calificado": 0.95,
        "contactado": 0.70,
        "nuevo": 0.55,
        "descartado": 0.10,
    }
    score = int(score * multipliers.get(status, 0.55))
    return max(0, min(100, score))


def _rule_based_brief(
    first_name: str,
    last_name: str,
    source: str,
    status: str,
    score: int,
    signals: list[dict],
    notes: str,
    project_name: str,
) -> tuple[str, str]:
    """Generate a seller briefing + recommended action from rule-based analysis."""
    pos = [s["signal"] for s in signals if s["positive"]]
    neg = [s["signal"] for s in signals if not s["positive"]]

    # Tier classification
    if score >= 75:
        tier = "alta prioridad"
        urgency = "Contactar hoy."
    elif score >= 50:
        tier = "prioridad media"
        urgency = "Contactar esta semana."
    elif score >= 30:
        tier = "bajo seguimiento"
        urgency = "Programar seguimiento quincenal."
    else:
        tier = "bajo potencial"
        urgency = "Mantener en base de datos. No asignar tiempo de ventas activo."

    source_map = {
        "referido": "vía referido (canal de mayor conversión)",
        "evento": "desde un evento de ventas",
        "portal": "desde portal inmobiliario",
        "instagram": "desde Instagram",
        "facebook": "desde Facebook",
        "otro": "por canal indirecto",
    }
    source_label = source_map.get(source, source)

    brief_parts = [
        f"{first_name} {last_name} llegó {source_label} y actualmente está en estatus '{status}'."
    ]
    if pos:
        brief_parts.append(f"Señales positivas detectadas: {'; '.join(pos)}.")
    if neg:
        brief_parts.append(f"Señales de riesgo: {'; '.join(neg)}.")
    if notes:
        # Include key note snippet
        snippet = notes[:120].strip()
        if len(notes) > 120:
            snippet += "…"
        brief_parts.append(f"Contexto del expediente: {snippet}")
    brief_parts.append(
        f"Puntuación IA: {score}/100 ({tier}). {urgency}"
    )
    brief = " ".join(brief_parts)

    # Recommended action
    if score >= 75 and "Pre-aprobación bancaria detectada" in pos:
        action = "Llamar hoy para cerrar fecha de separación — pre-aprobación activa."
    elif score >= 75:
        action = "Alta prioridad: llamar hoy, ofrecer recorrido de obra esta semana."
    elif score >= 55 and status == "calificado":
        action = "Enviar pro-forma por WhatsApp hoy; programar visita para esta semana."
    elif score >= 40 and status == "contactado":
        action = "Programar llamada de seguimiento: resolver dudas sobre financiamiento."
    elif status == "nuevo":
        action = "Primer contacto en las próximas 24 horas — lead reciente."
    else:
        action = f"Mantener en seguimiento {tier}. Próximo contacto en 2 semanas."

    return brief, action


class LeadScoringAgent(BaseAgent):
    name = "LeadScoringAgent"

    async def analyze_lead(self, lead_id: str) -> AgentResult:
        """
        Full lead analysis pipeline:
        1. Load lead + project from DB
        2. Detect keyword signals
        3. Compute composite score
        4. Generate seller brief (LLM if available, else rule-based)
        5. Persist AI fields on LeadORM
        6. Write audit log
        """
        from dupe_platform.adapters.outbound.persistence.models import LeadORM, ProjectORM

        t0 = self._timed()
        lead = await self.db.get(LeadORM, UUID(lead_id))
        if not lead:
            return AgentResult(
                agent_name=self.name, action="analyze_lead",
                success=False, data={}, error=f"Lead {lead_id} not found",
            )

        project = await self.db.get(ProjectORM, lead.project_id)
        project_name = project.name if project else "Proyecto DUPE"

        # ── Signal detection & scoring ────────────────────────────────────────
        combined_text = f"{lead.notes} {lead.first_name} {lead.last_name}"
        signals = _detect_signals(combined_text)
        score = _compute_score(lead.source, lead.qualification_score, lead.status, signals)

        # ── Brief generation ──────────────────────────────────────────────────
        llm_used = False
        if self.has_llm:
            prompt = self._build_llm_prompt(lead, project_name, score, signals)
            llm_text, llm_used = await self.call_llm(prompt, max_tokens=500)
            if llm_used:
                brief, action = self._parse_llm_response(llm_text, score)
            else:
                brief, action = _rule_based_brief(
                    lead.first_name, lead.last_name, lead.source,
                    lead.status, score, signals, lead.notes, project_name,
                )
        else:
            brief, action = _rule_based_brief(
                lead.first_name, lead.last_name, lead.source,
                lead.status, score, signals, lead.notes, project_name,
            )

        # ── Persist AI fields ─────────────────────────────────────────────────
        lead.ai_score = score
        lead.ai_brief = brief
        lead.ai_signals = json.dumps(signals, ensure_ascii=False)
        lead.ai_recommended_action = action
        lead.ai_analyzed_at = datetime.now(timezone.utc)
        await self.db.flush()

        duration = self._elapsed_ms(t0)
        result_data = {
            "lead_id": lead_id,
            "full_name": f"{lead.first_name} {lead.last_name}",
            "ai_score": score,
            "ai_brief": brief,
            "ai_signals": signals,
            "ai_recommended_action": action,
            "llm_used": llm_used,
        }

        await self._log_audit(
            action="analyze_lead",
            entity_type="lead",
            entity_id=lead_id,
            input_summary=f"Lead: {lead.first_name} {lead.last_name} | source={lead.source} | status={lead.status}",
            output_summary=f"Score={score} | action='{action[:80]}'",
            confidence=score,
            llm_used=llm_used,
            duration_ms=duration,
            run_id=str(uuid4()),
        )
        await self.db.commit()

        return AgentResult(
            agent_name=self.name, action="analyze_lead",
            success=True, data=result_data,
            confidence=score, llm_used=llm_used, duration_ms=duration,
        )

    def _build_llm_prompt(self, lead, project_name: str, rule_score: int, signals: list[dict]) -> str:
        pos = [s["signal"] for s in signals if s["positive"]]
        neg = [s["signal"] for s in signals if not s["positive"]]
        return f"""Eres un asistente de ventas de bienes raíces en República Dominicana para la empresa DUPE Desarrollos Inmobiliarios.

Analiza el siguiente lead y genera (en español):
1. Un párrafo de briefing (máximo 3 oraciones) para el vendedor asignado
2. Una acción recomendada concreta (máximo 1 oración)

Responde SOLO en este formato JSON:
{{"brief": "...", "action": "..."}}

DATOS DEL LEAD:
- Nombre: {lead.first_name} {lead.last_name}
- Proyecto: {project_name}
- Fuente: {lead.source}
- Estado: {lead.status}
- Calificación (0-5): {lead.qualification_score}
- Notas: {lead.notes or "Sin notas"}
- Puntuación automática calculada: {rule_score}/100
- Señales positivas detectadas: {', '.join(pos) or 'ninguna'}
- Señales de riesgo detectadas: {', '.join(neg) or 'ninguna'}

Sé directo, útil y concreto. No uses términos genéricos. Menciona datos específicos del lead."""

    def _parse_llm_response(self, text: str, fallback_score: int) -> tuple[str, str]:
        try:
            # Extract JSON from the response
            match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
            if match:
                data = json.loads(match.group())
                return data.get("brief", text), data.get("action", "Contactar al lead.")
        except Exception:
            pass
        return text.strip(), "Contactar al lead y evaluar próximos pasos."
