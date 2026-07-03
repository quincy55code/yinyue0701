-- sql/2026-07-03-notes-reviews.sql
-- 在 Supabase SQL Editor 中执行
-- 创建 notes（博客文章）和 reviews（歌曲短评）两张表

-- 1. notes 表 — 博客文章（含每日推荐）
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    cover_image TEXT,
    tags TEXT[] DEFAULT '{}',
    daily_recommend BOOLEAN DEFAULT false,
    song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
    pinned BOOLEAN DEFAULT false,
    published BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_published ON notes(published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_daily ON notes(daily_recommend, published_at DESC) WHERE daily_recommend = true;

-- 2. reviews 表 — 歌曲短评
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
    content TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_song ON reviews(song_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_feed ON reviews(is_admin, created_at DESC) WHERE is_admin = true;
