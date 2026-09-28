# Manojalam · मनोजालम्

**A visual knowledge canvas for study, Sanskrit, and structured thinking.**

Manojalam is a mind-map and infinite-canvas whiteboard app built with Next.js, React Flow, and a Supabase backend. Users can securely share boards with view-only or editing access.

## Local Supabase Setup

1. Create a Supabase project.
2. Run `database/migrations/001_supabase_auth_boards.sql`, then `database/migrations/002_board_collaboration.sql`, in the Supabase SQL Editor.
3. In Supabase Authentication → URL Configuration:
   - Site URL: `http://localhost:3005`
   - Redirect URL: `http://localhost:3005/auth/callback`
   - Redirect URL: `http://localhost:3005/auth/update-password`
4. In Supabase Authentication → Providers:
   - Enable the Email provider.
   - Enable "Confirm email" if email verification is desired.
5. Create `.env.local` with:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   NEXT_PUBLIC_APP_URL=http://localhost:3005
   ```
6. Do not commit `.env.local`.
7. Start the app on `localhost:3005`.

Vercel deployment will be configured later.

## Features

- Infinite pannable/zoomable canvas with React Flow
- Mind-map nodes with Tab/Enter keyboard workflow
- Sticky notes, text blocks, shapes, frames, and image/audio attachments with in-app recording
- Sanskrit cards, śloka cards, grammar cards
- Transliteration helper (IAST, ITRANS, HK, Devanāgarī)
- 11 curated templates, including Sanskrit study maps
- Export JSON backups plus complete hierarchical Markdown, TXT, HTML, and PDF outlines; import JSON backup
- Undo/redo, search, command palette (⌘/Ctrl+K)
- Board sharing with owner, editor, and viewer roles
- Live refresh when a collaborator saves an open board
- Light/dark mode with scholarly indigo/saffron theme
- Local demo mode or Supabase cloud sync

## Quick start (local demo mode)

```bash
cd manashchitram
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables needed — boards save to `localStorage`.

You can use the app without an account, whether or not Supabase is configured. Guest boards display **Saved on this device**.

## Environment variables

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Leave empty for browser-only guest mode. With Supabase configured, new boards use cloud storage after sign-in; existing guest boards stay on the device until explicitly transferred.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the migration files in order:
   ```
   database/migrations/001_supabase_auth_boards.sql
   database/migrations/002_board_collaboration.sql
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

## Storage behavior

Without an account, boards persist in this browser's IndexedDB and are labeled **Saved on this device**, even when Supabase is configured. Auth pages offer **Continue without an account**. Sign in for cloud saving, sharing, and cloud snapshots. Existing guest boards are transferred only when the user chooses **Save to account**.

Signed-in users create new boards in the Supabase `boards` table. RLS restricts cloud boards to owners and invited collaborators.

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
- **Export outline** — complete parent/child hierarchy in Markdown, TXT, standalone HTML, or paginated PDF, including authored details, cross-links, and relationships
- **Import JSON** — restore from `.vidyamap.json` backup
- PNG/SVG export — planned (menu items disabled)

## License

Private / family use. Not affiliated with Miro or any third-party whiteboard product.

## Guest boards

Guests can create boards, use templates, edit, duplicate, import, and download exports without signing in. Boards are stored in IndexedDB in the current browser profile. Clearing site data, private browsing, or browser storage eviction can erase them. The editor offers a JSON backup download and labels device-only saving explicitly.

After signing in, the dashboard offers a link to device boards. On **Boards**, choose **Save to account** for each board to upload it. The upload uses a stable ID, verifies ownership and content, and removes the device copy only after verification. Failed uploads keep the local copy. If another tab edits during upload, newer local edits remain; duplicate that board to upload a separate copy if it differs from the existing cloud copy.

Cloud database permissions and collaborator access remain enforced by Supabase. Sharing and cloud snapshots require an account. The remote-asset export proxy still requires authentication when Supabase is configured; guest exports can use embedded assets and directly accessible resources, with the existing export warnings/fallbacks for inaccessible remote assets.

Run guest storage regression tests with `npm run test:guest-storage`.
