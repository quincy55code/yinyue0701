# Task 6 Report — Rewrite player bar CSS for dark theme single-row layout

## Summary
Rewrote the player bar CSS in `css/style.css` from a two-row layout (progress row + controls row) to a single flex row with: player-info | controls | progress-row, all in one line.

## Changes Made

### `css/style.css`
- **`.player-bar`** — Changed from `flex-direction: column` to `flex-direction: row`, updated background to `rgba(20, 20, 22, 0.82)` with `blur(24px) saturate(1.2)`, replaced old warm-theme border/shadow with dark theme `var(--border-subtle)`, used `var(--space-*)` tokens for padding/gap
- **`.player-info`** — Removed `position: absolute; left: 24px; bottom: 28px;`, now a normal flex child with `min-width: 140px; max-width: 240px`
- **`.progress-row`** — Added `flex: 1` so it stretches to fill available space (no longer full-width below controls)
- **`.progress-bar-wrap`** — Height 4px (hover 6px), background `rgba(255,255,255,0.08)`, border-radius 2px, added height transition
- **`.progress-bar-fill`** — Background simplified to `var(--accent)` (removed gradient), border-radius 2px
- **`.progress-bar-fill::after`** — Always visible (`opacity: 1`), 12px circle, no box-shadow, transition on `transform` instead of `opacity`
- **`.progress-bar-wrap:hover .progress-bar-fill::after`** — Changed from `opacity: 1` to `scale(1.25)`
- **`.controls-row`** — Removed `justify-content: center`, added `flex-shrink: 0`, gap uses `var(--space-md)`
- **`.btn-ctrl`** — Reduced to 36px, font-size 20px, color `var(--text-secondary)`, simplified transitions
- **`.btn-ctrl.play-btn`** — Reduced to 48px, font-size 24px, purple shadow `rgba(165, 160, 240, 0.3)`
- **`.btn-ctrl.play-btn:hover`** — Added `box-shadow: 0 4px 24px rgba(165, 160, 240, 0.45)`
- **`.btn-ctrl.play-btn:active`** — Added `transform: scale(0.94)`
- **`.btn-mode`** — Reduced to 34px, font-size 14px, added `font-family: var(--font-sans)`
- **`.btn-mode:hover`** — Background changed from `var(--bg-surface)` to `var(--bg-hover)`
- **`.now-playing-label .dot`** — Color changed from `#4caf50` to `#4ade80`, animation uses `var(--ease-in-out)`
- **`@keyframes pulseDot`** — Renamed from `pulse-dot`, uses `var(--ease-in-out)`
- **`.now-playing-title`** — Removed `max-width: 200px` constraint
- **Responsive (`@media max-width: 768px`)** — Removed outdated `.player-info { position: static; margin-bottom: 4px; }` (no longer needed since `.player-info` is no longer absolutely positioned)

## Self-Review Checklist
- [x] `.player-bar` is a single flex row: `display: flex; align-items: center`
- [x] Background uses `rgba(20, 20, 22, 0.82)` with `blur(24px) saturate(1.2)`
- [x] `.player-info` has no `position: absolute`, uses `min-width: 140px; max-width: 240px`
- [x] `.progress-row` has `flex: 1` and fills available space inline
- [x] Progress thumb always visible (`opacity: 1`)
- [x] `.progress-bar-wrap` height 4px, hover 6px
- [x] `.btn-ctrl.play-btn` is 48px with `rgba(165, 160, 240, ...)` purple shadow
- [x] `.btn-mode` uses 34px size, `font-size: 14px`
- [x] `.now-playing-label .dot` uses `#4ade80`
- [x] No remaining references to `--bg-player`, `pulse-dot`, or old warm-theme colors

## Commit
`feat: add dark theme player bar with single-row layout`
