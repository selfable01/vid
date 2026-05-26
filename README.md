# AI 影片生成工作流程

自動將 YouTube 或 Instagram 影片轉換為 Seedance 2.0 AI 生成影片的完整工作流程。系統使用 Gemini 分析原始影片，生成詳細的場景提示詞，再透過 Seedance 2.0 生成全新影片，最後合併為完整作品。

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
├── n8n_seedance_manual_4prompt_workflow.json  ← 手動4段提示詞工作流程
├── n8n_seedance_extend_workflow.json          ← 自動延伸生成工作流程
├── seedance2-workflow.js                      ← Seedance 2.0 管線（n8n SDK 版）
├── combine_videos.bat                         ← 合併影片腳本
├── video/                                     ← 放置下載的 MP4 片段
└── temp/                                      ← 合併後的成品輸出位置
```

---

## 🗂️ Google 試算表欄位說明

在試算表第一列建立以下欄位標題：

| 欄位 | 說明 |
|------|------|
| `source_url` | 輸入的 YouTube 或 Instagram 網址（觸發條件） |
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

### 方法一：手動 4 段提示詞工作流程（推薦）

此工作流程會生成 4 段提示詞，由你手動貼入 Seedance 生成影片。

**步驟：**

1. **匯入工作流程**
   - 在 n8n 開啟工作流程連結
   - 確認 Google Sheets 及 Gemini API 金鑰已設定完成

2. **輸入影片網址**
   - 開啟 [Google 試算表](https://docs.google.com/spreadsheets/d/1wIh6AcVKWvef4NANk_c5a9jRiZ5gxrnBSHKdDB1yfc0/edit?gid=0#gid=0)
   - 在 `source_url` 欄位新增一列，貼上 YouTube 或 Instagram 網址
   - 工作流程每分鐘自動偵測新增列並執行

3. **等待提示詞生成**
   - Gemini 會分析原始影片並生成 4 段詳細提示詞
   - 完成後試算表會自動填入 `section_1_prompt` 至 `section_4_prompt`

4. **在 Seedance 生成影片**

   | 段落 | 操作方式 |
   |------|---------|
   | **第 1 段** | 進入 Seedance → 選擇「文字生影片」→ 貼上 `section_1_prompt` → 生成並下載 MP4 |
   | **第 2 段** | 進入 Seedance → 上傳第 1 段完整影片作為參考 → 貼上 `section_2_prompt` → 生成並下載 MP4 |
   | **第 3 段** | 進入 Seedance → 上傳第 2 段完整影片作為參考 → 貼上 `section_3_prompt` → 生成並下載 MP4 |
   | **第 4 段** | 進入 Seedance → 上傳第 3 段完整影片作為參考 → 貼上 `section_4_prompt` → 生成並下載 MP4 |

5. **合併影片**（見下方說明）

---

### 方法二：自動延伸生成工作流程

此工作流程透過 Seedance API 全自動生成 4 段影片，無需手動操作 Seedance。

**步驟：**

1. 在試算表 `source_url` 欄位新增 YouTube 或 Instagram 網址
2. 工作流程自動：
   - 分析原始影片
   - 生成 4 段提示詞
   - 依序呼叫 Seedance API 生成每段影片
   - 將影片連結寫回試算表
3. 從試算表複製 `clip_1_url` 至 `clip_4_url` 的連結，下載各段 MP4
4. 合併影片（見下方說明）

---

## 🎬 合併影片

完成所有片段下載後，使用 `combine_videos.bat` 合併成完整影片。

**步驟：**

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

> **注意：** 腳本會自動建立 `temp/` 資料夾，無需手動建立。若未指定輸出名稱，預設為 `combined_output.mp4`。

---

## ⚙️ 提示詞設計原則

所有提示詞均遵循以下規則：

- **雙角色一致性**：東亞外貌的一男一女，髮型、服裝、膚色在每段保持完全一致
- **10 秒動態內容**：每段提示詞描述完整的開始、中間、結尾動作序列，填滿 10 秒
- **角色與鏡頭同步移動**：兩位角色皆需在畫面中移動，鏡頭也需有推進、拉遠、橫移或上升等動態
- **忠實還原原始場景**：地點、光線、色調與原始影片保持一致
- **無對話無字幕**：所有情感透過動作與表情傳達
- **每段鏡頭語言不同**：4 段分別使用不同的鏡頭運動方式，不重複

---

## 🔧 環境需求

| 工具 | 用途 |
|------|------|
| [n8n](https://n8n.io) | 自動化工作流程平台 |
| [Gemini API](https://aistudio.google.com/app/apikey) | 影片分析與提示詞生成 |
| [Seedance 2.0](https://seedance.ai) | AI 影片生成 |
| [FFmpeg](https://ffmpeg.org) | 影片合併（已內建於 .bat 腳本） |
| Google Sheets | 輸入網址與儲存結果 |

---

## ❗ 常見錯誤

| 錯誤 | 原因 | 解決方式 |
|------|------|---------|
| `403 Forbidden` | API 金鑰無效或過期 | 至 Google AI Studio 重新產生 Gemini 金鑰 |
| `503 Service Unavailable` | Gemini 伺服器暫時過載 | 工作流程會自動重試 4 次，每次間隔 10 秒 |
| 提示詞欄位空白 | Gemini 回應解析失敗 | 檢查 `error` 欄位的錯誤訊息 |
| 影片合併失敗 | FFmpeg 路徑錯誤 | 確認 `combine_videos.bat` 內的 FFmpeg 路徑正確 |
