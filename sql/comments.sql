-- sql/comments.sql
-- 在 Supabase SQL Editor 中执行
-- 创建 comments 表 — 博客文章评论

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_note ON comments(note_id, created_at ASC);