-- sql/2026-07-04-notes-song-ids.sql
-- 在 Supabase SQL Editor 中执行
-- 为 notes 表添加 song_ids 数组字段，支持多首歌曲

ALTER TABLE notes ADD COLUMN IF NOT EXISTS song_ids INTEGER[] DEFAULT '{}';
