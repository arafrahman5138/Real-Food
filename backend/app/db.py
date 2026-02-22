import uuid
from sqlalchemy import create_engine, String, TypeDecorator
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import get_settings

settings = get_settings()

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class GUID(TypeDecorator):
    """Platform-independent UUID type.
    Uses String(36) for SQLite, native UUID for PostgreSQL.
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return str(value)
        return value


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Call this on startup for SQLite dev environments."""
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()


def _migrate_add_columns():
    """Add any missing columns to existing tables (lightweight dev migration)."""
    if not settings.database_url.startswith("sqlite"):
        return
    import sqlite3
    db_path = settings.database_url.replace("sqlite:///", "")
    try:
        conn = sqlite3.connect(db_path)
        cols = [row[1] for row in conn.execute("PRAGMA table_info(recipes)").fetchall()]
        if "cuisine" not in cols:
            conn.execute('ALTER TABLE recipes ADD COLUMN cuisine TEXT DEFAULT "american"')
        if "health_benefits" not in cols:
            conn.execute('ALTER TABLE recipes ADD COLUMN health_benefits TEXT DEFAULT "[]"')
        conn.commit()
        conn.close()
    except Exception:
        pass

    try:
        conn = sqlite3.connect(db_path)
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "saved_recipes" not in tables:
            conn.execute("""
                CREATE TABLE saved_recipes (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
                    recipe_id VARCHAR(36) NOT NULL REFERENCES recipes(id),
                    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX ix_saved_recipes_user_id ON saved_recipes(user_id)")
            conn.commit()
        conn.close()
    except Exception:
        pass
