# Image storage and recovery deployment

Apply `migrations/005_board_images.sql` in the project's Supabase SQL Editor before deploying this client. It works with the existing owner-only board policies and, if installed, the collaboration tables. The migration is repeatable and does not change board content.

The `board-images` bucket is private. Images are immutable objects named by board ID and SHA-256 digest. Uploads are limited to one image per request; board JSON contains references only. The first successful save of an old board uploads its embedded images before replacing its cloud JSON. A failed upload leaves the previous cloud board untouched. Assets are not deleted on edits because undo and snapshots can reference them.

The editor loads references back into data URLs at the persistence boundary. JSON/image/PDF/PowerPoint exports and cross-board copy remain self-contained. Creating an imported cloud board requires a board row before image upload so RLS can authorize the assets.

Recovery copies are stored in IndexedDB (`manojalam-board-recovery`), scoped by account and board. Writes resolve only on transaction commit. Pending recovery is loaded before canvas hydration. A cloud success acknowledges only the exact local revision it saved; newer edits remain pending. Normal saves retain the last local copy. Local quota failures remain visible and offer JSON download. Browser storage is device-specific and can be erased by clearing site data; it is not an external backup service.

Checks:
- `node --test scripts/guest-storage.test.mjs` (140 images / >45 MB, <100 KB board JSON, failure/retry, export, recovery/quota/account isolation)
- `npm install --prefix .tmp/image-storage-db --no-audit --no-fund @electric-sql/pglite`
- `node scripts/run-image-storage-db-tests.mjs` (owner-only and collaborator permissions)
- `node scripts/run-save-recovery-smoke.mjs` with a local production server on port 3095 (isolated Chrome; 140 images + 140 notes, failed save/reload/retry)

The cloud tests use a controlled Supabase boundary and the SQL tests use PostgreSQL locally. Production credentials are required for a live end-to-end Supabase upload verification. The original failed production request was not captured, so its precise server error remains unconfirmed.
