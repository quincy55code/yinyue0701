### Task 9: 全功能测试与微调

- [ ] **Step 1: 启动服务器**

```bash
/d/softwa/nodejs/node server.js
```

- [ ] **Step 2: 测试博客 CRUD**
  1. 访问首页 → 看到动态流
  2. 登录管理员账号（lexiaode@163.com 或 quincy55@163.com）
  3. 侧边栏点击"听歌笔记" → "写新文章"
  4. 填写标题、正文（Markdown）、标签（回车添加）
  5. 保存草稿 → 确认 Toast "草稿已保存"
  6. 发布文章 → Toast "文章已发布"
  7. 回到首页 → 看到新文章出现在动态流
  8. 点击文章 → 进入详情页 → Markdown 渲染正确
  9. 点击编辑 → 修改内容 → 重新发布
  10. 删除文章 → 确认后 Toast "已删除"

- [ ] **Step 3: 测试每日推荐**
  1. 编辑器中勾选"设为每日推荐"
  2. 搜索并选择一首歌（按 ID 或歌名）
  3. 发布 → 首页看到紫色边框 + 📌 标记的每日推荐卡片
  4. 点击每日推荐 → 播放该歌曲

- [ ] **Step 4: 测试短评**
  1. 播放一首歌 → 点击歌词按钮 → 打开歌词面板
  2. 歌词面板底部看到短评区域 + 输入框 + 评分选择器
  3. 选择评分（点击星星）→ 输入短评
  4. 发表 → Toast "短评已发表"
  5. 确认短评在面板中显示
  6. 侧边栏"歌曲短评"→ 进入汇总页 → 确认短评可见
  7. 回到首页 → 如果是管理员短评，出现在动态流

- [ ] **Step 5: 回归测试 — 确认现有功能不受影响**
  1. 播放/暂停/上一首/下一首：正常
  2. 收藏/取消收藏：正常
  3. 创建/重命名/删除歌单：正常
  4. 歌曲汇总导航：正常
  5. 搜索：正常
  6. 歌词同步/偏移调整：正常
  7. 沉浸式 Now Playing：正常
  8. 登录/退出/修改用户名/头像：正常
  9. 意见反馈：正常
  10. 平板抽屉（FAB）：正常

- [ ] **Step 6: 修复发现的问题并最终提交**

```bash
git add -A
git commit -m "fix: 测试发现的 bug 修复"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ `notes` 表 DDL → Task 1
- ✅ `reviews` 表 DDL → Task 1
- ✅ `/api/feed` 动态流 → Task 3
- ✅ `/api/notes` CRUD → Task 2
- ✅ `/api/reviews` CRUD → Task 3
- ✅ 首页动态流 → Task 5
- ✅ 博客列表/详情/编辑器 → Task 6
- ✅ 短评系统（歌词面板+汇总页） → Task 7
- ✅ 每日推荐 → Task 8
- ✅ Markdown 渲染 → Task 4/5
- ✅ 侧边栏新按钮 → Task 4/5
- ✅ 保留所有现有功能 → Task 9

**2. Placeholder scan:**
- ✅ 无 TBD/TODO/fill-in-later
- ✅ 所有代码块是完整实现（或引用设计文档中的完整代码）

**3. Type consistency:**
- ✅ `navigateToNotes()` vs `navigateToNote(id)` — 命名一致
- ✅ `_feedCache` 在多个位置被正确清除（navigateHome、after-publish）
- ✅ `loadReviewsForSong(songId)` 调用签名一致
