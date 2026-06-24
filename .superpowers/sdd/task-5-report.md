# Task 5 Report: Local Tag Background Images

- **Status:** DONE
- **Changes:**
  - `scripts/download_tag_bg.js` — switched from Unsplash (503 down) to picsum.photos with seed-based URLs for deterministic images per tag
  - `js/ui.js` — replaced yumus.cn external API URLs with local `/public/images/tags/<filename>.jpg` paths in both `getCollectionBgStyle()` and `renderCollectionItemsGrid()`
  - `public/images/tags/` — 15 background images downloaded (600x400, ~35KB avg)
- **Concerns:** None. The yumus.cn API often returned the same image — local images give each collection a distinct background. CSS `--tag-color` provides fallback color if an image fails to load.
