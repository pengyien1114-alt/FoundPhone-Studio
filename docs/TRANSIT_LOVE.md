# 換乘戀愛：第一階段

故事來源為 `stories/template/story.json`。原手機鎖屏、桌面、49 個 App 與操作方式保留。密碼為 **0112**。

遊玩順序：備忘錄「01｜入住前的秘密備忘錄」→ X 第一天 → Safari 的 theqoo → KakaoTalk「合宿節目組」。點訊息泡泡觸發選項。三次互動後，可先閱讀各 App 更新與備忘錄心意紀錄，再點「結束第一天」。結束畫面可重新開始。

初始設定選七位男嘉賓中的六位、其中一位前任 X、是否後期登場、分手原因與復合傾向；換乘為互補百分比。女嘉賓是玩家與尹書妍、韓知恩、宋夏琳、崔有真、白恩彩。其餘五位男嘉賓依選擇順序與五位女嘉賓配對，私密名單與固定人物資料保存在備忘錄。X 若為鯰魚，首日五男六女，完整陣容仍為六男六女；寄給 X 的心意交節目組保管。未選的第七位不會進入劇情。全員無照片，男嘉賓選擇僅呈現姓名。所有戀愛經歷均為虛構。

三次選擇（晚餐、讀信、匿名心意）各有三種方向，共 27 條第一天路徑。復合變化依序為 ±15、±10、±20（或 0），總值限制於 0–100，換乘始終等於 100 減復合。theqoo 是遊戲內模擬，觀眾只評論鏡頭呈現的表現，不讀取分手原因、前任名單或匿名訊息全文。

必要的既有程式擴充：原備忘錄詳情可根據 `meta.profileForm` 顯示設定表單；資料保存在既有 Runtime.ui / IndexedDB。一般備忘錄不受影響。文字中的 `{{player}}` 等欄位經純文字替換，使用原 React 呈現，不執行 HTML 或腳本。事件、內容解鎖與選項仍使用原引擎。

驗證：

```sh
npm ci
npm run story:validate
npm run story:test
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npx playwright test --config playwright.transit.config.ts
```

GitHub Pages 沿用 `.github/workflows/pages.yml`。倉庫 Settings → Pages → Source 選 GitHub Actions，main 更新後自動驗證、建置並部署。預期網址為 https://pengyien1114-alt.github.io/FoundPhone-Studio/ 。實際部署是否完成以 Actions 的 Deploy 狀態為準。

存檔只存在當前瀏覽器。第一階段止於第一晚，第二天與鯰魚正式登場劇情尚未製作。行動視窗自動化不等同實體 iPhone Safari 測試。

本次驗證結果：故事校驗、27 條劇情路徑、TypeScript、ESLint、62 項單元測試、正式建置通過；2 項行動視窗故事流程與 8 項原手機回歸通過（離線回歸已調整為讀取作品密碼）。未使用實體 iPhone 驗證。

本次遠端限制：GitHub 連接工具與已登入的 gh CLI 寫入 Git tree 均回傳 `403 Resource not accessible by integration`，因此未能提交至遠端或部署。預期 Pages 網址當時為 404。請先在 ChatGPT 的 GitHub 連接與 GitHub Installed Apps 設定確認此倉庫可寫入；若授權範圍仍不足，重新連接具寫入能力的 GitHub 授權。這是 GitHub 授權問題，不需提供任何 token 或密碼。
