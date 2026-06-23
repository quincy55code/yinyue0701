-- sql/seed_collections.sql
-- 歌曲汇总种子数据
-- 在 Supabase SQL Editor 中执行此文件

-- 一级分类（12个）
INSERT INTO collections (name, slug, sort_order) VALUES
  ('热歌榜单', 'hot-songs', 1),
  ('KTV必点', 'ktv-must-sing', 2),
  ('华语流行', 'hua-yu-liu-xing', 3),
  ('欧美音乐', 'ou-mei-yin-yue', 4),
  ('粤语经典', 'yue-yu-jing-dian', 5),
  ('古风国风', 'gu-feng-guo-feng', 6),
  ('民谣', 'min-yao', 7),
  ('纯音乐', 'chun-yin-yue', 8),
  ('经典怀旧', 'jing-dian-huai-jiu', 9),
  ('网络神曲', 'wang-luo-shen-qu', 10),
  ('歌手专区', 'ge-shou-zhuan-qu', 11),
  ('主题歌单', 'theme-lists', 12);

-- 子标签（按 collection slug 关联，避免硬编码 ID）
INSERT INTO collection_items (collection_id, title, bvid, sort_order) VALUES
  -- 热歌榜单（9个）
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '网易云10W+热歌200首', 'BV1vm411Z7ZN', 1),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '2024热评榜首100首', 'BV1vg4y1U7Xf', 2),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '2025最新流行热歌', 'BV13icVeSENi', 3),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '全网热歌TOP100', 'BV1EPt7eGEH3', 4),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), 'B站热歌榜94期', 'BV16aEz68EBS', 5),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '2026年5月最火50首', 'BV1GxVU6oEWW', 6),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '网易云VIP热歌榜', 'BV1bzqbY8Ees', 7),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), '2026上半年最火100首', 'BV17vLz62EHG', 8),
  ((SELECT id FROM collections WHERE slug = 'hot-songs'), 'B站欧美神曲100期', 'BV1ueL96CEXN', 9),
  -- KTV必点（3个）
  ((SELECT id FROM collections WHERE slug = 'ktv-must-sing'), '00后KTV必点', 'BV1SrbkzxEVi', 1),
  ((SELECT id FROM collections WHERE slug = 'ktv-must-sing'), '8090后KTV必点200首', 'BV1Ei421i7mm', 2),
  ((SELECT id FROM collections WHERE slug = 'ktv-must-sing'), '百首华语代表作', 'BV1qpsPznEWJ', 3),
  -- 华语流行（6个）
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '治愈华语女声歌单', 'BV1pr6aYiE97', 1),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '111首华语经典', 'BV1fDqiYNEuf', 2),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '百首华语代表作', 'BV1qpsPznEWJ', 3),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '150首华语热歌', 'BV1NURNBtETP', 4),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '华语神仙打架', 'BV1Mv411p78Q', 5),
  ((SELECT id FROM collections WHERE slug = 'hua-yu-liu-xing'), '破亿播放华语歌', 'BV1Mv411p78Q', 6),
  -- 欧美音乐（8个）
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '50首经典英文歌', 'BV1sM4y1z7G8', 1),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '40首欧美顶流', 'BV15hV36ZENH', 2),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '40首上头欧美歌', 'BV1RFAkzPEij', 3),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '超好听英文歌', 'BV1PSNPe9EJg', 4),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '100首经典英文歌', 'BV1j4EM6aELa', 5),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), 'B站欧美神曲100期', 'BV1ueL96CEXN', 6),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '西城男孩精选20首', 'BV1BALF6NENq', 7),
  ((SELECT id FROM collections WHERE slug = 'ou-mei-yin-yue'), '霉霉精选40首', 'BV1ChR7B4ECE', 8),
  -- 粤语经典（2个）
  ((SELECT id FROM collections WHERE slug = 'yue-yu-jing-dian'), '百首粤语经典', 'BV1tyKceWETg', 1),
  ((SELECT id FROM collections WHERE slug = 'yue-yu-jing-dian'), '粤语经典重温', 'BV1xZ6gYLEWZ', 2),
  -- 古风国风（2个）
  ((SELECT id FROM collections WHERE slug = 'gu-feng-guo-feng'), '炸裂古风戏腔', 'BV1Ko6dYCEQv', 1),
  ((SELECT id FROM collections WHERE slug = 'gu-feng-guo-feng'), '100首超好听古风', 'BV1cUjW61EFN', 2),
  -- 民谣（1个）
  ((SELECT id FROM collections WHERE slug = 'min-yao'), '治愈民谣酒馆', 'BV1rDqKYXEfg', 1),
  -- 纯音乐（2个）
  ((SELECT id FROM collections WHERE slug = 'chun-yin-yue'), '100首绝美纯音乐', 'BV1xh68YvEij', 1),
  ((SELECT id FROM collections WHERE slug = 'chun-yin-yue'), '100首超好听纯音乐', 'BV1FEQuBXEn1', 2),
  -- 经典怀旧（5个）
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '8090一人一首成名曲', 'BV1Tm411973h', 1),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '滚石经典歌曲合集', 'BV1QC4y1P7YG', 2),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '00年代华语金曲TOP100', 'BV16FkMYPEeb', 3),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '150首怀旧金曲', 'BV1gT5Y6mEXM', 4),
  ((SELECT id FROM collections WHERE slug = 'jing-dian-huai-jiu'), '100首经典老歌', 'BV1RnEL6UEkY', 5),
  -- 网络神曲（5个）
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '100首经典网络神曲', 'BV1ToBCYME8m', 1),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '100首经典网络神曲', 'BV1AqmaYREDm', 2),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '90后MP3金曲', 'BV168411o7Bh', 3),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '网吧通宵130首神曲', 'BV1Y2w4zXEJ9', 4),
  ((SELECT id FROM collections WHERE slug = 'wang-luo-shen-qu'), '90后150首网络神曲', 'BV1GSEj6UEaN', 5),
  -- 歌手专区（5个）
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '周深神仙嗓音', 'BV1Wg4heQEQU', 1),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '周杰伦100首合集', 'BV1e9Lo64EJx', 2),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '许嵩歌曲合集', 'BV1KXjF6REto', 3),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '西城男孩精选20首', 'BV1BALF6NENq', 4),
  ((SELECT id FROM collections WHERE slug = 'ge-shou-zhuan-qu'), '霉霉精选40首', 'BV1ChR7B4ECE', 5),
  -- 主题歌单（5个，bvid=NULL 占位无歌曲）
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '治愈', NULL, 1),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '睡前', NULL, 2),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '学习', NULL, 3),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '开车', NULL, 4),
  ((SELECT id FROM collections WHERE slug = 'theme-lists'), '伤感', NULL, 5);
