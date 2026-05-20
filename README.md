# 3D iBMS — 智慧建築監控管理平台

> AI-DT Enterprise · 3D 數位孿生 × 智慧設施管理

即時 3D 場景監控、AI 根因分析、BIM 整合、能源管理與工單維運的全方位智慧建築管理平台。

---

## 功能概覽

### 佈局
- **AppShell**：64px Navbar（KPI 列 + 時鐘 + 連線狀態）+ 可折疊左側邊欄
- **側邊欄 5 大分類**：監控 / 空間視覺 / 數據分析 / 維運管理 / 系統

### 監控
| 功能 | 說明 |
|------|------|
| 3D 場景 | Three.js 即時設備狀態視覺化，支援飛越相機、脈衝環、粒子流 |
| 設備詳情 | 側拉抽屜，顯示功率、溫度、AI 異常分數、歷史趨勢 |
| 設備清單 | 表格檢視，支援篩選、排序、設備履歷跳轉 |
| 全域搜尋 | `Ctrl+K` 快速搜尋設備與告警 |
| 告警中心 | 分級告警管理（CRITICAL / ALARM / WARNING / INFO） |
| 即時跑馬燈 | 底部告警無縫捲動，速度可調 |

### AI 功能
| 功能 | 說明 |
|------|------|
| AI 根因分析 | CRITICAL 告警自動呼叫 Claude API 產生根因說明 |
| 自然語言查詢 | 輸入中文查詢設備狀態、告警、能源 |
| AI 需量卸載 | 超過契約警戒線時，AI 自動建議卸載方案 |

### 空間視覺
- **BIM 視圖**：IFC 模型載入、設備定位、元件高亮
- **模型管理**：多棟 IFC 模型切換與可見性控制
- **KG 瀏覽器**：設備知識圖譜拓撲視覺化
- **樓層熱力圖**：2D 俯視告警 / 功率 / RUL 熱力疊加

### 數據分析
- **OEE 效率儀表板**：可用率、效率、品質三率趨勢
- **趨勢比較**：多設備歷史數據疊加對比
- **能源報表**：日/月用電、電費試算、峰谷分析、Excel/PDF 匯出

### 維運管理
- **工單中心**：CRUD、狀態追蹤（待指派 → 處理中 → 完成）
- **維護日曆**：月曆視圖，工單排程視覺化
- **需量卸載**：AI 卸載計畫面板（需後端連線）
- **規則引擎**：自訂告警規則，支援 AND/OR 條件

### 系統
- **儀表板個人化**：KPI 顯示項目開關、左右面板切換
- **稽核日誌**：操作歷史查詢（需後端連線）
- **系統設定**：能源參數、告警音效、桌面推播、Webhook 推送、Claude API 金鑰
- **設備履歷護照**：設備完整生命週期記錄

---

## 技術棧

**前端**
- React 18 + TypeScript + Vite 5
- Three.js / `@react-three/fiber` — 3D 場景
- `@thatopen/components` + `web-ifc` — IFC / BIM 解析
- ECharts 5 (`echarts-for-react`) — 圖表
- framer-motion — 動畫
- `@xyflow/react` — 知識圖譜
- Anthropic SDK — Claude AI 整合

**後端**（選配）
- Python 3.x + FastAPI + Uvicorn
- WebSocket 即時資料推送
- 模擬 IoT 資料產生器

---

## 快速開始

### 前端

```bash
# 安裝依賴
npm install

# 啟動開發伺服器（port 5173）
npm run dev

# 建置
npm run build
```

### 後端（選配，啟用後切換為 LIVE 模式）

```bash
cd backend
pip install -r requirements.txt
python main.py
# 或 Windows：
start.bat
```

後端預設監聽 `http://localhost:8000`，前端自動偵測連線狀態（Navbar 右側顯示 `LIVE · Backend` / `SIM · Frontend`）。

### BIM 模型（選配）

將 `.ifc` 檔案放置於專案根目錄，dev server 會自動透過 `/ifc/<檔名>` 提供服務。

---

## 專案結構

```
├── src/
│   ├── App.tsx                    # 主入口，狀態管理、佈局
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx       # Navbar + Sidebar 佈局框架
│   │   │   ├── LeftPanel.tsx      # 左側資料面板
│   │   │   ├── RightPanel.tsx     # 右側告警面板
│   │   │   └── BottomAlarmTicker.tsx  # 底部告警跑馬燈
│   │   ├── scene3d/               # Three.js 3D 場景元件
│   │   ├── charts/                # ECharts 圖表元件
│   │   └── ui/                    # 功能 Overlay 元件（20+）
│   ├── hooks/
│   │   ├── useBackendWS.ts        # WebSocket 資料連線
│   │   ├── useSystemSettings.ts   # 系統設定持久化
│   │   ├── useAlertRules.ts       # 規則引擎
│   │   └── useSimulation.ts       # 前端模擬資料
│   ├── data/mockData.ts           # 模擬設備與告警資料
│   └── types/index.ts             # TypeScript 型別定義
├── backend/                       # FastAPI 後端
├── public/                        # WASM 靜態資源
└── vite.config.ts
```

---

## 環境需求

- Node.js 18+
- Python 3.10+（後端選配）
- 建議螢幕寬度 1366px 以上

---

## License

MIT
