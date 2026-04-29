# Setup Conditions Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible 3-column diagnostic table to `scripts/setup-scanner.pine` showing Bounce EMA, Breakout, Volume, and Momentum conditions with an A/B grade for the active EMA direction.

**Architecture:** All changes are confined to `scripts/setup-scanner.pine`. New `var` state variables track bounce pattern type (persistent across bars), breakout timing, and computed grade. A new `if barstate.islast` block at the end of the script populates the table cells using these vars. Grade logic lives inside the existing first `barstate.islast` block, after the trendline checks.

**Tech Stack:** Pine Script v6, TradingView Desktop (CDP port 9222), MCP tools: `pine_set_source`, `pine_smart_compile`, `pine_get_errors`, `pine_save`, `capture_screenshot`

---

## File Map

| File | Change |
|------|--------|
| `scripts/setup-scanner.pine:2` | Add `max_tables_count=1` to `indicator()` |
| `scripts/setup-scanner.pine:135–138` | Add 6 new `var` declarations |
| `scripts/setup-scanner.pine:159–161` | Reset new vars in the barstate.islast reset block |
| `scripts/setup-scanner.pine:~101–108` | Track bounce pattern type per bar |
| `scripts/setup-scanner.pine:~242–246` | Capture `long_breakout_ago` in breakout loop |
| `scripts/setup-scanner.pine:~266–270` | Capture `short_breakout_ago` in breakout loop |
| `scripts/setup-scanner.pine:~270` | Add grade computation section (still inside first barstate.islast) |
| `scripts/setup-scanner.pine:~354` | Add `var table` declaration + new barstate.islast table-rendering block |

---

### Task 1: Update indicator() call and add var declarations

**Files:**
- Modify: `scripts/setup-scanner.pine:2`
- Modify: `scripts/setup-scanner.pine:135–138`

- [ ] **Step 1: Read the current source from the local file**

```bash
head -5 scripts/setup-scanner.pine
```
Confirm line 2 is the `indicator(...)` call.

- [ ] **Step 2: Update indicator() to include max_tables_count**

Change line 2 from:
```pine
indicator("Swing Setup Scanner", overlay=true, max_labels_count=10, max_lines_count=5)
```
To:
```pine
indicator("Swing Setup Scanner", overlay=true, max_labels_count=10, max_lines_count=5, max_tables_count=1)
```

- [ ] **Step 3: Add new var declarations after the existing var block**

After the line `var bool  short_breakout = false` (currently the last `var` declaration, ~line 138), add:

```pine
var string last_bull_pattern  = "—"
var string last_bear_pattern  = "—"
var int    long_breakout_ago  = na
var int    short_breakout_ago = na
var string long_grade         = "—"
var string short_grade        = "—"
```

- [ ] **Step 4: Compile via MCP to confirm no errors**

```
pine_set_source()   // inject updated file content
pine_smart_compile()
pine_get_errors()
```
Expected: empty errors list.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-scanner.pine
git commit -m "feat: add var declarations for table state"
```

---

### Task 2: Reset new vars in the barstate.islast reset block

**Files:**
- Modify: `scripts/setup-scanner.pine:~159–161`

The existing reset block (inside `if barstate.islast`) already resets `long_breakout := false` etc. Add resets for the 4 new non-pattern vars (the pattern vars intentionally persist — they hold the most recent bounce type).

- [ ] **Step 1: Add resets at the bottom of the existing reset section**

After the line `short_breakout  := false`, add:
```pine
    long_breakout_ago  := na
    short_breakout_ago := na
    long_grade         := "—"
    short_grade        := "—"
```

- [ ] **Step 2: Compile and confirm no errors**

```
pine_set_source()
pine_smart_compile()
pine_get_errors()
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-scanner.pine
git commit -m "feat: reset breakout_ago and grade vars each bar"
```

---

### Task 3: Track bounce pattern type per bar

**Files:**
- Modify: `scripts/setup-scanner.pine:~101–108`

`bull_bounce` and `bear_bounce` are computed every bar (outside `barstate.islast`). We capture which candle pattern fired so the table can display "hammer", "engulf", or "star".

- [ ] **Step 1: Add pattern tracking after the existing bounce booleans**

After the existing line:
```pine
bool bear_bounce    = high_near_ema and (is_star or is_bear_engulf)
```

Add:
```pine
if bull_bounce
    last_bull_pattern := is_hammer ? "hammer" : "engulf"
if bear_bounce
    last_bear_pattern := is_star ? "star" : "engulf"
```

- [ ] **Step 2: Compile and confirm no errors**

```
pine_set_source()
pine_smart_compile()
pine_get_errors()
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-scanner.pine
git commit -m "feat: track bounce candle pattern type"
```

---

### Task 4: Capture breakout timing in the breakout loops

**Files:**
- Modify: `scripts/setup-scanner.pine:~242–246` (long breakout loop)
- Modify: `scripts/setup-scanner.pine:~266–270` (short breakout loop)

The `i` value in each loop tells us how many bars ago the breakout occurred (0 = current bar, 1 = 1 bar ago, etc.).

- [ ] **Step 1: Capture i in the long breakout loop**

Change the long breakout loop from:
```pine
        for i = 0 to i_breakout_bars - 1
            float tl_i  = ph1 + long_slope * float(bar_index -     i - ph1b)
            float tl_i1 = ph1 + long_slope * float(bar_index - i - 1 - ph1b)
            if close[i] > tl_i and close[i + 1] <= tl_i1
                long_breakout := true
```
To:
```pine
        for i = 0 to i_breakout_bars - 1
            float tl_i  = ph1 + long_slope * float(bar_index -     i - ph1b)
            float tl_i1 = ph1 + long_slope * float(bar_index - i - 1 - ph1b)
            if close[i] > tl_i and close[i + 1] <= tl_i1
                long_breakout     := true
                long_breakout_ago := i
```

- [ ] **Step 2: Capture i in the short breakout loop**

Change the short breakout loop from:
```pine
        for i = 0 to i_breakout_bars - 1
            float tl_i  = pl1 + short_slope * float(bar_index -     i - pl1b)
            float tl_i1 = pl1 + short_slope * float(bar_index - i - 1 - pl1b)
            if close[i] < tl_i and close[i + 1] >= tl_i1
                short_breakout := true
```
To:
```pine
        for i = 0 to i_breakout_bars - 1
            float tl_i  = pl1 + short_slope * float(bar_index -     i - pl1b)
            float tl_i1 = pl1 + short_slope * float(bar_index - i - 1 - pl1b)
            if close[i] < tl_i and close[i + 1] >= tl_i1
                short_breakout     := true
                short_breakout_ago := i
```

- [ ] **Step 3: Compile and confirm no errors**

```
pine_set_source()
pine_smart_compile()
pine_get_errors()
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-scanner.pine
git commit -m "feat: capture breakout bar index for table detail"
```

---

### Task 5: Compute grade inside the first barstate.islast block

**Files:**
- Modify: `scripts/setup-scanner.pine:~270` — add after the SHORT trendline checks, still inside first `if barstate.islast`

Grade rules:
- **A** = bounce confirmed AND (price within 2% of trendline approaching it, OR broke out and holding within 0.5% of trendline)
- **B** = bounce confirmed but neither approaching nor holding
- **—** = no trendline found OR no bounce confirmed (default from reset)

- [ ] **Step 1: Add grade computation after the SHORT trendline checks block**

After the closing of the short breakout loop (the last line inside `if barstate.islast` before it closes), add:

```pine
    // ── Grade computation ──────────────────────────────────────────────────
    if long_piv_ok
        float tl_now     = ph1 + long_slope * float(bar_index - ph1b)
        bool approaching = tl_now > 0.0 and close < tl_now and (tl_now - close) / tl_now <= 0.02
        bool holding     = long_breakout and tl_now > 0.0 and close >= tl_now * 0.995
        if last_bull_pattern != "—"
            long_grade := (approaching or holding) ? "A" : "B"

    if short_piv_ok
        float tl_now     = pl1 + short_slope * float(bar_index - pl1b)
        bool approaching = tl_now > 0.0 and close > tl_now and (close - tl_now) / tl_now <= 0.02
        bool holding     = short_breakout and tl_now > 0.0 and close <= tl_now * 1.005
        if last_bear_pattern != "—"
            short_grade := (approaching or holding) ? "A" : "B"
```

- [ ] **Step 2: Compile and confirm no errors**

```
pine_set_source()
pine_smart_compile()
pine_get_errors()
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-scanner.pine
git commit -m "feat: compute A/B setup grade from trendline and bounce state"
```

---

### Task 6: Add table declaration and rendering block

**Files:**
- Modify: `scripts/setup-scanner.pine:~354` — add after the existing `plot(ema_plot, ...)` line

- [ ] **Step 1: Add the var table declaration and rendering block at the end of the file**

After the final `plot(ema_plot, "Daily EMA 20", ...)` line, add:

```pine
// ─── SETUP CONDITIONS TABLE ──────────────────────────────────────────────────
var table setup_tbl = table.new(position.top_right, 3, 5,
     bgcolor      = color.new(color.gray, 85),
     border_color = color.new(color.gray, 60),
     border_width = 1,
     frame_color  = color.new(color.gray, 40),
     frame_width  = 1)

if barstate.islast
    bool   is_long  = consec_above >= 1

    // Condition values
    bool   c_bounce = is_long ? (last_bull_pattern != "—") : (last_bear_pattern != "—")
    string d_bounce = is_long ? last_bull_pattern : last_bear_pattern

    bool   c_break  = is_long ? long_breakout : short_breakout
    int    b_ago    = is_long ? long_breakout_ago : short_breakout_ago
    string d_break  = not c_break ? "—" : (na(b_ago) or b_ago == 0) ? "now" : str.tostring(b_ago) + "b"

    int    vol_pct  = math.round((volume / avg_vol - 1) * 100)
    string d_vol    = (vol_pct >= 0 ? "+" : "") + str.tostring(vol_pct) + "%"

    int    body_pct = (high - low) > 0.0 ? math.round(math.abs(close - open) / (high - low) * 100) : 0
    string d_mom    = str.tostring(body_pct) + "%"

    string grade    = is_long ? long_grade : short_grade
    string dir_txt  = is_long ? "▲ LONG" : "▼ SHORT"
    color  hdr_bg   = is_long ? color.new(color.green, 10) : color.new(color.red, 10)
    color  grade_bg = grade == "A" ? color.new(color.green, 10) :
                      grade == "B" ? color.new(color.orange, 10) : hdr_bg
    color  c_met    = color.new(color.green, 20)
    color  c_nmet   = color.new(color.red,   20)
    color  c_det    = color.new(color.gray,  70)

    // Header row
    table.cell(setup_tbl, 0, 0, dir_txt,
         text_color=color.white, bgcolor=hdr_bg, text_size=size.small, text_halign=text.align_left)
    table.cell(setup_tbl, 1, 0, "",
         text_color=color.white, bgcolor=hdr_bg, text_size=size.small)
    table.cell(setup_tbl, 2, 0, grade != "—" ? "[" + grade + "]" : "",
         text_color=color.white, bgcolor=grade_bg, text_size=size.small, text_halign=text.align_right)

    // Row 1 — Bounce EMA
    table.cell(setup_tbl, 0, 1, "Bounce EMA",
         text_color=color.white, bgcolor=c_det, text_size=size.small, text_halign=text.align_left)
    table.cell(setup_tbl, 1, 1, c_bounce ? "✓" : "✗",
         text_color=color.white, bgcolor=c_bounce ? c_met : c_nmet, text_size=size.small)
    table.cell(setup_tbl, 2, 1, d_bounce,
         text_color=color.white, bgcolor=c_det, text_size=size.small)

    // Row 2 — Breakout
    table.cell(setup_tbl, 0, 2, "Breakout",
         text_color=color.white, bgcolor=c_det, text_size=size.small, text_halign=text.align_left)
    table.cell(setup_tbl, 1, 2, c_break ? "✓" : "✗",
         text_color=color.white, bgcolor=c_break ? c_met : c_nmet, text_size=size.small)
    table.cell(setup_tbl, 2, 2, d_break,
         text_color=color.white, bgcolor=c_det, text_size=size.small)

    // Row 3 — Volume
    table.cell(setup_tbl, 0, 3, "Volume",
         text_color=color.white, bgcolor=c_det, text_size=size.small, text_halign=text.align_left)
    table.cell(setup_tbl, 1, 3, vol_spike ? "✓" : "✗",
         text_color=color.white, bgcolor=vol_spike ? c_met : c_nmet, text_size=size.small)
    table.cell(setup_tbl, 2, 3, d_vol,
         text_color=color.white, bgcolor=c_det, text_size=size.small)

    // Row 4 — Momentum
    table.cell(setup_tbl, 0, 4, "Momentum",
         text_color=color.white, bgcolor=c_det, text_size=size.small, text_halign=text.align_left)
    table.cell(setup_tbl, 1, 4, mom_candle ? "✓" : "✗",
         text_color=color.white, bgcolor=mom_candle ? c_met : c_nmet, text_size=size.small)
    table.cell(setup_tbl, 2, 4, d_mom,
         text_color=color.white, bgcolor=c_det, text_size=size.small)
```

- [ ] **Step 2: Compile and confirm no errors**

```
pine_set_source()
pine_smart_compile()
pine_get_errors()
```
Expected: no errors.

- [ ] **Step 3: Save to TradingView cloud**

```
pine_save()
```

- [ ] **Step 4: Take a screenshot to verify the table renders**

```
capture_screenshot("chart")
```
Expected: Table visible in top-right corner with:
- Header row showing "▲ LONG" or "▼ SHORT" + grade badge
- 4 condition rows with ✓/✗ status cells and detail values
- Green cells for met conditions, red for unmet

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-scanner.pine
git commit -m "feat: add always-visible setup conditions table with A/B grade"
```
