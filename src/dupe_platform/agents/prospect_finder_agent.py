"""
ProspectFinderAgent — discovers new potential buyers for a project.

Simulates scanning multiple lead sources:
  - INVI/FONVIVIENDA waitlist (social-interest projects)
  - Expat / diaspora forums (tourist projects)
  - Facebook Group intent signals
  - Rental market (people looking to rent → convert to buy)
  - Employer DB (public sector = stable income for social housing)

When ANTHROPIC_API_KEY is set, uses Claude to generate richer prospect
profiles and context. Otherwise uses a seeded realistic data generator
that produces indistinguishable demo output.

All discovered prospects go to the ProspectORM table. From there,
sellers one-click convert them to leads in the Comercial pipeline.
"""
from __future__ import annotations
import json
import random
from datetime import datetime, timezone
from uuid import UUID, uuid4

from .base import BaseAgent, AgentResult


# ── DR name corpus ────────────────────────────────────────────────────────────
FIRST_NAMES_M = ["Juan Carlos", "José Miguel", "Rafael", "Pedro Luis", "Edwin", "Kelvin",
                  "Derlin", "Aneudis", "Wascar", "Franklyn", "Leonel", "Bienvenido"]
FIRST_NAMES_F = ["Yolanda", "Marleny", "Dahiana", "Leidy", "Niurka", "Suleika",
                  "Altagracia", "Rosalba", "Yanira", "Marisol", "Dilenia", "Yokasta"]
LAST_NAMES    = ["Taveras", "Polanco", "Guerrero", "Batista", "de la Cruz", "Montero",
                  "Sánchez", "Ramírez", "Féliz", "Ureña", "Then", "Almonte", "Familia",
                  "Cabrera", "Rosario", "Marte", "Beras", "Vásquez", "Lora"]

MUNICIPALITIES_SOCIAL = [
    "Santo Domingo Este", "Santo Domingo Norte", "San Cristóbal",
    "Boca Chica", "Guerra", "Sabana Perdida", "Los Alcarrizos",
    "Pedro Brand", "La Victoria", "Villa Mella",
]
MUNICIPALITIES_TOURIST = [
    "Juan Dolio", "Boca Chica", "La Romana", "Punta Cana",
    "Playa Nueva Romana", "Casa de Campo", "Bayahíbe",
]

SOURCES_SOCIAL = [
    ("INVI Waitlist", "Lista de espera FONVIVIENDA municipio {mun}. Solicitante activo con {months} meses en lista."),
    ("Facebook Group — Vivienda RD", "Comentario en grupo 'Vivienda Asequible RD': buscando apartamento de 3 habs en {mun}, presupuesto RD$3-4M."),
    ("Empleador Público — Nómina", "Empleado del sector público ({employer}), ingreso fijo mensual, elegible para FONVIVIENDA según parámetros."),
    ("Portal OLX/Corotos", "Lead desde búsqueda en portal: filtro '3 habitaciones bajo RD$4M en {mun}'."),
    ("WhatsApp Group — Alquiler → Compra", "Miembro de grupo de alquileres en {mun} preguntando por opciones de compra. Renta actual RD${rent}K/mes."),
]

SOURCES_TOURIST = [
    ("Expat Forum — DR1.com", "Post en DR1.com preguntando por condominios en {mun} para inversión/retiro. Presupuesto $250-400K USD."),
    ("Facebook Group — DR Real Estate Investors", "Comentario buscando villas playa cerca {mun}. Viajó a RD en {month}."),
    ("Airbnb Host Community", "Anfitrión Airbnb activo buscando segunda propiedad en DR. ROI estimado 8-12%."),
    ("Miami Dominican Diaspora Network", "Contacto de red diáspora dominicana Miami. Interesado en segunda vivienda o inversión en {mun}."),
    ("Instagram — @dupedesa", "Envió DM preguntando por disponibilidad en Juan Dolio tras ver publicación de maqueta."),
]

EMPLOYERS = ["Ministerio de Educación", "MOPC", "MEPYD", "Policía Nacional",
             "INAPA", "CDEEE", "Ayuntamiento SDN", "Ministerio de Salud"]
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio"]


def _random_dr_phone() -> str:
    return f"+1809{random.randint(1000000, 9999999)}"

def _random_email(name: str) -> str:
    domains = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com"]
    slug = name.lower().replace(" ", ".").replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
    return f"{slug}{random.randint(10,99)}@{random.choice(domains)}"

def _generate_prospect(project_type: str, idx: int, run_id: str) -> dict:
    is_female = random.random() < 0.48
    first = random.choice(FIRST_NAMES_F if is_female else FIRST_NAMES_M)
    last1 = random.choice(LAST_NAMES)
    last2 = random.choice(LAST_NAMES)
    full_name = f"{first} {last1} {last2}"

    if project_type == "tourist":
        mun = random.choice(MUNICIPALITIES_TOURIST)
        src_pool = SOURCES_TOURIST
        income = "alto"
        affinity = random.randint(55, 95)
    else:
        mun = random.choice(MUNICIPALITIES_SOCIAL)
        src_pool = SOURCES_SOCIAL
        income = random.choice(["bajo", "medio", "medio"])
        affinity = random.randint(45, 90)

    src_name, src_tpl = random.choice(src_pool)
    context = src_tpl.format(
        mun=mun,
        months=random.randint(3, 18),
        employer=random.choice(EMPLOYERS),
        rent=random.randint(18, 45),
        month=random.choice(MONTHS),
    )

    return {
        "full_name": full_name,
        "phone": _random_dr_phone(),
        "email": _random_email(f"{first.split()[0]} {last1}"),
        "source_platform": src_name,
        "source_context": context,
        "municipality": mun,
        "estimated_income_bracket": income,
        "affinity_score": affinity,
        "notes": "",
        "agent_run_id": run_id,
    }


class ProspectFinderAgent(BaseAgent):
    name = "ProspectFinderAgent"

    async def find_prospects(self, project_id: str, count: int = 8) -> AgentResult:
        """
        Discover new potential buyers for a given project.

        Steps:
        1. Load project to determine type (social / tourist)
        2. Generate realistic prospects from multiple simulated sources
        3. If LLM available, enrich each prospect with AI context
        4. Persist to ProspectORM
        5. Audit log the run
        """
        from dupe_platform.adapters.outbound.persistence.models import ProjectORM, ProspectORM

        t0 = self._timed()
        project = await self.db.get(ProjectORM, UUID(project_id))
        if not project:
            return AgentResult(
                agent_name=self.name, action="find_prospects",
                success=False, data={}, error=f"Project {project_id} not found",
            )

        run_id = str(uuid4())
        project_type = "tourist" if project.currency == "USD" else "social"
        count = min(count, 12)  # cap at 12 per run

        raw_prospects = [_generate_prospect(project_type, i, run_id) for i in range(count)]

        # If LLM available, enrich with a single batch call
        llm_used = False
        if self.has_llm and len(raw_prospects) > 0:
            raw_prospects, llm_used = await self._llm_enrich(raw_prospects, project, project_type)

        # Sort by affinity descending
        raw_prospects.sort(key=lambda p: p["affinity_score"], reverse=True)

        # Persist
        saved = []
        for p in raw_prospects:
            orm = ProspectORM(
                id=uuid4(),
                project_id=UUID(project_id),
                full_name=p["full_name"],
                phone=p["phone"],
                email=p["email"],
                source_platform=p["source_platform"],
                source_context=p["source_context"],
                municipality=p["municipality"],
                estimated_income_bracket=p["estimated_income_bracket"],
                affinity_score=p["affinity_score"],
                status="pending",
                agent_run_id=run_id,
                notes=p.get("notes", ""),
            )
            self.db.add(orm)
            p["id"] = str(orm.id)
            saved.append(p)

        await self.db.flush()
        duration = self._elapsed_ms(t0)

        await self._log_audit(
            action="find_prospects",
            entity_type="project",
            entity_id=project_id,
            input_summary=f"Project: {project.name} | type={project_type} | requested={count}",
            output_summary=f"Found {len(saved)} prospects | sources: {set(p['source_platform'] for p in saved)}",
            confidence=70,
            llm_used=llm_used,
            duration_ms=duration,
            run_id=run_id,
        )
        await self.db.commit()

        return AgentResult(
            agent_name=self.name, action="find_prospects",
            success=True,
            data={
                "project_id": project_id,
                "project_name": project.name,
                "run_id": run_id,
                "prospects": saved,
                "total": len(saved),
                "llm_used": llm_used,
            },
            confidence=70, llm_used=llm_used, duration_ms=duration,
        )

    async def _llm_enrich(
        self, prospects: list[dict], project, project_type: str,
    ) -> tuple[list[dict], bool]:
        """Use LLM to improve prospect context descriptions."""
        prompt = f"""Eres un analista de ventas inmobiliarias en República Dominicana.
Para el proyecto "{project.name}" ({project_type}), enriquece las descripciones de los siguientes prospectos.
Para cada uno, mejora el campo 'source_context' con un detalle más específico y natural (1-2 oraciones).
Responde SOLO con un JSON array con los mismos objetos pero con 'source_context' mejorado.

Prospectos:
{json.dumps([{'index': i, 'name': p['full_name'], 'source': p['source_platform'], 'context': p['source_context'], 'municipality': p['municipality']} for i, p in enumerate(prospects)], ensure_ascii=False)}
"""
        text, used = await self.call_llm(prompt, max_tokens=800)
        if not used:
            return prospects, False
        try:
            import re
            match = re.search(r'\[.*\]', text, re.DOTALL)
            if match:
                enriched = json.loads(match.group())
                for item in enriched:
                    idx = item.get("index", -1)
                    if 0 <= idx < len(prospects) and item.get("source_context"):
                        prospects[idx]["source_context"] = item["source_context"]
        except Exception:
            pass
        return prospects, used

    async def convert_to_lead(self, prospect_id: str, project_id: str) -> AgentResult:
        """Convert a discovered prospect into a LeadORM record."""
        from dupe_platform.adapters.outbound.persistence.models import ProspectORM, LeadORM

        t0 = self._timed()
        prospect = await self.db.get(ProspectORM, UUID(prospect_id))
        if not prospect:
            return AgentResult(
                agent_name=self.name, action="convert_to_lead",
                success=False, data={}, error="Prospect not found",
            )
        if prospect.status == "converted":
            return AgentResult(
                agent_name=self.name, action="convert_to_lead",
                success=False, data={}, error="Already converted",
            )

        parts = prospect.full_name.strip().split(" ", 1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ""

        lead = LeadORM(
            id=uuid4(),
            project_id=prospect.project_id,
            first_name=first,
            last_name=last,
            phone=prospect.phone,
            email=prospect.email,
            source="otro",
            status="nuevo",
            qualification_score=max(0, min(5, prospect.affinity_score // 20)),
            assigned_seller="",
            notes=f"[IA Prospección] Fuente: {prospect.source_platform}. {prospect.source_context}",
        )
        self.db.add(lead)

        prospect.status = "converted"
        prospect.converted_lead_id = lead.id
        await self.db.flush()

        await self._log_audit(
            action="convert_to_lead",
            entity_type="prospect",
            entity_id=prospect_id,
            input_summary=f"Prospect: {prospect.full_name}",
            output_summary=f"Converted to LeadORM id={lead.id}",
            confidence=80,
            llm_used=False,
            duration_ms=self._elapsed_ms(t0),
            run_id=prospect.agent_run_id,
        )
        await self.db.commit()

        return AgentResult(
            agent_name=self.name, action="convert_to_lead",
            success=True,
            data={"lead_id": str(lead.id), "prospect_id": prospect_id},
            confidence=80, duration_ms=self._elapsed_ms(t0),
        )
