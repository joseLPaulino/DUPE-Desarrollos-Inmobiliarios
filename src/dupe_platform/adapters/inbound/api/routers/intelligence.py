"""
Intelligence router — agentic layer surface.

Endpoints:
  POST /intelligence/leads/{lead_id}/analyze      → LeadScoringAgent
  POST /intelligence/prospects/{project_id}       → ProspectFinderAgent.find_prospects
  GET  /intelligence/prospects/{project_id}       → list discovered prospects for a project
  POST /intelligence/prospects/{prospect_id}/convert → ProspectFinderAgent.convert_to_lead
  GET  /intelligence/funnel/{project_id}          → conversion funnel + source analytics
  GET  /intelligence/agent-log                    → recent AgentAuditLogORM entries
"""
from __future__ import annotations
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dupe_platform.adapters.outbound.persistence.database import get_db
from dupe_platform.adapters.outbound.persistence.models import (
    AgentAuditLogORM,
    LeadORM,
    ProspectORM,
    ProjectORM,
)
from dupe_platform.agents.lead_scoring_agent import LeadScoringAgent
from dupe_platform.agents.prospect_finder_agent import ProspectFinderAgent

router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _lead_dict(lead: LeadORM) -> dict:
    import json as _json
    signals = []
    if lead.ai_signals:
        try:
            signals = _json.loads(lead.ai_signals)
        except Exception:
            pass
    return {
        "id": str(lead.id),
        "project_id": str(lead.project_id),
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "full_name": f"{lead.first_name} {lead.last_name}",
        "phone": lead.phone,
        "email": lead.email,
        "source": lead.source,
        "status": lead.status,
        "qualification_score": lead.qualification_score,
        "assigned_seller": lead.assigned_seller,
        "notes": lead.notes,
        # AI fields
        "ai_score": lead.ai_score,
        "ai_brief": lead.ai_brief,
        "ai_signals": signals,
        "ai_recommended_action": lead.ai_recommended_action,
        "ai_analyzed_at": lead.ai_analyzed_at.isoformat() if lead.ai_analyzed_at else None,
    }


def _prospect_dict(p: ProspectORM) -> dict:
    return {
        "id": str(p.id),
        "project_id": str(p.project_id),
        "full_name": p.full_name,
        "phone": p.phone,
        "email": p.email,
        "source_platform": p.source_platform,
        "source_context": p.source_context,
        "municipality": p.municipality,
        "estimated_income_bracket": p.estimated_income_bracket,
        "affinity_score": p.affinity_score,
        "status": p.status,
        "converted_lead_id": str(p.converted_lead_id) if p.converted_lead_id else None,
        "agent_run_id": p.agent_run_id,
        "discovered_at": p.discovered_at.isoformat() if p.discovered_at else None,
        "notes": p.notes or "",
    }


def _audit_dict(log: AgentAuditLogORM) -> dict:
    return {
        "id": str(log.id),
        "agent_name": log.agent_name,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "input_summary": log.input_summary,
        "output_summary": log.output_summary,
        "confidence_score": log.confidence_score,
        "llm_used": log.llm_used,
        "duration_ms": log.duration_ms,
        "status": log.status,
        "error_message": log.error_message,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


# ── Lead Scoring ──────────────────────────────────────────────────────────────

@router.post("/leads/{lead_id}/analyze")
async def analyze_lead(lead_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Run LeadScoringAgent on a lead. Returns the enriched lead with AI fields."""
    # Validate lead exists
    lead = await db.get(LeadORM, UUID(lead_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    agent = LeadScoringAgent(db)
    result = await agent.analyze_lead(lead_id)

    if not result.success:
        raise HTTPException(status_code=500, detail=result.error)

    # Reload from DB to get persisted values
    await db.refresh(lead)
    return {
        "success": True,
        "llm_used": result.llm_used,
        "duration_ms": result.duration_ms,
        "lead": _lead_dict(lead),
    }


@router.get("/leads")
async def list_scored_leads(
    project_id: str | None = Query(None),
    analyzed_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List leads with their AI scoring data."""
    q = select(LeadORM)
    if project_id:
        q = q.where(LeadORM.project_id == UUID(project_id))
    if analyzed_only:
        q = q.where(LeadORM.ai_score.isnot(None))
    q = q.order_by(LeadORM.ai_score.desc().nullslast())

    rows = (await db.execute(q)).scalars().all()
    leads = [_lead_dict(r) for r in rows]

    # Summary stats
    scored = [l for l in leads if l["ai_score"] is not None]
    avg_score = int(sum(l["ai_score"] for l in scored) / len(scored)) if scored else 0

    return {
        "leads": leads,
        "total": len(leads),
        "scored_count": len(scored),
        "avg_score": avg_score,
    }


# ── Prospect Finder ───────────────────────────────────────────────────────────

@router.post("/prospects/{project_id}")
async def find_prospects(
    project_id: str,
    count: int = Query(8, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run ProspectFinderAgent to discover new potential buyers."""
    project = await db.get(ProjectORM, UUID(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    agent = ProspectFinderAgent(db)
    result = await agent.find_prospects(project_id, count=count)

    if not result.success:
        raise HTTPException(status_code=500, detail=result.error)

    return {
        "success": True,
        "llm_used": result.llm_used,
        "duration_ms": result.duration_ms,
        "run_id": result.data.get("run_id"),
        "prospects": result.data.get("prospects", []),
        "total": result.data.get("total", 0),
    }


@router.get("/prospects/{project_id}")
async def list_prospects(
    project_id: str,
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all discovered prospects for a project."""
    q = select(ProspectORM).where(ProspectORM.project_id == UUID(project_id))
    if status:
        q = q.where(ProspectORM.status == status)
    q = q.order_by(ProspectORM.affinity_score.desc())

    rows = (await db.execute(q)).scalars().all()
    prospects = [_prospect_dict(r) for r in rows]

    # Source breakdown
    source_counts: dict[str, int] = {}
    for p in prospects:
        src = p["source_platform"]
        source_counts[src] = source_counts.get(src, 0) + 1

    return {
        "prospects": prospects,
        "total": len(prospects),
        "pending": sum(1 for p in prospects if p["status"] == "pending"),
        "converted": sum(1 for p in prospects if p["status"] == "converted"),
        "rejected": sum(1 for p in prospects if p["status"] == "rejected"),
        "source_breakdown": source_counts,
    }


@router.post("/prospects/{prospect_id}/convert")
async def convert_prospect(
    prospect_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Convert a discovered prospect into a Comercial lead."""
    prospect = await db.get(ProspectORM, UUID(prospect_id))
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if prospect.status == "converted":
        raise HTTPException(status_code=409, detail="Already converted")

    agent = ProspectFinderAgent(db)
    result = await agent.convert_to_lead(prospect_id, str(prospect.project_id))

    if not result.success:
        raise HTTPException(status_code=500, detail=result.error)

    return {
        "success": True,
        "lead_id": result.data.get("lead_id"),
        "prospect_id": prospect_id,
    }


@router.delete("/prospects/{prospect_id}")
async def reject_prospect(
    prospect_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark a prospect as rejected."""
    prospect = await db.get(ProspectORM, UUID(prospect_id))
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")

    prospect.status = "rejected"
    await db.commit()
    return {"success": True, "prospect_id": prospect_id}


# ── Funnel Analytics ──────────────────────────────────────────────────────────

@router.get("/funnel/{project_id}")
async def get_funnel(
    project_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Conversion funnel from prospects → leads → qualified → reserved."""
    pid = UUID(project_id)

    # Lead counts by status
    lead_q = (
        await db.execute(
            select(LeadORM.status, func.count().label("cnt"))
            .where(LeadORM.project_id == pid)
            .group_by(LeadORM.status)
        )
    ).all()
    lead_by_status = {row.status: row.cnt for row in lead_q}

    # Prospect counts by status
    prospect_q = (
        await db.execute(
            select(ProspectORM.status, func.count().label("cnt"))
            .where(ProspectORM.project_id == pid)
            .group_by(ProspectORM.status)
        )
    ).all()
    prospect_by_status = {row.status: row.cnt for row in prospect_q}

    # Source performance for leads
    source_q = (
        await db.execute(
            select(LeadORM.source, func.count().label("total"),
                   func.avg(LeadORM.ai_score).label("avg_score"))
            .where(LeadORM.project_id == pid)
            .group_by(LeadORM.source)
        )
    ).all()
    source_performance = [
        {
            "source": row.source,
            "total_leads": row.total,
            "avg_ai_score": round(float(row.avg_score), 1) if row.avg_score else None,
        }
        for row in source_q
    ]

    # Prospect source breakdown
    psource_q = (
        await db.execute(
            select(ProspectORM.source_platform, func.count().label("total"))
            .where(ProspectORM.project_id == pid)
            .group_by(ProspectORM.source_platform)
        )
    ).all()
    prospect_sources = [{"source": row.source_platform, "count": row.total} for row in psource_q]

    total_leads = sum(lead_by_status.values())
    reservados = lead_by_status.get("reservado", 0)
    calificados = lead_by_status.get("calificado", 0)
    conversion_rate = round(reservados / total_leads * 100, 1) if total_leads else 0.0

    return {
        "project_id": project_id,
        "funnel": {
            "prospects_discovered": sum(prospect_by_status.values()),
            "prospects_converted": prospect_by_status.get("converted", 0),
            "leads_total": total_leads,
            "leads_nuevo": lead_by_status.get("nuevo", 0),
            "leads_contactado": lead_by_status.get("contactado", 0),
            "leads_calificado": calificados,
            "leads_reservado": reservados,
            "leads_descartado": lead_by_status.get("descartado", 0),
        },
        "conversion_rate_pct": conversion_rate,
        "lead_source_performance": source_performance,
        "prospect_source_breakdown": prospect_sources,
    }


# ── Agent Activity Log ────────────────────────────────────────────────────────

@router.get("/agent-log")
async def get_agent_log(
    limit: int = Query(50, le=200),
    agent_name: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recent agent audit log entries, newest first."""
    q = select(AgentAuditLogORM).order_by(AgentAuditLogORM.created_at.desc()).limit(limit)
    if agent_name:
        q = q.where(AgentAuditLogORM.agent_name == agent_name)

    rows = (await db.execute(q)).scalars().all()
    logs = [_audit_dict(r) for r in rows]

    # Summary
    success_count = sum(1 for l in logs if l["status"] == "success")
    llm_count = sum(1 for l in logs if l["llm_used"])

    return {
        "logs": logs,
        "total": len(logs),
        "success_count": success_count,
        "error_count": len(logs) - success_count,
        "llm_used_count": llm_count,
    }
