"""LLM client factory — returns a LangChain ChatOpenAI instance.

Usage anywhere in the codebase:
    from dupe_platform.infrastructure.llm import get_llm
    llm = get_llm()
    response = await llm.ainvoke([HumanMessage(content="...")])

If OPENAI_API_KEY is not set or is the placeholder, get_llm() raises a clear
RuntimeError so the calling agent can fall back to rule-based logic.

All agents should check settings.llm_enabled before calling get_llm():
    if settings.llm_enabled:
        llm = get_llm()
        # use LLM reasoning
    else:
        # use synthetic / rule-based fallback
"""
from dupe_platform.infrastructure.config import get_settings


def get_llm(temperature: float = 0.0):
    """Return a ChatOpenAI client configured from settings.

    temperature=0.0 is the default for all DUPE agents — deterministic output
    is preferred for financial reconciliation and notification decisions.
    """
    settings = get_settings()
    if not settings.llm_enabled:
        raise RuntimeError(
            "LLM not configured. Set OPENAI_API_KEY in .env to enable AI agents. "
            "Agents will fall back to rule-based logic until key is provided."
        )
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        raise RuntimeError(
            "langchain-openai is not installed. Run: pip install langchain-openai"
        )
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=temperature,
    )
