from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json
import logging
from google.api_core.exceptions import ResourceExhausted
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.meal_plan import ChatSession
from app.schemas.chat import ChatRequest, ChatResponse, ChatSessionSummary
from app.agents.healthify import healthify_agent
from typing import List

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/healthify", response_model=ChatResponse)
async def healthify_food(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id,
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
    else:
        session = ChatSession(user_id=current_user.id, title=request.message[:50])
        db.add(session)
        db.commit()
        db.refresh(session)

    messages = session.messages or []
    messages.append({"role": "user", "content": request.message})

    try:
        result = await healthify_agent(request.message, messages[:-1])
    except ResourceExhausted:
        raise HTTPException(
            status_code=429,
            detail="AI quota exceeded for the configured model. Please add billing, switch provider, or try again later.",
        )
    except Exception as exc:
        logger.exception("Healthify request failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Healthify AI is temporarily unavailable. Please try again shortly.",
        )

    assistant_message = {
        "role": "assistant",
        "content": result["message"],
    }
    messages.append(assistant_message)
    session.messages = messages
    db.commit()

    return ChatResponse(
        session_id=str(session.id),
        message=assistant_message,
        healthified_recipe=result.get("recipe"),
        ingredient_swaps=result.get("swaps"),
        nutrition_comparison=result.get("nutrition"),
    )


@router.post("/healthify/stream")
async def healthify_food_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id,
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
    else:
        session = ChatSession(user_id=current_user.id, title=request.message[:50])
        db.add(session)
        db.commit()
        db.refresh(session)

    messages = session.messages or []
    messages.append({"role": "user", "content": request.message})

    async def generate():
        full_response = ""
        try:
            async for chunk in healthify_agent(request.message, messages[:-1], stream=True):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"
        except ResourceExhausted:
            yield f"data: {json.dumps({'error': 'AI quota exceeded for the configured model. Please try again later.', 'done': True})}\n\n"
            return
        except Exception as exc:
            logger.exception("Healthify stream failed: %s", exc)
            yield f"data: {json.dumps({'error': 'Healthify AI is temporarily unavailable.', 'done': True})}\n\n"
            return

        messages.append({"role": "assistant", "content": full_response})
        session.messages = messages
        db.commit()
        yield f"data: {json.dumps({'done': True, 'session_id': str(session.id)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/sessions", response_model=List[ChatSessionSummary])
async def get_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.updated_at.desc()).all()

    return [
        ChatSessionSummary(
            id=str(s.id),
            title=s.title,
            created_at=s.created_at.isoformat(),
            message_count=len(s.messages or []),
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}
