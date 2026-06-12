# Food Guessr

Singleplayer Food Guessr MVP built as a web monorepo.

## Apps

- `frontend/`: Next.js game client
- `backend/`: Express + Socket.io + Prisma API

## Local development

1. Install dependencies:
   - `npm --prefix backend install`
   - `npm --prefix frontend install`
2. Create env files from the examples in each app.
3. If using Supabase, set both `DATABASE_URL` and `DIRECT_URL` in `backend/.env`.
4. If using Supabase, run Prisma migrations:
   - `npm --prefix backend run prisma:generate`
   - `cd backend && npx prisma migrate deploy`
5. Start the backend:
   - `npm run dev:backend`
6. Start the frontend:
   - `npm run dev:frontend`

## Notes

- The backend will use an in-memory fallback when `DATABASE_URL` is not set. This keeps the MVP playable locally before Supabase is wired.
- For Supabase, use the transaction pooler in `DATABASE_URL` and the direct/session URL in `DIRECT_URL`.
- For production, use Supabase Postgres with Prisma migrations on Render.
