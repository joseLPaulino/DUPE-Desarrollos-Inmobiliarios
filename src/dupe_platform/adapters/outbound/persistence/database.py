"""SQLAlchemy async engine and session factory."""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from dupe_platform.infrastructure.config import get_settings


class Base(DeclarativeBase):
    pass


def build_engine(database_url: str | None = None):
    url = database_url or get_settings().database_url
    return create_async_engine(url, echo=get_settings().debug, pool_pre_ping=True)


_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = build_engine()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), expire_on_commit=False, class_=AsyncSession
        )
    return _session_factory


async def get_db() -> AsyncSession:
    async with get_session_factory()() as session:
        yield session
