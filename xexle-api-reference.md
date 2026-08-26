# xexle.com API — Complete Reference

> Reverse-engineered from network traffic and client-side JS (v8.6.0)

---

## Endpoint

```
POST https://xexle.com/api/
```

- Content-Type: `application/x-www-form-urlencoded`
- All requests are URL-encoded key=value pairs
- Response shape: `{"status": true/false, "data": {...}, "message": "..."}`
- Auth: `session=<userId>:<sessionToken>` — passed as a param in the body
- CORS: `access-control-allow-origin: *`
- No auth needed for public reads

---

## Auth

### Register (One-Click Sign Up)

```
query=user.registration&el=<el_token>
```

With bot guard:

```
query=user.registration&el=<el_token>&bguardToken=<token>
```

Response:

```json
{
  "userId": 954816,
  "username": "user_954816",
  "session": "954816:<sessionToken>"
}
```

Sets cookie `session=954816%3A<sessionToken>` on success. The session format is always `userId:sessionToken`.

### Login

```
query=user.auth&login=<usernameOrEmail>&password=<password>&bguardToken=&markId=
```

Response:

```json
{
  "userId": 954816,
  "username": "user_954816",
  "session": "954816:<sessionToken>",
  "avatar": ""
}
```

Session is stored to `localStorage.user` and `cookie.session`.

### Get current user

```
query=user.getBySession&session=<session>
```

Response:

```json
{
  "userId": 954788,
  "username": "user_954788",
  "coins": 0,
  "points": 0,
  "registered": 1782658078,
  "stat": [],
  "country": "FR",
  "emailVerification": { "verified": 0, "requestedAt": 0, "verifiedAt": 0, "lastSentAt": 0 },
  "avatar": "",
  "zp": 0,
  "verified": 0,
  "counter": { "views": 0, "downloads": 0 }
}
```

### Get user profile

```
query=user.get&username=<username>
```

Returns the same user object or `{"status":false,"message":"User not found"}`.

### Other user endpoints

```
user.getList                — list users
user.create                 — create user
user.update                 — update profile
user.exit                   — logout
user.setGender              — set gender
user.avatar.set             — set avatar
user.avatar.info            — avatar info
user.uploadingSet           — set uploading state
user.recoveryPasswordAuth   — password recovery
user.verifyEmail            — verify email
user.id                     — get user ID
user.applyFlux              — apply rate limit check response
user.default
```

---

## Community

### List users (Interesting tab)

```
query=community.getList&type=interesting&session=<session>
```

Response:

```json
{
  "lists": [338498, 305699, 329380, ...],
  "totalCount": 1565,
  "searchableCount": 944878,
  "usersData": {
    "338498": { "username": "blip_blup", "description": "optional bio", "avatar": "" },
    ...
  },
  "subscribed": []
}
```

The `type` parameter may support different values (only `interesting` observed).

### Get interest tags

```
query=community.interests.getList
```

Response:

```json
{
  "list": [
    { "id": 6894, "tag": "amateur", "text": "amateur", "count": 43 },
    { "id": 6900, "tag": "anal", "text": "anal", "count": 42 },
    ...
  ],
  "searchableCount": 944878
}
```

---

## Favorites / Folders

### Get folder contents — browse a folder (video cards)

```
query=usersFavoriteContent.getFolder&folderId=<id>&page=<page>
```

Optional: `&session=<session>` to access private folders.

This is the main endpoint for loading the content items inside a folder. Returns content items with full media metadata.

### Get all folders for a user (profile page)

```
query=usersFavoriteContent.getFolders&user=<username>&session=<session>
```

Response:

```json
{
  "list": {
    "45746": {
      "_id": 45746,
      "folderId": 45746,
      "userId": 338498,
      "title": "My favorites",
      "count": 41,
      "created": 1738764933,
      "private": 0,
      "last": { "contentId": 354665 },
      "avatar": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.p.webp?token=<JWT>",
      "url": "favorites/45746/0"
    },
    ...
  },
  "count": 10
}
```

### Get folder metadata

```
query=usersFavoriteContent.getFolderMeta&folderId=<id>&session=<session>
```

### Get user's folder settings (own account)

```
query=usersFavoriteContent.getSettings&session=<session>
```

Response:

```json
{
  "userId": 954788,
  "defaultFolderId": 1926740,
  "hiddenFolderIds": [],
  "folders": {
    "1926740": {
      "_id": 1926740, "folderId": 1926740, "userId": 954788,
      "title": "My favorites", "count": 0, "private": 0,
      "created": 1782658078, "url": "favorites/1926740/0",
      "hiddenInAddList": 0, "isDefaultAddFolder": 1
    },
    ...
  },
  "foldersCount": 2
}
```

### Get favorite lists by user

```
query=usersFavoriteContent.lists.getByUser&user=<username>&page=0&countOnPage=8&session=<session>
```

### Get list contents (public curated lists)

```
query=usersFavoriteContent.lists.get&listId=<id>&page=<page>&countOnPage=50&session=<session>
```

### Get lists to add content to

```
query=usersFavoriteContent.getListToAdd&contentId=<id>&session=<session>
```

### Create folder

```
query=usersFavoriteContent.create&name=<name>&session=<session>
```

### Check if content is already in favorites

```
query=usersFavoriteContent.isAdded&contentId=<id>&session=<session>
```

### Set folder privacy

```
query=usersFavoriteContent.setPrivacy&folderId=<id>&value=0|1&session=<session>
```

### Add to list

```
query=usersFavoriteContent.lists.addFolder&listId=<id>&folderId=<folderId>&session=<session>
```

---

## Content Items (Media — the core data shape)

### Get content item details

```
query=contentItems.getByIds&itemIds=354665,257399,307243
```

Response per item:

```json
{
  "_id": 354665,
  "type": 3,
  "group": 0,
  "category": 14,
  "fileWidth": 854,
  "fileHeight": 480,
  "fileFilesize": 185445050,
  "fileDuration": 3228,
  "previewThumbWidth": 450,
  "previewThumbHeight": 252,
  "previewThumbCount": 100,
  "ppCount": 0,
  "ppWidth": 500,
  "ppHeight": 281,
  "title": "Video",
  "premium": 1,
  "tags": ["ANAL", "Drunk", "Wife", "Friend"],
  "description": "",
  "added": 1733567773,
  "status": 1,
  "indexes_search": "dormida drugged elaine sleep ...",
  "actors": [],
  "id": 354665,
  "fileFilesizeMb": "177mb",
  "isInGroup": false,
  "name": "Video",
  "publicDuration": "53:48",
  "publicQuality": "480p",
  "isHq": 0,
  "isPremium": 1,
  "new": false,
  "views": 2494,
  "addedPublic": ["1Y", ""],
  "urlFull": "https://xexle.com/watch/354665",
  "itemId": "354665",
  "itemType": "content",
  "isClip": false,

  "previewPicPath": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.p.webp?token=<JWT>",
  "previewVideoPath": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.vp.mp4?token=<JWT>",
  "previewThumbPath": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.t.webp?token=<JWT>",

  "filePath": "https://s2.worldwide-cdn.com/45/28/21/71/35_282172.mp4?token=<JWT>",
  "mobilePath": "https://s2.worldwide-cdn.com/45/28/21/71/35_282172.mp4?token=<JWT>",
  "downloadPath": "https://s2.worldwide-cdn.com/45/28/21/71/35_282172.mp4?token=<JWT>",

  "media": {
    "main": {
      "url": "https://s2.worldwide-cdn.com/45/28/21/71/35_282172.mp4?token=<JWT>",
      "mobileUrl": "https://s2.worldwide-cdn.com/45/28/21/71/35_282172.mp4?token=<JWT>",
      "downloadUrl": "https://s2.worldwide-cdn.com/45/28/21/71/35_282172.mp4?token=<JWT>"
    },
    "preview": {
      "poster": {
        "url": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.p.webp?token=<JWT>"
      },
      "video": {
        "url": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.vp.mp4?token=<JWT>"
      },
      "timelineSprite": {
        "url": "https://s2.worldwide-cdn.com/66/35/46/64/56_354665.t.webp?token=<JWT>",
        "grid": {
          "frameCount": 100,
          "cellWidth": 450,
          "cellHeight": 252,
          "cols": 10,
          "rows": 10,
          "width": 4500,
          "height": 2520
        }
      }
    }
  }
}
```

**Key fields:**
- `premium`: 1 = premium only (main video URLs empty), 0 or `""` = free (filePath/mobilePath populated)
- `isHq`: 1 = HD quality
- `publicDuration`: human-readable duration string
- `publicQuality`: resolution label
- `views`: view count

### Get media (scoped, access-checked)

```
query=contentItems.getMedia&itemIds=354665,282172&scope=preview,playback
```

Response:

```json
{
  "items": {
    "354665": {
      "itemId": "354665",
      "itemType": "content",
      "access": {
        "preview": true,
        "playable": false,
        "downloadable": false,
        "premium": true,
        "accessScope": "public",
        "reason": "premium_required"
      },
      "delivery": { "mode": "dfs" },
      "media": { "main": { "url": "", "mobileUrl": "" }, "preview": { ... } },
      "legacy": { ... }
    }
  }
}
```

Premium content returns empty main URLs with `access.premium=true`. Free content returns full URLs.

### Content comments count

```
query=contentComments.getCount&contentIds=354665,257399,307243,282172
```

Response:

```json
{ "354665": 0, "257399": 0, "307243": 0, "282172": 4 }
```

---

## CDN Image / Video URL patterns

**CDN hosts:** `s1.worldwide-cdn.com` or `s2.worldwide-cdn.com`

| Type | Pattern |
|---|---|
| Preview poster (thumbnail) | `https://s{1,2}.worldwide-cdn.com/<path>/<contentId>.p.webp?token=<JWT>` |
| Preview video (animated clip) | `https://s{1,2}.worldwide-cdn.com/<path>/<contentId>.vp.mp4?token=<JWT>` |
| Timeline sprite sheet | `https://s{1,2}.worldwide-cdn.com/<path>/<contentId>.t.webp?token=<JWT>` |
| Full video | `https://s{1,2}.worldwide-cdn.com/<path>/<contentId>.mp4?token=<JWT>` |

All URLs have JWT tokens for access control (expire after some time).

---

## Search

### Content search

```
query=content.search&text=<text>&section=search&menu=<menu>&type=All&pars=<pars>&count=30&page=0&ab=&mark=<mark>&session=<session>
```

| Param | Description |
|---|---|
| `text` | Search query string |
| `menu` | Section filter — one of: `All`, `sfhardcore`, `sfporn`, `sfnotporn`, `sfshocking`, `sfsissy`, `sfunsorted` |
| `type` | Content type — `All`, `Video`, `Image` (others?) |
| `count` | Results per page (default 30) |
| `page` | Page number (0-based) |

### Other content endpoints

```
content.getFeed                    — get feed
content.getGroups                  — content groups
content.searchTag                  — search by tag
content.related.get                — get related content
content.hide                       — hide content
content.addView&contentId=<id>     — add a view
content.addDownload&contentId=<id> — add a download
content.addViewedTimestamp         — add view timestamp
contentDescription.add             — add description
contentDescription.get             — get description
```

---

## Clips

```
contentClips.search    — search clips
contentClips.create    — create a clip
```

---

## Reactions

```
reactions.get&ids=<type>|<id>,<type>|<id>,...
```

Types: `1` = content, `10` = news, `14` = folder

Response:

```json
{
  "list": {
    "1|354665": { "0": 1, "10": 1, "13": 2, "14": 1, "2": 6, "9": 1 },
    "1|282172": { "0": 6, "1": 1, "10": 16, ... }
  }
}
```

The inner keys are emoji reaction type IDs, values are counts.

```
reactions.user&session=<session>   — get user's own reactions
reactions.add                      — add reaction
```

---

## Notifications

```
notifications.ping&session=<session>
```

Polls every ~10s while the page is open.

Response:

```json
{
  "alarm": 7,
  "coins": 0,
  "coinsUsd": 0,
  "points": 0,
  "verified": 0,
  "permissions": [],
  "email": "",
  "emailVerification": { "verified": 0, "requestedAt": 0, "verifiedAt": 0, "lastSentAt": 0 },
  "version": "8.6.0",
  "versionSub": "2",
  "popup": [],
  "popupCount": 0,
  "alerts": {
    "menu": {
      "Notifications": { "type": "alert", "value": 1 },
      "Changelog": { "type": "info", "value": 1 }
    },
    "raw": {
      "notificationsUnread": 1,
      "messagesUnread": 0,
      "newsUnread": 0,
      "changelogUnread": 1
    }
  },
  "userIp": "176.181.149.183",
  "zp": 0
}
```

```
notifications.autoload              — auto-load notifications
notifications.settings.get          — get notification settings
notifications.settings.set          — set notification settings
notifications.settings.reset        — reset notification settings
```

---

## Subscriptions

```
subscriptions.isFollowed&userIds=<userId>&session=<session>
subscriptions.getFollowers
subscriptions.getFollowing
subscriptions.add
```

---

## Interests (User bio tags)

```
interests.getPublic&user=<username>     — get user's public interest tags
interests.get&ids=...                   — get specific interests
interests.getList                       — get available interests
interests.set                           — set interests
```

---

## Service

```
service.ping
```

Response:

```json
{
  "version": "8.6.0",
  "versionSub": "2",
  "userIp": "176.181.149.183",
  "geo": {
    "ip": "176.181.149.183",
    "country": "FR",
    "hash": "1c877b5d09b44597d04da8ccf39efca7",
    "cache": "fastdb"
  },
  "error": ""
}
```

```
service.getSponsors                — returns []
service.getNews                    — get news items
service.getChangelog               — get changelog
service.dsa                        — DSA info
```

---

## Saved Searches

```
favoriteSearches.getPublic&user=<username>
favoriteSearches.get&session=<session>
favoriteSearches.add
favoriteSearches.setPublic
favoriteSearches.getWithSearch
favoriteSearches.deleteAll
searchHistory.get
searchHistory.deleteAll
```

---

## Posts

```
posts.getUserPosts&user=<username>    — get user's posts
posts.getThread                       — get post thread
posts.getUpdates                      — get post updates
posts.create                          — create post
posts.delete                          — delete post
posts.update                          — update post
posts.bookmarkToggle                  — toggle bookmark
posts.getBookmarksState               — get bookmark state
posts.getTagsHot                      — hot tags
posts.addViews                        — add views
posts.uploadInfo                      — upload info
```

---

## Coins / Premium / Topup

```
coins.getHistory                 — coin transaction history
coins.getСryptoPrices            — crypto prices
coins.setPublic                  — set coin public status
coins.transaction                — coin transaction
premium.ask                      — premium info
premium.buy                      — buy premium
premium.getPrices                — premium pricing
store.premiumGiftActivate        — activate premium gift
store.premiumGiftAsk             — ask for premium gift
store.premiumGiftBuy             — buy premium gift
topup.createInvoice              — create topup invoice
topup.confirmInvoice             — confirm topup invoice
topup.cancelInvoice              — cancel topup invoice
topup.getList                    — get topup list
topup.increaseInvoiceTimeout     — extend invoice timeout
```

---

## Contact / Support

```
contact.info              — get contact info
contact.send              — send contact message
faq.getCategory           — get FAQ category
faq.getList               — get FAQ list
report.getStats           — get report stats
report.getStatus          — get report status
ipRestriction.enable      — enable IP restriction
```

---

## Discord / Telegram link

```
discord.checkCode&code=...     — check Discord code
discord.delete                 — disconnect Discord
discord.getCode                — get Discord linking code
telegram.checkCode&code=...    — check Telegram code
telegram.delete                — disconnect Telegram
telegram.getCode               — get Telegram linking code
```

---

## Fast Auth

```
fastAuth.askHash
fastAuth.responseUnauthorized
```

---

## Upload

```
fs.download
fs.get
fs.upload.open
fs.upload.prepareUpload
fs.upload.resolveUploaded
fs.upload.resolveProcessing
fs.upload.deleteUploaded
```

---

## Bot Guard (Anti-scraping)

```
bguard.init&markId=<id>&sessionId=<id>&payloadJson=<json>
bguard.event&markId=<id>&sessionId=<id>&payloadJson=<json>
```

Payload JSON contains: `stats` (ageMs, visibleMs, hiddenMs, pointerMoves, clicks, keyEvents, focusEvents, visibilityChanges, eventSeq, webdriver, viewport, timezone, language, platform, maxTouchPoints, cookieEnabled) and `createdAt`.

Fires on every page load and periodically. May block API calls if it detects automation.

---

## Logs (Analytics)

```
logs.insert&database=visits-pages&logQuery=insert&url=<url>&userId=<userId>
logs.insert&database=api_errors&logQuery=insert&command=<query>&url=<url>&response=<response>&cookies=<cookies>&storage=<storage>
```

---

## Games

```
games.get                    — get game info
games.home                   — games homepage
games.leaderboard.get        — get leaderboard
games.progress.get           — get progress
games.progress.set           — set progress
games.score.submit           — submit score
games.session.create         — create game session
games.session.end            — end game session
games.session.heartbeat      — game session heartbeat
games.storage.get            — get game storage
games.storage.set            — set game storage
```

---

## URL Structure (Client-side routing)

| Route | API calls | Purpose |
|---|---|---|
| `/community` | `community.getList&type=interesting` | Community user list |
| `/community/interests` | `community.interests.getList` | Interest tag list |
| `/user/<username>` | `user.get`, `interests.getPublic`, `usersFavoriteContent.getFolders`, `favoriteSearches.getPublic`, `subscriptions.isFollowed` | User profile page |
| `/favorites/<folderId>/<page>` | `usersFavoriteContent.getFolder&folderId=<id>&page=<n>` | Browse folder contents |
| `/explore/search/<text>/<section>/<type>/<pars>/<page>` | `content.search` | Search/browse content |
| `/account` | — | Account settings page |
| `/settings` | `usersFavoriteContent.getSettings` | User settings |
| `/watch/<contentId>` | `contentItems.getByIds` | Video player page |
| `/content/<contentId>` | — | Content detail page |

---

## Workflow example: Scrape a user's folders and their content

```bash
# 1. Get user's public folders
curl -s -X POST https://xexle.com/api/ \
  -d 'query=usersFavoriteContent.getFolders&user=blip_blup'

# 2. Get content in a folder (page 0)
curl -s -X POST https://xexle.com/api/ \
  -d 'query=usersFavoriteContent.getFolder&folderId=45746&page=0'

# 3. Get full media details for specific content IDs
curl -s -X POST https://xexle.com/api/ \
  -d 'query=contentItems.getByIds&itemIds=354665,257399,307243,282172'

# 4. Get comments count for content items
curl -s -X POST https://xexle.com/api/ \
  -d 'query=contentComments.getCount&contentIds=354665,257399,307243'

# 5. Get reactions for content items
curl -s -X POST https://xexle.com/api/ \
  -d 'query=reactions.get&ids=1|354665,1|257399,1|307243'

# 6. Get media (with access check, scoped)
curl -s -X POST https://xexle.com/api/ \
  -d 'query=contentItems.getMedia&itemIds=354665,282172&scope=preview,playback'
```

---

## Legend: Common URL encoded characters

| Encoded | Actual |
|---|---|
| `%3A` | `:` |
| `%2F` | `/` |
| `%7C` | `\|` |
| `%7B` | `{` |
| `%7D` | `}` |
| `%22` | `"` |
| `%26` | `&` |
| `%3D` | `=` |
