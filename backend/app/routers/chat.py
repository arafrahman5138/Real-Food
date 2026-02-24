from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json
import logging
import time
import uuid
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


def _message_preview(message: str, limit: int = 120) -> str:
    compact = " ".join((message or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit]}…"


@router.post("/healthify", response_model=ChatResponse)
async def healthify_food(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    request_id = str(uuid.uuid4())
    started_at = time.perf_counter()

    logger.info(
        "healthify.request.received request_id=%s user_id=%s session_id=%s chars=%s preview=%r",
        request_id,
        current_user.id,
        request.session_id or "new",
        len(request.message or ""),
        _message_preview(request.message),
    )

    if request.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id,
        ).first()
        if not session:
            logger.warning(
                "healthify.request.session_not_found request_id=%s user_id=%s session_id=%s",
                request_id,
                current_user.id,
                request.session_id,
            )
            raise HTTPException(status_code=404, detail="Chat session not found")
    else:
        session = ChatSession(user_id=current_user.id, title=request.message[:50])
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info(
            "healthify.request.session_created request_id=%s user_id=%s session_id=%s",
            request_id,
            current_user.id,
            session.id,
        )

    messages = session.messages or []
    messages.append({"role": "user", "content": request.message})

    try:
        result = await healthify_agent(request.message, messages[:-1])
    except ResourceExhausted:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.warning(
            "healthify.request.quota_exceeded request_id=%s user_id=%s session_id=%s elapsed_ms=%s",
            request_id,
            current_user.id,
            session.id,
            elapsed_ms,
        )
        raise HTTPException(
            status_code=429,
            detail="AI quota exceeded for the configured model. Please add billing, switch provider, or try again later.",
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.exception(
            "healthify.request.failed request_id=%s user_id=%s session_id=%s elapsed_ms=%s error=%s",
            request_id,
            current_user.id,
            session.id,
            elapsed_ms,
            exc,
        )
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

    elapsed_ms = int((time.perf_counter() - started_at) * 1000)
    logger.info(
        "healthify.request.completed request_id=%s user_id=%s session_id=%s elapsed_ms=%s has_recipe=%s swaps=%s has_nutrition=%s",
        request_id,
        current_user.id,
        session.id,
        elapsed_ms,
        bool(result.get("recipe")),
        len(result.get("swaps") or []),
        bool(result.get("nutrition")),
    )

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
    request_id = str(uuid.uuid4())
    started_at = time.perf_counter()

    logger.info(
        "healthify.stream.received request_id=%s user_id=%s session_id=%s chars=%s preview=%r",
        request_id,
        current_user.id,
        request.session_id or "new",
        len(request.message or ""),
        _message_preview(request.message),
    )

    if request.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id,
        ).first()
        if not session:
            logger.warning(
                "healthify.stream.session_not_found request_id=%s user_id=%s session_id=%s",
                request_id,
                current_user.id,
                request.session_id,
            )
            raise HTTPException(status_code=404, detail="Chat session not found")
    else:
        session = ChatSession(user_id=current_user.id, title=request.message[:50])
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info(
            "healthify.stream.session_created request_id=%s user_id=%s session_id=%s",
            request_id,
            current_user.id,
            session.id,
        )

    messages = session.messages or []
    messages.append({"role": "user", "content": request.message})

    async def generate():
        full_response = ""
        chunk_count = 0
        try:
            async for chunk in healthify_agent(request.message, messages[:-1], stream=True):
                full_response += chunk
                chunk_count += 1
                yield f"data: {json.dumps({'content': chunk})}\n\n"
        except ResourceExhausted:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.warning(
                "healthify.stream.quota_exceeded request_id=%s user_id=%s session_id=%s elapsed_ms=%s chunks=%s",
                request_id,
                current_user.id,
                session.id,
                elapsed_ms,
                chunk_count,
            )
            yield f"data: {json.dumps({'error': 'AI quota exceeded for the configured model. Please try again later.', 'done': True})}\n\n"
            return
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.exception(
                "healthify.stream.failed request_id=%s user_id=%s session_id=%s elapsed_ms=%s chunks=%s error=%s",
                request_id,
                current_user.id,
                session.id,
                elapsed_ms,
                chunk_count,
                exc,
            )
            yield f"data: {json.dumps({'error': 'Healthify AI is temporarily unavailable.', 'done': True})}\n\n"
            return

        messages.append({"role": "assistant", "content": full_response})
        session.messages = messages
        db.commit()

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info(
            "healthify.stream.completed request_id=%s user_id=%s session_id=%s elapsed_ms=%s chunks=%s response_chars=%s",
            request_id,
            current_user.id,
            session.id,
            elapsed_ms,
            chunk_count,
            len(full_response),
        )
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


@router.get("/sessions/{session_id}")
async def get_session(
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
    return {
        "id": str(session.id),
        "title": session.title,
        "messages": session.messages or [],
        "created_at": session.created_at.isoformat(),
    }
