# AI-First 企業整合智慧監控平台
## Web 中央監控 × BIM/DCIM × 派工巡檢 × EMS × AI 知識圖譜
### 完整企業平台規格書 v4.0

> **文件版本：** v4.0（整合企業完整平台規格書）
> **建立日期：** 2026-05
> **系統定位：** AI-First Digital Twin 企業智慧運維平台（AI-DT-Enterprise）
> **核心理念：** 單一平台、全域感知、知識驅動、預測運維

---

## 版本說明（v3.0 → v4.0 整合項目）

本文件 v4.0 在 v3.0（EMS × AI KG × 3D 數位孿生）基礎上，整合企業完整平台規格：

| 新增整合項目 | 核心能力 | 差異化價值 |
|------------|---------|-----------|
| **Web 中央監控 SCADA/BMS** | 全域設備監控、告警、控制、歷史趨勢 | 從 EMS 擴展至全設備類型 |
| **BIM/DCIM 3D 管理** | IFC/Revit 3D 定位、設備資訊、空間管理 | 三維空間語義知識圖譜 |
| **派工與巡檢（Work Order/Inspection）** | PM/CM 工單、QR 巡檢、APP 離線模式 | 維運閉環，KG 自動建單 |
| **圖資管理（DMS）** | CAD/IFC/施工日誌、版本管控 | 圖紙語義化存入 KG |
| **資產履歷（EAM/CMMS）** | 設備生命週期、維保記錄、RUL 預測 | 全生命週期知識圖譜 |
| **AI 知識圖譜深化** | GraphRAG 全平台根因、NL2Cypher 跨模組 | 統一語義大腦 |

**整合後的平台核心價值：**
```
傳統分散系統：
  SCADA 系統  → 看監控數值
  EMS 系統    → 看能耗報表
  CMMS 系統   → 管維修工單
  BIM 系統    → 看 3D 模型
  問題：四套系統、資料孤島、人工串聯、告警不知根因

本平台（AI 知識圖譜驅動）：
  IoT 告警觸發
  → 知識圖譜理解：「這是 A棟 3F 冰機，屬於 HVAC 系統，
                    影響需量 50 kW，上次維修在 3 個月前，
                    BIM 定位在 3F 機房西側，
                    負責工程師是陳大維」
  → AI 自動：根因分析 + 建立工單 + 派工通知 + BIM 3D 定位
  → 工程師 APP：掃 QR → 看 BIM 位置 → 維修 → 更新履歷
  → 閉環完成：KG 學習此次事件，下次更準確預測
```

---

## 目錄

1. [平台願景與系統定位](#1-平台願景與系統定位)
2. [AI 知識圖譜核心理念（全平台版）](#2-ai-知識圖譜核心理念)
3. [六層企業架構](#3-六層企業架構)
4. [核心功能模組規劃（全平台）](#4-核心功能模組規劃)
5. [企業知識圖譜 Schema](#5-企業知識圖譜-schema)
6. [向量資料庫與語義搜尋](#6-向量資料庫與語義搜尋)
7. [OT 系統整合架構](#7-ot-系統整合架構)
8. [資料模型與演算法](#8-資料模型與演算法)
9. [API 設計規範（全平台）](#9-api-設計規範)
10. [UI/UX 設計規範（戰情中心版）](#10-uiux-設計規範)
11. [GraphRAG 全平台根因分析](#11-graphrag-全平台根因分析)
12. [各模組程式碼範例](#12-各模組程式碼範例)
13. [測試策略與案例](#13-測試策略與案例)
14. [部署設計](#14-部署設計)
15. [開發流程與排程（五階段）](#15-開發流程與排程)
16. [文案與風格規範](#16-文案與風格規範)
17. [風險與注意事項](#17-風險與注意事項)
18. [後續擴充建議](#18-後續擴充建議)

---

## 1. 平台願景與系統定位

### 1.1 平台願景

建立**單一平台**整合企業全域智慧運維能力，以 **AI 知識圖譜為神經中樞**，驅動所有模組協同運作：

```
┌──────────────────────────────────────────────────────────────┐
│              AI-First Digital Twin 企業智慧運維平台           │
├──────────────────────────────────────────────────────────────┤
│  Web 中央監控    │  EMS 能源管理   │  BIM/DCIM 3D 管理       │
│  SCADA/BMS 全域  │  需量/碳排/電費  │  IFC/Revit/空間語義     │
├──────────────────────────────────────────────────────────────┤
│  派工與巡檢      │  圖資管理       │  資產履歷（EAM/CMMS）    │
│  PM/CM/AI派工    │  CAD/IFC/施工誌 │  生命週期/預測維護       │
├──────────────────────────────────────────────────────────────┤
│                  AI 知識圖譜（Neo4j）神經中樞                 │
│  GraphRAG 根因 │ NL2Cypher 查詢 │ GDS 隱藏關聯 │ 向量語義    │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 專案背景

| 項目 | 說明 |
|------|------|
| **平台名稱** | AI-First Digital Twin 企業智慧運維平台（AI-DT-Enterprise） |
| **系統類型** | Web 中央監控 + EMS + BIM/DCIM + 派工巡檢 + 圖資 + EAM/CMMS |
| **使用場景** | 辦公大樓、工廠、校園、資料中心、智慧園區 |
| **主要使用者** | 監控操作員、維修工程師、能源管理員、廠務主管、系統管理員 |
| **業務目標** | 設備停機減少 70%、節能 15–20%、維護效率提升 50%、超約風險 99% 降低 |
| **目前痛點** | 多套分散系統、資料孤島、告警不知根因、工單人工建立、巡檢紙本化 |
| **預期成果** | 單一平台統一管理 + AI 自動根因 + KG 驅動派工 + BIM 3D 定位維修 |

### 1.3 角色權限矩陣（企業全平台）

| 角色 | 3D/BIM | SCADA 控制 | EMS 需量 | 工單派工 | 巡檢 | KG 查詢 | 圖資 | 報表 | 系統設定 |
|------|--------|-----------|---------|---------|------|---------|------|------|---------|
| 觀察員 | 唯讀 | ✗ | ✗ | 唯讀 | ✗ | 唯讀 | 唯讀 | ✓ | ✗ |
| 操作員 | 唯讀 | 確認告警 | 手動控制 | 確認工單 | 執行 | 唯讀 | 唯讀 | ✓ | ✗ |
| 工程師 | 唯讀 | 全部 | 全部 | 建立/編輯 | 全部 | 讀寫 | 讀寫 | ✓ | 設備資料 |
| 主管 | 全部 | 全部 | 全部 | 全部 | 全部 | 讀寫 | 讀寫 | ✓ | 部分 |
| 系統管理員 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | 全部 | ✓ | 全部 |

### 1.4 競品差異化定位

| 功能 | 本平台 | Schneider EcoStruxure | IBM Maximo | 台灣本土 |
|------|-------|----------------------|------------|---------|
| Web 中央監控 SCADA | ✓ | ✓ | △ | ✓ |
| EMS 需量控制（MPC） | ✓ 預測式 | ✓ 基礎 | ✗ | ✓ 基礎 |
| BIM/DCIM 3D 管理 | ✓ Three.js+IFC | △ 2D | ✗ | ✗ |
| 派工巡檢（APP） | ✓ Flutter | ✓ | ✓ | △ |
| 圖資管理（DMS） | ✓ | △ | △ | △ |
| EAM/CMMS 資產履歷 | ✓ | ✓ | ✓ | △ |
| **AI 知識圖譜（GraphRAG）** | ✓ **獨家** | ✗ | ✗ | ✗ |
| **NL2Cypher 自然語言** | ✓ **獨家** | ✗ | ✗ | ✗ |
| **BIM × KG 語義整合** | ✓ **獨家** | ✗ | ✗ | ✗ |
| **IoT 告警 → KG → 自動派工** | ✓ **獨家** | ✗ | △ | ✗ |
| 中文化 | 完整 | 部分 | 部分 | 完整 |
| 整合程度 | **單一平台** | 多套整合 | 多套整合 | 分散 |

---

## 2. AI 知識圖譜核心理念

### 2.1 企業資料的三層演進

```
階段一：Data（孤立在各系統的數據點）
  SCADA：AHU-3F 溫度 26°C
  EMS：需量 875 kW
  CMMS：工單 #1023 待派工
  BIM：設備 ID 3F-AHU-01
  問題：四套系統，人工串聯，效率低落

                    + Relationships（加入跨系統關聯）
                           ↓

階段二：Graph（跨系統動態語境）
  [AHU-3F-01] ──monitors──> [溫度感測器 26°C]
  [AHU-3F-01] ──located_in──> [3F BIM 空間]
  [AHU-3F-01] ──affects_demand──> [主電表 875 kW]
  [AHU-3F-01] ──has_workorder──> [工單 #1023]

                  + Organizing Principle（加入本體語義）
                           ↓

階段三：Enterprise Knowledge Graph（企業深層動態語境）
  一個設備節點連結：
  • 空間位置（BIM 座標 + 樓層 + 系統）
  • 能源消耗（即時功率 + 費率時段 + 需量影響）
  • 維修歷史（歷次工單 + 維修人員 + 零件更換）
  • 圖紙資料（設備圖紙 ID + 施工日誌）
  • 巡檢記錄（最後巡檢時間 + 異常照片）
  • AI 預測（剩餘壽命 RUL + 異常分數）
  → AI 主動：根因分析 + 自動建工單 + BIM 定位 + 派工通知
```

### 2.2 知識圖譜驅動的維運閉環

```
IoT 告警觸發
      ↓
  BIM 設備閃爍（3D 定位）
      ↓
  AI GraphRAG 根因分析
  ├── 分析歷次維修記錄（KG 時序關係）
  ├── 關聯相似故障案例（Vector 語義搜尋）
  ├── 估算影響範圍（需量 / 空調 / 生產）
  └── 建議最佳處置方案
      ↓
  自動建立工單（CM 工單 + BIM 定位連結）
      ↓
  AI 派工（依 KG：技能匹配 + 地理位置 + 工作負荷）
      ↓
  工程師 APP 接收（BIM 3D 定位 + 維修手冊 KG 搜尋）
      ↓
  現場執行（QR 掃描 + 拍照 + 量測記錄）
      ↓
  完工回報（更新設備履歷 + KG 學習此事件）
      ↓
  閉環完成（下次更準確預測 + 預防性維護排程）
```

### 2.3 六大資料型態在企業平台的應用

| 資料類型 | 企業 EAM/BIM 對應場景 | 建議儲存 |
|---------|-------------------|---------|
| **小型寬數據** | 設備 ↔ 感測器 ↔ 工單一對多 | Neo4j |
| **複雜數據** | 多系統交叉影響（HVAC × 電力 × 生產）| Neo4j 圖遍歷 |
| **階層遞迴數據** | Site→Building→Floor→Space→Asset→Part | Neo4j 遞迴查詢 |
| **傳統數據** | 舊 CMMS 工單歷史、ERP 設備台帳 | 防腐層 ACL 橋接 |
| **凍結數據** | 歷史時序感測、竣工 IFC 文件 | InfluxDB + MinIO |
| **隱藏數據** | 設備故障相似模式、跨系統潛在影響 | GraphRAG + GDS |

---

## 3. 六層企業架構

### 3.1 完整六層架構圖

```
┌────────────────────────────────────────────────────────────────────┐
│  Layer 01  │  現場設備 / OT 層                                     │
│            │  電表、水表、空調、消防、UPS、門禁、車辨、CCTV、PLC    │
│            │  協定：Modbus TCP/RTU, BACnet/IP, OPC UA, MQTT,       │
│            │         KNX, RTSP（影像串流）                          │
├────────────────────────────────────────────────────────────────────┤
│  Layer 02  │  Gateway 邊緣層                                        │
│            │  OT Gateway：協定轉換、資料清洗、Edge AI、Buffer       │
│            │  Neo4j 即時代理（每 60 秒更新設備節點狀態）            │
├────────────────────────────────────────────────────────────────────┤
│  Layer 03  │  Data 儲存層                                           │
│            │  PostgreSQL（設備主檔/工單/人員）                      │
│            │  TimescaleDB（時序感測/需量歷史）                      │
│            │  InfluxDB（高頻時序/每秒 IoT）                         │
│            │  MinIO（BIM 模型/圖紙/照片/報表）                     │
├────────────────────────────────────────────────────────────────────┤
│  Layer 04  │  Knowledge Graph 層（企業神經中樞）                    │
│            │  Neo4j Enterprise：設備 + 空間 + 能源 + 維修 + 圖紙   │
│            │  Neo4j Vector Index：HNSW 語義搜尋（1536 維）          │
│            │  Neo4j GDS：Node Similarity + Link Inference           │
├────────────────────────────────────────────────────────────────────┤
│  Layer 05  │  Service 應用服務層                                    │
│            │  EMS Engine │ SCADA Engine │ Alarm Engine             │
│            │  WorkOrder  │ Inspection  │ BIM Engine │ GIS          │
│            │  Auth       │ Report      │ AI Service │ GraphRAG     │
├────────────────────────────────────────────────────────────────────┤
│  Layer 06  │  Presentation 展示層                                   │
│  Web Portal│  戰情中心 Dashboard │ EMS Dashboard │ 中央監控 SCADA  │
│            │  BIM Viewer 3D │ DCIM │ 派工工單 │ 巡檢管理 │ 圖說    │
│  APP       │  Flutter APP：巡檢 / 派工 / BIM 定位 / 離線模式        │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 資料流架構（整合版）

```
                    ┌─── Layer 01: OT ───┐
  電表(Modbus)      │  空調(BACnet)       │  CCTV(RTSP)
  消防(Modbus)      │  UPS(SNMP)          │  門禁(API)
                    └────────┬───────────┘
                             │
                    ┌─── Layer 02: Gateway ───┐
                    │  協定橋接 + Tag Mapping  │
                    │  Edge AI 異常預篩        │
                    │  SQLite 斷線暫存         │
                    │  Neo4j 即時同步代理      │
                    └────────┬────────────────┘
                             │ MQTT / Kafka
              ┌──────────────┼──────────────────┐
              ↓              ↓                   ↓
         InfluxDB      PostgreSQL            Neo4j KG
         (時序數據)    (設備主檔/工單)      (語義知識)
              │              │                   │
              └──────────────┼───────────────────┘
                             │
                    ┌─── Layer 05: Services ───┐
                    │  SCADA / EMS / WorkOrder  │
                    │  BIM / Inspection / AI    │
                    └────────┬─────────────────┘
                             │ REST / WebSocket / SSE
                    ┌─── Layer 06: Presentation ──┐
                    │  Web Portal + Flutter APP    │
                    └─────────────────────────────┘
```

### 3.3 技術選型總表

| 層級 | 技術選型 | 版本 | 選型理由 |
|------|---------|------|---------|
| **3D BIM 渲染** | Three.js + IFC.js + React Three Fiber | IFC.js 0.0.36 | IFC 格式直接解析，Web 即時渲染 |
| **地理圖資** | Cesium.js（GIS / 園區地圖）| 1.x | 地理空間 3D，支援 3D Tiles |
| **前端框架** | React 18 + TypeScript + Vite | 18.x | 效能佳，生態完整 |
| **行動 APP** | Flutter | 3.x | 跨平台（iOS/Android），離線模式 |
| **EMS 圖表** | Apache ECharts | 5.x | 折線/Sankey/儀表圖，效能優異 |
| **後端框架** | Python FastAPI（AI）+ Node.js NestJS（API）| — | AI 推論 + 企業 REST API |
| **圖資料庫** | Neo4j Enterprise 5.x | 5.x | 原生圖、GraphRAG、內建向量索引 |
| **時序 DB** | InfluxDB 2.x（高頻）+ TimescaleDB（分析）| — | 兩者互補，高頻 + SQL 分析 |
| **關聯式 DB** | PostgreSQL 16 | 16 | 設備主檔/工單/人員/圖資 |
| **物件儲存** | MinIO（私有）/ S3（雲端）| — | BIM 模型/圖紙/照片 |
| **快取** | Redis Cluster 7.x | 7.x | 即時狀態快取、KG 查詢快取 |
| **訊息佇列** | Kafka 3.x（高吞吐）+ RabbitMQ（工單派工）| — | 兩者互補 |
| **IoT Broker** | EMQX 5.x | 5.x | 百萬連接，MQTT 5.0 |
| **GraphRAG** | Neo4j GraphRAG Python | 最新版 | 官方，直接對接 Neo4j |
| **LLM** | Claude 3.5 Sonnet + Llama 3.1（本地）| — | 企業敏感資料用本地 |
| **嵌入模型** | text-embedding-3-large | 1536 維 | 多語言，設備/圖紙/工單語義 |
| **部署** | Kubernetes + Helm | 1.28+ | 企業級，高可用，HPA |
| **監控** | Prometheus + Grafana LGTM Stack | — | 全鏈路可觀測性 |
| **密鑰管理** | HashiCorp Vault | — | 工業安全標準 |

---

## 4. 核心功能模組規劃

### 4.1 Module 01：Web 中央監控（SCADA/BMS）

```
即時監控（Real-Time Monitoring）：
  ├── 全域設備監控儀表板
  │   ├── 設備狀態燈號（正常/警示/嚴重/離線）
  │   ├── 即時數據卡片（電壓 V / 電流 A / 功率 kW / 溫度 °C）
  │   └── 設備樹狀列表（Site→Building→Floor→System→Device）
  │       → 對應 Neo4j KG 節點，點擊開啟知識卡片
  ├── 歷史趨勢查詢
  │   ├── 時間範圍篩選（今日/昨日/本週/自訂）
  │   ├── 多設備數據對比圖表（ECharts）
  │   └── 匯出 CSV / Excel
  └── 設備遠端控制
      ├── 空調開關 / 溫度設定
      ├── 照明開關 / 調光
      ├── UPS 切換 / 測試
      └── 控制日誌（寫入 Neo4j Person-CONTROLLED-Device）

通訊協定支援：
  ├── Modbus TCP/RTU（電表、PLC、UPS）
  ├── BACnet/IP、BACnet MSTP（空調、BMS）
  ├── OPC UA（工業設備）
  ├── MQTT（IoT 感測器、門禁）
  ├── KNX（照明、遮陽）
  └── RTSP（CCTV 影像串流整合）

SCADA 告警引擎：
  ├── 狀態型（設備離線、通訊中斷）
  ├── 閾值型（數值超標）
  ├── 趨勢型（異常增長/下降）
  └── AI 型（Isolation Forest 異常分數 > 閾值）
      → 觸發 Neo4j Alert 節點 + GraphRAG 根因 + 自動建工單
```

### 4.2 Module 02：EMS 能源管理

```
即時能耗監控：
  ├── KPI 儀表板（總用電 kW / 需量 / 碳排 / 節能率）
  ├── 需量管理（15 分鐘滑動視窗）
  │   ├── 即時需量計算 + 契約容量進度條
  │   ├── 需量預測（LSTM，未來 15/30 分鐘）
  │   └── 超約風險警示（80% / 90% / 95% / 100%）
  ├── 電費試算
  │   ├── 基本電費 + 流動電費 + 超約罰款
  │   ├── 費率時段（尖峰/半尖峰/離峰）
  │   └── Neo4j Tariff 節點整合費率計算
  └── 碳排管理
      ├── 範疇二碳排（Scope 2）：用電 × 電力排放係數
      └── ISO 50001 / ISO 14064 報表一鍵匯出

能源分析：
  ├── 能源基準線（Baseline）建模
  ├── 異常用電偵測（vs 基準線偏差）
  ├── 設備效率分析（COP / 效率劣化趨勢）
  └── 分類用電（照明 / 空調 / 動力 / 其他）Sankey 圖

再生能源 + 儲能：
  ├── 太陽能（PV）發電監控 + 自發自用率
  ├── 儲能（ESS）SOC 監控 + 套利策略
  └── EV 充電樁排程管理

AI 增強（KG 整合）：
  ├── GraphRAG 卸載建議（依 AFFECTS_DEMAND 關係鏈）
  ├── NL 查詢：「今日 A 棟空調花了多少電費？」
  └── AI 節能助理：主動分析電費異常原因
```

### 4.3 Module 03：BIM/DCIM 3D 管理

```
BIM 3D 視覺化（IFC.js + Three.js）：
  ├── IFC / Revit / GLTF 模型載入
  ├── 設備 3D 定位（scene_object_id → Neo4j KG 節點）
  ├── 即時數據疊加
  │   ├── 能源熱力圖（用電越高越紅）
  │   ├── 設備狀態 Shader（正常/警示/嚴重 Bloom 效果）
  │   └── 需量超約 Pulse Shader（紅色閃爍）
  ├── 能流動畫（Particle Flow 電力流動）
  ├── 空間分析
  │   ├── 樓層平面圖切換
  │   ├── 房間溫度/CO2 熱力圖
  │   └── 人員密度視覺化
  └── 點擊設備 → 企業知識卡片（含工單/能耗/維修歷史）

DCIM 資料中心管理：
  ├── 機櫃 3D 視覺化（U 位佔用率）
  ├── 電力 PUE 監控
  ├── 熱通道/冷通道溫度圖
  └── 機房設備容量規劃

BIM 與 KG 整合（核心價值）：
  ├── IFC 解析 → 自動建立 Neo4j 空間節點
  │   (IfcBuilding → Building, IfcSpace → Room, IfcElement → Device)
  ├── 設備座標（BIM xyz）存入 KG Device 節點
  ├── 工單連結 BIM 座標（工程師一鍵導航到現場）
  └── 圖紙版本 → KG Document 節點（圖紙歷史可追溯）

GIS 地理圖資（Cesium.js）：
  ├── 園區 / 多場域 3D 地圖
  ├── 建築物外部能源熱力圖
  └── 多廠區統一管理視角
```

### 4.4 Module 04：派工系統（Work Order）

```
工單類型：
  ├── PM（預防性維護）：KG 排程，依設備壽命/保養週期自動建單
  ├── CM（矯正性維護）：AI 告警 → GraphRAG 根因 → 自動建工單
  └── EM（緊急維護）：即時告警 → 快速派工 → SLA 計時

工單管理（Web）：
  ├── 工單建立（自動 / 手動）
  │   ├── 關聯 Neo4j Alert 節點（告警觸發）
  │   ├── BIM 定位連結（設備 3D 位置）
  │   └── AI 根因摘要自動填入
  ├── 工單追蹤（甘特圖 / 看板 Kanban）
  ├── 工單歷程（工程師 + 時間 + 動作）
  │   → 寫入 Neo4j WorkOrder 節點歷程關係
  └── KPI 統計（MTTR / MTBF / 完成率）

AI 派工（Smart Dispatch）：
  ├── KG 技能匹配（工程師專長 vs 設備類型）
  ├── 工作負荷平衡（目前派工數）
  ├── 地理位置最近（目前位置）
  └── 緊急程度加權（CRITICAL 優先派工）

工單與 KG 整合：
  WorkOrder 節點：{id, wo_number, type, status, priority,
                    estimated_hours, actual_hours, bim_location}
  關係：
  ├── (Alert)-[:TRIGGERS_WORKORDER]->(WorkOrder)
  ├── (WorkOrder)-[:FOR_ASSET]->(Device)
  ├── (Person)-[:ASSIGNED_TO]->(WorkOrder)
  └── (WorkOrder)-[:USES_PART]->(SparePart)
```

### 4.5 Module 05：巡檢系統（Inspection）

```
巡檢計畫管理：
  ├── 巡檢路線規劃（GIS 最優路線）
  ├── 巡檢週期設定（日/週/月）
  ├── 巡檢項目清單（KG 驅動，依設備類型自動生成）
  └── 異常觸發臨時巡檢

Flutter APP 巡檢功能：
  ├── QR Code 掃描（設備 QR → 開啟 KG 知識卡片）
  ├── GPS 定位確認（防止假巡檢）
  ├── 拍照記錄（MinIO 存儲，連結 Neo4j Document 節點）
  ├── 數值量測記錄（溫度/壓力/電壓輸入）
  ├── 電子簽章確認
  └── 離線模式（斷網可繼續，上線後自動同步）

BIM 輔助巡檢：
  ├── 手機掃 QR → 3D BIM 定位（設備在哪裡）
  ├── AR 疊加（顯示設備規格 + 巡檢歷史）
  └── 巡檢路線 BIM 導航

巡檢 × KG 整合：
  ├── 巡檢結果寫入 Neo4j Inspection 節點
  ├── 異常值 → 自動建立 Alert → 觸發 CM 工單
  └── 巡檢歷史 → 設備壽命預測（RUL 訓練資料）

Inspection 節點：{id, inspection_type, scheduled_date, actual_date,
                   inspector_id, status, location_verified,
                   gps_lat, gps_lng, photos[]}
關係：
  ├── (Person)-[:PERFORMED_INSPECTION]->(Inspection)
  ├── (Inspection)-[:INSPECTED]->(Device)
  └── (Inspection)-[:FOUND_ISSUE]->(Alert)
```

### 4.6 Module 06：圖資管理（DMS）

```
圖資儲存與管理：
  ├── 支援格式：CAD (DWG/DXF), IFC, Revit (RVT), PDF, SVG
  ├── 版本控管（圖紙版次追蹤）
  ├── 多解析度預覽（Web 即時渲染）
  └── 大型檔案分塊上傳（MinIO S3 + Presigned URL）

圖資 × KG 整合：
  ├── 圖紙 → Neo4j Document 節點
  │   {id, drawing_number, revision, title, format, file_url,
  │    valid_from, created_by, tags[]}
  ├── 設備關聯圖紙（Device)-[:HAS_DRAWING]->(Document）
  ├── 施工日誌節點（ConstructionLog）
  │   {date, contractor, work_description, photo_urls[], status}
  └── 工單關聯圖紙（工程師維修時直接查設備圖）

IFC 解析 → KG 自動匯入：
  ├── 解析 IfcBuilding, IfcSpace, IfcElement
  ├── 自動建立 Neo4j 空間節點（Building/Floor/Room/Space）
  ├── 設備 IFC GlobalId → Neo4j Device.ifc_guid
  └── 設備 BIM 座標 (x, y, z) → Neo4j Device.bim_location

圖紙智慧搜尋（Vector 語義搜尋）：
  ├── 圖紙標題 + 說明 → 向量化
  └── NL 查詢：「找 3F 空調系統的竣工圖」
```

### 4.7 Module 07：資產履歷（EAM/CMMS）

```
設備資產管理：
  ├── 設備台帳（基本資訊 + 規格 + 通訊設定）
  ├── 設備生命週期管理（採購→安裝→運行→維修→報廢）
  ├── 保固管理（保固期限 + 供應商聯絡）
  └── 備品管理（零件庫存 + 採購觸發）

維保歷程（Maintenance History）：
  ├── 每次維修記錄（日期 + 人員 + 零件 + 費用 + 備注）
  ├── 定期保養計畫（PM 排程）
  ├── 設備維修費用統計
  └── 維修趨勢分析（故障頻率 / 劣化速度）

AI 預測性維護（KG 整合）：
  ├── RUL（Remaining Useful Life）預測
  │   → LSTM 模型 + 振動/溫度/電流特徵
  │   → 預測結果存入 Neo4j Device.rul_days
  ├── Node Similarity：發現相似故障模式的設備群
  └── Link Inference：推論潛在零件老化關聯

EAM KG 節點設計：
  Asset 節點：{id, asset_code, name, category, manufacturer, model,
               serial_number, install_date, warranty_expiry,
               purchase_cost, rul_days, lifecycle_stage}
  SparePart 節點：{id, part_number, name, quantity, min_stock,
                    unit_cost, supplier_id}
  Supplier 節點：{id, name, contact, sla_hours, service_categories[]}
  關係：
  ├── (Asset)-[:PART_OF]->(Asset)（子設備）
  ├── (Asset)-[:HAS_SPARE_PART]->(SparePart)
  ├── (SparePart)-[:SUPPLIED_BY]->(Supplier)
  ├── (WorkOrder)-[:USES_PART {quantity, cost}]->(SparePart)
  └── (MaintenanceRecord)-[:FOR_ASSET]->(Asset)
```

### 4.8 Module 08：AI 告警分析（Alarm Engine）

```
多層次告警引擎：
  ├── 規則型告警（閾值 / 離線 / 趨勢）→ 即時
  ├── AI 型告警（Isolation Forest 異常分數）→ 近即時（< 5 秒）
  ├── 預測型告警（LSTM 負載預測 / RUL 預測）→ 預防性
  └── 語義型告警（KG 跨系統關聯分析）→ 複合告警

告警通知管道：
  ├── 3D BIM 場景閃爍（設備 Pulse Shader）
  ├── Web 推播通知（Web Push + 聲音）
  ├── LINE Notify / Telegram Bot
  ├── Email（分群通知，附 AI 根因摘要）
  └── Flutter APP 推播（含 BIM 3D 定位連結）

AI 告警處理流程：
  IoT 異常偵測（Edge AI 或 Cloud AI）
      ↓
  建立 Neo4j Alert 節點
      ↓
  GraphRAG 根因分析（向量搜尋 + 圖譜遍歷 + LLM）
      ↓
  3D BIM 設備閃爍 + 推播通知（含根因摘要）
      ↓
  自動建立 CM 工單（含 BIM 定位 + AI 建議）
      ↓
  AI 派工（KG 技能匹配）
      ↓
  工程師 APP 接收工單

告警 × KG 整合：
  Alert 節點：{id, alert_code, title, description, alert_type,
               severity, status, ai_score, ai_root_cause,
               ai_action_suggestion, bim_location, embedding}
  關係：
  ├── (Device)-[:HAS_ALERT]->(Alert)
  ├── (Alert)-[:TRIGGERS_WORKORDER]->(WorkOrder)
  └── (Alert)-[:SIMILAR_TO {similarity}]->(Alert)（歷史案例）
```

### 4.9 Module 09：戰情中心 Dashboard（Command Center）

```
戰情中心 KPI 區塊（頂部固定，F-Pattern）：
  ├── 即時設備狀態：在線 N / 告警 N / 嚴重 N / 離線 N
  ├── 能源 KPI：總用電 kW / 需量使用率 % / 今日 kWh
  ├── 工單 KPI：待處理 N / 進行中 N / 今日完成 N
  └── 維護 KPI：MTTR 小時 / MTBF 天 / 設備完好率 %

主視覺化區：
  ├── 3D BIM 場景（左側主區，含熱力圖 + 狀態 Shader）
  ├── AI 告警列表（右上，含根因摘要 + 一鍵派工）
  ├── 能源趨勢圖（右中，ECharts 折線）
  ├── 工單看板（右下，待處理/進行中/完成）
  └── NL AI 查詢欄（底部，全平台自然語言查詢）

戰情中心 NL 查詢範例：
  「A棟本週故障最多的設備？」→ KG 圖譜 + 工單統計
  「目前有哪些 CRITICAL 告警影響需量？」→ Alert + EMS 聯查
  「3F 空調今日維修了幾次，費用多少？」→ WorkOrder + 費用聚合
  「哪些設備的 RUL 小於 30 天？」→ Asset.rul_days 查詢
```

### 4.10 功能優先級矩陣

| 功能模組 | 優先級 | 開發週期 | 市場競爭力 | AI KG 整合 |
|---------|--------|---------|-----------|-----------|
| Web 中央監控 SCADA | P0 | 2 個月 | ★★★☆☆ | ★★★☆☆ |
| EMS 需量管理 + KG | P0 | 1.5 個月 | ★★★★★ | ★★★★★ |
| BIM 3D 定位 + KG | P0 | 2 個月 | ★★★★★ | ★★★★★ |
| AI 告警 + GraphRAG | P0 | 1 個月 | ★★★★★ | ★★★★★ |
| 派工工單 + AI 派工 | P1 | 1.5 個月 | ★★★★☆ | ★★★★★ |
| 巡檢 APP（Flutter）| P1 | 2 個月 | ★★★★☆ | ★★★★☆ |
| 圖資管理 DMS | P1 | 1 個月 | ★★★☆☆ | ★★★★☆ |
| EAM/CMMS 資產履歷 | P1 | 1.5 個月 | ★★★★☆ | ★★★★★ |
| 戰情中心 Dashboard | P1 | 1 個月 | ★★★★★ | ★★★★★ |
| 負載預測（LSTM）| P2 | 2 個月 | ★★★★☆ | ★★★★☆ |
| AI 節能助理 | P2 | 2 個月 | ★★★★★ | ★★★★★ |
| 儲能 + 碳排管理 | P2 | 2 個月 | ★★★★☆ | ★★★☆☆ |
| GIS 地理圖資 | P3 | 2 個月 | ★★★☆☆ | ★★★☆☆ |
| 行為能源學 | P3 | 2 個月 | ★★★★☆ | ★★★☆☆ |
| 多租戶 SaaS | P3 | 3 個月 | ★★★★★ | ★★★☆☆ |

---

## 5. 企業知識圖譜 Schema

### 5.1 節點類型全覽（Enterprise Node Labels）

```
空間維度：   Site → Building → Floor → Space/Room → Zone
設備維度：   System → Asset(Device) → SubAsset → Point
能源維度：   Meter → EnergyReading → Tariff → Baseline
維運維度：   WorkOrder → Inspection → MaintenanceRecord → SparePart
人員維度：   Person → Department → Role → Skill
文件維度：   Document → Drawing → ConstructionLog → Manual
事件維度：   Alert → AnomalyEvent → ControlAction
知識維度：   Supplier → Manufacturer → Standard
```

### 5.2 完整 Cypher Schema DDL

```cypher
// ============================================================
// ENTERPRISE AI-DT KNOWLEDGE GRAPH SCHEMA v4.0
// 企業數位孿生知識圖譜 Schema
// 整合：空間 + 設備 + 能源 + 維運 + 人員 + 文件 + 事件
// ============================================================

// ── 節點約束 ─────────────────────────────────────────────
CREATE CONSTRAINT site_id         IF NOT EXISTS FOR (n:Site)         REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT building_id     IF NOT EXISTS FOR (n:Building)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT floor_id        IF NOT EXISTS FOR (n:Floor)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT space_id        IF NOT EXISTS FOR (n:Space)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT system_id       IF NOT EXISTS FOR (n:System)       REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT asset_id        IF NOT EXISTS FOR (n:Asset)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT point_id        IF NOT EXISTS FOR (n:Point)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT meter_id        IF NOT EXISTS FOR (n:Meter)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT tariff_id       IF NOT EXISTS FOR (n:Tariff)       REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT workorder_id    IF NOT EXISTS FOR (n:WorkOrder)    REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT inspection_id   IF NOT EXISTS FOR (n:Inspection)   REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT alert_id        IF NOT EXISTS FOR (n:Alert)        REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT person_id       IF NOT EXISTS FOR (n:Person)       REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT document_id     IF NOT EXISTS FOR (n:Document)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT supplier_id     IF NOT EXISTS FOR (n:Supplier)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT spare_part_id   IF NOT EXISTS FOR (n:SparePart)   REQUIRE n.id IS UNIQUE;

// ── 業務索引 ─────────────────────────────────────────────
CREATE INDEX asset_code        IF NOT EXISTS FOR (n:Asset)     ON (n.asset_code);
CREATE INDEX asset_scene       IF NOT EXISTS FOR (n:Asset)     ON (n.scene_object_id);
CREATE INDEX asset_ifc_guid    IF NOT EXISTS FOR (n:Asset)     ON (n.ifc_guid);
CREATE INDEX asset_qr_code     IF NOT EXISTS FOR (n:Asset)     ON (n.qr_code);
CREATE INDEX workorder_number  IF NOT EXISTS FOR (n:WorkOrder) ON (n.wo_number);
CREATE INDEX workorder_status  IF NOT EXISTS FOR (n:WorkOrder) ON (n.status, n.priority);
CREATE INDEX alert_status      IF NOT EXISTS FOR (n:Alert)     ON (n.status, n.severity);
CREATE INDEX person_employee   IF NOT EXISTS FOR (n:Person)    ON (n.employee_id);
CREATE INDEX document_number   IF NOT EXISTS FOR (n:Document)  ON (n.drawing_number);

// ── 向量索引（語義搜尋）─────────────────────────────────
CREATE VECTOR INDEX asset_embedding IF NOT EXISTS
  FOR (n:Asset) ON (n.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }};

CREATE VECTOR INDEX alert_embedding IF NOT EXISTS
  FOR (n:Alert) ON (n.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }};

CREATE VECTOR INDEX document_embedding IF NOT EXISTS
  FOR (n:Document) ON (n.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }};

CREATE VECTOR INDEX workorder_embedding IF NOT EXISTS
  FOR (n:WorkOrder) ON (n.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }};

// ============================================================
// 節點建立範例
// ============================================================

// 空間節點
CREATE (site:Site {
  id: 'site-001', name: '台北科技園區',
  address: '台北市南港區...', total_area_sqm: 50000.0,
  contract_demand_kw: 5000.0, utility_account: 'TAI-001'
});

CREATE (bldg:Building {
  id: 'bldg-a', name: 'A棟辦公大樓',
  floors: 10, total_area_sqm: 12000.0, built_year: 2018,
  bim_model_url: 'minio://bim/A-building-v2.ifc'  // BIM 模型路徑
});

CREATE (floor:Floor {
  id: 'floor-3f', name: '3F', floor_number: 3, area_sqm: 1200.0
});

CREATE (space:Space {
  id: 'space-3f-mr', name: '3F 機房', space_type: 'mechanical_room',
  area_sqm: 80.0,
  bim_location: {x: 12.5, y: 8.3, z: 9.6}  // BIM 座標
});

// 資產設備節點（整合 BIM + EMS + CMMS）
CREATE (asset:Asset {
  id: 'asset-ahu-3f-01',
  asset_code: 'AHU-3F-01',
  name: '3F 空調箱 01',
  asset_type: 'AHU',                           // AHU/Chiller/Meter/UPS/Fire/CCTV
  category: 'HVAC',                             // HVAC/Power/Fire/Security/IT
  manufacturer: 'Carrier',
  model: 'AHU-3000',
  serial_number: 'SN20180601001',
  install_date: date('2018-06-15'),
  warranty_expiry: date('2023-06-15'),
  expected_lifetime_years: 15,
  criticality: 'MEDIUM',
  demand_shed_priority: 3,
  status: 'Running',
  current_power_kw: 42.3,
  rul_days: 450,                                // AI 預測剩餘壽命
  lifecycle_stage: 'operational',               // procurement/install/op/maintain/retire
  // BIM 整合
  scene_object_id: 'uuid-3d-ahu-3f-01',        // Three.js 物件 UUID
  ifc_guid: '2YkjUk8_P06fhTp79DEEtP',          // IFC GlobalId
  bim_location: {x: 12.5, y: 8.3, z: 9.6},    // BIM 座標
  qr_code: 'QR-AHU-3F-01',                     // 巡檢 QR Code
  // 資料橋接
  pg_device_id: 'pg-uuid-ahu-3f-01',           // PostgreSQL ID
  influx_measurement: 'device_power',           // InfluxDB measurement
  can_remote_control: true,
  embedding: null                               // AI 向量嵌入
});

// 人員節點（整合派工技能）
CREATE (person:Person {
  id: 'person-001',
  name: '陳大維',
  employee_id: 'EMP-001',
  role: 'engineer',
  department: '設備維護部',
  phone: '+886-912-345-678',
  email: 'chen@company.com',
  specialties: ['HVAC', 'Pump', 'AHU', 'Chiller'],  // 技能清單
  certifications: ['冷凍空調技術士', '乙級電工'],
  current_workload: 3,                           // 目前派工數
  current_location: {lat: 25.033, lng: 121.564} // APP 即時位置
});

// 工單節點（整合 BIM + KG + AI）
CREATE (wo:WorkOrder {
  id: 'wo-001',
  wo_number: 'WO-2026-001234',
  wo_type: 'CM',                               // PM / CM / EM
  title: 'AHU-3F-01 高壓保護跳脫維修',
  description: '冷媒壓力異常，高壓開關跳脫停機',
  priority: 'HIGH',                             // LOW/MEDIUM/HIGH/URGENT
  status: 'in_progress',
  ai_root_cause: null,                          // GraphRAG 生成
  ai_suggested_parts: null,                     // AI 建議零件
  bim_location: {x: 12.5, y: 8.3, z: 9.6},   // 3D 定位（工程師導航用）
  bim_scene_url: '/bim/floor3?focus=ahu-3f-01',
  estimated_hours: 3.0,
  actual_hours: null,
  sla_deadline: datetime() + duration({hours: 4}),
  embedding: null
});

// 巡檢節點
CREATE (insp:Inspection {
  id: 'insp-001',
  inspection_code: 'INSP-2026-0516-001',
  inspection_type: 'routine',                   // routine / special / post_repair
  scheduled_date: date('2026-05-16'),
  actual_date: datetime(),
  status: 'completed',
  location_verified: true,
  gps_lat: 25.033, gps_lng: 121.564,
  photos: ['minio://inspection/2026/0516/photo1.jpg'],
  checklist_results: [{item: '冷媒壓力', value: '18 bar', normal: true}],
  notes: '運轉正常，濾網略髒建議下月更換'
});

// 文件節點（圖資管理）
CREATE (doc:Document {
  id: 'doc-001',
  drawing_number: 'M-3F-HVAC-001',
  revision: 'Rev.C',
  title: '3F 空調系統配置圖',
  doc_type: 'mechanical',                       // mechanical/electrical/architectural/as-built
  format: 'DWG',                               // DWG/IFC/PDF/SVG
  file_url: 'minio://drawings/M-3F-HVAC-001-RevC.dwg',
  valid_from: date('2023-01-15'),
  created_by: 'engineer-001',
  tags: ['HVAC', '3F', '空調', 'AHU'],
  embedding: null                               // 圖紙描述語義向量
});

// ============================================================
// 關係建立（完整企業關係網絡）
// ============================================================

// 空間層級
MATCH (s:Site {id:'site-001'}), (b:Building {id:'bldg-a'})
CREATE (s)-[:CONTAINS]->(b);

MATCH (b:Building {id:'bldg-a'}), (f:Floor {id:'floor-3f'})
CREATE (b)-[:CONTAINS]->(f);

MATCH (f:Floor {id:'floor-3f'}), (sp:Space {id:'space-3f-mr'})
CREATE (f)-[:CONTAINS]->(sp);

// 設備關係
MATCH (sp:Space {id:'space-3f-mr'}), (a:Asset {id:'asset-ahu-3f-01'})
CREATE (a)-[:LOCATED_IN {bim_coords: {x:12.5, y:8.3, z:9.6}}]->(sp);

// 能源影響（需量影響鏈）
MATCH (a:Asset {id:'asset-ahu-3f-01'}), (m:Meter {id:'meter-main-a'})
CREATE (a)-[:AFFECTS_DEMAND {
  estimated_reduction_kw: 42.0,
  shed_priority: 3,
  control_delay_sec: 30
}]->(m);

// 工單 × 設備 × 告警
MATCH (al:Alert {id:'alert-001'}), (wo:WorkOrder {id:'wo-001'})
CREATE (al)-[:TRIGGERS_WORKORDER {auto_created: true, created_at: datetime()}]->(wo);

MATCH (wo:WorkOrder {id:'wo-001'}), (a:Asset {id:'asset-ahu-3f-01'})
CREATE (wo)-[:FOR_ASSET]->(a);

MATCH (p:Person {id:'person-001'}), (wo:WorkOrder {id:'wo-001'})
CREATE (p)-[:ASSIGNED_TO {assigned_at: datetime(), assigned_by: 'ai-dispatch'}]->(wo);

// 巡檢關係
MATCH (p:Person {id:'person-001'}), (insp:Inspection {id:'insp-001'})
CREATE (p)-[:PERFORMED_INSPECTION]->(insp);

MATCH (insp:Inspection {id:'insp-001'}), (a:Asset {id:'asset-ahu-3f-01'})
CREATE (insp)-[:INSPECTED]->(a);

// 文件關係
MATCH (a:Asset {id:'asset-ahu-3f-01'}), (doc:Document {id:'doc-001'})
CREATE (a)-[:HAS_DRAWING]->(doc);

MATCH (wo:WorkOrder {id:'wo-001'}), (doc:Document {id:'doc-001'})
CREATE (wo)-[:REFERENCES_DOCUMENT]->(doc);

// 技能派工關係
MATCH (p:Person {id:'person-001'}), (a:Asset {id:'asset-ahu-3f-01'})
CREATE (p)-[:RESPONSIBLE_FOR]->(a);

// 人員 KG 追蹤（維運閉環）
MATCH (p:Person {id:'person-001'}), (al:Alert {id:'alert-001'})
CREATE (p)-[:RESPONDED_TO {at: datetime(), action: 'acknowledged'}]->(al);
```

### 5.3 核心跨模組 Cypher 查詢

```cypher
// ── 1. 全平台戰情查詢：當前 CRITICAL 告警影響鏈 ──────────
MATCH (al:Alert {status: 'open', severity: 'CRITICAL'})
      <-[:HAS_ALERT]-(asset:Asset)
      -[:AFFECTS_DEMAND]->(m:Meter)
OPTIONAL MATCH (al)-[:TRIGGERS_WORKORDER]->(wo:WorkOrder)
OPTIONAL MATCH (p:Person)-[:ASSIGNED_TO]->(wo)
RETURN al.title, al.ai_root_cause,
       asset.name AS affected_asset,
       asset.bim_location,
       m.demand_ratio AS demand_impact,
       wo.wo_number, wo.status,
       p.name AS assigned_to,
       p.phone AS contact_phone
ORDER BY m.demand_ratio DESC

// ── 2. AI 派工：找最適合工程師 ───────────────────────────
// 輸入：工單需要的技能 'HVAC'
MATCH (p:Person)
WHERE 'HVAC' IN p.specialties
  AND p.role IN ['engineer', 'senior_engineer']
OPTIONAL MATCH (p)-[:ASSIGNED_TO]->(active_wo:WorkOrder {status: 'in_progress'})
WITH p, count(active_wo) AS current_load
WHERE current_load < 5
RETURN p.name, p.employee_id, p.phone,
       p.specialties, current_load,
       point.distance(
         point({latitude: p.current_location.lat, longitude: p.current_location.lng}),
         point({latitude: 25.033, longitude: 121.564})
       ) AS distance_meters
ORDER BY current_load ASC, distance_meters ASC
LIMIT 3

// ── 3. BIM 空間查詢：3F 所有設備狀態 + 工單 ─────────────
MATCH (f:Floor {name: '3F'})-[:CONTAINS*1..2]->(a:Asset)
OPTIONAL MATCH (a)-[:HAS_ALERT]->(al:Alert {status: 'open'})
OPTIONAL MATCH (wo:WorkOrder)-[:FOR_ASSET]->(a)
WHERE wo.status IN ['pending', 'in_progress']
RETURN a.name, a.asset_code, a.status, a.bim_location,
       collect(DISTINCT al.severity) AS open_alerts,
       collect(DISTINCT wo.wo_number) AS active_workorders

// ── 4. 維修歷史：設備 MTTR / MTBF 分析 ──────────────────
MATCH (a:Asset {asset_code: 'AHU-3F-01'})<-[:FOR_ASSET]-(wo:WorkOrder)
WHERE wo.status = 'completed' AND wo.actual_hours IS NOT NULL
WITH a, wo,
     duration.between(wo.created_at, wo.completed_at).hours AS repair_hours
RETURN a.name,
       avg(repair_hours) AS avg_mttr_hours,
       count(wo) AS total_repairs,
       sum(repair_hours) AS total_downtime_hours

// ── 5. 圖資查詢：設備關聯圖紙（語義搜尋）───────────────
CALL db.index.vector.queryNodes('document_embedding', 5, $query_embedding)
YIELD node AS doc, score
MATCH (doc)<-[:HAS_DRAWING]-(asset:Asset)
RETURN doc.drawing_number, doc.title, doc.revision,
       doc.file_url, asset.name, score
ORDER BY score DESC

// ── 6. NL2Cypher 範例：「本月故障費用最高的設備？」──────
MATCH (a:Asset)<-[:FOR_ASSET]-(wo:WorkOrder)
WHERE wo.status = 'completed'
  AND wo.completed_at >= datetime() - duration({days: 30})
OPTIONAL MATCH (wo)-[:USES_PART]->(sp:SparePart)
WITH a, wo, COALESCE(sp.unit_cost * 1, 0) AS part_cost
RETURN a.name, a.asset_code,
       count(wo) AS repair_count,
       sum(wo.actual_hours * 800 + part_cost) AS total_cost_ntd
ORDER BY total_cost_ntd DESC
LIMIT 5
```

---

## 6. 向量資料庫與語義搜尋

### 6.1 企業四種向量類型

| 向量類型 | 資料來源 | 索引名稱 | 用途 |
|---------|---------|---------|------|
| **設備文字向量** | 設備名稱 + 規格 + 故障歷史 + 維修記錄 | `asset_embedding` | 語義搜尋相似設備 / 案例匹配 |
| **告警描述向量** | 告警標題 + 描述 + AI 根因 + 處置建議 | `alert_embedding` | 相似告警案例 / GraphRAG 脈絡 |
| **圖紙文件向量** | 圖紙標題 + 說明 + 施工日誌 + 手冊 | `document_embedding` | 智慧圖紙搜尋 / 維修知識庫 |
| **工單記錄向量** | 工單描述 + 維修備注 + 零件紀錄 | `workorder_embedding` | 相似工單推薦 / 維修步驟建議 |

### 6.2 IFC 解析自動向量化流程

```python
# src/bim_service/modules/ifc_parser/ifc_to_kg.py
import ifcopenshell
from neo4j import AsyncGraphDatabase
from modules.vector.embedding_service import EmbeddingService
import logging

logger = logging.getLogger(__name__)

class IFCToKnowledgeGraph:
    """
    IFC 檔案解析 → 自動建立 Neo4j KG 節點
    同時向量化設備描述，建立語義索引
    """

    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.driver = AsyncGraphDatabase.driver(
            os.getenv("NEO4J_URI"),
            auth=(os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD"))
        )

    async def parse_and_import(self, ifc_file_path: str, building_id: str) -> dict:
        """解析 IFC 並匯入 Neo4j KG"""
        model = ifcopenshell.open(ifc_file_path)
        stats = {"spaces": 0, "assets": 0, "relations": 0}

        # 1. 解析空間（IfcSpace → Neo4j Space 節點）
        for ifc_space in model.by_type("IfcSpace"):
            await self._create_space_node(ifc_space, building_id)
            stats["spaces"] += 1

        # 2. 解析設備元素（IfcElement → Neo4j Asset 節點）
        equipment_types = [
            "IfcAirHandlingUnit", "IfcChiller", "IfcPump",
            "IfcElectricMotor", "IfcUnitaryEquipment",
            "IfcMechanicalFastener", "IfcDistributionElement"
        ]
        for eq_type in equipment_types:
            for element in model.by_type(eq_type):
                asset_id = await self._create_asset_node(element, building_id)
                if asset_id:
                    # 向量化設備描述
                    await self._vectorize_asset(asset_id, element)
                    stats["assets"] += 1

        # 3. 建立空間-設備關係
        for rel in model.by_type("IfcRelContainedInSpatialStructure"):
            for element in rel.RelatedElements:
                space = rel.RelatingStructure
                await self._create_spatial_relation(element.GlobalId, space.GlobalId)
                stats["relations"] += 1

        logger.info(f"IFC import complete: {stats}")
        return stats

    async def _create_asset_node(self, element, building_id: str) -> str:
        """建立 Asset 節點，包含 IFC 屬性"""
        # 取得設備屬性集
        props = self._extract_pset(element, "Pset_ManufacturerTypeInformation")
        location = self._get_local_placement(element)

        asset_id = f"asset-ifc-{element.GlobalId}"
        async with self.driver.session() as session:
            await session.run("""
                MERGE (a:Asset {ifc_guid: $guid})
                SET a.id = $id,
                    a.name = $name,
                    a.asset_type = $asset_type,
                    a.manufacturer = $manufacturer,
                    a.model = $model,
                    a.bim_location = $location,
                    a.qr_code = $qr_code,
                    a.status = 'Unknown',
                    a.lifecycle_stage = 'operational',
                    a.updated_at = datetime()
            """,
            guid=element.GlobalId,
            id=asset_id,
            name=element.Name or element.GlobalId,
            asset_type=element.is_a(),
            manufacturer=props.get("Manufacturer", ""),
            model=props.get("ModelNumber", ""),
            location=location,
            qr_code=f"QR-{element.GlobalId[:8]}"
            )
        return asset_id

    async def _vectorize_asset(self, asset_id: str, element) -> None:
        """向量化設備描述並存入 Neo4j Vector Index"""
        text = f"""
        設備名稱：{element.Name or '未知'}
        設備類型：{element.is_a()}
        IFC 全域 ID：{element.GlobalId}
        描述：{element.Description or '無描述'}
        """
        embedding = await self.embedding_service.get_embedding(text.strip())
        async with self.driver.session() as session:
            await session.run("""
                MATCH (a:Asset {id: $id})
                CALL db.create.setNodeVectorProperty(a, 'embedding', $embedding)
            """, id=asset_id, embedding=embedding)
```

---

## 7. OT 系統整合架構

### 7.1 設備分類與協定對應（企業全設備版）

```
┌───────────────────────────────────────────────────────────────┐
│              企業 OT 設備層（全設備類型）                      │
├───────────────────────────────────────────────────────────────┤
│ 電力監控                                                       │
│   電表(Modbus TCP) → 水表(Modbus RTU) → CT(4-20mA→AI Module) │
│                                                               │
│ 空調/HVAC（對應 Neo4j System/Asset 節點）                     │
│   冰水主機(BACnet IP) → AHU(BACnet MSTP) → VFD(Modbus RTU)  │
│   溫濕度感測器(MQTT/Zigbee) → 風閥(BACnet)                    │
│                                                               │
│ 消防系統                                                       │
│   消防主機(Modbus TCP/RS-232) → 偵煙/溫感(Dry Contact)        │
│   消防廣播(RS-485) → 緊急照明(Modbus)                          │
│                                                               │
│ 電力保護備援                                                    │
│   UPS(Modbus TCP/SNMP) → 發電機(Modbus RTU)                  │
│   ATS 自動切換(Modbus TCP)                                     │
│                                                               │
│ 門禁/保全/CCTV                                                 │
│   門禁主機(RESTful API/Wiegand) → 車辨系統(API)               │
│   CCTV 錄影主機(RTSP/ONVIF) → 影像 AI 分析                    │
│                                                               │
│ 再生能源+儲能                                                   │
│   PV 逆變器(Modbus TCP/SunSpec) → ESS PCS(Modbus TCP)        │
│   BMS 電池管理(CAN bus→Gateway) → EV 充電樁(OCPP)             │
│                                                               │
│ 樓宇智控（BMS）                                                │
│   DDC 控制器(BACnet IP) → 照明(DALI/KNX)                     │
│   電動捲簾(KNX) → 梯控(API)                                    │
└───────────────────────────────────────────────────────────────┘
```

### 7.2 邊緣閘道器架構（含 Neo4j 即時代理）

```
┌──────────────────────────────────────────────────────────────┐
│         Enterprise Edge Gateway（Docker 容器化）              │
├──────────────────────────────────────────────────────────────┤
│  Protocol Drivers（多協定並行）                               │
│    ├─ Modbus Driver（pymodbus）                               │
│    ├─ BACnet Driver（BAC0）                                   │
│    ├─ OPC UA Client（asyncua）                                │
│    ├─ MQTT Client（aiomqtt）                                  │
│    ├─ KNX Driver（xknx）                                      │
│    └─ RTSP Stream（OpenCV + FFMPEG）                         │
├──────────────────────────────────────────────────────────────┤
│  Data Processor                                              │
│    ├─ Tag Mapping（YAML → Neo4j Point 節點對應）              │
│    ├─ Data Validation（品質碼 Quality 192=Good）              │
│    ├─ Unit Conversion（單位標準化）                            │
│    └─ Buffering（SQLite 斷線暫存）                            │
├──────────────────────────────────────────────────────────────┤
│  Edge AI（輕量化，離線可用）                                   │
│    ├─ Isolation Forest（異常初篩，< 100ms）                   │
│    ├─ 閾值規則引擎（即時告警觸發）                              │
│    └─ 影像分析（CCTV 人流統計 / 煙霧偵測）                    │
├──────────────────────────────────────────────────────────────┤
│  Neo4j 即時更新代理（v4.0 核心新增）                          │
│    → 每 60 秒批次更新 Asset.status / current_power_kw        │
│    → 每 60 秒更新 Meter.current_demand_kw / demand_ratio     │
│    → 告警觸發時建立 Alert 節點 + 觸發 GraphRAG                │
│    → 巡檢完成時更新 Inspection 節點                           │
├──────────────────────────────────────────────────────────────┤
│  Output Pipeline                                             │
│    ├─ MQTT → EMQX Broker（→ Kafka → InfluxDB）              │
│    ├─ HTTP → GraphQL API（即時查詢）                          │
│    └─ Local SQLite Cache（斷線緩存）                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. 資料模型與演算法

### 8.1 設備樹狀結構（PostgreSQL + Neo4j 雙存）

```sql
-- PostgreSQL Closure Table（加速階層查詢）
CREATE TABLE hierarchy_nodes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    node_type   VARCHAR(50) NOT NULL,  -- site/building/floor/space/system/asset/point
    parent_id   UUID REFERENCES hierarchy_nodes(id),
    neo4j_id    VARCHAR(128),          -- 對應 Neo4j 節點 ID
    bim_ifc_guid VARCHAR(64),          -- IFC GlobalId（BIM 整合）
    qr_code     VARCHAR(64) UNIQUE,    -- 巡檢 QR Code
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 資產設備主表
CREATE TABLE assets (
    id              UUID PRIMARY KEY,
    node_id         UUID REFERENCES hierarchy_nodes(id) UNIQUE,
    asset_code      VARCHAR(64) NOT NULL UNIQUE,
    asset_type      VARCHAR(50),         -- AHU/Chiller/Meter/UPS/Fire/CCTV
    category        VARCHAR(50),         -- HVAC/Power/Fire/Security/IT
    manufacturer    VARCHAR(100),
    model           VARCHAR(100),
    serial_number   VARCHAR(100),
    install_date    DATE,
    warranty_expiry DATE,
    rated_capacity  DECIMAL(10,2),
    criticality     VARCHAR(20) DEFAULT 'MEDIUM',
    demand_shed_priority INTEGER,
    lifecycle_stage VARCHAR(50) DEFAULT 'operational',
    communication   JSONB,               -- 通訊設定
    bim_location    JSONB,               -- {x, y, z} BIM 座標
    scene_object_id VARCHAR(128),        -- Three.js UUID
    neo4j_asset_id  VARCHAR(128),        -- Neo4j 節點 ID
    photo_url       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- 工單主表
CREATE TABLE work_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wo_number       VARCHAR(64) NOT NULL UNIQUE,
    wo_type         VARCHAR(20) NOT NULL,  -- PM/CM/EM
    title           VARCHAR(256) NOT NULL,
    description     TEXT,
    priority        VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    asset_id        UUID REFERENCES assets(id),
    alert_id        UUID,                  -- 觸發工單的告警 ID
    assigned_to     UUID REFERENCES users(id),
    estimated_hours DECIMAL(6,2),
    actual_hours    DECIMAL(6,2),
    sla_deadline    TIMESTAMPTZ,
    bim_location    JSONB,                 -- 工程師導航用 BIM 座標
    ai_root_cause   TEXT,                  -- GraphRAG 生成
    completion_note TEXT,
    neo4j_wo_id     VARCHAR(128),          -- Neo4j WorkOrder 節點 ID
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

-- 巡檢記錄表
CREATE TABLE inspections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_code VARCHAR(64) NOT NULL UNIQUE,
    inspection_type VARCHAR(30),           -- routine/special/post_repair
    asset_id        UUID REFERENCES assets(id),
    inspector_id    UUID REFERENCES users(id),
    scheduled_date  DATE,
    actual_datetime TIMESTAMPTZ,
    status          VARCHAR(30) DEFAULT 'pending',
    gps_lat         DECIMAL(10,7),
    gps_lng         DECIMAL(10,7),
    location_verified BOOLEAN DEFAULT FALSE,
    checklist_results JSONB,              -- [{item, value, normal, note}]
    photos          JSONB DEFAULT '[]',   -- MinIO 圖片路徑列表
    digital_signature TEXT,
    notes           TEXT,
    neo4j_insp_id   VARCHAR(128),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 圖資文件表
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_number  VARCHAR(100),
    revision        VARCHAR(20),
    title           VARCHAR(256) NOT NULL,
    doc_type        VARCHAR(50),           -- mechanical/electrical/architectural/as-built
    format          VARCHAR(20),           -- DWG/IFC/PDF/SVG/RVT
    file_url        TEXT NOT NULL,         -- MinIO 路徑
    file_size_mb    DECIMAL(10,2),
    valid_from      DATE,
    valid_to        DATE,
    created_by      UUID REFERENCES users(id),
    tags            JSONB DEFAULT '[]',
    neo4j_doc_id    VARCHAR(128),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.2 需量計算 + AI 派工演算法

```python
# src/ems_service/demand_calculator.py（同 v3.0，已整合）

# src/workorder_service/ai_dispatcher.py
from neo4j import AsyncGraphDatabase
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class AIDispatcher:
    """
    AI 派工引擎
    基於 Neo4j KG：技能匹配 + 工作負荷 + 地理位置
    """

    async def find_best_engineer(
        self,
        wo_asset_type: str,
        wo_location: dict,
        priority: str
    ) -> List[Dict]:
        """
        找最適合的工程師
        考慮：技能匹配 / 目前工作負荷 / 距離 / 認證
        """
        async with self.driver.session() as session:
            result = await session.run("""
                MATCH (p:Person)
                WHERE $asset_type IN p.specialties
                  AND p.role IN ['engineer', 'senior_engineer']
                OPTIONAL MATCH (p)-[:ASSIGNED_TO]->(active:WorkOrder)
                WHERE active.status IN ['pending', 'in_progress']
                WITH p, count(active) AS workload
                WHERE workload < 5
                RETURN p {
                  .id, .name, .employee_id, .phone,
                  .specialties, .certifications,
                  .current_location
                } AS engineer,
                workload,
                point.distance(
                  point({latitude: p.current_location.lat,
                         longitude: p.current_location.lng}),
                  point({latitude: $lat, longitude: $lng})
                ) AS distance_m
                ORDER BY
                  CASE WHEN $priority = 'URGENT' THEN distance_m ELSE workload END ASC,
                  workload ASC
                LIMIT 3
            """,
            asset_type=wo_asset_type,
            lat=wo_location.get("lat", 25.033),
            lng=wo_location.get("lng", 121.564),
            priority=priority
            )
            return [dict(r) async for r in result]

    async def auto_assign(self, wo_id: str, engineer_id: str) -> None:
        """自動指派工單，記錄至 KG"""
        async with self.driver.session() as session:
            await session.run("""
                MATCH (wo:WorkOrder {id: $wo_id})
                MATCH (p:Person {id: $engineer_id})
                MERGE (p)-[r:ASSIGNED_TO]->(wo)
                SET r.assigned_at = datetime(),
                    r.assigned_by = 'ai-dispatcher',
                    wo.status = 'assigned',
                    wo.updated_at = datetime()
            """, wo_id=wo_id, engineer_id=engineer_id)
```

### 8.3 電費計算引擎（同 v3.0）

```python
# 台灣台電費率計算引擎（夏月/非夏月 × 尖峰/半尖峰/離峰）
# 參見 v3.0 §8.3 TariffCalculator，整合至本平台不變
```

---

## 9. API 設計規範（全平台）

### 9.1 統一回應格式

```json
// 成功
{ "success": true, "data": {...}, "meta": {"request_id": "uuid"} }
// 錯誤
{ "success": false, "error": {"code": "ERROR_CODE", "message": "說明", "request_id": "uuid"} }
```

### 9.2 完整 API 端點（企業全平台）

```yaml
# ── Auth ──────────────────────────────────────────────────
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# ── SCADA / Real-Time Monitoring ────────────────────────
GET    /api/v1/scada/overview           # 全域設備狀態概覽
GET    /api/v1/scada/device/:id         # 單一設備即時數據
POST   /api/v1/scada/control            # 遠端設備控制（需 Engineer+）
WS     /ws/scada                        # WebSocket 即時推播（全設備）

# ── EMS ─────────────────────────────────────────────────
GET    /api/v1/ems/overview             # EMS 總覽（需量/用電/碳排）
GET    /api/v1/ems/demand/current       # 當前需量
GET    /api/v1/ems/demand/forecast      # 需量預測
POST   /api/v1/ems/demand/control       # 需量控制
GET    /api/v1/ems/tariff/calculate     # 電費試算
GET    /api/v1/ems/energy/summary       # 能源彙總
GET    /api/v1/ems/carbon               # 碳排報告
GET    /api/v1/ems/solar                # 太陽能監控
GET    /api/v1/ems/storage              # 儲能監控

# ── BIM / 3D ───────────────────────────────────────────
GET    /api/v1/bim/buildings            # 建築物列表 + BIM 模型 URL
GET    /api/v1/bim/floor/:building/:floor # 樓層平面圖 + 設備清單
POST   /api/v1/bim/import               # 上傳並解析 IFC 檔案（→ KG）
GET    /api/v1/bim/space/:id            # 空間詳情 + 設備 + 環境數據
GET    /api/v1/bim/navigate/:asset_id   # 取得設備 BIM 導航 URL

# ── Assets / Devices ───────────────────────────────────
GET    /api/v1/assets                   # 設備清單（樹狀 / 列表）
POST   /api/v1/assets                   # 新增設備（需 Engineer+）
GET    /api/v1/assets/:id               # 設備詳情 + KG 知識卡片
PUT    /api/v1/assets/:id               # 更新設備
DELETE /api/v1/assets/:id               # 軟刪除
GET    /api/v1/assets/:id/readings      # 時序數據
GET    /api/v1/assets/:id/workorders    # 設備工單歷史
GET    /api/v1/assets/:id/inspections   # 設備巡檢歷史

# ── Work Orders ─────────────────────────────────────────
GET    /api/v1/workorders               # 工單清單（篩選/排序）
POST   /api/v1/workorders               # 建立工單（自動/手動）
GET    /api/v1/workorders/:id           # 工單詳情（含 BIM 定位）
PUT    /api/v1/workorders/:id           # 更新工單
POST   /api/v1/workorders/:id/assign    # 派工（AI / 手動）
POST   /api/v1/workorders/:id/complete  # 完工（更新設備履歷）
GET    /api/v1/workorders/kpi           # MTTR / MTBF / 完成率

# ── Inspection ──────────────────────────────────────────
GET    /api/v1/inspections              # 巡檢計畫清單
POST   /api/v1/inspections              # 建立巡檢計畫
GET    /api/v1/inspections/:id          # 巡檢詳情
POST   /api/v1/inspections/:id/submit   # 提交巡檢結果（APP）
GET    /api/v1/inspections/qr/:qr_code  # QR 掃描 → 設備資訊 + 巡檢表單

# ── Documents / DMS ─────────────────────────────────────
GET    /api/v1/documents                # 圖紙清單
POST   /api/v1/documents/upload         # 上傳圖紙（Presigned URL）
GET    /api/v1/documents/:id            # 圖紙詳情 + 預覽 URL
GET    /api/v1/documents/asset/:id      # 設備相關圖紙
POST   /api/v1/documents/search         # 語義搜尋（Vector）

# ── Alerts ──────────────────────────────────────────────
GET    /api/v1/alerts                   # 告警清單
POST   /api/v1/alerts/:id/acknowledge   # 確認告警
POST   /api/v1/alerts/:id/resolve       # 關閉告警
GET    /api/v1/alerts/rules             # 告警規則
POST   /api/v1/alerts/rules             # 新增規則

# ── Knowledge Graph ─────────────────────────────────────
GET    /api/v1/knowledge/entity/:uuid   # 3D 物件 → KG 知識卡片
GET    /api/v1/knowledge/qr/:qr_code    # QR → KG 節點（APP 掃描用）
POST   /api/v1/knowledge/query          # NL2Cypher 自然語言查詢
GET    /api/v1/knowledge/search         # 語義向量搜尋
GET    /api/v1/knowledge/impact/:meter  # 需量影響鏈
GET    /api/v1/knowledge/graph/:id      # 設備關聯圖（可視化用）

# ── AI Services ─────────────────────────────────────────
GET    /api/v1/ai/anomaly/status        # 設備 AI 異常分數
GET    /api/v1/ai/root-cause/:alert_id  # GraphRAG 根因分析
GET    /api/v1/ai/load-forecast         # LSTM 負載預測
GET    /api/v1/ai/dispatch/:wo_id       # AI 派工建議
GET    /api/v1/ai/rul/:asset_id         # 設備剩餘壽命預測
POST   /api/v1/ai/chat                  # AI 全平台助理（Streaming SSE）
GET    /api/v1/ai/similar-cases         # 相似故障案例搜尋

# ── Reports ─────────────────────────────────────────────
GET    /api/v1/reports/energy/daily     # 每日能源報表
GET    /api/v1/reports/energy/monthly   # 月報（電費分析）
GET    /api/v1/reports/maintenance      # 維護績效報表
GET    /api/v1/reports/carbon           # 碳排報表（ISO 14064）
GET    /api/v1/reports/kpi/dashboard    # 戰情中心 KPI 彙總
POST   /api/v1/reports/export           # 匯出 PDF/Excel

# ── System ──────────────────────────────────────────────
GET    /api/v1/health                   # 健康檢查（全服務狀態）
GET    /api/v1/metrics                  # Prometheus 指標
```

### 9.3 WebSocket 事件規格

```
WS 端點：wss://api.platform.com/ws?token={token}

── Server → Client ───────────────────────────────────────────
scada.device.update      # 設備即時數據更新
ems.demand.update        # 需量即時更新（含預測）
alert.created            # 新告警（含 BIM 定位 + AI 根因）
alert.updated            # 告警狀態變更
workorder.created        # 新工單建立（含 AI 派工建議）
workorder.updated        # 工單狀態變更
inspection.submitted     # 巡檢結果提交（APP 回傳）
bim.asset.status_changed # BIM 場景設備狀態變更
kg.updated               # KG 節點更新（前端快取失效）
ai.insight               # AI 主動推送洞察（預警 / 節能建議）

── Client → Server ───────────────────────────────────────────
subscribe.site           # 訂閱整個場域
subscribe.building       # 訂閱特定建築
subscribe.demand         # 訂閱需量監控
subscribe.workorders     # 訂閱工單動態
unsubscribe
```

---

## 10. UI/UX 設計規範（戰情中心版）

### 10.1 設計系統配色

```css
/* ── 深色模式（長時間監控首選）── */
--bg-primary:   #0A0E27;  /* 主背景 */
--bg-secondary: #151A30;  /* 次要背景 */
--bg-elevated:  #1E2538;  /* 卡片背景 */
--bg-hover:     #252B40;  /* Hover */

/* ── 數據主色系 ── */
--data-primary:   #00D9FF;  /* 青藍（高對比）*/
--data-secondary: #7B61FF;  /* 紫 */
--data-accent:    #00FFA3;  /* 青綠 */

/* ── 設備 / 告警狀態色（全系統語義一致）── */
--status-normal:   #00E676;  /* 正常 - 綠 */
--status-caution:  #FFB300;  /* 注意 - 琥珀 */
--status-warning:  #FF8800;  /* 警示 - 橙 */
--status-alarm:    #FF3D71;  /* 告警 - 紅 */
--status-critical: #7C3AED;  /* 嚴重 - 紫閃爍 */
--status-offline:  #78909C;  /* 離線 - 灰 */

/* ── 字體 ── */
--font-data: 'JetBrains Mono', monospace;   /* 數值顯示 */
--font-ui:   'Inter', 'Noto Sans TC', sans-serif;
```

### 10.2 全平台頁面架構

```
App
├── AuthLayout
│   └── LoginPage
└── MainLayout（含響應式側欄）
    │
    ├── CommandCenterPage          → 戰情中心（全平台整合 Dashboard）
    │
    ├── 監控模組
    │   ├── Scene3DPage            → 3D BIM 能源場景（主場景）
    │   │   ├── BIMViewer          → IFC.js + Three.js 場景
    │   │   ├── EnergyHeatmap      → 能源熱力圖 Shader
    │   │   ├── EnergyFlowAnim     → 粒子能流動畫
    │   │   ├── AssetKnowledgePanel → 點擊設備的 KG 企業知識卡片
    │   │   ├── AlertOverlay       → 告警閃爍浮層
    │   │   ├── WorkOrderBadge     → 工單狀態 BIM 疊加
    │   │   └── AIQueryPanel       → AI 全平台自然語言查詢
    │   └── SCADAPage              → 傳統 SCADA 監控視圖
    │
    ├── 能源模組
    │   ├── EMSDashboardPage       → EMS 總覽（需量/電費/碳排）
    │   ├── DemandManagementPage   → 需量管理 + AI 卸載建議
    │   ├── EnergyAnalyticsPage    → 能源分析（基準線/異常/效率）
    │   ├── SolarStoragePage       → 太陽能 + 儲能監控
    │   └── CarbonReportPage       → 碳排計算 + ISO 報表
    │
    ├── 維運模組
    │   ├── WorkOrderPage          → 派工工單（看板 + 甘特圖）
    │   ├── InspectionPage         → 巡檢計畫 + 執行記錄
    │   ├── AssetManagementPage    → 設備台帳 + EAM 履歷
    │   └── AlertCenterPage        → 告警中心（含 GraphRAG 根因）
    │
    ├── BIM/圖資模組
    │   ├── BIMFloorPlanPage       → 樓層平面圖 2D/3D 切換
    │   ├── DCIMPage               → 資料中心機房管理
    │   ├── DocumentsPage          → 圖資管理（DMS）
    │   └── KnowledgeExplorerPage  → KG 圖譜瀏覽器
    │
    ├── 報表模組
    │   ├── EnergyReportPage       → 能源日/週/月報表
    │   ├── MaintenanceReportPage  → 維護績效 MTTR/MTBF
    │   └── KPIDashboardPage       → 全平台 KPI 彙總
    │
    └── 系統設定
        └── SystemSettingsPage     → 全平台設定（Admin）
```

### 10.3 企業知識卡片設計（Asset Enterprise Panel）

```
點擊 3D BIM 場景中的設備後，彈出企業知識卡片：

┌─────────────────────────────────────────────┐
│ [設備圖示]  AHU-3F-01                        │
│ 3F 空調箱 · Carrier AHU-3000 · SN: 20180601 │
│ 📍 A棟 / 3F / HVAC 系統 / 機房西側           │
├─────────────────────────────────────────────┤
│ 即時狀態 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ 功率    42.3 kW    ↑ 偏高（額定 45 kW）      │
│ 送風溫   16.5°C    ✓ 正常                   │
│ 功率因數  0.92     ✓ 正常                   │
├─────────────────────────────────────────────┤
│ 能源 & 費用 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 今日用電   320 kWh  今日費用  NT$ 1,365      │
│ 需量貢獻   42 kW   卸載優先  第 3 位          │
├─────────────────────────────────────────────┤
│ AI 健康評分  [████████░░] 0.78  ⚠️ 注意      │
│ 剩餘壽命預測  約 450 天（2027-08）           │
├─────────────────────────────────────────────┤
│ 維運狀態 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ 進行中工單   WO-2026-001234（高優先）         │
│ 上次巡檢    2026-05-10（5 天前）  ✓ 正常     │
│ 下次保養    2026-07-15（60 天後）            │
├─────────────────────────────────────────────┤
│ AI 根因建議（GraphRAG）                      │
│ 功率偏高可能與冷媒充填量不足相關，建議…      │
├─────────────────────────────────────────────┤
│ 快速連結 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ 設備圖紙：M-3F-HVAC-001-RevC（立即查看）     │
│ 維修手冊：AHU-3000 Operating Manual         │
├─────────────────────────────────────────────┤
│ [建立工單]  [BIM 導航]  [查趨勢]  [KG 圖]   │
└─────────────────────────────────────────────┘
```

### 10.4 Flutter APP 設計規範

```
APP 主要頁面：
  ├── 首頁：待辦工單列表（依優先級排序）
  ├── 工單詳情：
  │   ├── AI 根因摘要
  │   ├── BIM 3D 定位地圖（一鍵導航到設備位置）
  │   ├── 相關圖紙下載（MinIO Presigned URL）
  │   └── 維修步驟（AI KG 建議）
  ├── 巡檢執行：
  │   ├── QR 掃描（開啟設備 KG 知識卡片）
  │   ├── GPS 定位確認
  │   ├── 量測值輸入
  │   ├── 相機拍照記錄
  │   └── 電子簽章
  ├── BIM 瀏覽：
  │   ├── 樓層切換
  │   ├── AR 疊加（設備狀態 + 規格）
  │   └── 導航到工單位置
  └── 設定：
      ├── 離線資料同步管理
      └── 推播通知設定

離線模式：
  ├── 本機快取：設備資料 + 巡檢表單 + BIM 樓層圖
  ├── 離線操作：巡檢記錄 + 拍照 + 量測值輸入
  └── 上線同步：自動推送至雲端 + 更新 Neo4j KG
```

### 10.5 語氣與數據格式規範

```
語氣矩陣：
  正常狀態  → 「A棟所有設備運轉正常，需量 75%」
  需注意    → 「AHU-3F-01 效率略低，建議本月保養」
  警示狀態  → 「需量 90%，建議啟動卸載策略」
  嚴重告警  → 「冰機 #1 故障！已自動建立緊急工單，陳大維已收到通知」

數值格式：
  功率（kW）: 42.3 kW     電量（kWh）: 1,250 kWh
  電費（元）: NT$ 5,340   溫度：23.5°C
  百分比：87.5%            時間：2 小時 35 分
  距離：1.2 km            壽命：約 450 天
```

---

## 11. GraphRAG 全平台根因分析

### 11.1 全平台 GraphRAG Pipeline

```
告警或異常觸發（任何模組）
         ↓
Step 1：Vector Search（語義定位）
  → alert_embedding 索引：找 Top 5 相似歷史告警
  → workorder_embedding 索引：找相似歷史工單處置方式

Step 2：Graph Traversal（跨模組脈絡）
  MATCH path = (alert)<-[:HAS_ALERT]-(asset)
  OPTIONAL MATCH (asset)-[:AFFECTS_DEMAND]->(meter)     ← EMS 影響
  OPTIONAL MATCH (asset)-[:LOCATED_IN]->(space)         ← BIM 位置
  OPTIONAL MATCH (asset)<-[:FOR_ASSET]-(recent_wo)      ← 維修歷史
  OPTIONAL MATCH (asset)<-[:INSPECTED]-(recent_insp)    ← 巡檢記錄
  OPTIONAL MATCH (asset)-[:HAS_DRAWING]->(doc)          ← 相關圖紙
  OPTIONAL MATCH (p:Person)-[:RESPONSIBLE_FOR]->(asset) ← 負責人

Step 3：Context 組合
  = 告警狀況 + 能源影響（EMS）+ BIM 位置 + 維修歷史（CMMS）
    + 巡檢記錄 + 相關圖紙 + 負責人資訊 + 相似歷史案例

Step 4：LLM 生成報告（Claude / Llama）
  → 繁體中文，工程師可讀
  → 根因分析（3 個假設）
  → 立即行動建議（具體設備 + 步驟）
  → 影響評估（能源 + 生產 + 安全）
  → 推薦維修人員（依 KG 技能匹配）
  → 相關圖紙（DMS 直接連結）

Step 5：結果寫回 + 推播
  → Alert.ai_root_cause = 根因摘要
  → Alert.ai_action_suggestion = 建議動作
  → 自動建立 WorkOrder（含 BIM 定位 + AI 根因）
  → AI 派工（KG 技能匹配）
  → 推播：3D BIM 閃爍 + APP 通知 + LINE + Email
```

### 11.2 全平台 GraphRAG Prompt

```python
def build_enterprise_rag_prompt(
    alert_ctx: dict, asset_ctx: dict, ems_ctx: dict,
    maintenance_ctx: dict, similar_cases: list
) -> str:
    return f"""你是一位資深設施管理暨能源管理專家，請根據以下跨系統資訊進行完整分析。

### 告警資訊
類型：{alert_ctx['alert_type']} | 嚴重度：{alert_ctx['severity']}
說明：{alert_ctx['description']}
發生：{alert_ctx['occurred_at']}

### 設備資訊（BIM 整合）
設備：{asset_ctx['name']}（{asset_ctx['asset_code']}）
類型：{asset_ctx['asset_type']} | 製造商：{asset_ctx['manufacturer']}
BIM 位置：{asset_ctx['building']} / {asset_ctx['floor']} / {asset_ctx['space']}
AI 剩餘壽命：約 {asset_ctx['rul_days']} 天
負責工程師：{asset_ctx.get('responsible_engineer', '未指定')}

### 能源影響（EMS 整合）
即時功率：{ems_ctx['current_power_kw']} kW
需量影響：卸載可降低 {ems_ctx['estimated_reduction_kw']} kW
費率時段：{ems_ctx['tariff_period']}（{ems_ctx['rate_kwh']} 元/kWh）

### 維修歷史（CMMS 整合）
近 90 天工單數：{maintenance_ctx['recent_workorders']} 件
最近維修：{maintenance_ctx.get('last_repair_date', '無記錄')}
最近巡檢：{maintenance_ctx.get('last_inspection', '無記錄')}
相關圖紙：{maintenance_ctx.get('drawing_number', '未連結')}

### 相似歷史案例（語義搜尋）
{chr(10).join([
    f"案例{i+1}（相似度 {c['score']:.2f}）：{c['title']}"
    f"\n  根因：{c.get('ai_root_cause','未記錄')}"
    f"\n  處置：{c.get('ai_action_suggestion','未記錄')}"
    for i, c in enumerate(similar_cases[:3])
])}

### 請提供（繁體中文）：
1. **根因分析**（3 個最可能假設，依可能性排序）
2. **立即行動**（具體操作步驟 + 工具需求）
3. **能源影響**（此異常的能耗成本估算）
4. **推薦工程師**（依 KG 技能匹配，說明原因）
5. **參考圖紙**（應查閱哪些圖紙，可直接連結）
6. **預防措施**（未來如何避免）

請保持簡潔，適合現場工程師快速閱讀和執行。"""
```

---

## 12. 各模組程式碼範例

### 12.1 BIM 告警閃爍 + KG 知識卡片（Three.js + IFC.js）

```typescript
// src/frontend/modules/bim/components/BIMViewer.tsx
import React, { useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { IfcLoader } from 'three/examples/jsm/loaders/IFCLoader';
import { useSceneStore } from '../store/sceneStore';
import { useSocketStore } from '../../../stores/socketStore';
import { AssetEnterprisePanel } from './AssetEnterprisePanel';
import { AlertPulseShader } from './shaders/AlertPulseShader';
import { EnergyHeatmapShader } from './shaders/EnergyHeatmapShader';

export const BIMViewer: React.FC<{ buildingUrl: string }> = ({ buildingUrl }) => {
  const { selectedAssetUUID, setSelectedAsset, assets } = useSceneStore();
  const socket = useSocketStore(s => s.socket);

  // 訂閱 WebSocket：設備狀態 + 告警 → 更新 Shader
  useEffect(() => {
    if (!socket) return;

    socket.on('scada.device.update', (data) => {
      useSceneStore.getState().updateAssetPower(data.asset_id, data.current_power_kw);
    });

    socket.on('alert.created', (data) => {
      useSceneStore.getState().setAssetAlert(data.asset_id, data.severity);
      // 相機飛行到告警設備
      if (data.severity === 'CRITICAL' || data.severity === 'ALARM') {
        useSceneStore.getState().focusOnAsset(data.asset_id);
      }
    });

    return () => {
      socket.off('scada.device.update');
      socket.off('alert.created');
    };
  }, [socket]);

  const handleAssetClick = useCallback((sceneObjectUUID: string) => {
    setSelectedAsset(sceneObjectUUID);
    // 觸發 KG 知識卡片查詢
    useSceneStore.getState().fetchAssetEnterprisePanel(sceneObjectUUID);
  }, [setSelectedAsset]);

  return (
    <div className="bim-viewer-container">
      <Canvas camera={{ position: [30, 20, 30], fov: 60 }}>
        {/* IFC BIM 模型 */}
        <IFCModel
          url={buildingUrl}
          onAssetClick={handleAssetClick}
        />

        {/* 能源熱力圖 Shader */}
        <EnergyHeatmapShader assets={assets} />

        {/* 告警脈衝 Shader */}
        <AlertPulseShader
          alertAssets={assets.filter(a => a.alertSeverity)}
        />

        <OrbitControls makeDefault />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
      </Canvas>

      {/* 企業知識卡片 */}
      {selectedAssetUUID && (
        <AssetEnterprisePanel assetUUID={selectedAssetUUID} />
      )}
    </div>
  );
};
```

### 12.2 企業 KG 服務（全平台知識卡片）

```python
# src/kg_service/modules/enterprise/enterprise_kg_service.py
import os, json
from typing import Dict, Optional
from neo4j import AsyncGraphDatabase
from shared.redis_client import redis_client
from shared.errors import AppError

CACHE_TTL = 30  # 企業知識卡片 30 秒 TTL

class EnterpriseKGService:
    """
    企業全平台知識圖譜服務
    提供統一的「企業知識卡片」：
    設備資訊 + 能源 + 工單 + 巡檢 + 圖紙 + AI 建議
    """

    def __init__(self):
        self.driver = AsyncGraphDatabase.driver(
            os.getenv("NEO4J_URI"),
            auth=(os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD"))
        )

    async def get_enterprise_panel(self, scene_object_uuid: str) -> Dict:
        """
        企業知識卡片：整合全平台資訊
        觸發點：3D BIM 場景點擊 / QR 掃描
        """
        cache_key = f"kg:enterprise:panel:{scene_object_uuid}"
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

        async with self.driver.session() as session:
            result = await session.run("""
                MATCH (a:Asset {scene_object_id: $uuid})

                // 空間位置（BIM）
                OPTIONAL MATCH (a)-[:LOCATED_IN]->(sp:Space)
                OPTIONAL MATCH (sp)<-[:CONTAINS]-(f:Floor)
                OPTIONAL MATCH (f)<-[:CONTAINS]-(b:Building)

                // 能源（EMS）
                OPTIONAL MATCH (a)-[demand_rel:AFFECTS_DEMAND]->(m:Meter)

                // 費率
                OPTIONAL MATCH (b)<-[:CONTAINS]-(site:Site)-[:USES_TARIFF]->(t:Tariff)
                WHERE t.period_type IN ['PEAK', 'SEMI_PEAK', 'OFF_PEAK']

                // 進行中工單（維運）
                OPTIONAL MATCH (wo:WorkOrder)-[:FOR_ASSET]->(a)
                WHERE wo.status IN ['pending', 'in_progress', 'assigned']

                // 最近完成工單
                OPTIONAL MATCH (wo_done:WorkOrder)-[:FOR_ASSET]->(a)
                WHERE wo_done.status = 'completed'

                // 最近巡檢
                OPTIONAL MATCH (insp:Inspection)-[:INSPECTED]->(a)

                // 開放告警
                OPTIONAL MATCH (a)-[:HAS_ALERT]->(al:Alert {status: 'open'})

                // 相關圖紙
                OPTIONAL MATCH (a)-[:HAS_DRAWING]->(doc:Document)

                // 負責工程師
                OPTIONAL MATCH (p:Person)-[:RESPONSIBLE_FOR]->(a)

                RETURN a {
                  .id, .asset_code, .name, .asset_type, .category,
                  .manufacturer, .model, .serial_number, .install_date,
                  .warranty_expiry, .criticality, .status, .current_power_kw,
                  .rated_capacity, .rul_days, .lifecycle_stage,
                  .demand_shed_priority, .can_remote_control,
                  .bim_location, .qr_code, .scene_object_id
                } AS asset,
                {building: b.name, floor: f.name, space: sp.name} AS location,
                {estimated_reduction_kw: demand_rel.estimated_reduction_kw,
                 shed_priority: demand_rel.shed_priority} AS demand_impact,
                m {.current_demand_kw, .contract_demand_kw, .demand_ratio} AS meter,
                t {.period_type, .rate_kwh, .name} AS tariff,
                collect(DISTINCT {
                  id: wo.id, wo_number: wo.wo_number,
                  title: wo.title, priority: wo.priority, status: wo.status,
                  assigned_to: [(p2:Person)-[:ASSIGNED_TO]->(wo) | p2.name][0]
                })[..3] AS active_workorders,
                collect(DISTINCT {
                  title: wo_done.title, completed_at: toString(wo_done.completed_at)
                })[..3] AS recent_completed_workorders,
                collect(DISTINCT {
                  inspection_code: insp.inspection_code,
                  actual_datetime: toString(insp.actual_datetime),
                  status: insp.status, notes: insp.notes
                })[..2] AS recent_inspections,
                collect(DISTINCT {
                  id: al.id, title: al.title, severity: al.severity,
                  ai_root_cause: al.ai_root_cause,
                  ai_action_suggestion: al.ai_action_suggestion
                })[..3] AS open_alerts,
                collect(DISTINCT {
                  drawing_number: doc.drawing_number, revision: doc.revision,
                  title: doc.title, file_url: doc.file_url
                })[..3] AS drawings,
                p {.name, .phone, .specialties} AS responsible_engineer
            """, uuid=scene_object_uuid)

            record = await result.single()
            if not record:
                raise AppError("RESOURCE_NOT_FOUND",
                               f"找不到物件 {scene_object_uuid} 對應的知識節點", 404)

            # 計算今日費用估算
            power_kw = record["asset"].get("current_power_kw", 0) or 0
            rate = record["tariff"]["rate_kwh"] if record["tariff"] else 2.51
            hourly_cost = power_kw * rate

            data = {
                "asset": dict(record["asset"]),
                "location": dict(record["location"]),
                "demand_impact": dict(record["demand_impact"]) if record["demand_impact"] else None,
                "meter": dict(record["meter"]) if record["meter"] else None,
                "tariff": dict(record["tariff"]) if record["tariff"] else None,
                "estimated_hourly_cost_ntd": round(hourly_cost, 1),
                "active_workorders": record["active_workorders"],
                "recent_completed_workorders": record["recent_completed_workorders"],
                "recent_inspections": record["recent_inspections"],
                "open_alerts": record["open_alerts"],
                "drawings": record["drawings"],
                "responsible_engineer": dict(record["responsible_engineer"]) if record["responsible_engineer"] else None
            }

        await redis_client.setex(cache_key, CACHE_TTL, json.dumps(data, default=str))
        return data
```

### 12.3 IoT 告警 → KG → 自動工單完整流程

```python
# src/alarm_service/alarm_orchestrator.py
import asyncio
from shared.neo4j_client import neo4j_driver
from shared.kafka_producer import KafkaProducer
from modules.graphrag.enterprise_root_cause_analyzer import EnterpriseRootCauseAnalyzer
from workorder_service.ai_dispatcher import AIDispatcher
import logging

logger = logging.getLogger(__name__)

class AlarmOrchestrator:
    """
    告警編排器：IoT 告警 → KG → 自動派工完整閉環
    """

    def __init__(self):
        self.graphrag = EnterpriseRootCauseAnalyzer()
        self.dispatcher = AIDispatcher()
        self.kafka = KafkaProducer()

    async def process_alert(self, alert_data: dict) -> dict:
        """
        完整告警處理流程：
        1. 建立 Neo4j Alert 節點
        2. GraphRAG 根因分析（非同步）
        3. 自動建立工單
        4. AI 派工
        5. 多通道推播
        """
        # Step 1：建立 Alert 節點
        alert_id = await self._create_alert_node(alert_data)
        logger.info(f"Alert node created: {alert_id}")

        # Step 2：立即推播（不等 GraphRAG）
        await self.kafka.send("alert.created", {
            "alert_id": alert_id,
            "asset_id": alert_data["asset_id"],
            "severity": alert_data["severity"],
            "title": alert_data["title"]
        })

        # Step 3：非同步執行 GraphRAG（避免阻塞）
        asyncio.create_task(
            self._async_graphrag_and_dispatch(alert_id, alert_data)
        )

        return {"alert_id": alert_id, "status": "processing"}

    async def _async_graphrag_and_dispatch(
        self, alert_id: str, alert_data: dict
    ) -> None:
        """非同步：根因分析 + 自動建工單 + AI 派工"""
        try:
            # GraphRAG 根因分析（含 BIM + EMS + CMMS 脈絡）
            root_cause = await self.graphrag.analyze(alert_id)

            # 更新 Alert 節點（根因 + 建議）
            await self._update_alert_root_cause(alert_id, root_cause)

            # 自動建立 CM 工單（僅 WARNING 以上）
            if alert_data["severity"] in ["WARNING", "ALARM", "CRITICAL"]:
                wo_id = await self._auto_create_workorder(alert_id, alert_data, root_cause)

                # AI 派工
                engineer = await self.dispatcher.find_best_engineer(
                    wo_asset_type=alert_data["asset_type"],
                    wo_location=alert_data.get("bim_location", {}),
                    priority="HIGH" if alert_data["severity"] in ["ALARM", "CRITICAL"] else "MEDIUM"
                )
                if engineer:
                    await self.dispatcher.auto_assign(wo_id, engineer[0]["id"])

                # 推播完整通知（含根因 + BIM 定位 + 工單）
                await self.kafka.send("workorder.created", {
                    "wo_id": wo_id,
                    "alert_id": alert_id,
                    "assigned_engineer": engineer[0] if engineer else None,
                    "ai_root_cause": root_cause["root_cause_summary"][:200] + "...",
                    "bim_location": alert_data.get("bim_location")
                })

        except Exception as e:
            logger.error(f"GraphRAG + dispatch failed for alert {alert_id}: {e}")

    async def _create_alert_node(self, data: dict) -> str:
        """建立 Neo4j Alert 節點"""
        alert_id = f"alert-{data['timestamp'].replace(':', '').replace('.', '')}"
        async with neo4j_driver.session() as session:
            await session.run("""
                MATCH (a:Asset {id: $asset_id})
                CREATE (al:Alert {
                  id: $alert_id,
                  title: $title,
                  description: $description,
                  alert_type: $alert_type,
                  severity: $severity,
                  status: 'open',
                  ai_score: $ai_score,
                  bim_location: $bim_location,
                  occurred_at: datetime()
                })
                CREATE (a)-[:HAS_ALERT {detected_at: datetime()}]->(al)
            """,
            alert_id=alert_id,
            asset_id=data["asset_id"],
            title=data["title"],
            description=data["description"],
            alert_type=data["alert_type"],
            severity=data["severity"],
            ai_score=data.get("ai_score"),
            bim_location=data.get("bim_location")
            )
        return alert_id
```

---

## 13. 測試策略與案例

### 13.1 測試層級（企業全平台）

| 測試層級 | 工具 | 覆蓋目標 |
|---------|------|---------|
| 單元測試 | pytest / Jest | 需量計算 / 電費計算 / AI 派工算法 ≥ 90% |
| Cypher 查詢測試 | Neo4j Test Containers | 所有跨模組 Cypher ≥ 85% |
| OT 通訊測試 | Modbus Simulator / BACnet Simulator | 各協定採集正確性 |
| IFC 解析測試 | 測試 IFC 檔案 | 解析 → KG 匯入正確性 |
| API 整合測試 | httpx / Supertest | 全平台 API 端點 |
| GraphRAG 品質測試 | pytest + LLM 評估 | 根因準確率 ≥ 75%（跨模組更複雜）|
| E2E 測試 | Playwright | 告警 → 工單 → 派工完整流程 |
| APP 測試 | Flutter Integration Test | QR 掃描 / 巡檢提交 / 離線同步 |
| 效能測試 | k6 | 1000 設備 × 1 秒更新 |
| 安全測試 | OWASP ZAP + 滲透測試 | OWASP Top 10 + OT 安全 |

### 13.2 關鍵測試案例

**告警閉環測試（E2E）：**

| 測試 ID | 測試項目 | 步驟 | 預期結果 |
|---------|---------|------|---------|
| E2E-01 | IoT 告警完整閉環 | 模擬設備告警 → 等待 60 秒 | Alert 節點建立 → GraphRAG 完成 → 工單建立 → 派工完成 |
| E2E-02 | QR 掃描巡檢 | APP 掃描設備 QR → 填寫結果 → 提交 | Inspection 節點建立，KG 更新 |
| E2E-03 | 需量超約控制 | 模擬需量 95% | 自動卸載建議 + WebSocket 推播 + 3D Shader 閃爍 |
| E2E-04 | IFC 匯入 | 上傳 IFC 檔案 | 空間 + 設備節點正確建立於 KG，向量化完成 |
| E2E-05 | AI 派工 | 建立 HVAC 工單 | 回傳技能匹配 + 工作負荷最低的工程師 |

**知識圖譜跨模組測試：**

| 測試 ID | 測試項目 | 測試資料 | 預期結果 |
|---------|---------|---------|---------|
| KG-01 | 企業知識卡片 | 存在的 scene_object_id | 200 + 完整 10 項資訊 |
| KG-02 | 跨模組查詢 | CRITICAL 告警 → 工單 → 派工人員 | 一次查詢回傳完整鏈路 |
| KG-03 | NL2Cypher 跨模組 | 「本月維修費最高設備」| 正確 Cypher + 費用加總 |
| KG-04 | Cypher 注入防護 | 含 CREATE 的自然語言 | 422 阻擋 |
| KG-05 | AI 派工 KG | 技能 'HVAC'，地點座標 | 回傳最近 + 最閒工程師 |
| KG-06 | 圖紙語義搜尋 | 「3F 空調竣工圖」| 正確圖紙（score > 0.7）|

---

## 14. 部署設計

### 14.1 企業級 docker-compose.yml

```yaml
version: '3.9'

services:
  # ── Presentation Layer ──────────────────────────────────
  web-portal:
    build: { context: ./services/web-portal }
    ports: ["80:80", "443:443"]
    environment:
      API_URL: http://api-gateway:3000
      WS_URL: ws://api-gateway:3000

  # ── Service Layer ────────────────────────────────────────
  api-gateway:
    build: { context: ./services/api-gateway }
    ports: ["3000:3000"]
    environment:
      NEO4J_URI: bolt://neo4j:7687
      INFLUXDB_URL: http://influxdb:8086
      POSTGRES_HOST: postgres
      REDIS_HOST: redis
      KAFKA_BROKERS: kafka:9092
      AI_SERVICE_URL: http://ai-service:8000
      MINIO_ENDPOINT: http://minio:9000
    depends_on:
      neo4j: { condition: service_healthy }
      influxdb: { condition: service_healthy }
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  ai-service:
    build: { context: ./services/ai-service }
    ports: ["8000:8000"]
    environment:
      NEO4J_URI: bolt://neo4j:7687
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      KAFKA_BROKERS: kafka:9092

  alarm-orchestrator:
    build: { context: ./services/alarm-orchestrator }
    environment:
      NEO4J_URI: bolt://neo4j:7687
      KAFKA_BROKERS: kafka:9092
      REDIS_HOST: redis

  bim-service:
    build: { context: ./services/bim-service }
    environment:
      NEO4J_URI: bolt://neo4j:7687
      MINIO_ENDPOINT: http://minio:9000
    volumes:
      - bim_temp:/tmp/ifc-processing

  edge-gateway:
    build: { context: ./services/edge-gateway }
    environment:
      MQTT_BROKER: mqtt-broker
      NEO4J_URI: bolt://neo4j:7687
      INFLUXDB_URL: http://influxdb:8086
    volumes:
      - ./config/tag_mapping.yaml:/app/config/tag_mapping.yaml

  # ── Knowledge Graph ──────────────────────────────────────
  neo4j:
    image: neo4j:5-enterprise
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
      NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes"
      NEO4J_server_memory_heap_max__size: 4G
      NEO4J_server_memory_pagecache_size: 2G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - ./kg/enterprise_schema.cypher:/var/lib/neo4j/import/schema.cypher
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 15s; timeout: 10s; retries: 5

  # ── Storage Layer ────────────────────────────────────────
  influxdb:
    image: influxdb:2.7
    ports: ["8086:8086"]
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_ORG: ${INFLUXDB_ORG}
      DOCKER_INFLUXDB_INIT_BUCKET: enterprise-iot
      DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: ${INFLUXDB_TOKEN}
    volumes: [influxdb_data:/var/lib/influxdb2]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: enterprise_db
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/migrations:/docker-entrypoint-initdb.d

  minio:
    image: minio/minio:latest
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes: [minio_data:/data]
    command: server /data --console-address ":9001"

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes: [redis_data:/data]

  # ── Messaging ────────────────────────────────────────────
  mqtt-broker:
    image: emqx/emqx:5
    ports: ["1883:1883", "18083:18083"]

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk

  rabbitmq:
    image: rabbitmq:3-management
    ports: ["5672:5672", "15672:15672"]
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}

volumes:
  neo4j_data: neo4j_logs: influxdb_data: postgres_data:
  minio_data: redis_data: bim_temp:
```

---

## 15. 開發流程與排程（五階段）

### 15.1 開發策略

**核心原則：由底層到應用層（Bottom-Up）+ OT 優先 + KG Schema 早鎖定**

```
Phase 0（POC）→ Phase 1（OT + 資料層 + KG 基礎）
            → Phase 2（SCADA + EMS + BIM 基礎）
            → Phase 3（派工 + 巡檢 + AI 功能）
            → Phase 4（優化 + 創新 + SaaS）
```

### 15.2 Sprint 排程總覽（五階段 18 個月）

```
PHASE 0 — POC 技術驗證（月 0–1）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Week 1：OT 通訊 + IFC 解析驗證
  ├── Modbus TCP / BACnet / MQTT 電表讀值測試
  ├── IFC.js 解析 IFC 模型（Three.js 渲染概念驗證）
  ├── Neo4j 安裝 + APOC + GDS + Schema v0 設計
  └── Flutter APP 基礎框架 + QR 掃描 POC
Week 2：KG + EMS + 前端原型
  ├── Enterprise KG Schema v0.1（全 17 種節點）
  ├── 需量計算 / 電費計算演算法驗證
  ├── React 儀表板原型（ECharts + WebSocket）
  └── IFC → KG 匯入 POC（小型 IFC 測試）
  ✦ 產出：POC Demo + 技術選型報告

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — OT 層 + 資料層 + KG 基礎（月 1–3）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sprint 1（W1–2）：基礎設施 + Enterprise KG Schema
  ├── Docker Compose 環境、CI/CD Pipeline
  ├── Enterprise KG Schema v1.0（完整 DDL + 約束 + 向量索引）
  ├── PostgreSQL DDL（assets / work_orders / inspections / documents）
  └── InfluxDB + MinIO 設定
  ✦ Gate：KG Schema 確認，基礎設施可啟動

Sprint 2（W3–4）：Auth + 設備管理 + BIM 基礎
  ├── JWT 認證（5 種角色 RBAC）
  ├── 設備 CRUD API + KG 雙向同步
  ├── IFC 解析服務（IFCParser → KG 匯入）
  └── 前端：登入 + 設備管理樹狀列表

Sprint 3（W5–6）：OT 採集 + 邊緣閘道器
  ├── 邊緣閘道器（Modbus/BACnet/MQTT 多協定）
  ├── MQTT → Kafka → InfluxDB 管道
  ├── Neo4j 即時更新代理（Asset/Meter 節點每 60 秒）
  └── 測試：真實或模擬設備資料採集

Sprint 4（W7–8）：SCADA 監控 + WebSocket
  ├── SCADA 即時監控頁面（多設備狀態燈號）
  ├── WebSocket Server（全設備類型推播）
  ├── 歷史趨勢查詢（InfluxDB + ECharts）
  └── 設備遠端控制 API（需 Engineer+，控制日誌 KG）

Sprint 5（W9–10）：EMS 需量 + 電費
  ├── 需量計算微服務（15 分鐘滑動視窗）
  ├── EMS 儀表板（需量進度條 + 即時更新）
  ├── 電費試算（台電費率 + Neo4j Tariff 節點）
  └── KG 費率時段整合

Sprint 6（W11–12）：告警引擎 + 通知 + MVP 驗收
  ├── 多層次告警規則引擎（規則 / AI 初篩）
  ├── 通知管道（Email / LINE / Web Push）
  ├── 告警 → Neo4j Alert 節點自動建立
  └── MVP 驗收 Demo（SCADA + EMS + KG 基礎）
  ✦ PHASE 1 Gate：MVP 驗收通過

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — BIM + AI + 3D 強化（月 3–7）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sprint 7（W13–14）：BIM 3D 場景 + KG 整合
  ├── Three.js + IFC.js BIM 場景渲染
  ├── 點擊設備 → 企業知識卡片（含工單/能耗/圖紙）
  └── 能源熱力圖 + 告警 Pulse Shader

Sprint 8（W15–16）：AI 異常偵測 + 負載預測
  ├── Isolation Forest 部署（設備異常分數）
  ├── LSTM 負載預測（24h，整合氣象 API）
  └── AI 分數疊加 3D 熱力圖

Sprint 9（W17–18）：GraphRAG 全平台根因分析
  ├── Enterprise GraphRAG Pipeline（跨 5 個模組脈絡）
  ├── 告警觸發自動 GraphRAG（Kafka Consumer）
  ├── 根因報告 Panel（含 BIM 定位 + 圖紙連結）
  └── 測試：GraphRAG 跨模組準確率 ≥ 70%
  ✦ Gate：GraphRAG 可跨模組分析

Sprint 10（W19–20）：NL2Cypher + AI 全平台助理
  ├── NL2Cypher（能源 + 維運 + BIM 跨模組語義）
  ├── AI 全平台助理（戰情中心 Chat UI）
  └── Cypher 安全驗證（白名單）

Sprint 11（W21–22）：向量索引 + 圖紙語義搜尋
  ├── 四種向量索引建立（asset/alert/document/workorder）
  ├── IFC 解析時自動向量化
  ├── 圖紙語義搜尋 API
  └── KG 瀏覽器頁面（設備關係圖）

Sprint 12（W23–24）：Phase 2 整合驗收
  ├── AI 全平台功能整合測試
  ├── 模型驗收（預測 MAPE < 10%，異常精確率 ≥ 85%）
  └── Phase 2 業主驗收 Demo
  ✦ PHASE 2 Gate：BIM + AI + GraphRAG 驗收通過

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3 — 派工 + 巡檢 + EAM（月 7–12）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sprint 13–14：工單系統（PM/CM/EM）+ AI 派工
  ├── 工單 CRUD + 看板 + 甘特圖
  ├── 告警 → 自動建工單（Kafka Consumer）
  └── AI 派工引擎（KG 技能 + 負荷 + 距離）
  ✦ Gate：告警 → 工單 → 派工完整閉環

Sprint 15–16：Flutter APP 巡檢
  ├── APP 基礎框架（登入 / 工單列表 / 通知）
  ├── QR 掃描 → KG 知識卡片
  ├── GPS + 拍照 + 量測 + 電子簽章
  └── 離線模式 + 自動同步

Sprint 17–18：EAM/CMMS 資產履歷
  ├── 設備生命週期管理
  ├── 維保排程自動建單（PM 工單）
  ├── RUL 預測模型（rul_days → Neo4j Asset）
  └── 備品管理 + 庫存觸發

Sprint 19–20：圖資管理（DMS）+ 施工日誌
  ├── 圖紙上傳（MinIO）+ 版本管控
  ├── DMS 頁面（預覽 / 版本 / 連結設備）
  └── 施工日誌（ConstructionLog KG 節點）

Sprint 21–22：戰情中心 Dashboard + Phase 3 驗收
  ├── 戰情中心整合（全平台 KPI + 3D BIM）
  ├── 全平台 KPI 報表（MTTR/MTBF/節能率/碳排）
  └── Phase 3 業主驗收 Demo
  ✦ PHASE 3 Gate：全平台功能完整驗收

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 4 — 優化 + 創新（月 12–18）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Month 12–14：儲能 + 碳排 + GIS 地理圖資
Month 14–16：Node Similarity + Link Inference + 預測維護進階
Month 16–18：多租戶 SaaS + 正式上線（GA）
  ✦ PHASE 4 Gate：正式上線 + SLA 簽署
```

### 15.3 測試驗證里程碑

| 里程碑 | 時間 | 驗證內容 | 通過標準 |
|-------|------|---------|---------|
| M1 環境就緒 | Sprint 1 末 | Enterprise KG Schema + 所有服務啟動 | 無服務失敗 |
| M2 OT 採集 | Sprint 3 末 | 多協定設備資料採集 + KG 同步 | 連續無中斷 |
| M3 SCADA + EMS | Sprint 6 末 | 基礎監控 + 需量計算 + 電費 | MVP 業主驗收 |
| M4 BIM 整合 | Sprint 7 末 | IFC 匯入 KG + 3D 知識卡片 | 業主操作確認 |
| M5 GraphRAG | Sprint 9 末 | 跨模組根因分析 | 準確率 ≥ 70% |
| M6 AI 全平台 | Sprint 12 末 | NL + 向量搜尋 + 預測 | Phase 2 驗收 |
| M7 工單閉環 | Sprint 14 末 | 告警 → 工單 → 派工 → 完工 | E2E 完整通過 |
| M8 APP 巡檢 | Sprint 16 末 | QR 掃描 + 離線模式 + 同步 | APP 測試通過 |
| M9 全平台 | Sprint 22 末 | 完整企業平台 | Phase 3 驗收 |
| M10 正式上線 | Month 18 | 生產環境全功能 | SLA 協議簽署 |

---

## 16. 文案與風格規範

### 16.1 語氣矩陣（全平台）

| 情境 | 語氣 | 範例 |
|------|------|------|
| 正常狀態 | 平穩資訊 | 「全廠 238 台設備運轉正常，需量 75%」 |
| 需注意 | 提醒建議 | 「AHU-3F-01 效率略低，建議本月安排保養」 |
| 告警狀態 | 明確指導 | 「冰機 #1 高壓跳脫，已自動建立緊急工單」 |
| 嚴重異常 | 緊急行動 | 「需量超約！陳大維已收到通知，預計 15 分鐘到場」 |

### 16.2 戰情中心 LINE 通知範本

```
🔴 緊急設備告警

A棟 3F 空調箱 AHU-3F-01
告警：高壓保護跳脫，緊急停機

AI 根因：冷媒充填量不足，建議補充 R410A

已自動處理：
  ✓ 緊急工單 WO-2026-001234 已建立
  ✓ 陳大維（分機 1234）已接收派工
  ✓ 能源影響：需量降低 42 kW

📍 BIM 定位：https://platform.com/bim?asset=ahu-3f-01
📋 工單詳情：https://platform.com/wo/001234
```

---

## 17. 風險與注意事項

### 17.1 OT 整合風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|------|------|---------|
| 多協定不相容（BACnet/Modbus/KNX）| 高 | 高 | Phase 0 全協定 POC，準備協定轉換器 |
| OT/IT 網路安全隔離不足 | 高 | 極高 | 強制 VLAN 隔離，OT 網路獨立 |
| CCTV RTSP 延遲 | 中 | 低 | 影像分析在 Edge 執行，不傳原始流 |
| 設備控制安全（誤操作）| 高 | 極高 | 雙確認機制，關鍵設備鎖定，操作日誌 KG |

### 17.2 BIM / 圖資風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|------|------|---------|
| IFC 版本不相容（IFC2x3 vs IFC4）| 高 | 中 | IFC.js 多版本支援，提前確認 BIM 規格 |
| BIM 模型過大（> 500MB）| 中 | 中 | Web 端分層載入 + LOD，MinIO CDN 加速 |
| 設備 IFC GUID 與現場不符 | 中 | 高 | QR Code 掃描二次確認，人工標記修正流程 |
| 竣工圖與實際安裝不符 | 高 | 中 | 巡檢時拍照更新，施工日誌 KG 追蹤 |

### 17.3 知識圖譜風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|------|------|---------|
| Enterprise KG Schema 大規模修改 | 中 | 高 | Phase 1 前鎖定 80% Schema |
| NL2Cypher 生成跨模組錯誤語句 | 中 | 高 | 白名單驗證 + 結果人工抽樣確認 |
| GraphRAG 幻覺導致錯誤派工 | 中 | 極高 | 自動派工需人工確認（非全自動）|
| Neo4j 即時更新頻率（全設備）| 高 | 中 | 批次 60 秒更新 + Redis 快取 30 秒 |

### 17.4 維運與安全注意事項

- **OT/IT 網路強制隔離**：設備控制網路與 IT 網路 VLAN 分離，不可合用
- **設備控制雙確認**：高風險設備（消防/電力主開關）需二次確認 + 主管授權
- **知識圖譜 RBAC**：Neo4j 層級權限控制（Viewer 唯讀，Engineer 部分讀寫）
- **工控安全合規**：符合 IEC 62443 工控安全標準
- **個資保護**：人員位置資訊（GPS）需取得同意，符合個資法
- **Audit Log 不可篡改**：所有控制操作寫入不可刪除的稽核日誌

---

## 18. 後續擴充建議

### 18.1 短期（上線後 3–6 個月）

- **Neo4j Bloom 整合**：非技術主管自然語言探索設備關係圖
- **LLM Graph Builder**：從維修手冊 PDF 自動抽取知識，豐富 KG 維修知識庫
- **AR 現場巡檢**：Flutter APP + AR 疊加（設備狀態 + BIM 位置 + 巡檢歷史）
- **DCIM 機房擴充**：U 位管理、電力 PUE 分析、熱通道溫度可視化

### 18.2 中期（6–12 個月）

- **GraphRAG 多跳推理**：5 跳跨模組影響鏈分析，引入 PageRank 排序
- **時序知識圖譜（Temporal KG）**：事件時序因果鏈，設備劣化歷程追蹤
- **區塊鏈綠電憑證**：太陽能發電量 NFT 憑證，支援 RE100 + ESG
- **多租戶 SaaS 平台**：訂閱制（依監控點數），白標服務

### 18.3 長期（12 個月以上）

- **Graph Neural Networks（GNN）**：在 Enterprise KG 結構上學習故障模式
- **自主決策閉環**：AI 感知異常 → KG 分析 → 自動控制 + 派工（需業主授權）
- **跨場域聯邦 KG**：多廠區共享故障知識，保護各廠資料隱私
- **數位孿生模擬（What-If）**：「如果空調設定 +2°C，能耗/費用/舒適度如何？」

---

> **文件維護說明**
> 本文件 v4.0 整合企業完整平台規格（Web SCADA + EMS + BIM/DCIM + 派工巡檢 + 圖資 + EAM）
> × AI 知識圖譜（v3.0）× 3D 數位孿生。
> 每個 Phase Gate 前進行文件審查，Enterprise KG Schema 變更需全團隊同步。
>
> **平台核心理念：**
> 「單一平台、全域感知、知識驅動、預測運維。
>  從孤立設備數據，到企業知識圖譜神經中樞，
>  讓 AI 真正理解每一台設備的過去、現在與未來。」
