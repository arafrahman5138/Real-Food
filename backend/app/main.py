from collections import defaultdict, deque
from contextlib import asynccontextmanager
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import auth, chat, meal_plan, grocery, recipes, food_db, gamification, nutrition, metabolic, whole_food_scan
from app.db import init_db

# Import all models so they register with Base.metadata
from app.models import user, meal_plan as mp_model, recipe, grocery as g_model, gamification as gm_model  # noqa: F401
from app.models import saved_recipe as sr_model, nutrition as nt_model, local_food as lf_model  # noqa: F401
from app.models import metabolic as met_model, metabolic_profile as met_profile_model  # noqa: F401

settings = get_settings()
DEFAULT_DEV_SECRET = "dev-secret-key-change-in-production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_security_settings()
    init_db()
    _seed_on_startup()
    yield


def _validate_security_settings() -> None:
    env = (settings.environment or "development").lower()
    # Block unsafe secret configuration outside development.
    if env not in {"dev", "development"}:
        if settings.secret_key == DEFAULT_DEV_SECRET or len(settings.secret_key or "") < 32:
            raise RuntimeError("Unsafe JWT secret_key for non-development environment. Set a strong SECRET_KEY in env.")


def _parse_cors_origins(raw: str) -> list[str]:
    return [o.strip() for o in (raw or "").split(",") if o.strip()]


def _seed_on_startup():
    """Populate achievements on startup. Recipe seeding is disabled — run seed_db.py manually."""
    import logging
    log = logging.getLogger(__name__)
    # Recipe seeding disabled — old meals backed up in seed_meals_backup.json.
    # To re-seed old meals: python seed_db.py
    # To restore from backup: python restore_meals.py
    try:
        from app.achievements_engine import seed_achievements
        from app.db import SessionLocal
        db = SessionLocal()
        try:
            seed_achievements(db)
        finally:
            db.close()
    except Exception as exc:
        log.warning("Achievement seeding skipped: %s", exc)


app = FastAPI(
    title="WholeFoodLabs API",
    description="Backend API for WholeFoodLabs - eat real, whole foods",
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = _parse_cors_origins(settings.cors_allowed_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Lightweight in-process rate limiter (IP + path window)
_rate_buckets: dict[tuple[str, str], deque] = defaultdict(deque)
WINDOW_SECONDS = 60


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path or ""
    # Only protect API routes.
    if not path.startswith("/api/"):
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    key = (client_ip, path)
    now = time.time()

    # Stricter budget for auth endpoints.
    auth_sensitive = (
        path.startswith("/api/auth/login")
        or path.startswith("/api/auth/register")
        or path.startswith("/api/auth/refresh")
        or path.startswith("/api/auth/social")
    )
    limit = settings.auth_rate_limit_per_minute if auth_sensitive else settings.rate_limit_per_minute

    q = _rate_buckets[key]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()

    if len(q) >= limit:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again shortly."},
        )

    q.append(now)
    return await call_next(request)


app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(chat.router, prefix="/api/chat", tags=["Healthify Chatbot"])
app.include_router(meal_plan.router, prefix="/api/meal-plans", tags=["Meal Plans"])
app.include_router(grocery.router, prefix="/api/grocery", tags=["Grocery Lists"])
app.include_router(recipes.router, prefix="/api/recipes", tags=["Recipes"])
app.include_router(food_db.router, prefix="/api/foods", tags=["Food Database"])
app.include_router(whole_food_scan.router, prefix="/api/whole-food-scan", tags=["Whole Food Scan"])
app.include_router(gamification.router, prefix="/api/game", tags=["Gamification"])
app.include_router(nutrition.router, prefix="/api/nutrition", tags=["Chronometer"])
app.include_router(metabolic.router, prefix="/api/metabolic", tags=["Metabolic Budget"])


@app.get("/")
async def root():
    return {"message": "Welcome to WholeFoodLabs API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
