-- sql/seed_collections.sql
-- 歌曲汇总种子数据（2026-07-03 更新：简化命名）
-- 在 Supabase SQL Editor 中执行此文件

-- 一级分类（12个）
INSERT INTO collections (name, slug, sort_order) VALUES
  ('热榜', 'hot-songs', 1),
  ('欢唱', 'ktv-must-sing', 2),
  ('华语', 'hua-yu-liu-xing', 3),
  ('欧美', 'ou-mei-yin-yue', 4),
  ('粤韵', 'yue-yu-jing-dian', 5),
  ('国风', 'gu-feng-guo-feng', 6),
  ('民谣', 'min-yao', 7),
  ('纯音', 'chun-yin-yue', 8),
  ('拾光', 'jing-dian-huai-jiu', 9),
  ('上头', 'wang-luo-shen-qu', 10),
  ('歌手', 'ge-shou-zhuan-qu', 11),
  ('主题', 'theme-lists', 12);

-- 子标签（按 collection slug 关联，避免硬编码 ID）
INSERT INTO collection_items (collection_id, title, bvid, sort_order) VALUES
  -- 热榜（9个）
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 1', 'BV1vm411Z7ZN', 1),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 2', 'BV1vg4y1U7Xf', 2),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 3', 'BV13icVeSENi', 3),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 4', 'BV1EPt7eGEH3', 4),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 5', 'BV16aEz68EBS', 5),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 6', 'BV1GxVU6oEWW', 6),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 7', 'BV1bzqbY8Ees', 7),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 8', 'BV17vLz62EHG', 8),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '焦点 9', 'BV1ueL96CEXN', 9),
  -- 欢唱（3个）
  ((SELECT id FROM collections WHERE slug = 'ktv-must-sing'), '麦霸 1', 'BV1SrbkzxEVi', 1),
  ((SELECT id FROM collections WHERE slug = 'ktv-must-sing'), '麦霸 2', 'BV1Ei421i7mm', 2),
  ((SELECT id FROM collections WHERE slug = 'ktv-must-sing'), '麦霸 3', 'BV1qpsPznEWJ', 3),
  -- 华语（6个）
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华章 1', 'BV1pr6aYiE97', 1),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华章 2', 'BV1fDqiYNEuf', 2),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华章 3', 'BV1qpsPznEWJ', 3),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华章 4', 'BV1NURNBtETP', 4),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华章 5', 'BV1Mv411p78Q', 5),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华章 6', 'BV1Mv411p78Q', 6),
  -- 欧美（8个）
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 1', 'BV1sM4y1z7G8', 1),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 2', 'BV15hV36ZENH', 2),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 3', 'BV1RFAkzPEij', 3),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 4', 'BV1PSNPe9EJg', 4),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 5', 'BV1j4EM6aELa', 5),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 6', 'BV1ueL96CEXN', 6),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 7', 'BV1BALF6NENq', 7),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西岸 8', 'BV1ChR7B4ECE', 8),
  -- 粤韵（2个）
  ((SELECT id FROM collections WHERE slug = 'yue-yu-jing-dian'), '港乐 1', 'BV1tyKceWETg', 1),
  ((SELECT id FROM collections WHERE slug = 'yue-yu-jing-dian'), '港乐 2', 'BV1xZ6gYLEWZ', 2),
  -- 国风（2个）
  ((SELECT id FROM collections WHERE slug = 'gu-feng-guo-feng'), '雅韵 1', 'BV1Ko6dYCEQv', 1),
  ((SELECT id FROM collections WHERE slug = 'gu-feng-guo-feng'), '雅韵 2', 'BV1cUjW61EFN', 2),
  -- 民谣（1个）
  ((SELECT id FROM collections WHERE slug = 'min-yao'), '远方 1', 'BV1rDqKYXEfg', 1),
  -- 纯音（2个）
  ((SELECT id FROM collections WHERE slug = 'chun-yin-yue'), '轻语 1', 'BV1xh68YvEij', 1),
  ((SELECT id FROM collections WHERE slug = 'chun-yin-yue'), '轻语 2', 'BV1FEQuBXEn1', 2),
  -- 拾光（5个）
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '岁月 1', 'BV1Tm411973h', 1),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '岁月 2', 'BV1QC4y1P7YG', 2),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '岁月 3', 'BV16FkMYPEeb', 3),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '岁月 4', 'BV1gT5Y6mEXM', 4),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '岁月 5', 'BV1RnEL6UEkY', 5),
  -- 上头（5个）
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '音浪 1', 'BV1ToBCYME8m', 1),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '音浪 2', 'BV1AqmaYREDm', 2),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '音浪 3', 'BV168411o7Bh', 3),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '音浪 4', 'BV1Y2w4zXEJ9', 4),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '音浪 5', 'BV1GSEj6UEaN', 5),
  -- 歌手（5个）
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '星曜 1', 'BV1Wg4heQEQU', 1),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '星曜 2', 'BV1e9Lo64EJx', 2),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '星曜 3', 'BV1KXjF6REto', 3),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '星曜 4', 'BV1BALF6NENq', 4),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '星曜 5', 'BV1ChR7B4ECE', 5),
  -- 主题（6个，bvid=NULL 占位无歌曲）
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '胶囊 1', NULL, 1),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '胶囊 2', NULL, 2),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '胶囊 3', NULL, 3),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '胶囊 4', NULL, 4),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '胶囊 5', NULL, 5),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '胶囊 6', NULL, 6);