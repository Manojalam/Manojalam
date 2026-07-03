# Manashchitram

**A visual knowledge canvas for study, Sanskrit, and structured thinking.**

Manashchitram is a mind-map and infinite-canvas whiteboard app built with Next.js, React Flow, and optional Supabase backend. It works fully offline in local demo mode — no backend setup required to get started.

## Features

- Infinite pannable/zoomable canvas with React Flow
- Mind-map nodes with Tab/Enter keyboard workflow
- Sticky notes, text blocks, shapes, frames
- Sanskrit cards, śloka cards, grammar cards
- Transliteration helper (IAST, ITRANS, HK, Devanāgarī)
- 19+ templates including Sanskrit study maps
- Export JSON and Markdown; import JSON backup
- Undo/redo, search, command palette (⌘/Ctrl+K)
- Light/dark mode with scholarly indigo/saffron theme
- Local demo mode or Supabase cloud sync

## Quick start (local demo mode)

```bash
cd manashchitram
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables needed — boards save to `localStorage`.

You'll see a **Demo Mode: local save only** badge when Supabase is not configured.

## Environment variables

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Leave empty for demo mode. Once both are set, the app automatically uses Supabase for board storage.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the migration file:
   ```
   database/migrations/001_initial_schema.sql
   ```
3. Copy your project URL and anon key from **Settings → API**
4. Add them to `.env.local`
5. (Optional) Create a Storage bucket named `board-assets` for future image uploads

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add the same env vars under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

Without env vars, the Vercel deployment still works in demo mode.

## Demo mode behavior

When Supabase env vars are missing:

- Boards persist in browser `localStorage` under `vidyamap.boards`
- Auth pages show a helpful message with "Continue in local demo mode"
- Cloud-only features (auth, snapshots to Supabase, asset storage) are disabled
- A demo badge appears in the UI

When Supabase is configured:

- Board CRUD uses the `boards` table
- Auth callback route handles OAuth/magic link sessions
- RLS ensures users only access their own data

## Tech stack

- **Next.js 15+** App Router
- **TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui** components
- **@xyflow/react** canvas
- **Zustand** state
- **Supabase** (optional)
- **@indic-transliteration/sanscript**

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/app` | Dashboard |
| `/app/boards` | Board list |
| `/app/boards/new` | Create board |
| `/app/boards/[boardId]` | Canvas editor |
| `/app/templates` | Template gallery |
| `/app/settings` | App settings |
| `/auth/sign-in` | Sign in |
| `/auth/sign-up` | Sign up |
| `/help/shortcuts` | Keyboard shortcuts |
| `/help/sanskrit-tools` | Sanskrit tools guide |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Tab | Child node |
| Enter | Sibling node |
| ⌘/Ctrl+Z | Undo |
| ⌘/Ctrl+S | Save |
| ⌘/Ctrl+K | Command palette |
| V/H/M/S/T/R | Tool selection |

See `/help/shortcuts` for the full list.

## Export / import

- **Export JSON** — full board backup with nodes, edges, settings
- **Export Markdown** — outline with Sanskrit sections formatted
- **Import JSON** — restore from `.vidyamap.json` backup
- PNG/SVG export — planned (menu items disabled)

## License

Private / family use. Not affiliated with Miro or any third-party whiteboard product.
