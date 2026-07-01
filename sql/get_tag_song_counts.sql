-- Supabase RPC 函数：获取标签歌曲计数
-- 在 Supabase SQL Editor 中执行：https://supabase.com/dashboard/project/orphftlwdwuvoscizndx/sql/new
CREATE OR REPLACE FUNCTION get_tag_song_counts()
RETURNS TABLE(tag_id bigint, cnt bigint)
LANGUAGE sql
AS $$
  SELECT tag_id, COUNT(*)::bigint
  FROM song_tags
  GROUP BY tag_id;
$$;
