from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from app.db import get_db
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, Token, UserProfile, UserPreferencesUpdate, SocialAuthRequest

router = APIRouter()


def _auto_update_streak(user: User, db: Session):
    """Silently update streak when user fetches profile."""
    today = datetime.utcnow().date()
    last_active = user.last_active_date.date() if user.last_active_date else None
    if last_active == today:
        return
    if last_active and (today - last_active).days == 1:
        user.current_streak = (user.current_streak or 0) + 1
    elif not last_active or (today - last_active).days > 1:
        user.current_streak = 1
    if (user.current_streak or 0) > (user.longest_streak or 0):
        user.longest_streak = user.current_streak
    user.last_active_date = datetime.utcnow()
    db.commit()


@router.post("/register", response_model=Token)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        name=user_data.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/social", response_model=Token)
async def social_auth(auth_data: SocialAuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == auth_data.email).first()
    if not user:
        user = User(
            email=auth_data.email,
            name=auth_data.name or auth_data.email.split("@")[0],
            auth_provider=auth_data.provider,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserProfile)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _auto_update_streak(current_user, db)
    return UserProfile(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        auth_provider=current_user.auth_provider,
        dietary_preferences=current_user.dietary_preferences or [],
        flavor_preferences=current_user.flavor_preferences or [],
        allergies=current_user.allergies or [],
        cooking_time_budget=current_user.cooking_time_budget or {},
        household_size=current_user.household_size,
        budget_level=current_user.budget_level,
        xp_points=current_user.xp_points,
        current_streak=current_user.current_streak,
        longest_streak=current_user.longest_streak,
    )


@router.put("/preferences")
async def update_preferences(
    prefs: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update_data = prefs.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_user, key, value)
    db.commit()
    return {"message": "Preferences updated"}
