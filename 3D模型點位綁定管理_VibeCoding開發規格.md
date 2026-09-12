# 3D模型與監控設備點位綁定頁面開發規格

## 1. 功能目標

本功能用於「3D BIM / 3D 數位孿生 / Web 中央監控平台」中，建立 **3D模型元件** 與 **監控設備點位 DI / DO / AI / AO** 的綁定關係。

系統需支援：

1. 匯入 3D 模型清單，包含 UUID、唯一 ID、樓層、區域、設備名稱等。
2. 匯入監控設備點位清單，點位類型包含 DI、DO、AI、AO。
3. 透過 Excel 匯入點位資料。
4. 可先匯出 3D 模型清單，再由工程人員填入對應監控點位，完成綁定後再匯入。
5. 可在頁面中搜尋、篩選 3D 模型與監控點位。
6. 綁定後，系統依據點位即時狀態改變 3D 模型外觀或顯示數值。
7. DI / DO / AI / AO 需依據各自特性呈現不同互動方式。

---

## 2. 使用情境

### 2.1 DI 狀態點位範例

範例設備：求救按鈕、門磁、故障狀態、警報狀態、設備運轉回饋。

當系統收到 DI 狀態：

| 狀態 | 顯示方式 |
|---|---|
| 正常 | 3D模型維持原色或綠色 |
| 警報 | 3D模型變成紅色 |
| 離線 | 3D模型變灰色 |
| 未綁定 | 顯示未綁定標籤 |

範例：  
求救按鈕為 DI 點位，當 DI = 1 且代表警報時，3D 模型需變紅色並顯示警報提示。

---

### 2.2 DO 控制點位範例

範例設備：燈具、風機啟停、閥門開關、排風機、泵浦啟停。

當 3D 燈具模型綁定 DO 點位：

| 狀態 | 顯示方式 |
|---|---|
| DO = 1 | 燈具模型顯示亮燈效果 |
| DO = 0 | 燈具模型顯示關燈效果 |
| 控制中 | 顯示控制中動畫或 loading |
| 控制失敗 | 顯示錯誤提示 |

DO 類型需支援使用者於 3D 模型資訊視窗中進行控制，例如：

- 開啟
- 關閉
- 確認控制
- 顯示控制結果
- 記錄操作人員、時間與結果

---

### 2.3 AI 類比輸入點位範例

範例設備：溫度、濕度、壓差、電壓、電流、功率、流量、水位。

AI 點位需在 3D 模型旁邊的資訊視窗顯示即時數值，例如：

```text
設備名稱：AHU-01
點位名稱：送風溫度
即時值：24.6 °C
狀態：正常
更新時間：2026-05-23 10:15:30
```

AI 點位需支援：

- 單位顯示
- 上下限警報
- 數值顏色變化
- 趨勢圖入口
- 歷史資料查詢入口

---

### 2.4 AO 類比輸出點位範例

範例設備：閥門開度、變頻器頻率、設定溫度、風門開度。

AO 點位需在 3D 模型旁邊顯示目前設定值，並可依權限進行調整。

範例：

```text
設備名稱：VAV-03
AO點位：風門開度設定
目前值：45 %
可調整範圍：0 ~ 100 %
```

AO 控制需支援：

- 數值輸入
- Slider 調整
- 最小值 / 最大值限制
- 二次確認
- 權限檢查
- 操作紀錄
- 控制結果回饋

---

## 3. 頁面名稱

建議頁面名稱：

```text
3D模型點位綁定管理
```

英文名稱：

```text
3D Model Point Binding Management
```

---

## 4. 頁面功能模組

### 4.1 3D 模型清單區

功能：

- 顯示所有可綁定的 3D 模型元件
- 可依樓層、區域、系統別、設備類型篩選
- 可用關鍵字搜尋模型名稱、UUID、唯一 ID
- 可點擊模型後，在 3D Viewer 中高亮顯示
- 顯示目前是否已綁定點位

欄位建議：

| 欄位 | 說明 |
|---|---|
| model_uuid | 3D模型 UUID |
| model_unique_id | 系統內部唯一 ID |
| model_name | 模型名稱 |
| building | 棟別 |
| floor | 樓層 |
| area | 區域 |
| system_type | 系統別 |
| equipment_type | 設備類型 |
| binding_status | 綁定狀態 |
| bound_point_count | 已綁定點位數量 |

---

### 4.2 監控點位清單區

功能：

- 顯示所有 DI / DO / AI / AO 點位
- 可依點位類型、系統別、設備類型、狀態篩選
- 可搜尋點位名稱、點位代碼、設備名稱
- 顯示是否已綁定 3D 模型

欄位建議：

| 欄位 | 說明 |
|---|---|
| point_id | 點位唯一 ID |
| point_code | 點位代碼 |
| point_name | 點位名稱 |
| point_type | DI / DO / AI / AO |
| system_type | 系統別 |
| equipment_name | 設備名稱 |
| unit | 單位 |
| normal_value | 正常值 |
| alarm_value | 警報值 |
| current_value | 即時值 |
| binding_status | 綁定狀態 |

---

### 4.3 綁定設定區

功能：

- 選擇 3D 模型
- 選擇監控點位
- 設定點位與模型的顯示規則
- 可一個 3D 模型綁定多個點位
- 可一個點位綁定一個模型
- 支援取消綁定
- 支援批次綁定

設定欄位：

| 欄位 | 說明 |
|---|---|
| binding_id | 綁定 ID |
| model_uuid | 3D 模型 UUID |
| point_id | 監控點位 ID |
| point_type | DI / DO / AI / AO |
| display_mode | 顯示模式 |
| normal_color | 正常顏色 |
| alarm_color | 警報顏色 |
| offline_color | 離線顏色 |
| value_position | 數值視窗顯示位置 |
| control_enabled | 是否允許控制 |
| permission_code | 控制權限代碼 |

---

## 5. Excel 匯入 / 匯出規格

## 5.1 匯出 3D 模型清單

系統需提供「匯出 3D 模型清單」功能，讓工程人員下載 Excel 後填入監控點位資料。

### Excel Sheet：Model_List

| 欄位名稱 | 必填 | 說明 |
|---|---|---|
| model_uuid | 是 | 3D 模型 UUID |
| model_unique_id | 是 | 系統唯一 ID |
| model_name | 是 | 3D 模型名稱 |
| building | 否 | 棟別 |
| floor | 否 | 樓層 |
| area | 否 | 區域 |
| system_type | 否 | 系統別 |
| equipment_type | 否 | 設備類型 |
| remark | 否 | 備註 |

---

## 5.2 匯入監控點位清單

### Excel Sheet：Point_List

| 欄位名稱 | 必填 | 說明 |
|---|---|---|
| point_id | 是 | 點位唯一 ID |
| point_code | 是 | 點位代碼 |
| point_name | 是 | 點位名稱 |
| point_type | 是 | DI / DO / AI / AO |
| system_type | 是 | 系統別 |
| equipment_name | 是 | 設備名稱 |
| unit | AI/AO 必填 | 單位 |
| normal_value | 否 | 正常值 |
| alarm_value | 否 | 警報值 |
| min_value | AI/AO 建議 | 最小值 |
| max_value | AI/AO 建議 | 最大值 |
| description | 否 | 說明 |

---

## 5.3 匯入模型與點位綁定表

### Excel Sheet：Model_Point_Binding

| 欄位名稱 | 必填 | 說明 |
|---|---|---|
| model_uuid | 是 | 3D 模型 UUID |
| model_unique_id | 否 | 模型唯一 ID |
| model_name | 否 | 模型名稱 |
| point_id | 是 | 點位 ID |
| point_code | 是 | 點位代碼 |
| point_name | 否 | 點位名稱 |
| point_type | 是 | DI / DO / AI / AO |
| display_mode | 是 | color / light / value_panel / control_panel |
| normal_color | 否 | 正常顏色 |
| alarm_color | 否 | 警報顏色 |
| offline_color | 否 | 離線顏色 |
| control_enabled | 否 | true / false |
| value_position | 否 | top / right / left / bottom / auto |
| remark | 否 | 備註 |

---

## 6. Excel 匯入檢核規則

匯入時需檢查：

1. 必填欄位不可空白。
2. point_type 僅允許 DI、DO、AI、AO。
3. model_uuid 必須存在於系統模型清單。
4. point_id 不可重複。
5. 同一個 point_id 不可綁定多個模型，除非系統設定允許。
6. DI / DO 不應填寫類比單位，除非為狀態文字。
7. AI / AO 建議填寫 unit、min_value、max_value。
8. DO / AO 若 control_enabled = true，需檢查使用者權限。
9. 匯入前需顯示預覽畫面。
10. 匯入失敗需提供錯誤報表下載。

---

## 7. 3D 顯示規則

## 7.1 DI 顯示規則

| DI 狀態 | 顯示效果 |
|---|---|
| 0 正常 | 綠色 / 原色 |
| 1 警報 | 紅色閃爍 |
| null / timeout | 灰色 |
| disabled | 半透明 |

可設定：

```json
{
  "point_type": "DI",
  "normal_value": 0,
  "alarm_value": 1,
  "normal_color": "#22C55E",
  "alarm_color": "#EF4444",
  "offline_color": "#9CA3AF",
  "blink_on_alarm": true
}
```

---

## 7.2 DO 顯示與控制規則

| DO 狀態 | 顯示效果 |
|---|---|
| 0 | 關閉狀態 |
| 1 | 開啟狀態 |
| 控制中 | loading |
| 控制失敗 | 顯示錯誤 |

燈具範例：

```json
{
  "point_type": "DO",
  "off_value": 0,
  "on_value": 1,
  "off_effect": "dark_material",
  "on_effect": "emissive_light",
  "control_enabled": true
}
```

---

## 7.3 AI 顯示規則

| AI 狀態 | 顯示效果 |
|---|---|
| 正常範圍 | 綠色數值 |
| 超過警戒 | 黃色數值 |
| 超過警報 | 紅色數值 |
| 離線 | 灰色或 N/A |

範例：

```json
{
  "point_type": "AI",
  "unit": "°C",
  "min_value": 0,
  "max_value": 50,
  "warning_high": 30,
  "alarm_high": 35,
  "display_mode": "value_panel"
}
```

---

## 7.4 AO 顯示與控制規則

AO 需顯示目前設定值，並可依權限調整。

```json
{
  "point_type": "AO",
  "unit": "%",
  "min_value": 0,
  "max_value": 100,
  "control_enabled": true,
  "control_type": "slider"
}
```

---

## 8. UI 頁面配置建議

```text
┌──────────────────────────────────────────────────────────────┐
│ 3D模型點位綁定管理                                            │
├──────────────────────────────────────────────────────────────┤
│ [匯出模型清單] [匯入點位] [匯入綁定表] [下載範本] [錯誤報表]     │
├───────────────────────┬──────────────────────────────────────┤
│ 左側：3D模型清單        │ 右側：3D Viewer                       │
│ - 搜尋 UUID            │ - 顯示模型                            │
│ - 搜尋模型名稱          │ - 點選模型高亮                         │
│ - 樓層篩選              │ - 顯示綁定狀態顏色                     │
├───────────────────────┴──────────────────────────────────────┤
│ 下方：監控點位清單 / 綁定設定 / 匯入預覽 / 錯誤訊息              │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. 3D Viewer 互動需求

3D Viewer 需支援：

1. 點擊模型後顯示資訊視窗。
2. 顯示模型 UUID、模型名稱、樓層、區域。
3. 顯示已綁定點位。
4. DI 警報時模型變紅或閃爍。
5. DO 開啟時模型顯示亮燈或設備啟動效果。
6. AI / AO 於模型旁顯示數值卡片。
7. 支援模型搜尋後自動定位。
8. 支援隱藏未綁定模型。
9. 支援只顯示警報模型。
10. 支援重置模型顏色。

---

## 10. 建議資料表設計

## 10.1 3D 模型資料表

```sql
CREATE TABLE model_3d_objects (
    id BIGSERIAL PRIMARY KEY,
    model_uuid VARCHAR(100) NOT NULL UNIQUE,
    model_unique_id VARCHAR(100),
    model_name VARCHAR(255),
    building VARCHAR(100),
    floor VARCHAR(100),
    area VARCHAR(100),
    system_type VARCHAR(100),
    equipment_type VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10.2 監控點位資料表

```sql
CREATE TABLE monitoring_points (
    id BIGSERIAL PRIMARY KEY,
    point_id VARCHAR(100) NOT NULL UNIQUE,
    point_code VARCHAR(100) NOT NULL,
    point_name VARCHAR(255) NOT NULL,
    point_type VARCHAR(10) NOT NULL CHECK (point_type IN ('DI', 'DO', 'AI', 'AO')),
    system_type VARCHAR(100),
    equipment_name VARCHAR(255),
    unit VARCHAR(50),
    normal_value VARCHAR(50),
    alarm_value VARCHAR(50),
    min_value NUMERIC,
    max_value NUMERIC,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10.3 模型點位綁定資料表

```sql
CREATE TABLE model_point_bindings (
    id BIGSERIAL PRIMARY KEY,
    model_uuid VARCHAR(100) NOT NULL,
    point_id VARCHAR(100) NOT NULL,
    point_type VARCHAR(10) NOT NULL CHECK (point_type IN ('DI', 'DO', 'AI', 'AO')),
    display_mode VARCHAR(50),
    normal_color VARCHAR(20),
    alarm_color VARCHAR(20),
    offline_color VARCHAR(20),
    control_enabled BOOLEAN DEFAULT FALSE,
    value_position VARCHAR(50) DEFAULT 'auto',
    display_rule JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_uuid, point_id)
);
```

---

## 10.4 點位即時狀態資料表

```sql
CREATE TABLE point_realtime_values (
    id BIGSERIAL PRIMARY KEY,
    point_id VARCHAR(100) NOT NULL UNIQUE,
    current_value VARCHAR(100),
    quality VARCHAR(50),
    status VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10.5 控制紀錄資料表

```sql
CREATE TABLE control_command_logs (
    id BIGSERIAL PRIMARY KEY,
    point_id VARCHAR(100) NOT NULL,
    point_type VARCHAR(10) NOT NULL,
    command_value VARCHAR(100) NOT NULL,
    operator_id VARCHAR(100),
    operator_name VARCHAR(100),
    command_status VARCHAR(50),
    response_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 11. API 規格建議

## 11.1 取得 3D 模型清單

```http
GET /api/3d-models
```

Query：

```text
keyword=
floor=
area=
system_type=
equipment_type=
binding_status=
```

---

## 11.2 匯出 3D 模型清單

```http
GET /api/3d-models/export
```

回傳：

```text
Excel file
```

---

## 11.3 匯入監控點位

```http
POST /api/monitoring-points/import
Content-Type: multipart/form-data
```

Body：

```text
file: points.xlsx
```

---

## 11.4 匯入模型點位綁定表

```http
POST /api/model-point-bindings/import
Content-Type: multipart/form-data
```

Body：

```text
file: model_point_binding.xlsx
```

---

## 11.5 建立單筆綁定

```http
POST /api/model-point-bindings
```

Body：

```json
{
  "model_uuid": "uuid-001",
  "point_id": "DI_HELP_001",
  "point_type": "DI",
  "display_mode": "color",
  "normal_color": "#22C55E",
  "alarm_color": "#EF4444",
  "offline_color": "#9CA3AF",
  "control_enabled": false
}
```

---

## 11.6 取消綁定

```http
DELETE /api/model-point-bindings/{binding_id}
```

---

## 11.7 取得模型已綁定點位

```http
GET /api/3d-models/{model_uuid}/points
```

---

## 11.8 接收即時點位資料

```http
POST /api/realtime/points
```

Body：

```json
{
  "point_id": "DI_HELP_001",
  "value": 1,
  "quality": "GOOD",
  "timestamp": "2026-05-23T10:15:30+08:00"
}
```

---

## 11.9 DO / AO 控制命令

```http
POST /api/control/command
```

Body：

```json
{
  "point_id": "DO_LIGHT_001",
  "point_type": "DO",
  "command_value": 1,
  "operator_id": "admin",
  "confirm": true
}
```

---

## 12. 前端開發需求

建議前端頁面包含：

1. 3D Viewer 元件
2. 模型清單 DataGrid
3. 點位清單 DataGrid
4. 綁定設定 Drawer / Modal
5. Excel 匯入 Modal
6. 匯入預覽表格
7. 錯誤報表下載
8. 點位即時狀態 WebSocket 更新
9. 模型狀態顏色更新
10. DO / AO 控制確認視窗

---

## 13. WebSocket 即時更新需求

即時資料格式：

```json
{
  "event": "point_value_changed",
  "data": {
    "point_id": "DI_HELP_001",
    "point_type": "DI",
    "value": 1,
    "quality": "GOOD",
    "status": "ALARM",
    "timestamp": "2026-05-23T10:15:30+08:00"
  }
}
```

前端收到資料後需：

1. 找出 point_id 對應的 model_uuid。
2. 找出 display_rule。
3. 更新 3D 模型材質、顏色、亮燈效果或數值視窗。
4. 更新點位清單中的即時值。
5. 若為警報，加入警報清單。

---

## 14. 權限控管

### 14.1 操作權限

| 功能 | 權限 |
|---|---|
| 查看模型 | viewer |
| 查看點位 | viewer |
| 建立綁定 | engineer |
| 匯入 Excel | engineer |
| 匯出模型清單 | engineer |
| DO 控制 | operator |
| AO 控制 | operator |
| 刪除綁定 | admin |
| 修改顯示規則 | engineer / admin |

---

## 15. UI 狀態顏色建議

| 狀態 | 顏色 |
|---|---|
| 正常 | #22C55E |
| 警告 | #FACC15 |
| 警報 | #EF4444 |
| 離線 | #9CA3AF |
| 未綁定 | #CBD5E1 |
| 控制中 | #38BDF8 |

---

## 16. 開發注意事項

1. 3D 模型 UUID 不可隨意變更，否則綁定會失效。
2. 若模型重新上傳，需提供 UUID 對應轉換機制。
3. 匯入 Excel 前需先進行資料預覽與錯誤檢查。
4. DI / DO / AI / AO 不可使用同一套顯示邏輯，需依類型分開處理。
5. DO / AO 屬於控制類點位，必須加入權限與二次確認。
6. 控制命令不可只更新前端畫面，需等待後端回覆成功後再改變狀態。
7. WebSocket 斷線時需顯示資料品質為離線或逾時。
8. 3D 模型狀態顏色需支援還原原始材質。
9. 大量模型時需注意效能，避免每次狀態更新都重新渲染整個場景。
10. 匯入結果需記錄操作紀錄。

---

## 17. 驗收條件

### 17.1 Excel 匯入驗收

- 可匯入 DI / DO / AI / AO 點位。
- 可匯入模型與點位綁定表。
- 錯誤資料可顯示明確原因。
- 可下載錯誤報表。
- 匯入後可於頁面查詢到綁定結果。

### 17.2 3D 顯示驗收

- DI 警報時，對應 3D 模型變紅。
- DI 恢復正常時，模型恢復正常顏色。
- DO 開啟時，燈具模型顯示亮燈。
- DO 關閉時，燈具模型顯示關燈。
- AI 點位可於模型旁顯示即時數值與單位。
- AO 點位可於模型旁顯示設定值。
- 離線點位可顯示灰色或 N/A。

### 17.3 控制驗收

- DO 控制需跳出確認視窗。
- AO 控制需檢查輸入範圍。
- 無權限使用者不可控制 DO / AO。
- 控制成功後需更新模型狀態。
- 控制失敗需顯示錯誤訊息。
- 所有控制命令需寫入操作紀錄。

---

## 18. Vibe Coding 開發 Prompt

請依據本 Markdown 文件，開發一個「3D模型點位綁定管理」頁面，功能包含：

1. 3D 模型清單查詢、搜尋、篩選。
2. 監控點位 DI / DO / AI / AO 查詢、搜尋、篩選。
3. Excel 匯入監控點位。
4. Excel 匯出 3D 模型清單。
5. Excel 匯入模型與點位綁定表。
6. 3D Viewer 中可點選模型並顯示已綁定點位。
7. DI 點位依狀態改變模型顏色。
8. DO 點位可控制設備並改變模型亮燈或啟停效果。
9. AI 點位於模型旁顯示即時數值與單位。
10. AO 點位於模型旁顯示設定值並可依權限控制。
11. 支援 WebSocket 即時點位狀態更新。
12. 支援匯入預覽、錯誤檢查、錯誤報表下載。
13. 支援操作權限與控制命令紀錄。
14. 使用乾淨、工程化、可維護的前後端架構。
15. 請產出前端頁面、後端 API、資料表、Excel 匯入驗證邏輯與基本測試案例。

---

## 19. 建議技術架構

前端建議：

```text
React / Vue
Three.js / Babylon.js
DataGrid
ExcelJS / SheetJS
WebSocket
```

後端建議：

```text
Node.js / NestJS / Express
PostgreSQL
Redis
MQTT / OPC UA / Modbus Gateway
WebSocket Gateway
```

資料流：

```text
現場設備 / PLC / Gateway
        ↓
Modbus / BACnet / OPC UA / MQTT
        ↓
後端點位資料服務
        ↓
WebSocket 即時推送
        ↓
3D Viewer 更新模型狀態
```

---

## 20. 最小可行版本 MVP

MVP 第一階段至少完成：

1. 匯出 3D 模型清單。
2. 匯入監控點位 Excel。
3. 匯入模型點位綁定 Excel。
4. 3D Viewer 點選模型顯示已綁定點位。
5. DI 警報變紅。
6. DO 燈具開關狀態切換。
7. AI / AO 顯示數值。
8. WebSocket 模擬即時資料更新。
9. 匯入錯誤檢查與錯誤清單顯示。

---

## 21. 第二階段擴充功能

1. 多模型批次綁定。
2. 點位歷史趨勢圖。
3. 警報事件列表。
4. 點位與模型關聯圖。
5. 模型重新上傳後 UUID 對應轉換。
6. BIM 樓層 / 區域快速篩選。
7. 權限角色管理。
8. 控制命令審核流程。
9. 與 EMS / SCADA / BMS 點表同步。
10. 與圖資管理系統整合。
