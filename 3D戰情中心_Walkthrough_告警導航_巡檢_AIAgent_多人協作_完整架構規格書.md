# 3D戰情中心 Walkthrough + 告警導航 + 巡檢 + AI Agent + 多人協作完整架構規格書

版本：v1.0  
用途：提供 Vibe Coding / AI Coding / 軟體開發團隊作為 3D 智慧建築戰情中心平台開發依據  
適用場景：智慧建築、園區、社區、資料中心、廠務、校園、醫院、公共集合住宅、機房、工廠

---

# 1. 系統定位

本系統為一套結合 3D BIM、EMS、SCADA、BMS、DCIM、圖資管理、派工巡檢、告警管理與 AI Agent 的 3D 戰情中心平台。

核心目標：

1. 以 3D BIM 模型作為建築與設備的視覺化主介面。
2. 使用第一人稱 Walkthrough 模式進行空間漫遊、巡檢與設備查詢。
3. 當設備發生告警時，自動定位告警設備並產生導航路徑。
4. 支援巡檢人員依任務路線完成設備巡檢。
5. 支援 AI Agent 協助查詢設備、判讀告警、推薦處置流程與導引維修。
6. 支援多人協作，讓管理員、維修員、巡檢員、保全與業主可共同在 3D 場景中查看狀態。
7. 可與 EMS / SCADA / BMS / DCIM / 圖資 / 工單系統整合。

---

# 2. 核心模組總覽

| 模組 | 說明 |
|---|---|
| 3D BIM Viewer | 載入建築、結構、MEP、設備模型 |
| Walkthrough 第一人稱漫遊 | 使用 WASD / 滑鼠 / 導航模式於建築中行走 |
| 告警導航 | 告警發生時自動定位並導航到設備 |
| 巡檢模式 | 依巡檢任務逐點導航與打卡 |
| AI Agent | 自然語言查詢、告警分析、維修建議、導航指令 |
| 多人協作 | 顯示線上人員位置、角色、任務狀態 |
| 設備資訊面板 | 顯示點位、狀態、文件、COBie、維修紀錄 |
| 2D 平面圖 MiniMap | 顯示目前樓層、位置、方向與路徑 |
| 圖資管理 | 維修手冊、竣工圖、SOP、保固文件 |
| EMS/SCADA 即時資料 | DI / DO / AI / AO 點位狀態 |
| 派工/報修 | 產生工單、追蹤維修、巡檢紀錄 |
| 權限控管 | 依角色控制可視資料與操作權限 |

---

# 3. 整體系統架構

```text
使用者端
  ├─ 3D 戰情中心 Web App
  ├─ 平板巡檢 App
  ├─ 大螢幕戰情中心
  └─ VR / MR 裝置

前端層
  ├─ 3D Viewer
  ├─ Walkthrough Controller
  ├─ MiniMap
  ├─ Alarm Navigation UI
  ├─ Inspection UI
  ├─ AI Agent Chat UI
  └─ Multi-user Presence UI

應用服務層
  ├─ BIM Model Service
  ├─ Equipment Service
  ├─ Point Data Service
  ├─ Alarm Service
  ├─ Navigation Service
  ├─ Inspection Service
  ├─ Work Order Service
  ├─ AI Agent Orchestrator
  ├─ Collaboration Service
  └─ Document Service

資料層
  ├─ PostgreSQL
  ├─ Redis
  ├─ Object Storage
  ├─ Time Series DB
  └─ Vector DB

現場整合層
  ├─ Modbus Gateway
  ├─ BACnet Gateway
  ├─ OPC UA Gateway
  ├─ MQTT Broker
  ├─ CCTV / RTSP
  └─ BMS / EMS / SCADA
```

---

# 4. 使用者角色

| 角色 | 說明 | 權限重點 |
|---|---|---|
| viewer | 一般瀏覽者 | 查看模型、查看狀態 |
| operator | 中控操作員 | 查看告警、操作 DO/AO |
| inspector | 巡檢人員 | 執行巡檢、填寫巡檢結果 |
| technician | 維修人員 | 查看維修文件、處理工單 |
| engineer | 工程師 | 設定點位、模型、路徑 |
| bim_manager | BIM 管理員 | 管理模型、COBie、空間資料 |
| admin | 系統管理員 | 權限、系統設定、刪除資料 |
| ai_agent | AI 助理 | 查詢、分析、建議，不可直接控制設備 |

---

# 5. 3D BIM Viewer 功能

## 5.1 模型載入

支援格式：

| 格式 | 用途 |
|---|---|
| GLB / GLTF | Web 端快速載入 |
| IFC | 開放 BIM 資料交換 |
| SVF / SVF2 | Autodesk Viewer |
| 3D Tiles | 大型園區、多棟建築 |
| Metadata JSON | BIM 元件屬性、設備資料 |
| NavMesh JSON | 導航網格資料 |
| Collision Mesh | 碰撞資料 |

## 5.2 模型操作

需支援：

1. 放大。
2. 縮小。
3. 平移。
4. 旋轉。
5. 第一人稱漫遊。
6. 飛行模式。
7. 樓層切換。
8. 系統別顯示 / 隱藏。
9. 設備搜尋。
10. 設備定位。
11. 設備高亮。
12. 剖切。
13. 透明化。
14. 隔離顯示。
15. 重置視角。

---

# 6. Walkthrough 第一人稱漫遊模組

## 6.1 功能目標

Walkthrough 模組需讓使用者以接近現場行走的方式，在 3D 建築內巡視設備、尋找告警、執行巡檢與查看設備資訊。

## 6.2 操作方式

| 操作 | 功能 |
|---|---|
| W | 前進 |
| S | 後退 |
| A | 左移 |
| D | 右移 |
| Shift | 快走 |
| Ctrl | 慢走 |
| Space | 跳躍或上樓梯輔助 |
| C | 蹲下 |
| 滑鼠移動 | 控制視角 |
| E | 開啟設備資訊 |
| F | 聚焦設備 |
| M | 開啟 MiniMap |
| Esc | 離開 Walkthrough |

## 6.3 Camera 參數

```json
{
  "camera_height": 1.7,
  "walk_speed": 2.0,
  "run_speed": 5.0,
  "crouch_speed": 1.0,
  "rotation_speed": 1.2,
  "fov": 75,
  "near": 0.1,
  "far": 5000,
  "eye_level_min": 1.2,
  "eye_level_max": 2.0
}
```

## 6.4 漫遊模式

| 模式 | 說明 |
|---|---|
| walk | 一般行走 |
| fly | 飛行檢視 |
| inspect | 巡檢模式 |
| alarm_guide | 告警導航模式 |
| maintenance | 維修導引模式 |
| training | 教育訓練模式 |
| vr | VR 模式 |
| multi_user | 多人協作模式 |

## 6.5 碰撞與重力

需支援：

1. 不可穿牆。
2. 不可穿樓板。
3. 可限制設備穿越。
4. 可開啟或關閉碰撞。
5. 可開啟或關閉重力。
6. 可處理樓梯與斜坡。
7. 可設定人物高度與半徑。

碰撞設定：

```json
{
  "enabled": true,
  "gravity": true,
  "avatar_height": 1.7,
  "avatar_radius": 0.35,
  "step_height": 0.25,
  "slope_limit": 35,
  "allow_clip": false
}
```

---

# 7. NavMesh 與導航系統

## 7.1 NavMesh 目標

NavMesh 用於計算建築內可行走區域，支援：

1. 設備導航。
2. 告警導航。
3. 巡檢路線。
4. 跨樓層導航。
5. 最短路徑。
6. 避開不可通行區域。

## 7.2 NavMesh 資料來源

| 來源 | 說明 |
|---|---|
| BIM Floor / Room | 從 BIM 樓板與空間萃取 |
| 2D 平面圖 | 從平面圖 Polygon 建立 |
| 人工繪製 | 後台設定可行走區 |
| IFC Space | 從 IFC 空間轉換 |
| Revit Room/Space | 從 Revit Room 或 Space 轉換 |

## 7.3 NavMesh JSON

```json
{
  "navmesh_id": "A-B1-NAV-001",
  "building": "A",
  "floor": "B1",
  "version": "1.0",
  "nodes": [
    {
      "node_id": "N001",
      "x": 10.5,
      "y": 0,
      "z": 20.3,
      "type": "walkable"
    }
  ],
  "edges": [
    {
      "from": "N001",
      "to": "N002",
      "distance": 5.2,
      "type": "corridor"
    }
  ],
  "connections": [
    {
      "from_floor": "B1",
      "to_floor": "1F",
      "type": "stair",
      "node_id": "STAIR-01"
    }
  ]
}
```

## 7.4 跨樓層導航

支援跨樓層節點：

| 節點類型 | 說明 |
|---|---|
| stair | 樓梯 |
| elevator | 電梯 |
| ramp | 斜坡 |
| escalator | 電扶梯 |
| fire_escape | 避難梯 |

跨樓層流程：

```text
目前位置
  ↓
目前樓層最近 NavMesh Node
  ↓
最近樓梯 / 電梯
  ↓
目標樓層連接點
  ↓
目標設備
```

---

# 8. 告警導航模組

## 8.1 功能目標

當 EMS / SCADA / BMS 發生告警時，系統需：

1. 接收告警。
2. 判斷告警等級。
3. 找出對應設備。
4. 定位 3D 模型。
5. 顯示 2D MiniMap。
6. 產生導航路徑。
7. 推送給值班人員或維修人員。
8. 顯示處置 SOP。
9. 可建立報修或派工單。

## 8.2 告警等級

| 等級 | 說明 | 顯示 |
|---|---|---|
| info | 資訊 | 藍色 |
| warning | 警告 | 黃色 |
| alarm | 警報 | 紅色 |
| critical | 重大警報 | 紅色閃爍 |
| fault | 故障 | 橘紅 |
| offline | 離線 | 灰色 |

## 8.3 告警資料格式

```json
{
  "alarm_id": "ALM-20260525-0001",
  "point_id": "DI_FP_PUMP_FAULT",
  "equipment_code": "FP-PMP-001",
  "equipment_name": "消防泵浦",
  "alarm_level": "critical",
  "alarm_message": "消防泵浦故障",
  "building": "A",
  "floor": "B1",
  "space_name": "消防機房",
  "timestamp": "2026-05-25T10:10:00+08:00"
}
```

## 8.4 告警導航 UI

顯示：

1. 告警設備名稱。
2. 告警等級。
3. 所在樓層。
4. 所在空間。
5. 距離。
6. 預估到達時間。
7. 建議處置 SOP。
8. 導航按鈕。
9. 建立工單按鈕。
10. 通知維修人員按鈕。

---

# 9. 巡檢模組

## 9.1 巡檢流程

```text
建立巡檢任務
  ↓
指派巡檢人員
  ↓
產生巡檢路線
  ↓
Walkthrough 導航到設備
  ↓
到達設備自動判定
  ↓
填寫巡檢項目
  ↓
拍照 / 備註 / 數值確認
  ↓
完成該點
  ↓
下一個巡檢點
  ↓
完成任務
```

## 9.2 巡檢點資料

```json
{
  "inspection_point_id": "INSP-P-001",
  "equipment_code": "AHU-001",
  "equipment_name": "空調箱 AHU-001",
  "building": "A",
  "floor": "7F",
  "space_name": "空調機房",
  "check_items": [
    {
      "item_code": "TEMP_CHECK",
      "item_name": "檢查溫度",
      "type": "number",
      "unit": "°C",
      "min": 20,
      "max": 28
    },
    {
      "item_code": "NOISE_CHECK",
      "item_name": "異音檢查",
      "type": "boolean"
    }
  ]
}
```

## 9.3 到達判定

需避免假巡檢。

判定條件：

1. 使用者位置距離設備小於設定距離。
2. 停留時間超過指定秒數。
3. 可搭配 NFC / QR Code / BLE Beacon。
4. 可要求拍照。
5. 可要求即時定位。

設定：

```json
{
  "arrival_distance_m": 3,
  "minimum_stay_seconds": 10,
  "require_photo": false,
  "require_qrcode": false,
  "require_nfc": false
}
```

---

# 10. AI Agent 模組

## 10.1 AI Agent 目標

AI Agent 用於輔助使用者在 3D 戰情中心中查詢、判斷、導航與維修建議。

可回答：

1. 這個設備在哪裡？
2. 導航到消防泵浦。
3. 目前有哪些重大警報？
4. 這個警報可能原因是什麼？
5. 消防泵浦故障 SOP 是什麼？
6. 最近一次維修紀錄是什麼？
7. 這個設備有哪些 DI / DO / AI / AO 點位？
8. 這個設備保固到什麼時候？
9. 幫我建立報修單。
10. 導航到最近的電氣室。

## 10.2 AI Agent 能力

| 能力 | 說明 |
|---|---|
| Equipment Lookup | 查詢設備 |
| Alarm Analysis | 分析告警 |
| SOP Retrieval | 查找 SOP |
| Navigation Command | 產生導航 |
| Work Order Draft | 建立工單草稿 |
| Inspection Assistant | 巡檢協助 |
| Document QA | 查詢手冊、維修文件 |
| COBie QA | 查詢 COBie 資料 |
| Multi-step Plan | 多步驟處置建議 |

## 10.3 AI Agent 工具

AI Agent 可呼叫：

```text
search_equipment
get_equipment_status
get_alarm_list
get_alarm_detail
get_navigation_path
get_sop_document
get_maintenance_history
create_work_order_draft
get_inspection_task
get_cobie_info
```

## 10.4 AI Agent 安全限制

1. AI 不可直接執行 DO / AO 控制。
2. AI 可產生控制建議，但需人工確認。
3. AI 建立工單需人工確認。
4. AI 回答需引用資料來源。
5. AI 不得捏造設備狀態。
6. AI 無資料時需回答查無資料。
7. AI 不可修改 BIM 模型。
8. AI 不可刪除文件與工單。

---

# 11. 多人協作模組

## 11.1 功能目標

多人協作需支援多名使用者同時進入 3D 戰情中心，彼此可以看到：

1. 位置。
2. 角色。
3. 狀態。
4. 任務。
5. 目前查看設備。
6. 是否正在處理告警。
7. 語音或文字訊息。

## 11.2 多人資料格式

```json
{
  "user_id": "u001",
  "display_name": "王技師",
  "role": "technician",
  "avatar_type": "engineer",
  "building": "A",
  "floor": "B1",
  "position": {
    "x": 12.5,
    "y": 0,
    "z": 8.3
  },
  "rotation": {
    "x": 0,
    "y": 90,
    "z": 0
  },
  "status": "handling_alarm",
  "current_task_id": "WO-20260525-001"
}
```

## 11.3 Presence 更新頻率

建議：

| 場景 | 更新頻率 |
|---|---|
| 一般瀏覽 | 1 秒 |
| Walkthrough | 200~500 ms |
| 巡檢模式 | 500 ms |
| 告警處理 | 200 ms |
| 大螢幕展示 | 1~3 秒 |

---

# 12. 設備資訊面板

點擊設備或導航到設備後，需顯示設備面板。

## 12.1 面板內容

| 分頁 | 內容 |
|---|---|
| 基本資料 | 設備名稱、編號、樓層、空間、系統 |
| 即時監控 | DI / DO / AI / AO |
| 告警 | 目前告警、歷史告警 |
| 維修紀錄 | 報修、工單、保養 |
| 文件 | 手冊、SOP、竣工圖、規格書 |
| COBie | Component、Type、Space、Floor |
| 巡檢 | 巡檢項目、最近巡檢結果 |
| 2D 定位 | 平面圖位置 |
| 3D 定位 | BIM 模型元件 |

## 12.2 點位狀態

| 點位類型 | 顯示 |
|---|---|
| DI | 狀態、警報、故障 |
| DO | 開關狀態、控制按鈕 |
| AI | 數值、單位、上下限 |
| AO | 設定值、可調範圍 |

---

# 13. WebSocket 即時事件

## 13.1 事件類型

| event | 說明 |
|---|---|
| point_value_changed | 點位值變更 |
| alarm_created | 新告警 |
| alarm_acknowledged | 告警確認 |
| alarm_cleared | 告警解除 |
| user_position_updated | 使用者位置更新 |
| inspection_updated | 巡檢更新 |
| work_order_created | 工單建立 |
| navigation_started | 導航開始 |
| navigation_finished | 導航完成 |
| ai_agent_message | AI 回覆 |

## 13.2 告警推播範例

```json
{
  "event": "alarm_created",
  "data": {
    "alarm_id": "ALM-001",
    "equipment_code": "FP-PMP-001",
    "alarm_level": "critical",
    "message": "消防泵浦故障",
    "building": "A",
    "floor": "B1",
    "space_name": "消防機房"
  }
}
```

---

# 14. 資料庫設計

## 14.1 Walkthrough 位置紀錄

```sql
CREATE TABLE user_walkthrough_positions (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    building VARCHAR(100),
    floor VARCHAR(50),
    x NUMERIC,
    y NUMERIC,
    z NUMERIC,
    rotation_x NUMERIC,
    rotation_y NUMERIC,
    rotation_z NUMERIC,
    mode VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 14.2 NavMesh 資料表

```sql
CREATE TABLE navigation_meshes (
    id BIGSERIAL PRIMARY KEY,
    navmesh_code VARCHAR(100) NOT NULL UNIQUE,
    building VARCHAR(100),
    floor VARCHAR(50),
    version VARCHAR(50),
    navmesh_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 14.3 導航紀錄

```sql
CREATE TABLE navigation_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_code VARCHAR(100) NOT NULL UNIQUE,
    user_id VARCHAR(100),
    source_type VARCHAR(50),
    source_id VARCHAR(100),
    target_equipment_code VARCHAR(100),
    start_position JSONB,
    target_position JSONB,
    path_json JSONB,
    status VARCHAR(50),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);
```

## 14.4 巡檢任務

```sql
CREATE TABLE inspection_tasks (
    id BIGSERIAL PRIMARY KEY,
    task_code VARCHAR(100) NOT NULL UNIQUE,
    task_name VARCHAR(255),
    assigned_to VARCHAR(100),
    building VARCHAR(100),
    floor VARCHAR(50),
    status VARCHAR(50),
    planned_start_at TIMESTAMP,
    planned_end_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 14.5 巡檢點

```sql
CREATE TABLE inspection_task_points (
    id BIGSERIAL PRIMARY KEY,
    task_code VARCHAR(100) NOT NULL,
    sequence_no INTEGER,
    equipment_code VARCHAR(100),
    equipment_name VARCHAR(255),
    building VARCHAR(100),
    floor VARCHAR(50),
    space_name VARCHAR(255),
    check_items JSONB,
    arrival_rule JSONB,
    status VARCHAR(50),
    arrived_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

## 14.6 AI Agent 對話紀錄

```sql
CREATE TABLE ai_agent_conversations (
    id BIGSERIAL PRIMARY KEY,
    conversation_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    message_role VARCHAR(50),
    message_text TEXT,
    tool_calls JSONB,
    referenced_sources JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 14.7 多人協作狀態

```sql
CREATE TABLE collaboration_presence (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    role VARCHAR(50),
    building VARCHAR(100),
    floor VARCHAR(50),
    position JSONB,
    rotation JSONB,
    status VARCHAR(50),
    current_task_id VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

# 15. API 規格

## 15.1 取得可行走路徑

```http
POST /api/navigation/path
```

Body：

```json
{
  "user_id": "u001",
  "from": {
    "building": "A",
    "floor": "1F",
    "x": 10,
    "y": 0,
    "z": 20
  },
  "to": {
    "equipment_code": "FP-PMP-001"
  }
}
```

## 15.2 開始導航

```http
POST /api/navigation/start
```

## 15.3 結束導航

```http
POST /api/navigation/finish
```

## 15.4 更新使用者位置

```http
POST /api/walkthrough/position
```

## 15.5 取得線上使用者

```http
GET /api/collaboration/presence
```

## 15.6 開始巡檢

```http
POST /api/inspection/tasks/{task_code}/start
```

## 15.7 完成巡檢點

```http
POST /api/inspection/tasks/{task_code}/points/{point_id}/complete
```

## 15.8 AI Agent 對話

```http
POST /api/ai-agent/chat
```

Body：

```json
{
  "user_id": "u001",
  "message": "導航到消防泵浦，並顯示最近一次維修紀錄"
}
```

---

# 16. 前端元件架構

```text
src/
  pages/
    CommandCenter3DPage.tsx
    WalkthroughPage.tsx
    AlarmNavigationPage.tsx
    InspectionWalkthroughPage.tsx
  components/
    viewer/
      BimViewer.tsx
      ModelLayerControl.tsx
      EquipmentHighlighter.tsx
    walkthrough/
      FirstPersonController.tsx
      WalkthroughCamera.tsx
      CollisionManager.tsx
      GravityController.tsx
      WalkthroughHUD.tsx
    navigation/
      NavigationPathRenderer.tsx
      NavigationInstructionPanel.tsx
      CrossFloorNavigator.tsx
      MiniMap.tsx
    alarm/
      AlarmToast.tsx
      AlarmNavigationPanel.tsx
      AlarmEquipmentMarker.tsx
    inspection/
      InspectionTaskPanel.tsx
      InspectionChecklist.tsx
      InspectionProgress.tsx
      ArrivalVerifier.tsx
    ai/
      AiAgentPanel.tsx
      AiToolResultCard.tsx
      AiSuggestionPanel.tsx
    collaboration/
      UserAvatar3D.tsx
      PresenceList.tsx
      UserLocationMarker.tsx
    equipment/
      EquipmentInfoPanel.tsx
      EquipmentRealtimeStatus.tsx
      EquipmentDocumentList.tsx
      EquipmentMaintenanceHistory.tsx
```

---

# 17. 後端服務拆分

| 服務 | 職責 |
|---|---|
| bim-service | 模型、元件、COBie |
| point-service | 即時點位 DI/DO/AI/AO |
| alarm-service | 告警產生、確認、解除 |
| navigation-service | NavMesh、路徑計算 |
| walkthrough-service | 使用者位置與漫遊狀態 |
| inspection-service | 巡檢任務與紀錄 |
| workorder-service | 報修與維修工單 |
| document-service | 文件、手冊、SOP |
| ai-agent-service | AI 查詢、工具調用、建議 |
| collaboration-service | 多人在線、Presence |
| notification-service | LINE、Email、簡訊、App 推播 |

---

# 18. Redis 快取設計

建議 Redis 儲存：

| Key | 用途 |
|---|---|
| realtime:point:{point_id} | 即時點位值 |
| alarm:active | 目前未解除告警 |
| user:position:{user_id} | 使用者位置 |
| nav:path:{session_id} | 導航路徑 |
| inspection:task:{task_code} | 巡檢任務狀態 |
| presence:online_users | 在線使用者 |
| ai:context:{conversation_id} | AI 對話上下文 |

---

# 19. AI Agent RAG 資料來源

AI Agent 可查詢：

1. 設備台帳。
2. BIM 元件 Metadata。
3. COBie。
4. 維修手冊。
5. SOP。
6. 工單紀錄。
7. 巡檢紀錄。
8. 告警紀錄。
9. 點位即時值。
10. 2D 平面定位。
11. 3D 模型定位。
12. 廠商維護紀錄。

---

# 20. 安全與權限

## 20.1 DO/AO 控制限制

AI Agent 不可直接控制 DO/AO。  
人員操作 DO/AO 時需：

1. 權限檢查。
2. 二次確認。
3. 操作紀錄。
4. 控制結果回饋。
5. 失敗回復與提示。

## 20.2 告警處置

告警確認需記錄：

1. 操作人員。
2. 確認時間。
3. 處置說明。
4. 是否建立工單。
5. 是否通知相關人員。

---

# 21. 效能規格

## 21.1 前端效能

| 項目 | 要求 |
|---|---|
| FPS | 一般 30 FPS 以上，建議 60 FPS |
| 模型載入 | 支援延遲載入 |
| 大型模型 | 支援 LOD / 3D Tiles |
| 狀態更新 | 不可每次重繪整個場景 |
| 多人位置 | 使用插值減少跳動 |
| MiniMap | 只更新必要標記 |
| 告警閃爍 | 避免過度動畫造成卡頓 |

## 21.2 後端效能

| 項目 | 要求 |
|---|---|
| 即時點位 | WebSocket 延遲 < 1 秒 |
| 告警推播 | 重大告警 < 3 秒 |
| 導航路徑計算 | 一般 < 2 秒 |
| Presence 更新 | 支援 50~200 人同時在線 |
| AI Agent 回覆 | 一般查詢 < 10 秒 |
| 巡檢紀錄寫入 | < 1 秒 |

---

# 22. 部署架構

## 22.1 Docker 服務

```text
frontend
api-gateway
bim-service
point-service
alarm-service
navigation-service
walkthrough-service
inspection-service
workorder-service
document-service
ai-agent-service
collaboration-service
postgres
redis
mqtt-broker
object-storage
vector-db
```

## 22.2 K8S 建議

大型案場建議：

1. 前後端分離。
2. WebSocket Service 獨立擴展。
3. AI Agent Service 獨立部署。
4. Model Asset 使用 Object Storage + CDN。
5. Navigation Service 可獨立擴展。
6. Point Service 與 Gateway 可分離部署。

---

# 23. 驗收條件

## 23.1 Walkthrough 驗收

- 可 WASD 行走。
- 可控制滑鼠視角。
- 可設定人物高度與速度。
- 不可穿牆或穿樓板。
- 可跨樓層導航。
- 可開啟 MiniMap。
- 可點選或靠近設備開啟資訊面板。

## 23.2 告警導航驗收

- 告警發生時可定位設備。
- 可在 3D 模型中高亮設備。
- 可在 2D MiniMap 中標示設備。
- 可產生導航路徑。
- 可顯示 SOP。
- 可建立工單。

## 23.3 巡檢驗收

- 可建立巡檢任務。
- 可產生巡檢路線。
- 可逐點導航。
- 可判定是否到達設備。
- 可填寫巡檢項目。
- 可上傳照片或備註。
- 可完成巡檢並產出紀錄。

## 23.4 AI Agent 驗收

- 可查詢設備位置。
- 可查詢設備狀態。
- 可查詢告警原因。
- 可查詢維修文件。
- 可查詢 COBie。
- 可產生導航建議。
- 不可直接控制 DO/AO。
- 無資料時需明確回覆查無資料。

## 23.5 多人協作驗收

- 可看到在線使用者。
- 可看到使用者位置。
- 可看到使用者角色。
- 可看到使用者正在處理的任務。
- 使用者位置更新需平順。
- 可支援多人同時進入 3D 場景。

---

# 24. MVP 第一階段

建議第一階段完成：

1. 3D BIM Viewer。
2. 第一人稱 Walkthrough。
3. MiniMap。
4. 設備資訊面板。
5. 告警設備定位。
6. 基本導航路徑。
7. 巡檢任務與巡檢點。
8. AI Agent 查詢設備與告警。
9. 多人 Presence。
10. WebSocket 即時點位與告警。

---

# 25. 第二階段擴充

1. 完整跨樓層導航。
2. VR / MR。
3. 多人語音。
4. AI 自動生成巡檢路線。
5. AI 告警根因分析。
6. AI 維修 SOP 推薦。
7. 3D Tiles 大型模型串流。
8. 數位分身 Avatar。
9. 巡檢熱區分析。
10. 預測性維護。

---

# 26. Vibe Coding 開發 Prompt

請依據本 Markdown 規格，開發一套「3D戰情中心 Walkthrough + 告警導航 + 巡檢 + AI Agent + 多人協作」平台原型。

請產出：

1. 3D BIM Viewer。
2. 第一人稱 Walkthrough 控制器。
3. Collision / Gravity 設計。
4. MiniMap。
5. NavMesh 路徑導航。
6. 告警導航 UI。
7. 巡檢任務 UI。
8. 設備資訊面板。
9. AI Agent Chat Panel。
10. 多人 Presence 顯示。
11. WebSocket 即時事件。
12. PostgreSQL Schema。
13. Redis 快取設計。
14. 後端 API。
15. 前端元件架構。
16. 權限控管。
17. 測試案例。
18. Docker 部署架構。

開發原則：

1. 前端使用 React / Vue + Three.js / Babylon.js / Autodesk Viewer 皆可。
2. BIM 模型不直接解析原始 RVT，使用輕量化模型格式。
3. 即時點位狀態透過 WebSocket 更新。
4. 告警與導航需可分離開發。
5. AI Agent 不可直接控制設備。
6. DO / AO 控制必須人工確認。
7. 所有控制、告警確認、巡檢完成都需寫入紀錄。
8. 架構需可擴充到多棟、多樓層、多系統。
