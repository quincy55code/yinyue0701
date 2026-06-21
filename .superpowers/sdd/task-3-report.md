# Task 3 Report: Song Card and Button Styles

**Status:** Completed

**Commit:** `2d25a32` — feat: add dark theme song cards and button styles

**File modified:**
- `css/style.css`

### Step 1: Song Card Styles
- Replaced `--bg-card` with `--bg-surface`
- Replaced hardcoded `gap: 14px` / `padding: 14px 16px` with `var(--space-md)` / `var(--space-md) 16px`
- New transition using `var(--duration-fast)` + `var(--ease-spring)`/`var(--ease-out)` (was `var(--transition)`)
- Changed border from `2px solid transparent` to `1px solid transparent`
- Added `animation: cardEnter var(--duration-slow) var(--ease-out) both` to `.song-card`
- Hover: added `scale(1.01)` and `border-color: var(--border-card)` with dark shadow `0 8px 32px rgba(0,0,0,0.4)`
- Active: added `scale(0.99)`
- Playing: changed from `breathe` to `glowPulse`, border color to `rgba(165, 160, 240, 0.25)`
- Removed old `@keyframes breathe`

### `.card-index`:
- `--bg-primary` → `--bg-hover`
- Font size `14px` → `12px`, weight `600` → `500`
- Transition uses new duration/easing variables

### `.card-title`:
- Added `line-height: 1.3`

### `.card-meta`:
- `--text-muted` → `--text-secondary`

### `.card-actions`:
- `gap: 6px` → `gap: 4px`

### Step 2: Button Styles
- `.btn-fav`: `--text-muted` → `--text-tertiary`, new transition variables, hover `scale(1.18)`, added `:active` state, favorited color `#e74c3c` → `#f87171`, animation timing updated
- `.btn-add`: `--text-muted` → `--text-tertiary`, new transition variables, hover `scale(1.15)` → `scale(1.18)`

### Step 3: Animation Keyframes
- Added `@keyframes cardEnter` (stagger entrance)
- Added `@keyframes glowPulse` (replaces `breathe`, uses accent purple glow)
- Added `@keyframes heartPop` (consolidated from inline position)

### Self-review
- Dead variable names (`--bg-card`, `--bg-primary`, `--text-muted`, `--accent-light`, `--transition`, `--font-stack`, `--border`) are **not used** in the replaced blocks.
- All CSS variables referenced exist in the `:root` block (Tasks 1-2).
- Transition and animation timings use the new design system variables.
