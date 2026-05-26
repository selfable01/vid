# AI 影片生成工作流程

使用 n8n + Gemini 分析 YouTube 或 Instagram 影片，自動生成 4 段詳細的 Seedance 2.0 提示詞，再由你手動貼入 Seedance 生成影片，最後合併為完整作品。

---

## 🔗 重要連結

| 工具 | 連結 |
|------|------|
| **n8n 工作流程** | [開啟 n8n](https://threezebra.app.n8n.cloud/workflow/v6q9VUy6kXGbGi2o?projectId=pQgjgsAaINoKvWYN) |
| **Google 試算表** | [開啟試算表](https://docs.google.com/spreadsheets/d/1wIh6AcVKWvef4NANk_c5a9jRiZ5gxrnBSHKdDB1yfc0/edit?gid=0#gid=0) |

---

## 📁 專案結構

```
vid-generator/
├── n8n_seedance_manual_4prompt_workflow.json  ← 主要工作流程（匯入 n8n 使用）
├── seedance2-workflow.js                      ← 工作流程原始碼（n8n SDK 版）
├── combine_videos.bat                         ← 合併影片腳本
├── fetch_youtube_data.js                      ← YouTube 資料抓取輔助腳本
├── webapp/                                    ← 網頁應用程式
├── video/                                     ← 放置下載的 MP4 片段
└── temp/                                      ← 合併後的成品輸出位置
```

---

## 🗂️ Google 試算表欄位說明

在試算表第一列建立以下欄位標題：

| 欄位 | 說明 |
|------|------|
| `source_url` | 輸入的 YouTube 或 Instagram 網址（觸發條件，唯一需要手動填寫的欄位） |
| `video_title` | 自動抓取的影片標題 |
| `status` | 執行狀態，例如 `prompts_ready`、`error` |
| `video_analysis` | Gemini 分析原始影片的摘要 |
| `character_description` | 兩位角色的外觀描述（全程一致） |
| `global_style` | 影片整體視覺風格 |
| `section_1_mode` | 第1段使用方式說明 |
| `section_1_prompt` | 第1段提示詞（直接貼入 Seedance，文字生影片） |
| `section_2_mode` | 第2段使用方式說明 |
| `section_2_prompt` | 第2段提示詞（搭配第1段影片作為參考） |
| `section_3_mode` | 第3段使用方式說明 |
| `section_3_prompt` | 第3段提示詞（搭配第2段影片作為參考） |
| `section_4_mode` | 第4段使用方式說明 |
| `section_4_prompt` | 第4段提示詞（搭配第3段影片作為參考） |
| `instructions` | 使用步驟說明 |
| `debug_method` | 分析方式：`VIDEO_UPLOADED`、`MULTI_THUMBNAIL` 或 `TEXT_ONLY` |
| `completed_at` | 完成時間戳記 |
| `error` | 錯誤訊息（成功時為空白） |

---

## 🚀 使用流程

### 步驟一：輸入影片網址

1. 開啟 [Google 試算表](https://docs.google.com/spreadsheets/d/1wIh6AcVKWvef4NANk_c5a9jRiZ5gxrnBSHKdDB1yfc0/edit?gid=0#gid=0)
2. 在新的一列的 `source_url` 欄位貼上 YouTube 或 Instagram 網址
3. 工作流程每分鐘自動偵測新增列並執行

### 步驟二：等待提示詞生成

- Gemini 會分析原始影片（上傳影片或使用縮圖）
- 完成後試算表自動填入 `section_1_prompt` 至 `section_4_prompt`
- 通常需要 1–3 分鐘

### 步驟三：在 Seedance 生成 4 段影片

| 段落 | 操作方式 |
|------|---------|
| **第 1 段** | 進入 Seedance → 選擇「文字生影片」→ 貼上 `section_1_prompt` → 生成並下載 MP4 |
| **第 2 段** | 進入 Seedance → 上傳第 1 段完整影片作為參考影片 → 貼上 `section_2_prompt` → 生成並下載 MP4 |
| **第 3 段** | 進入 Seedance → 上傳第 2 段完整影片作為參考影片 → 貼上 `section_3_prompt` → 生成並下載 MP4 |
| **第 4 段** | 進入 Seedance → 上傳第 3 段完整影片作為參考影片 → 貼上 `section_4_prompt` → 生成並下載 MP4 |

> **重要：** 第 2–4 段必須上傳**前一段的完整影片**作為參考，Seedance 才能保持角色和場景的一致性。

### 步驟四：合併影片

1. 將 4 段 MP4 檔案放入 `video/` 資料夾
2. 重新命名確保按順序排列：
   ```
   01_clip1.mp4
   02_clip2.mp4
   03_clip3.mp4
   04_clip4.mp4
   ```
3. 雙擊執行 `combine_videos.bat`，或在終端機輸入：
   ```
   combine_videos.bat 我的影片名稱
   ```
4. 合併完成的影片儲存於 `temp/` 資料夾

> **注意：** 腳本會自動建立 `temp/` 資料夾，無需手動建立。若未指定名稱，預設輸出為 `combined_output.mp4`。

---

## ⚙️ 提示詞設計原則

所有生成的提示詞均遵循以下規則：

- **雙角色**：東亞外貌的一男一女，髮型、服裝、膚色在 4 段中完全一致
- **連貫故事**：每段結尾直接銜接下一段開頭，4 段合起來是一個完整故事
- **10 秒動態內容**：每段描述完整的開始、中間、結尾動作序列，填滿 10 秒
- **角色與鏡頭同步移動**：兩位角色皆需在畫面中移動，鏡頭也需有推進、拉遠、橫移或上升等動態
- **忠實還原原始場景**：地點、光線、色調與原始影片保持一致，不憑空創造新場景
- **無對話無字幕**：所有情感透過動作與表情傳達
- **每段鏡頭語言不同**：4 段分別使用不同的鏡頭運動方式，不重複

---

## 🔧 環境需求

| 工具 | 用途 |
|------|------|
| [n8n](https://n8n.io) | 自動化工作流程平台 |
| [Gemini API](https://aistudio.google.com/app/apikey) | 影片分析與提示詞生成 |
| [Seedance 2.0](https://seedance.ai) | AI 影片生成（手動操作） |
| [FFmpeg](https://ffmpeg.org) | 影片合併（已內建於 .bat 腳本） |
| Google Sheets | 輸入網址與儲存結果 |

---

## ❗ 常見錯誤

| 錯誤 | 原因 | 解決方式 |
|------|------|---------|
| `403 Forbidden` | Gemini API 金鑰無效或過期 | 至 [Google AI Studio](https://aistudio.google.com/app/apikey) 重新產生金鑰並更新 n8n |
| `503 Service Unavailable` | Gemini 伺服器暫時過載 | 工作流程會自動重試 4 次，每次間隔 10 秒 |
| 提示詞欄位空白 | Gemini 回應解析失敗 | 檢查試算表 `error` 欄位的錯誤訊息 |
| 影片合併失敗 | FFmpeg 路徑錯誤 | 確認 `combine_videos.bat` 第 13 行的 FFmpeg 路徑正確 |
| 第 2–4 段角色不一致 | 未上傳前一段影片作為參考 | 確認每段都上傳了正確的參考影片 |
