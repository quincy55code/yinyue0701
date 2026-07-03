-- ============================================================================
-- 🏷️ 歌曲标签系统 — 建表 + 初始数据
-- ============================================================================
-- 使用方法：
--   1. 打开 Supabase Dashboard → SQL Editor
--   2. 粘贴本文件全部内容
--   3. 点击 Run 执行
-- ============================================================================

-- ============================================================================
-- 1. tags（标签表）
-- ============================================================================
-- 存储歌曲标签，支持二级层级（如：明星 → 周杰伦）。
-- parent_id IS NULL = 顶级标签（首页卡片）；parent_id IS NOT NULL = 子标签。
-- ============================================================================
CREATE TABLE tags (
    id          SERIAL       PRIMARY KEY,
    name        TEXT         NOT NULL UNIQUE,              -- 标签名（唯一），如"粤语""周杰伦"
    color       TEXT         DEFAULT '#E8917B',            -- 标签颜色（CSS 颜色值）
    parent_id   INTEGER      DEFAULT NULL REFERENCES tags(id) ON DELETE SET NULL,  -- 父标签（NULL=顶级）
    sort_order  INTEGER      DEFAULT 0,                    -- 排序序号（数字越小越靠前）
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()        -- 创建时间
);

-- 索引：查询某父标签下的所有子标签
CREATE INDEX idx_tags_parent_id ON tags (parent_id);

-- 索引：按排序号查询
CREATE INDEX idx_tags_sort ON tags (sort_order);

COMMENT ON TABLE tags IS '标签表 — 支持二级层级（如 明星→周杰伦）';
COMMENT ON COLUMN tags.id IS '自增主键';
COMMENT ON COLUMN tags.name IS '标签名（唯一）';
COMMENT ON COLUMN tags.color IS '标签展示颜色';
COMMENT ON COLUMN tags.parent_id IS '父标签 ID，NULL=顶级标签，级联 SET NULL';
COMMENT ON COLUMN tags.sort_order IS '排序序号（越小越靠前）';
COMMENT ON COLUMN tags.created_at IS '创建时间';


-- ============================================================================
-- 2. song_tags（歌曲-标签关联表）
-- ============================================================================
-- 歌曲与标签的多对多关联表。
-- 一首歌曲可以有多个标签，一个标签下可以有多首歌曲。
-- ============================================================================
CREATE TABLE song_tags (
    song_id  INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,  -- 歌曲
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,   -- 标签

    -- 同一歌曲不能重复打同一个标签
    PRIMARY KEY (song_id, tag_id)
);

-- 索引：查询某标签下的所有歌曲
CREATE INDEX idx_song_tags_tag_id ON song_tags (tag_id);

-- 索引：查询某歌曲的所有标签
CREATE INDEX idx_song_tags_song_id ON song_tags (song_id);

COMMENT ON TABLE song_tags IS '歌曲标签关联表 — 歌曲与标签的多对多关联';
COMMENT ON COLUMN song_tags.song_id IS '外键 → songs.id，级联删除';
COMMENT ON COLUMN song_tags.tag_id IS '外键 → tags.id，级联删除';


-- ============================================================================
-- 3. 初始标签数据
-- ============================================================================
-- 顶级标签（首页卡片）
-- ============================================================================
INSERT INTO tags (name, color, sort_order) VALUES
('2026热歌',       '#FF6B6B', 1),   -- 红色系：热歌
('一人一首成名曲',  '#FF8E53', 2),   -- 橙色系：拾光(原一人一首成名曲)
('粤语',           '#4ECDC4', 3),   -- 青色系：粤韵(原粤语)
('KTV',            '#FF6B9D', 4),   -- 粉色系：欢唱(原KTV)
('民谣',           '#95E1D3', 5),   -- 薄荷绿：民谣
('热门',           '#F38181', 6),   -- 珊瑚红：热门
('动漫',           '#AA96DA', 7),   -- 紫色系：动漫
('经典',           '#C9A96E', 8),   -- 金色系：经典
('伤感',           '#769FCD', 9),   -- 蓝灰系：伤感
('古风',           '#B8A9C9', 10),  -- 浅紫系：古风
('8090',           '#E8B4B8', 11),  -- 复古粉：8090
('游戏',           '#6C5CE7', 12),  -- 深紫系：游戏
('纯音乐',         '#74B9FF', 13),  -- 天蓝系：纯音乐
('英语',           '#55E6C1', 14),  -- 翠绿系：英语
('摇滚',           '#FD79A8', 15);  -- 亮粉系：摇滚

-- 明星标签（二级：parent_id 指向自身组）
INSERT INTO tags (name, color, sort_order) VALUES
('明星', '#E8917B', 16);

-- 明星子标签（parent_id = 明星的 id）
-- 明星 id 固定为上面 INSERT 的最后一行，即 currval('tags_id_seq')
INSERT INTO tags (name, color, parent_id, sort_order) VALUES
('周杰伦', '#F0C27A', (SELECT id FROM tags WHERE name = '明星'), 1),
('王菲',   '#A29BFE', (SELECT id FROM tags WHERE name = '明星'), 2),
('林俊杰', '#74B9FF', (SELECT id FROM tags WHERE name = '明星'), 3),
('陈奕迅', '#FD79A8', (SELECT id FROM tags WHERE name = '明星'), 4),
('刘德华', '#F8B500', (SELECT id FROM tags WHERE name = '明星'), 5),
('邓紫棋', '#6C5CE7', (SELECT id FROM tags WHERE name = '明星'), 6),
('张学友', '#55E6C1', (SELECT id FROM tags WHERE name = '明星'), 7),
('莫文蔚', '#E8B4B8', (SELECT id FROM tags WHERE name = '明星'), 8);


-- ============================================================================
-- 表关系更新
-- ============================================================================
--
--   tags ── song_tags ── songs
--          (多对多)
--
--   tags 的层级关系（自引用）：
--     parent_id → tags.id
--     例：明星 (id=16) ← 周杰伦 (parent_id=16), 王菲 (parent_id=16), ...
--
-- 级联删除行为：
--   - 删除标签 → 自动删除该标签的所有歌曲关联（song_tags）
--   - 删除标签 → 其子标签的 parent_id 设为 NULL
--   - 删除歌曲 → 自动删除该歌曲的所有标签关联（song_tags）
-- ============================================================================
