# WholeFoodLabs

Eat real. Feel amazing. A mobile app that helps busy professionals transform their diet with whole, unprocessed foods.

## Features

1. **Healthify AI Chatbot** - Transform any unhealthy food into a delicious whole-food version with ingredient swaps and complete recipes
2. **Personalized Meal Plans** - Weekly plans based on flavor preferences, dietary needs, and time constraints with bulk-cook, quick, and sit-down meal options
3. **Smart Grocery Lists** - Auto-generated from your meal plan, organized by store section with cost estimates
4. **Cook Mode** - Step-by-step interactive walkthrough with built-in timers and ingredient checklists
5. **Food Database** - Searchable nutrition database powered by USDA FoodData Central
6. **Gamification** - XP, streaks, achievements, and leaderboards to keep you motivated

## Planned Feature: Metabolic Budget (MES)

We are adding a **Metabolic Energy Score (MES)** system to make metabolic health the primary daily metric.

### What MES Optimizes
- **Protein target** (primary driver)
- **Fiber floor**
- **Sugar ceiling**

> Prep time is intentionally **not** part of MES so the app supports quick meals, meal prep, desserts, and sit-down meals equally.

### Product Direction
- **MES is the primary score on Home ("Today")**
- Existing NutriScore remains in Chronometer as a **secondary deep-dive metric**
- Gamification (quests, streaks, achievements, XP) centers on MES and metabolic consistency

### Scoring Philosophy
- Protein is weighted highest and is the main lever for a high MES
- Fiber and sugar complete the score for stability and crash prevention
- Users should not be able to score highly without hitting protein goals

### Meal Plan + Data Quality
- Meal plan generation behavior stays the same
- We add a **projected MES** for generated plans
- Recipe import pipeline includes an **MES gate** so the database only contains metabolically healthy meals

### Rollout (High Level)
1. Core MES models + scoring engine + API
2. Home/Chronometer UI integration + recipe-level MES visibility
3. Full gamification integration + projected MES in meal plans

## Tech Stack

### Frontend
- React Native + Expo (managed workflow)
- Expo Router (file-based navigation)
- Zustand (state management)
- expo-linear-gradient (UI polish)

### Backend
- FastAPI (Python)
- LangGraph + LangChain (AI agent workflows)
- SQLAlchemy + Alembic (ORM + migrations)
- PostgreSQL (database)

### AI
- Configurable: OpenAI GPT-4o or Anthropic Claude
- LangGraph agents for healthify chatbot and meal plan generation

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 15+

### Frontend Setup

```bash
cd frontend
npm install
npx expo start
```

**Note**: For social authentication (Google/Apple), see [OAUTH_SETUP.md](OAUTH_SETUP.md) for configuration instructions.

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys and database URL
```

Create the database:
```bash
createdb wholefoodlabs
alembic upgrade head
```

Run the server:
```bash
uvicorn app.main:app --reload
```

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key |
| `OPENAI_API_KEY` | OpenAI API key (if using GPT) |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Claude) |
| `LLM_PROVIDER` | `openai` or `anthropic` |
| `USDA_API_KEY` | USDA FoodData Central API key |

## Project Structure

```
wholefoodlabs/
├── frontend/               # React Native + Expo
│   ├── app/                # Expo Router screens
│   │   ├── (auth)/         # Login/register
│   │   ├── (tabs)/         # Main tab screens
│   │   ├── cook/           # Cook mode
│   │   └── food/           # Food database
│   ├── components/         # Reusable UI components
│   ├── stores/             # Zustand state
│   ├── services/           # API client
│   └── constants/          # Theme, config
├── backend/
│   ├── app/
│   │   ├── routers/        # API endpoints
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── agents/         # LangGraph AI agents
│   │   └── services/       # Business logic
│   └── alembic/            # Database migrations
└── README.md
```
