-- Phase 12 content: the kinds of editable content documents. Kept in its own
-- migration, like every enum change.
-- CreateEnum
CREATE TYPE "ContentDocumentKind" AS ENUM ('HOME', 'ANNOUNCEMENTS', 'MENU', 'FOOTER', 'PAGE');
