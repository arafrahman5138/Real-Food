#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
EMAIL="smoke_$(date +%s)@example.com"
PASSWORD="TestPass123!"
NAME="Smoke Tester"
CURL="curl -sS --max-time 60"

echo "[1/7] Health check"
$CURL "$BASE_URL/health"
echo ""

echo "[2/7] Register"
REGISTER_RESPONSE=$($CURL -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"$NAME\"}")
echo "$REGISTER_RESPONSE"

TOKEN=$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.access_token || '')" "$REGISTER_RESPONSE")

if [ -z "$TOKEN" ]; then
  echo "[2/7] Register failed, trying login"
  LOGIN_RESPONSE=$($CURL -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  echo "$LOGIN_RESPONSE"
  TOKEN=$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.access_token || '')" "$LOGIN_RESPONSE")
fi

if [ -z "$TOKEN" ]; then
  echo "Failed to obtain access token"
  exit 1
fi

echo "[3/7] Update preferences"
PREFS_RESPONSE=$($CURL -X PUT "$BASE_URL/api/auth/preferences" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dietary_preferences": ["whole_food"],
    "flavor_preferences": ["savory"],
    "allergies": ["peanut"],
    "liked_ingredients": ["garlic", "lemon"],
    "disliked_ingredients": ["mushroom"],
    "protein_preferences": {"liked": ["chicken"], "disliked": ["pork"]},
    "cooking_time_budget": {"quick": 4, "medium": 2, "long": 1},
    "household_size": 2,
    "budget_level": "medium"
  }')
echo "$PREFS_RESPONSE"

echo "[4/7] Generate personalized meal plan"
PLAN_RESPONSE=$($CURL -X POST "$BASE_URL/api/meal-plans/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apply_substitutions": true
  }')
echo "$PLAN_RESPONSE" | head -c 300
echo ""

RECIPE_ID=$(node -e "const r=JSON.parse(process.argv[1]); const item=(r.items||[])[0]; const id=item?.recipe_data?.id || ''; console.log(id);" "$PLAN_RESPONSE")
if [ -z "$RECIPE_ID" ]; then
  echo "No recipe id found in meal plan response"
  exit 1
fi
echo "First recipe id: $RECIPE_ID"

echo "[5/7] Fetch recipe"
RECIPE_RESPONSE=$($CURL -X GET "$BASE_URL/api/recipes/$RECIPE_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$RECIPE_RESPONSE" | head -c 300
echo ""

echo "[6/7] Customize ingredients"
SUB_RESPONSE=$($CURL -X POST "$BASE_URL/api/recipes/$RECIPE_ID/substitute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "use_allergies": true,
    "use_dislikes": true,
    "custom_excludes": ["cilantro"]
  }')
echo "$SUB_RESPONSE" | head -c 300
echo ""

echo "[7/7] Get current meal plan"
CURRENT_RESPONSE=$($CURL -X GET "$BASE_URL/api/meal-plans/current" \
  -H "Authorization: Bearer $TOKEN")
echo "$CURRENT_RESPONSE" | head -c 300
echo ""

echo "Smoke test complete."
