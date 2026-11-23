# GPU Nexus Marketplace

Buy and sell used graphics cards with other GPU Nexus members: listings with up to six photos, prices in pesos or dollars, and messages between buyers and sellers.

A static site (HTML, CSS, JS, no build step). It runs at **`/market/`** on the GPU Nexus site through a rewrite in the Finder project's `vercel.json`, so it shares the GPU Nexus sign-in cookie and calls the same `/api` (lance-api). Opened on its own Vercel address, it redirects there.

## Views

The part after `#` picks the view:

| Address | View |
| --- | --- |
| `#/` | All listings (search, condition, sort) |
| `#/?gpu=17` | Listings of one catalog GPU (the Finder's "Buy used" button) |
| `#/listing/12` | One listing: photos, price, seller, linked GPU, message box |
| `#/sell`, `#/edit/12` | Post or change a listing |
| `#/mine` | Your listings, for sale and sold |
| `#/inbox`, `#/chat/7` | Conversations with buyers and sellers |

## API (lance-api `market.py`)

`GET/POST /listings`, `GET/PATCH/DELETE /listings/{id}`, `POST /listings/photos`, `POST /listings/{id}/messages`, `GET /me/conversations`, `GET /me/unread`, `GET /conversations/{id}`, `POST /conversations/{id}/messages`. Every route needs the GPU Nexus sign-in. Tables and the `listing-photos` bucket come from `lance-api/supabase/market.sql`.

## Notes

- Photos are shrunk in the browser to 2000 px before upload, then checked, resized to 1600 px, stripped of camera data and stored as WebP by the API.
- Showing a price in the other currency uses a fixed rate (`PHP_PER_USD` in `market.js`) and is marked "≈".
- No environment variables: secrets live in lance-api only.
