# xexle-community.user.js v35 Plan

## Features in this release

### F1 — Persist scroll position (#4)
- Debounced save of `scrollY` to `sessionStorage` key `xc-scroll:<path>` while scrolling in list view
- Restore after rows render (wait until tagged row count > 0, max 5s)
- Grid view excluded

### F2 — Full-width gallery grid view (#5)
- Panel toggle button "Gallery Grid"
- Replaces `#community_list` area with full-width container (site content column constrained; grid uses `position:fixed`-free full-bleed via appending to body-level wrapper)
- 3 users per row (`repeat(3, 1fr)`), responsive fallback 2/1 cols
- Card layout (inspired by inside-gallery video listing):
  - Header: avatar initial circle + username link + total videos
  - Body: up to 3 gallery thumbnails (`galleries[].avatar`) with count bubble + title strip, linking `/favorites/<id>/0`
- Same scroll-driven crawling: cards observed, fetched on approach
- Filters (min/search/gallery) apply to grid too

### F3 — Recent-activity sort (#6)
- Sort select in panel: `Default` | `Recent activity`
- Recent = desc by max(gallery.lastDt, gallery.created) across user's galleries
- Applies to both views (list sorts DOM rows; grid sorts cards)

### F4 — Gallery-title quick filter + saved searches (#9)
- Dropdown in panel listing unique gallery titles from DB, sorted by frequency
- Selecting one filters to users owning that gallery title
- Saved searches: disk icon next to search saves current query as chip; click chip re-applies; right-click/X deletes
- Chips persisted via GM_setValue

### F5 — Retry queue + permanent-failure handling (#16)
- Failed fetches no longer show fake "0 videos" badge
- Record `{username, failCount, lastAttempt}` in DB
- failCount < 3: retried next page visit / re-scroll
- failCount >= 3 and lastAttempt < 24h: show grey "unavailable" badge, skip crawling
- After 24h cooldown, retry resets

### F6 — Stale cache refresh (#2)
- Cached records older than 7 days are transparently re-crawled when their row scrolls into view

## Data model change (DB v3)
users store record:
```
{ username, total, galleries[{folderId,title,count,avatar,created,lastDt}],
  description, lastCrawled, failCount?, lastAttempt? }
```

## Out of scope (backlog, see IDEAS.md)
Pre-crawl idle background, CSV export, notes/tags, priority two-pass crawling, inline preview expansion, color tiers, counters.
