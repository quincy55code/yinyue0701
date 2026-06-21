/**
 * 批量插入 BV1iP4y1D7Y2 【十年榜】2000-2009年最强华语金曲TOP100 到 Supabase
 * 并自动打标签
 * 用法：/d/softwa/nodejs/node scripts/insert_bv1iP_songs.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// ========== 标签配置 ==========
const TAG_IDS = {
    '2026热歌': 1, '一人一首成名曲': 2, '粤语': 3, 'KTV': 4,
    '民谣': 5, '热门': 6, '动漫': 7, '经典': 8, '伤感': 9,
    '古风': 10, '8090': 11, '游戏': 12, '纯音乐': 13, '英语': 14, '摇滚': 15,
    '明星': 16,
    '周杰伦': 17, '王菲': 18, '林俊杰': 19, '陈奕迅': 20,
    '刘德华': 21, '邓紫棋': 22, '张学友': 23, '莫文蔚': 24,
};

const SINGER_TAGS = {
    // 粤语歌手
    '莫文蔚': ['粤语', '经典', 'KTV'],
    '陈慧琳': ['粤语', '经典', 'KTV'],
    '陈奕迅': ['粤语', '经典', '陈奕迅'],
    '张学友': ['粤语', '经典', '张学友'],
    '刘德华': ['粤语', '经典', '刘德华'],
    '邓紫棋': ['热门', 'KTV', '邓紫棋'],
    '林俊杰': ['8090', '经典', 'KTV', '一人一首成名曲', '林俊杰'],
    '王菲': ['经典', 'KTV', '王菲'],
    '林忆莲': ['8090', '粤语', '经典', 'KTV'],
    '周迅': ['经典'],
    // 古风
    '刘珂矣': ['古风', '纯音乐'],
    '音阙诗听': ['古风'],
    // 民谣
    '陈粒': ['民谣'],
    '房东的猫': ['民谣'],
    // 周杰伦
    '周杰伦': ['8090', '经典', 'KTV', '一人一首成名曲', '周杰伦'],
    '温岚': ['8090', '经典', '周杰伦'],
    // 伤感
    '阿桑': ['伤感', '经典'],
    '一支榴莲': ['伤感'],
    '蓝心羽': ['伤感'],
    '苏星婕': ['伤感'],
    // 8090
    '许茹芸': ['8090', '经典', '伤感'],
    '辛晓琪': ['8090', '经典', '伤感'],
    '金海心': ['8090', '经典'],
    '范玮琪': ['8090', '经典'],
    '孙燕姿': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '梁静茹': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '张韶涵': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '张惠妹': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '刘若英': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '萧亚轩': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '蔡健雅': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '戴佩妮': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '张靓颖': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '田馥甄': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '丁当': ['8090', '经典', 'KTV'],
    '张芸京': ['8090', '经典'],
    '戚薇': ['8090', '经典', 'KTV'],
    'A-Lin': ['8090', '经典', 'KTV'],
    '金莎': ['8090', '经典'],
    '金沙': ['8090', '经典'],
    '江美琪': ['8090', '经典'],
    '张碧晨': ['8090', '经典', 'KTV'],
    '袁娅维TIA RAY': ['热门', 'KTV'],
    // BV1az 新增
    '王力宏': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '周传雄': ['8090', '经典', 'KTV'],
    '五月天': ['8090', '经典', 'KTV', '一人一首成名曲'],
    'F.I.R.飞儿乐团': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '飞儿乐队': ['8090', '经典', 'KTV', '一人一首成名曲'],
    'F.I.R': ['8090', '经典', 'KTV', '一人一首成名曲'],
    'S.H.E': ['8090', '经典', 'KTV', '一人一首成名曲'],
    'she': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '蔡依林': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '陶喆': ['8090', '经典', 'KTV'],
    '王心凌': ['8090', '经典', 'KTV'],
    '光良': ['8090', '经典', 'KTV', '一人一首成名曲'],
    '容祖儿': ['8090', '粤语', '经典', 'KTV'],
    '杨丞琳': ['8090', '经典', 'KTV'],
    'Twins': ['8090', '粤语', '经典', 'KTV'],
    'twins': ['8090', '粤语', '经典', 'KTV'],
    '马天宇': ['8090', '经典'],
    '海鸣威': ['8090', '经典'],
    '李圣杰': ['8090', '经典', 'KTV'],
    'F4': ['8090', '经典', 'KTV'],
    '苏打绿': ['8090', '经典'],
    '沙宝亮': ['8090', '经典'],
    '陈小春': ['8090', '经典', 'KTV'],
    '庾澄庆': ['8090', '经典', 'KTV'],
    '伍佰': ['8090', '经典', 'KTV'],
    '吴克群': ['8090', '经典'],
    '林志炫': ['8090', '经典', 'KTV'],
    '阿杜': ['8090', '经典', '伤感'],
    '潘玮柏': ['8090', '经典', 'KTV'],
    '许嵩': ['8090', '经典'],
    '黄小琥': ['8090', '经典', 'KTV'],
    'Tank': ['8090', '经典'],
    '林宥嘉': ['8090', '经典', 'KTV'],
    '信乐团': ['8090', '经典', '摇滚'],
    '谢霆锋': ['8090', '经典', 'KTV'],
    '水木年华': ['8090', '经典'],
    '张宇': ['8090', '经典', 'KTV'],
    '萧敬腾': ['8090', '经典', 'KTV'],
    '李翊君': ['8090', '经典'],
    '梁咏琪': ['8090', '经典', 'KTV'],
    '郭静': ['8090', '经典'],
    '彭佳慧': ['8090', '经典', 'KTV'],
    '飞轮海': ['8090', '经典'],
    '孙楠': ['8090', '经典', 'KTV'],
    '韩红': ['8090', '经典', 'KTV'],
    '袁成杰': ['8090', '经典'],
    '郁可唯': ['热门', '一人一首成名曲'],
    '单依纯': ['热门', 'KTV'],
    '黄霄雲': ['热门', 'KTV'],
    '任然': ['热门'],
    '大籽': ['热门'],
    '阿肆': ['热门'],
    '阿YueYue': ['热门'],
    '徐佳莹': ['KTV', '一人一首成名曲'],
    '梦然': ['热门'],
    '回小仙': ['热门'],
    '王靖雯': ['热门', '伤感'],
    '卢润泽': ['2026热歌'],
    '潘成': ['2026热歌'],
    '丹正母子': ['2026热歌'],
    '窝窝': ['2026热歌'],
    '王睿卓': ['2026热歌'],
    'PAMajor': ['2026热歌'],
    '温奕心': ['热门'],
    '王搏': ['伤感'],
    '王艳薇': ['伤感'],
    '南方凯': ['热门'],
    '旺仔小乔': ['伤感'],
    '周林枫': ['伤感'],
    '尹昔眠': ['古风'],

    // ========== BV1iP 新增歌手 ==========
    '罗志祥': ['8090', '经典', 'KTV'],
    'Sweety': ['8090', '经典'],
    '许巍': ['8090', '经典', '摇滚'],
    '卢巧音': ['粤语', '经典'],
    '蔡卓妍': ['8090', '经典', '粤语'],
    '徐誉滕': ['8090', '伤感'],
    '誓言': ['8090', '伤感'],
    '王强': ['8090', '伤感'],
    '羽泉': ['8090', '经典'],
    '汪峰': ['8090', '经典', '摇滚'],
    '凤凰传奇': ['8090', '经典', 'KTV'],
    '费玉清': ['8090', '经典'],
    '华语群星': ['经典'],
    '刀郎': ['8090', '经典'],
    '乌兰托娅': ['8090', '经典'],
    '罗百吉': ['8090', '经典'],
    '张敬轩': ['8090', '经典', '粤语'],
};

// 歌名关键词 → 额外标签
const TITLE_KEYWORDS = [
    { kw: '阿嬷', tags: ['伤感', '2026热歌'] },
    { kw: '离别', tags: ['伤感'] },
    { kw: '樱花', tags: ['动漫'] },
    { kw: '海底', tags: ['伤感'] },
    { kw: '乌兰巴托', tags: ['民谣'] },
    { kw: '白月光', tags: ['伤感'] },
    { kw: '说散就散', tags: ['伤感', 'KTV'] },
    { kw: '永不失联的爱', tags: ['KTV', '热门'] },
    { kw: '星辰大海', tags: ['热门', 'KTV'] },
    { kw: '一路生花', tags: ['热门'] },
    { kw: '月亮之上', tags: ['民谣'] },
    { kw: '月亮代表我的心', tags: ['民谣'] },
    { kw: '狗尾草', tags: ['民谣'] },
    { kw: '白鸽乌鸦', tags: ['伤感', '2026热歌'] },
    { kw: '红昭愿', tags: ['古风', '热门'] },
    { kw: '半壶纱', tags: ['古风', '纯音乐'] },
    { kw: '风筝误', tags: ['古风'] },
    { kw: '九张机', tags: ['古风'] },
    { kw: '年轮', tags: ['古风'] },
    { kw: '西楼别序', tags: ['古风'] },
    { kw: '目及皆是', tags: ['热门'] },
    { kw: '云烟成雨', tags: ['民谣'] },
    { kw: '身骑白马', tags: ['经典', 'KTV'] },
    { kw: '热爱105', tags: ['热门'] },
    { kw: '偏爱', tags: ['经典', 'KTV'] },
    { kw: '红色高跟鞋', tags: ['KTV'] },
    { kw: '后来', tags: ['经典', 'KTV', '伤感'] },
    { kw: '一直很安静', tags: ['经典', '伤感'] },
    { kw: '突然想起你', tags: ['经典'] },
    { kw: '类似爱情', tags: ['伤感'] },
    { kw: '遗失的美好', tags: ['经典'] },
    { kw: '如果这就是爱情', tags: ['经典', '伤感'] },
    { kw: '你就不要想起我', tags: ['伤感', 'KTV'] },
    { kw: '会呼吸的痛', tags: ['伤感', 'KTV'] },
    { kw: '小幸运', tags: ['热门', 'KTV', '一人一首成名曲'] },
    { kw: '开始懂了', tags: ['经典', '伤感'] },
    { kw: '去有风的地方', tags: ['热门'] },
    { kw: '这世界那么多人', tags: ['热门', '伤感'] },
    { kw: '嘉宾', tags: ['热门', 'KTV'] },
    { kw: '想你时风起', tags: ['热门', '伤感'] },
    { kw: '追光者', tags: ['热门', 'KTV'] },
    { kw: '云与海', tags: ['热门'] },
    { kw: '飞鸟和蝉', tags: ['热门', '伤感'] },
    { kw: '去年夏天', tags: ['热门'] },
    { kw: '空空如也', tags: ['热门', '伤感'] },
    { kw: '醒不来的梦', tags: ['热门', '伤感'] },
    { kw: '把回忆拼好给你', tags: ['伤感'] },
    { kw: '你的酒馆对我打了烊', tags: ['伤感'] },
    { kw: '善变', tags: ['伤感'] },
    { kw: '走在冷风中', tags: ['伤感'] },
    { kw: '悲伤剧情', tags: ['伤感'] },
    { kw: '寂寞烟火', tags: ['伤感'] },
    { kw: '给我一个理由忘记', tags: ['伤感', 'KTV'] },
    { kw: '阿拉斯加海湾', tags: ['伤感'] },
    { kw: '如果爱忘了', tags: ['伤感', 'KTV'] },
    { kw: '画心', tags: ['经典', '伤感'] },
    { kw: '记事本', tags: ['经典', '伤感'] },
    { kw: '我们的纪念', tags: ['经典', '伤感'] },
    { kw: '吻别', tags: ['经典', '伤感', 'KTV'] },
    { kw: '十年', tags: ['伤感', 'KTV'] },
    { kw: '浮夸', tags: ['KTV'] },
    { kw: '黄昏', tags: ['伤感'] },
    { kw: '痴心绝对', tags: ['伤感', 'KTV'] },
    { kw: '暗香', tags: ['伤感'] },
    { kw: '独家记忆', tags: ['伤感', 'KTV'] },
    { kw: '死了都要爱', tags: ['伤感', 'KTV', '摇滚'] },
    { kw: '突然好想你', tags: ['伤感', 'KTV'] },
    { kw: '童话', tags: ['伤感', 'KTV', '一人一首成名曲'] },
    { kw: '我怀念的', tags: ['伤感'] },
    { kw: '知足', tags: ['KTV'] },
    { kw: '千年之恋', tags: ['伤感'] },
    { kw: '我们的爱', tags: ['伤感', 'KTV'] },
    { kw: '菊花台', tags: ['伤感'] },
    { kw: '千里之外', tags: ['KTV'] },
    { kw: '发如雪', tags: ['KTV'] },
    { kw: '夜曲', tags: ['KTV'] },
    { kw: '七里香', tags: ['KTV', '一人一首成名曲'] },
    { kw: '晴天', tags: ['KTV', '一人一首成名曲'] },
    { kw: '青花瓷', tags: ['KTV', '一人一首成名曲'] },
    { kw: '江南', tags: ['KTV', '一人一首成名曲'] },
    { kw: '一千年以后', tags: ['KTV'] },
    { kw: '曹操', tags: ['KTV'] },
    { kw: '日不落', tags: ['KTV'] },
    { kw: '勇气', tags: ['KTV', '一人一首成名曲'] },
    { kw: '隐形的翅膀', tags: ['KTV', '一人一首成名曲'] },
    { kw: '欧若拉', tags: ['KTV'] },
    { kw: '倔强', tags: ['KTV'] },
    { kw: '温柔', tags: ['伤感'] },
    { kw: '大城小爱', tags: ['KTV', '一人一首成名曲'] },
    { kw: '好心分手', tags: ['伤感', 'KTV'] },
    { kw: '快乐崇拜', tags: ['KTV', '一人一首成名曲'] },
    { kw: '波斯猫', tags: ['KTV'] },
    { kw: '流星雨', tags: ['KTV'] },
    { kw: '为你写诗', tags: ['KTV'] },
    { kw: '情非得已', tags: ['KTV'] },
    { kw: '盛夏的果实', tags: ['伤感', 'KTV'] },
    { kw: '他一定很爱你', tags: ['伤感'] },
    { kw: '遇见', tags: ['伤感', 'KTV', '一人一首成名曲'] },
    { kw: '龙卷风', tags: ['KTV'] },
    { kw: '爱你', tags: ['KTV'] },
    { kw: '第一次爱的人', tags: ['KTV'] },
    { kw: '至少还有你', tags: ['经典', 'KTV', '一人一首成名曲'] },
    { kw: '没那么简单', tags: ['伤感', 'KTV'] },
    { kw: '说谎', tags: ['伤感', 'KTV'] },
    { kw: '下一站天后', tags: ['KTV'] },
    { kw: '一生有你', tags: ['伤感'] },
    { kw: '月亮惹的祸', tags: ['伤感', 'KTV'] },
    { kw: '突然的自我', tags: ['KTV'] },
    { kw: '王妃', tags: ['KTV', '摇滚'] },
    { kw: '背对背拥抱', tags: ['KTV'] },
    { kw: '爱的主打歌', tags: ['KTV'] },
    { kw: '就是我', tags: ['KTV'] },
    { kw: '第一次', tags: ['伤感', 'KTV'] },
    { kw: '星月神话', tags: ['伤感'] },
    { kw: '美丽的神话', tags: ['伤感', 'KTV'] },
    { kw: '灰色头像', tags: ['伤感'] },
    { kw: '三国恋', tags: ['KTV'] },
    { kw: '给我一首歌的时间', tags: ['KTV'] },
    { kw: '稻香', tags: ['KTV', '一人一首成名曲'] },
    { kw: '花海', tags: ['伤感'] },
    { kw: '小情歌', tags: ['KTV'] },
    { kw: '寂寞沙洲冷', tags: ['伤感', 'KTV'] },
    { kw: '该死的温柔', tags: ['伤感'] },
    { kw: '老人与海', tags: ['KTV'] },
    { kw: '东风破', tags: ['KTV'] },
    { kw: '双截棍', tags: ['KTV'] },
    { kw: '今天你要嫁给我', tags: ['KTV'] },
    { kw: '北京欢迎你', tags: ['经典'] },
    { kw: '爱情转移', tags: ['KTV'] },
    { kw: '中国话', tags: ['KTV'] },
    { kw: '蓝莲花', tags: ['摇滚', '经典'] },
    { kw: 'Super Star', tags: ['KTV'] },
    { kw: 'super star', tags: ['KTV'] },
    { kw: '可惜不是你', tags: ['伤感', 'KTV'] },
    { kw: '怒放的生命', tags: ['摇滚'] },
    { kw: '因为爱所以爱', tags: ['KTV'] },
    { kw: '等一分钟', tags: ['伤感'] },
    { kw: '求佛', tags: ['伤感'] },
    { kw: '秋天不回来', tags: ['伤感'] },
    { kw: '挥着翅膀的女孩', tags: ['经典', 'KTV', '一人一首成名曲'] },
    { kw: '天路', tags: ['经典'] },
    { kw: '小酒窝', tags: ['KTV'] },
    { kw: '奔跑', tags: ['KTV'] },
    { kw: '自由飞翔', tags: ['KTV'] },
    { kw: '听妈妈的话', tags: ['KTV'] },
    { kw: '绿光', tags: ['KTV'] },
    { kw: '套马杆', tags: ['KTV'] },
    { kw: '最炫民族风', tags: ['KTV'] },
    { kw: '宁夏', tags: ['经典'] },
    { kw: '心墙', tags: ['KTV'] },
    { kw: '说爱你', tags: ['KTV'] },
    { kw: '有何不可', tags: ['KTV'] },
    { kw: '亲爱的那不是爱情', tags: ['KTV'] },
    { kw: '就是爱你', tags: ['KTV'] },
    { kw: '月牙湾', tags: ['KTV'] },
    { kw: '樱花草', tags: ['经典'] },
    { kw: '天黑黑', tags: ['经典', '伤感'] },
    { kw: '布拉格广场', tags: ['KTV'] },
    { kw: '你不是真正的快乐', tags: ['伤感', 'KTV'] },
    { kw: '唯一', tags: ['KTV'] },
    { kw: '2002年的第一场雪', tags: ['经典'] },
];

// ========== 解析函数 ==========

// 已知歌手列表（用于反向匹配）
const ALL_SINGERS = Object.keys(SINGER_TAGS);

// 歌名→歌手的硬编码修复（处理AI难以解析的情况）
const MANUAL_PARSE = {
    // 格式: part → { title, singer }
    '99.雨爱杨丞琳': { title: '雨爱', singer: '杨丞琳' },
    '93小情歌-苏打绿': { title: '小情歌', singer: '苏打绿' },
    '89 大城小爱 王力宏': { title: '大城小爱', singer: '王力宏' },
    '86 星月神话 金沙': { title: '星月神话', singer: '金沙' },
    '85 蓝莲花 许巍': { title: '蓝莲花', singer: '许巍' },
    '79 有何不可 许嵩': { title: '有何不可', singer: '许嵩' },
    '72 突然的自我 伍佰': { title: '突然的自我', singer: '伍佰' },
    '71 月牙湾 飞儿乐队': { title: '月牙湾', singer: '飞儿乐队' },
    '70 倔强-五月天': { title: '倔强', singer: '五月天' },
    '69 宁夏-梁静茹': { title: '宁夏', singer: '梁静茹' },
    '68我怀念的-孙燕姿': { title: '我怀念的', singer: '孙燕姿' },
    '67 波斯猫-S.H.E': { title: '波斯猫', singer: 'S.H.E' },
    '66 死了都要爱-信乐团': { title: '死了都要爱', singer: '信乐团' },
    '42 奔跑 羽泉': { title: '奔跑', singer: '羽泉' },
    '40 因为爱所以爱 谢霆锋': { title: '因为爱所以爱', singer: '谢霆锋' },
    '36一千年以后-林俊杰': { title: '一千年以后', singer: '林俊杰' },
    '35.自由飞翔-凤凰传奇': { title: '自由飞翔', singer: '凤凰传奇' },
    '32 绿光-孙燕姿': { title: '绿光', singer: '孙燕姿' },
    '31 我们的爱-F.I.R': { title: '我们的爱', singer: 'F.I.R' },
    '30.套马杆-乌兰托娅': { title: '套马杆', singer: '乌兰托娅' },
    '29 曹操-林俊杰': { title: '曹操', singer: '林俊杰' },
    '28 日不落-蔡依林': { title: '日不落', singer: '蔡依林' },
    '27 情非得已-庾澄庆': { title: '情非得已', singer: '庾澄庆' },
    '24 2002年的第一场雪-刀郎': { title: '2002年的第一场雪', singer: '刀郎' },
    '23 月亮之上-凤凰传奇': { title: '月亮之上', singer: '凤凰传奇' },
    '20夜曲-周杰伦': { title: '夜曲', singer: '周杰伦' },
    '17 中国话-S.H.E': { title: '中国话', singer: 'S.H.E' },
    '16 稻香-周杰伦': { title: '稻香', singer: '周杰伦' },
    '15 遇见 孙燕姿': { title: '遇见', singer: '孙燕姿' },
    '14 七里香-周杰伦': { title: '七里香', singer: '周杰伦' },
    '13 双截棍-周杰伦': { title: '双截棍', singer: '周杰伦' },
    '12 流星雨-F4': { title: '流星雨', singer: 'F4' },
    '11 Super Star she': { title: 'Super Star', singer: 'S.H.E' },
    '10 最炫民族风 凤凰传奇': { title: '最炫民族风', singer: '凤凰传奇' },
    '9 童话-光良': { title: '童话', singer: '光良' },
    '8 黄昏-周传雄': { title: '黄昏', singer: '周传雄' },
    '7 勇气 梁静茹': { title: '勇气', singer: '梁静茹' },
    '6 十年 陈奕迅': { title: '十年', singer: '陈奕迅' },
    '5 北京欢迎你-华语群星': { title: '北京欢迎你', singer: '华语群星' },
    '4 至少还有你 林忆莲': { title: '至少还有你', singer: '林忆莲' },
    '3 后来 刘若英': { title: '后来', singer: '刘若英' },
    '2 青花瓷-周杰伦': { title: '青花瓷', singer: '周杰伦' },
    '1隐形的翅膀-张韶涵': { title: '隐形的翅膀', singer: '张韶涵' },
};

function parsePart(part) {
    // 先检查硬编码修复
    if (MANUAL_PARSE[part]) return MANUAL_PARSE[part];

    // 1. 去掉前面的序号 "100", "99.", "98" 等
    let s = part.replace(/^\d+[\.\s]*\s*/, '').trim();

    // 2. 处理 "singer - title" 格式（空格-空格分隔，歌手在前）
    const dashSpaceIdx = s.lastIndexOf(' - ');
    if (dashSpaceIdx > 0) {
        const left = s.substring(0, dashSpaceIdx).trim();
        const right = s.substring(dashSpaceIdx + 3).trim();
        // 判断左边是否是已知歌手
        const leftIsSinger = ALL_SINGERS.some(sn => left.includes(sn) || sn.includes(left));
        if (leftIsSinger) {
            return { title: right, singer: left };
        }
        return { title: left, singer: right };
    }

    // 3. 处理 "title-singer" 格式（无空格 dash 分隔）
    const dashIdx = s.lastIndexOf('-');
    if (dashIdx > 0) {
        return {
            title: s.substring(0, dashIdx).trim(),
            singer: s.substring(dashIdx + 1).trim(),
        };
    }

    // 4. 处理 "title  singer" 格式（双空格或单空格分隔）
    // 优先在已知歌手中匹配
    for (const singerName of ALL_SINGERS) {
        if (s.endsWith(singerName) && s.length > singerName.length) {
            return { title: s.substring(0, s.length - singerName.length).trim(), singer: singerName };
        }
        if (s.startsWith(singerName) && s.length > singerName.length) {
            return { title: s.substring(singerName.length).trim(), singer: singerName };
        }
    }

    // 5. 尝试用最后的空格分割
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > 0) {
        return {
            title: s.substring(0, lastSpace).trim(),
            singer: s.substring(lastSpace + 1).trim(),
        };
    }

    // 6. 无法解析，返回整个字符串
    console.log(`  ⚠ 无法解析: "${part}" → "${s}"`);
    return { title: s, singer: '' };
}

// ========== 主流程 ==========
async function main() {
    // 从 .env 加载密钥
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    let serviceKey = '';
    for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
            serviceKey = t.split('=').slice(1).join('=').trim();
            break;
        }
    }

    const BASE = 'https://orphftlwdwuvoscizndx.supabase.co/rest/v1';
    const headers = {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    };

    // ===== 阶段1: 获取 B站 数据 =====
    console.log('📡 获取 B站 视频信息...');
    const biliData = await fetchBiliAPI('BV1iP4y1D7Y2');
    const pages = biliData.data.pages;
    const videoTitle = biliData.data.title;
    console.log(`  标题: ${videoTitle}`);
    console.log(`  分P数: ${pages.length}\n`);

    const BVID = 'BV1iP4y1D7Y2';
    const VIDEO_URL = `https://www.bilibili.com/video/${BVID}/`;

    // ===== 阶段2: 插入歌曲 =====
    console.log('📝 插入歌曲到 Supabase...\n');
    let insertedSongs = [];
    let skipped = 0;
    let failed = 0;

    for (const p of pages) {
        const { title, singer } = parsePart(p.part);

        const body = {
            title: title,
            singer: singer,
            bilibili_url: `${VIDEO_URL}?p=${p.page}`,
            bvid: BVID,
            page: p.page,
            start_seconds: null,
            end_seconds: null,
            duration_seconds: p.duration,
            cover_url: p.first_frame || '',
        };

        try {
            const resp = await fetch(`${BASE}/songs`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (resp.ok) {
                const data = await resp.json();
                const songId = data[0]?.id;
                insertedSongs.push({ id: songId, title, singer });
                if (insertedSongs.length <= 5 || insertedSongs.length % 20 === 0) {
                    console.log(`  ✓ [${insertedSongs.length}] #${songId} ${title} - ${singer} (${p.duration}s)`);
                }
            } else if (resp.status === 409) {
                console.log(`  ⏭ 重复: ${title} - ${singer}`);
                skipped++;
            } else {
                const errText = await resp.text();
                console.log(`  ✗ 失败: ${title} - ${singer}: ${errText.slice(0, 100)}`);
                failed++;
            }
        } catch (err) {
            console.log(`  ✗ 网络错误: ${title} - ${singer}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n📊 歌曲插入完成: ${insertedSongs.length} 首新增, ${skipped} 首重复跳过, ${failed} 首失败\n`);

    if (insertedSongs.length === 0) {
        console.log('没有新歌曲需要打标签，退出。');
        return;
    }

    // ===== 阶段3: 打标签 =====
    console.log('🏷️  为新歌曲打标签...\n');
    const tagHeaders = {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    };

    let tagInserted = 0;
    let tagSkipped = 0;

    for (const song of insertedSongs) {
        const tagSet = new Set();

        // 按歌手匹配
        for (const singerName of Object.keys(SINGER_TAGS)) {
            const singerLower = song.singer.toLowerCase();
            const nameLower = singerName.toLowerCase();
            if (singerLower.includes(nameLower) || nameLower.includes(singerLower)) {
                SINGER_TAGS[singerName].forEach(t => tagSet.add(t));
            }
        }

        // 按歌名关键词匹配
        for (const { kw, tags } of TITLE_KEYWORDS) {
            if (song.title.toLowerCase().includes(kw.toLowerCase())) {
                tags.forEach(t => tagSet.add(t));
            }
        }

        // 所有 8090 榜单歌曲默认加「热门」
        if (tagSet.size === 0) {
            tagSet.add('热门');
        }
        // 所有这个榜单的歌都是8090经典
        tagSet.add('8090');
        tagSet.add('经典');

        // 插入 song_tags
        for (const tagName of tagSet) {
            const tagId = TAG_IDS[tagName];
            if (!tagId) {
                console.log(`  ⚠ 未知标签: ${tagName} (song: ${song.title})`);
                continue;
            }

            try {
                const resp = await fetch(`${BASE}/song_tags`, {
                    method: 'POST',
                    headers: tagHeaders,
                    body: JSON.stringify({ song_id: song.id, tag_id: tagId }),
                });
                if (resp.ok) {
                    tagInserted++;
                } else if (resp.status === 409) {
                    tagSkipped++;
                } else {
                    const err = await resp.text();
                    console.log(`  ✗ ${song.title} -> ${tagName}: ${err.slice(0, 80)}`);
                }
            } catch (err) {
                console.log(`  ✗ ${song.title} -> ${tagName}: ${err.message}`);
            }
        }
    }

    console.log(`\n✅ 全部完成！`);
    console.log(`   歌曲: ${insertedSongs.length} 首新增`);
    console.log(`   标签: ${tagInserted} 个新增, ${tagSkipped} 个重复跳过`);
}

// ========== B站 API 请求 ==========
function fetchBiliAPI(bvid) {
    return new Promise((resolve, reject) => {
        const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/',
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.code !== 0) {
                        reject(new Error(`B站 API 返回 code=${json.code}: ${json.message}`));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`JSON 解析失败: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
