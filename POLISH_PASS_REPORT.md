# Loomyva — Full Polish Pass Report
**Date:** 2026-05-31  
**Pass:** Premium Product Polish v2.0

---

## 1. Files Changed

| File | What Changed |
|---|---|
| `assets/css/style.css` | **Full rewrite** — consolidated 4 competing `:root` blocks into 1 clean 1312-line design system |
| `index.html` | Cache-busting version → `?v=polish-20260531` |
| `login/index.html` | Cache-busting version updated |
| `create-account/index.html` | Cache-busting version updated |
| `search/index.html` | Cache-busting version updated |
| `profile/index.html` | Cache-busting version updated |
| `messages/index.html` | Cache-busting version updated |
| `chat/index.html` | Cache-busting version updated |
| `notifications/index.html` | Cache-busting version updated |
| `privacy/index.html` | Cache-busting version updated |
| `terms/index.html` | Cache-busting version updated |

**No JS or Supabase logic was touched.** All auth, posts, likes, comments, follows, profiles, search, inbox, messages, notifications, timestamps, and routes are preserved exactly.

---

## 2. Structure / Layout Issues Fixed

- **4 competing `:root` blocks eliminated.** The original `style.css` had 4 full `:root` redeclarations (lines 1–60, ~963, ~1710, ~3015) plus 3 dark-theme overrides, causing unpredictable CSS cascade behavior. Now there is exactly one `:root` and one dark override.
- **`!important` war ended.** The old file needed hundreds of `!important` rules to beat its own earlier declarations. The new file uses `!important` only on critical mobile overrides (media queries) which is correct behavior.
- **Home grid**: Feed + right rail layout now correctly displays on desktop (two-column) and stacks cleanly on tablet/mobile.
- **Feed top sticky header**: Cleaned up — no more z-index conflicts with topbar.
- **Profile stats**: Now a proper 4-column grid (2-column on mobile) with breathing room.
- **Profile identity area**: Avatar pulls up correctly with `margin-top: -56px`, aligned with cover strip height.
- **Chat window height**: Uses `100svh` (small viewport height) minus topbar/bottom-nav for correct mobile keyboard behavior.
- **Messages inbox**: Constrained to 760px max-width, centered, proper grid layout.
- **Search cards**: Spacious `58px` avatar, `18px 20px` padding, flex layout with proper action buttons.
- **Bottom nav overlap**: `padding-bottom` now includes `env(safe-area-inset-bottom)` for iPhone notch/home bar.

---

## 3. Design System Applied

**Token system** (single `:root`):
- Colors: `--bg`, `--surface`, `--surface-muted`, `--surface-hover`, `--text`, `--muted`, `--line`, `--brand`, `--brand-2`, `--danger`, `--good`, `--warning`
- Shadows: 3 levels (`--shadow-sm`, `--shadow-md`, `--shadow-lg`)
- Radii: `--radius-xs` (8px) through `--radius-pill` (999px)
- Spacing: `--space-1` through `--space-8`
- Layout: `--topbar-h` (68px), `--bottom-nav-h` (74px), `--content-w` (1180px), `--feed-w` (680px)
- Motion: `--fast` (150ms), `--med` (240ms)

**Typography:** Poppins (loaded via Google Fonts — already in HTML) as primary font.

**Breakpoints:**
- `≥1200px` — wide desktop: full 2-column layout
- `≤980px` — tablet: collapse to single column  
- `≤720px` — mobile: full mobile layout, hidden labels, grid action buttons
- `≤460px` — small mobile: tighter padding, stacked user cards

---

## 4. Navigation Changes

- **Top navbar text links hidden**: `.topbar-nav { display: none !important }` — no Home/Search/Profile text in topbar.
- **Topbar**: Clean floating pill with user avatar (left), brand logo + name (center-left), notification bell (right).
- **Bottom nav**: 5 icons — Home, Search, Create, Inbox, Profile. Labels visible on desktop, hidden on `≤720px` (icon-only). Active state uses `--brand` background.
- **Sidebar drawer**: Slides in from left with smooth transform, backdrop blur overlay. Contains auth, theme, language, and nav links.

---

## 5. Messaging / Chat Flow

- **`/messages/`** = inbox only. Shows latest conversations as cards. Each card opens `/chat/?conversation=ID`.
- **`/chat/`** = dedicated DM screen. Shows header with back button (`←` links to `/messages/`), recipient avatar + name, scrolling message bubbles, sticky input form.
- **Message bubbles**: `.own` class = right-aligned dark bubble; no class = left-aligned light bubble. Matches existing `chat.js` rendering.
- **Chat height**: Calculates `100svh - topbar - bottom-nav - 46px` to avoid keyboard/nav overlap.
- **Input**: Full-width pill textarea + Send button in grid layout, sticky at bottom.

---

## 6. Bugs Fixed

- **Invisible like/comment buttons**: Now always visible with `!important` guards. `18px` SVG icons, `44px` min-height tap targets, strong border contrast.
- **Thread content missing margin**: Moved to `display: grid; gap: 16px` on `.thread-card` — all children naturally spaced.
- **Bottom nav covering content**: Fixed `padding-bottom` with `env(safe-area-inset-bottom)`.
- **Chat keyboard overlap**: `100svh` + grid rows (`auto 1fr auto`) means input stays at bottom, messages scroll above.
- **Profile avatar overlap**: Correct negative margin (`-56px`) tuned to cover strip height.
- **Filter pills horizontal scroll on mobile**: `overflow-x: auto; flex-wrap: nowrap; width: 100%`.
- **Long usernames breaking layout**: `max-width: min(480px, 64vw)` + `text-overflow: ellipsis` on `.thread-user > div`.
- **Topbar not fixed on scroll**: Confirmed `position: fixed; top: 14px; left: 50%; transform: translateX(-50%)`.
- **Duplicate `:root` color wars**: Now single source. Dark mode works predictably.

---

## 7. What Still Needs Testing in Supabase After Upload

1. **Login / Google OAuth** — Verify redirect URLs in Supabase Auth settings match your deployed domain.
2. **Post a thread** — Test both text-only and with image upload to `thread-images` bucket.
3. **Like a post** — Confirm `thread_likes` table writes correctly.
4. **Comments modal** — Open comments, post a comment, verify it persists.
5. **Follow / Unfollow** — Check `follows` table updates and feed filter works.
6. **Search users** — Type username, verify results. Click Message — should open `/chat/?user=USER_ID`.
7. **Messages inbox** — Load `/messages/`, verify latest conversations appear.
8. **Chat page** — Open a conversation, send a message, confirm real-time appears.
9. **Notifications** — Like someone's post, verify notification badge updates.
10. **Profile edit** — Update display name, bio, avatar. Verify `profiles` table updates and avatar uploads to storage.
11. **RLS policies** — Confirm Row Level Security on `threads`, `thread_likes`, `follows`, `chat_messages`, `conversations`, `profiles` allows correct read/write per user.

---

## 8. Steps to Test on Phone and Desktop

### On Phone (iOS Safari or Android Chrome):
1. Open app URL. **Check**: topbar floats cleanly above content, not overlapping.
2. Scroll the feed. **Check**: no content hidden behind bottom nav.
3. Tap Like and Comment buttons. **Check**: large tap targets, visible icons, correct state.
4. Open sidebar (avatar button). **Check**: drawer slides from left, backdrop blur shows.
5. Tap Messages in bottom nav → `/messages/`. **Check**: inbox cards are spacious.
6. Tap a conversation → `/chat/`. **Check**: back button, header, bubbles visible.
7. Tap text input in chat. **Check**: keyboard appears, input stays visible, messages scroll up.
8. Open profile. **Check**: avatar overlaps cover, stats grid, tabs scroll.
9. Search a user. **Check**: cards stack vertically on small screens, Follow/Message buttons full-width.

### On Desktop (Chrome/Safari):
1. Open app at ≥1280px wide. **Check**: two-column feed + right rail layout.
2. Check feed cards are not stretched full width (max `680px` feed column).
3. Hover thread cards. **Check**: subtle lift animation.
4. Open chat. **Check**: centered `860px` max-width, proper bubble alignment.
5. Toggle dark mode in sidebar. **Check**: all colors update cleanly.
6. Test at 768px browser width (tablet). **Check**: single column, rail below feed.

