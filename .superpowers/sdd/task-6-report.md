# Task 6 Report — Auth State Management Module

## Summary
Created `js/auth.js` — an IIFE-based singleton `Auth` module for managing user authentication state.

## Deliverables
- **Created:** `js/auth.js`
- **Pattern:** IIFE returning `Auth` singleton, matching `js/playlist.js` and `js/player.js` style
- **Storage:** localStorage keys `music_player_session` and `music_player_user`

## API Surface
| Method | Description |
|--------|-------------|
| `init()` | Restores session from localStorage, validates via `GET /api/auth/me` |
| `isLoggedIn()` | Returns boolean session status |
| `getUser()` | Returns current user object `{ id, email, username }` |
| `getToken()` | Returns raw access token string |
| `login(email, password)` | POSTs to `/api/auth/login`, saves session on success |
| `signup(email, password, username)` | POSTs to `/api/auth/signup`, saves session on success |
| `logout()` | POSTs to `/api/auth/logout`, clears localStorage |
| `onChange(fn)` | Observer pattern listener registration |
| `getAuthHeaders()` | Returns `{ Authorization, Content-Type }` headers object |

## Dependencies
- Requires backend endpoints for Tasks 1-5 (auth routes) to be operational
- Requires `index.html` to load `js/auth.js` (Task 8) before use
