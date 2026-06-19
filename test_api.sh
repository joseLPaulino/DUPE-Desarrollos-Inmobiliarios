#!/usr/bin/env bash
# DUPE Platform — manual API test script
# Run from the project root: bash test_api.sh

BASE="http://localhost:8000/api/v1"
PASS=0; FAIL=0

green='\033[0;32m'; red='\033[0;31m'; yellow='\033[1;33m'; nc='\033[0m'

ok()   { echo -e "${green}  ✓ PASS${nc} — $1"; ((PASS++)); }
fail() { echo -e "${red}  ✗ FAIL${nc} — $1"; ((FAIL++)); }
hdr()  { echo -e "\n${yellow}▶ $1${nc}"; }

check() {
  local label="$1"; local expected="$2"; local actual="$3"
  if echo "$actual" | grep -q "$expected"; then ok "$label"; else fail "$label — got: $actual"; fi
}

# ── 1. Projects ───────────────────────────────────────────────────────────────
hdr "1. Projects"
PROJECTS=$(curl -s "$BASE/projects/")
check "GET /projects/ returns array"        '"id"'         "$PROJECTS"
check "Projects have currency field"        '"currency"'   "$PROJECTS"

PROJECT_ID=$(echo "$PROJECTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'])" 2>/dev/null)
echo "   project_id = $PROJECT_ID"

SOCIAL_ID=$(echo "$PROJECTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next(p['id'] for p in d if p.get('project_type')=='social'))" 2>/dev/null)
echo "   social_id  = $SOCIAL_ID"

# ── 2. Dashboard ──────────────────────────────────────────────────────────────
hdr "2. Dashboard"
DASH=$(curl -s "$BASE/dashboard/$PROJECT_ID")
check "GET /dashboard/{id} returns KPIs"         '"total_budget"'      "$DASH"
check "Dashboard has partidas"                   '"partidas"'          "$DASH"
check "Dashboard has collection_summary"         '"collection_summary"' "$DASH"

# ── 3. Cash Flow ──────────────────────────────────────────────────────────────
hdr "3. Cash Flow"
CF=$(curl -s "$BASE/cash-flow/$SOCIAL_ID")
CF_COUNT=$(echo "$CF" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "GET /cash-flow/{id} returns months"  '"month"'      "$CF"
check "Cash flow has is_actual field"       '"is_actual"'  "$CF"
check "Cash flow has cumulative_balance"    '"cumulative_balance"' "$CF"
echo "   months loaded = $CF_COUNT"

ACTUAL_COUNT=$(echo "$CF" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(1 for m in d if m['is_actual']))" 2>/dev/null)
echo "   actual months = $ACTUAL_COUNT"

# ── 4. AI Predictions ─────────────────────────────────────────────────────────
hdr "4. AI Predictions"
PRED=$(curl -s "$BASE/predictions/$SOCIAL_ID")
check "GET /predictions/{id} returns forecast"          '"cash_flow_forecast"'     "$PRED"
check "Predictions has budget_risk"                     '"budget_risk"'            "$PRED"
check "Predictions has delinquency_risks"               '"delinquency_risks"'      "$PRED"
check "Predictions has completion_prediction"           '"completion_prediction"'  "$PRED"
RISK=$(echo "$PRED" | python3 -c "import sys,json; print(json.load(sys.stdin)['budget_risk']['risk_level'])" 2>/dev/null)
echo "   budget risk level = $RISK"

# ── 5. Payment Plans ──────────────────────────────────────────────────────────
hdr "5. Payment Plans"
PLANS=$(curl -s "$BASE/payment-plans/project/$SOCIAL_ID")
check "GET /payment-plans/project/{id} returns plans" '"id"' "$PLANS"
PLAN_COUNT=$(echo "$PLANS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "   plans found = $PLAN_COUNT"

# Grab first installment ID from overdue list
OVERDUE=$(curl -s "$BASE/payment-plans/overdue")
INST_ID=$(echo "$OVERDUE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
echo "   overdue installments = $(echo "$OVERDUE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)"

# ── 6. Register Payment ───────────────────────────────────────────────────────
hdr "6. Register Payment (PATCH /payment-plans/installment/{id}/pay)"
if [ -n "$INST_ID" ]; then
  PAY=$(curl -s -X PATCH "$BASE/payment-plans/installment/$INST_ID/pay" \
    -H "Content-Type: application/json" \
    -d '{"paid_amount": 50000, "paid_date": "2026-06-18", "notes": "Test payment via script"}')
  check "Payment registered successfully"   '"status": "paid"'    "$PAY"
  check "Payment returns plan_total_paid"   '"plan_total_paid"'   "$PAY"
  echo "   response: $PAY"

  # Try paying same installment again → should get 409
  PAY2=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/payment-plans/installment/$INST_ID/pay" \
    -H "Content-Type: application/json" \
    -d '{"paid_amount": 50000, "paid_date": "2026-06-18"}')
  if [ "$PAY2" = "409" ]; then ok "Duplicate payment returns 409"; else fail "Expected 409 for duplicate, got $PAY2"; fi
else
  echo -e "   ${yellow}⚠ No overdue installments — skipping payment test${nc}"
fi

# ── 7. Manual Transaction ────────────────────────────────────────────────────
hdr "7. Manual Transaction (POST /reconciliation/transaction/{id})"
TX=$(curl -s -X POST "$BASE/reconciliation/transaction/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Cobro inicial Bloque A - test",
    "amount": 250000,
    "transaction_date": "2026-06-18",
    "reference": "REF-TEST-001"
  }')
check "Transaction created (no partida)"    '"transaction_id"' "$TX"
check "Transaction status is unmatched"     '"unmatched"'      "$TX"
echo "   response: $TX"

# ── 8. Manual Transaction with Partida ──────────────────────────────────────
hdr "8. Manual Transaction + Partida match"
# Get a valid partida code from dashboard
PARTIDA_CODE=$(curl -s "$BASE/dashboard/$PROJECT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
partidas=d.get('partidas',[])
if partidas: print(partidas[0]['code'])
" 2>/dev/null)
echo "   using partida_code = $PARTIDA_CODE"

if [ -n "$PARTIDA_CODE" ]; then
  TX2=$(curl -s -X POST "$BASE/reconciliation/transaction/$PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d "{
      \"description\": \"Pago contratista construccion - test\",
      \"amount\": -180000,
      \"transaction_date\": \"2026-06-18\",
      \"partida_code\": \"$PARTIDA_CODE\",
      \"reference\": \"FACT-2026-100\"
    }")
  check "Transaction+partida created"       '"transaction_id"' "$TX2"
  check "Transaction status is matched"     '"matched"'        "$TX2"
  check "execution_id is returned"          '"execution_id"'   "$TX2"
  echo "   response: $TX2"
else
  echo -e "   ${yellow}⚠ No partida found — skipping matched transaction test${nc}"
fi

# ── 9. Budget Execution ───────────────────────────────────────────────────────
hdr "9. Budget Execution (POST /reconciliation/execution)"
if [ -n "$PARTIDA_CODE" ]; then
  EXEC=$(curl -s -X POST "$BASE/reconciliation/execution" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"$PROJECT_ID\",
      \"partida_code\": \"$PARTIDA_CODE\",
      \"amount\": 50000,
      \"description\": \"Factura materiales construccion - test\",
      \"entered_by\": \"jose.paulino\"
    }")
  check "Execution created"                 '"execution_id"'    "$EXEC"
  check "Returns execution_pct"             '"execution_pct"'   "$EXEC"
  check "Returns budgeted_amount"           '"budgeted_amount"' "$EXEC"
  PCT=$(echo "$EXEC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('execution_pct','?'))" 2>/dev/null)
  echo "   execution % = $PCT"
  echo "   response: $EXEC"

  # Test 110% guard — try to exceed budget
  hdr "9b. Budget Guard (110% limit)"
  BUDGET_AMT=$(echo "$EXEC" | python3 -c "import sys,json; print(json.load(sys.stdin).get('budgeted_amount',0))" 2>/dev/null)
  GUARD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/reconciliation/execution" \
    -H "Content-Type: application/json" \
    -d "{
      \"project_id\": \"$PROJECT_ID\",
      \"partida_code\": \"$PARTIDA_CODE\",
      \"amount\": $BUDGET_AMT,
      \"description\": \"Oversized amount to trigger guard\",
      \"entered_by\": \"test\"
    }")
  if [ "$GUARD" = "422" ]; then ok "110% guard returns 422"; else fail "Expected 422 for overrun, got $GUARD"; fi
else
  echo -e "   ${yellow}⚠ No partida found — skipping execution test${nc}"
fi

# ── 10. Notifications ─────────────────────────────────────────────────────────
hdr "10. Notifications dispatch"
NOTIF=$(curl -s -X POST "$BASE/notifications/dispatch")
check "Dispatch returns sent count"   '"sent"'    "$NOTIF"
check "Dispatch returns skipped"      '"skipped"' "$NOTIF"
echo "   response: $NOTIF"

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Results: ${green}${PASS} passed${nc}  ${red}${FAIL} failed${nc}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ $FAIL -eq 0 ] && echo -e "${green}  All tests passed ✓${nc}" || echo -e "${red}  Some tests failed — check output above${nc}"
