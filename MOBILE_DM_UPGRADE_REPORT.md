# Loomyva Mobile DM Upgrade Report

## Main product changes

- Converted `/messages/` into a clean inbox-only page that shows latest conversations.
- Added a dedicated `/chat/` route for full direct messaging.
- Latest conversation cards now open `/chat/?conversation=CONVERSATION_ID`.
- Search message buttons now open `/chat/?user=USER_ID` instead of using an inline modal.
- Public profile modal now includes a `Message` button that opens `/chat/?user=USER_ID`.
- Kept Supabase URL / anon key untouched.
- Kept the existing chat tables and real-time message logic.

## Mobile UI upgrades

- Added Instagram/X-style inbox cards with compact avatars, latest preview, and timestamps.
- Added a full-height mobile chat layout with sticky composer, rounded phone-first shell, and safe-area spacing.
- Added proper message bubble styling for sent/received messages.
- Added a back button inside the chat header.
- Hid the old combined inbox/search/chat structure from the messages page.

## Files changed

- `messages/index.html`
- `chat/index.html`
- `assets/js/chat.js`
- `assets/js/user-search.js`
- `assets/js/profile.js`
- `assets/js/ui.js`
- `assets/css/style.css`
- `sitemap.xml`

## Testing checklist

1. Open `/messages/` on mobile. It should show only latest chats.
2. Tap a latest chat. It should open `/chat/?conversation=...`.
3. Open `/search/`, search a user, and tap the message icon. It should open `/chat/?user=...`.
4. Open another user profile modal and tap `Message`. It should open `/chat/?user=...`.
5. Send a message on `/chat/`. The message should appear in the bubble layout and update the conversation timestamp.
6. Return to `/messages/`. The latest chat should stay at the top.
