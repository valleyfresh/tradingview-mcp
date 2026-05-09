# Pine TDD Skill

Autonomous Pine Script verification loop. Runs visual regression tests against the live TradingView chart, analyzes failures in the Pine Script, applies a fix, recompiles, and iterates until all tests pass or 10 iterations are exhausted.

---

## When to use

Invoke this skill when:
- A Pine Script bug has been identified and needs autonomous fix-verify cycling
- A new assertion has been added to `tests/pine-visual/cases/` and you want to confirm it passes
- You want to regress-test the Swing Setup Scanner after any edit

---

## Protocol

### Step 1 — Initialise

```bash
# Read current iteration (0 if first run)
COUNT=$(cat tests/pine-visual/.tdd-active 2>/dev/null || echo 0)
echo $COUNT > tests/pine-visual/.tdd-active
```

Log: `[Pine TDD] Starting iteration $COUNT`

### Step 2 — Load indicator

Ensure "Swing Setup Scanner" is compiled and visible:
- Call `pine_open` with name "Swing Setup Scanner" if not already loaded
- If chart state shows it loaded, skip

### Step 3 — Run each test case

For every `.json` file in `tests/pine-visual/cases/`:

```
a. chart_set_symbol(ticker) + chart_set_timeframe(timeframe)
b. Wait ~3 seconds for indicator to render (use capture_screenshot as a sync point)
c. data_get_pine_labels(study_filter="Swing Setup Scanner")     → labels[]
d. data_get_pine_boxes(study_filter="Swing Setup Scanner")      → boxes[]
e. data_get_study_values()                                       → ema value (label "Daily EMA 20")
f. capture_screenshot(region="chart")                           → screenshot path
g. Build data JSON:
     { "labels": [...raw label strings...], "boxes": [...], "ema": <float> }
h. Run: node tests/pine-visual/evaluate.js --case <id> --data '<json>'
i. Parse output JSON — collect pass/fail/visual_pending per assertion
j. For visual assertions: Read the screenshot file and evaluate the description text
```

### Step 4 — Assess overall result

Collect all results. An overall PASS requires every assertion to pass (or be vacuously skipped).

**If all pass:**
```bash
rm -f tests/pine-visual/.tdd-active
```
Log: `[Pine TDD] ✓ All tests passing after $COUNT iteration(s). Done.`
STOP — do not continue.

**If any fail:** proceed to Step 5.

### Step 5 — Diagnose failure

1. Read `scripts/setup-scanner.pine` using the **Read tool** (NOT `pine_get_source` — too large)
2. Cross-reference with the logic gate map in `skills/setup-scanner-qa/SKILL.md`
3. Identify the ONE root cause. Common patterns:
   - `bounce_box_near_ema` fails → look at bounce scan logic (LONG: lines ~297–315, SHORT: ~317–334)
   - `has_bounce_box` fails → `long_bounce_ok` gate not reached
   - `label_field` fails → grade computation or signal gate issue
   - Visual: trendline wrong color → check color assignment vs breakout/span state

### Step 6 — Apply ONE fix

- Propose a single, targeted change to `scripts/setup-scanner.pine`
- Apply via the **Edit tool** (write the file locally)
- Then: `pine_set_source` with the full updated file content
- Then: `pine_smart_compile`
- Then: `pine_get_errors` — if compile errors, fix them before proceeding

### Step 7 — Check iteration cap

```bash
COUNT=$((COUNT + 1))
echo $COUNT > tests/pine-visual/.tdd-active
```

- If `COUNT >= 10`: 
  ```bash
  rm -f tests/pine-visual/.tdd-active
  ```
  Log: `[Pine TDD] ✗ Stopped after 10 iterations. Manual review needed.`
  Print a summary of all remaining failures.
  STOP.
- Else: go back to Step 3.

---

## Bounce-box bug reference

The known asymmetry in `setup-scanner.pine`:

**LONG bounce (buggy — no EMA proximity):**
```pine
for i = 0 to pl_cnt - 1
    int   pb = array.get(pl_bars_a, i)
    float pp = array.get(pl_prices, i)
    if pb >= ph2b and pb <= bo_bar_l
        int op = bar_index - pb
        if na(best_low) or pp < best_low   // picks deepest low regardless of EMA distance
            best_low        := pp
            long_bounce_bar := pb
```

**Fix (mirror SHORT logic):**
```pine
        int   op     = bar_index - pb
        float ema_pb = ema_val[op]
        if pp >= ema_pb * (1.0 - bounce_pct) and pp <= ema_pb * (1.0 + bounce_pct * 2)
            if na(best_low) or pp < best_low
                best_low        := pp
                long_bounce_bar := pb
```

---

## Notes

- Always read `GOTCHAS.md` before editing Pine Script
- Pine Script is version 6 — no semicolons as statement separators
- `pine_set_source` requires the **full** file content, not a diff
- After fixing, save to cloud: `pine_save` (optional but recommended)
- If `long_bounce_ok` goes false after the EMA proximity fix, it means no EMA-proximate pivot exists in the span — the overall setup will correctly be suppressed until a valid bounce occurs
