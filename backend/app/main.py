from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, chat, meal_plan, grocery, recipes, food_db, gamification, nutrition
from app.db import init_db

# Import all models so they register with Base.metadata
from app.models import user, meal_plan as mp_model, recipe, grocery as g_model, gamification as gm_model  # noqa: F401
from app.models import saved_recipe as sr_model, nutrition as nt_model, local_food as lf_model  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _seed_on_startup()
    yield


def _seed_on_startup():
    """Populate recipes and achievements on startup."""
    import logging
    log = logging.getLogger(__name__)
    try:
        from seed_db import seed_recipes
        seed_recipes()
    except Exception as exc:
        log.warning("Recipe seeding skipped: %s", exc)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(chat.router, prefix="/api/chat", tags=["Healthify Chatbot"])
app.include_router(meal_plan.router, prefix="/api/meal-plans", tags=["Meal Plans"])
app.include_router(grocery.router, prefix="/api/grocery", tags=["Grocery Lists"])
app.include_router(recipes.router, prefix="/api/recipes", tags=["Recipes"])
app.include_router(food_db.router, prefix="/api/foods", tags=["Food Database"])
app.include_router(gamification.router, prefix="/api/game", tags=["Gamification"])
app.include_router(nutrition.router, prefix="/api/nutrition", tags=["Chronometer"])


@app.get("/")
async def root():
    return {"message": "Welcome to WholeFoodLabs API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
