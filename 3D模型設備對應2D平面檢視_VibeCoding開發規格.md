# 3D模型設備對應2D平面檢視頁面開發規格

## 1. 功能目標

本功能用於 3D BIM / 3D 監控平台首頁，當使用者點擊某一個 3D 模型設備後，系統需在畫面右下方顯示該設備所在樓層的 2D 平面圖，並於 2D 平面圖上標示該設備對應的空間、區域或房間位置。

此功能主要解決：

1. 使用者在 3D 模型中看到設備後，可快速知道該設備在平面圖上的位置。
2. 可從 3D 設備反查 2D 樓層平面。
3. 可從 2D 平面圖點選空間，再反查該空間內的 3D 設備。
4. 可作為 BIM / EMS / SCADA / 派工巡檢 / 圖資管理整合頁面的基礎。
5. 可支援消防機房、揚水機房、資訊機房、空調機房、電氣室等重要區域定位。

---

## 2. 頁面名稱

建議頁面名稱：

```text
3D設備與2D平面定位檢視
```

英文名稱：

```text
3D Equipment to 2D Floor Plan Viewer
```

---

## 3. 使用情境

### 3.1 3D 主畫面點擊設備

使用者在 3D BIM 模型首頁看到設備，例如：

- 消防泵浦
- 揚水泵浦
- 冰水主機
- AHU
- VAV
- 電盤
- 門禁設備
- 攝影機
- 求救按鈕
- 燈具
- 感測器

使用者點擊 3D 模型設備後，系統需執行：

1. 高亮顯示被點擊的 3D 設備。
2. 顯示設備基本資訊。
3. 載入該設備所在樓層的 2D 平面圖。
4. 在 2D 平面圖中標示該設備所屬空間。
5. 若設備有精確座標，需標示設備點位。
6. 若設備只對應空間，需以框線或半透明色塊標示空間範圍。
7. 可點擊 2D 平面圖上的標示區域，回到 3D 模型設備。

---

## 4. 首頁 UI 配置建議

依據提供圖片，建議畫面配置如下：

```text
┌────────────────────────────────────────────────────────────────────┐
│                           3D BIM 主視窗                             │
│                                                                    │
│  ┌──────────────┐                                      ┌──────────┐ │
│  │ 切換棟別      │                                      │重要區域  │ │
│  │ 樓層切換      │                                      │機房清單  │ │
│  └──────────────┘                                      └──────────┘ │
│                                                                    │
│                                                                    │
│                                                                    │
│  ┌────────────────────┐                         ┌────────────────┐ │
│  │ 該棟已綁定設備清單   │                         │ 2D樓層平面檢視  │ │
│  │ - 設備名稱           │                         │ - 樓層圖        │ │
│  │ - 設備編號           │                         │ - 空間框選      │ │
│  └────────────────────┘                         │ - 設備定位點    │ │
│                                                   └────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. 主頁面功能需求

## 5.1 3D 模型設備顯示

3D 主畫面需支援：

| 功能 | 說明 |
|---|---|
| 顯示 3D BIM 模型 | 載入建築、樓層、設備模型 |
| 點擊設備 | 點選設備後觸發設備資訊與 2D 平面定位 |
| 設備高亮 | 被選取設備需以亮色、高透明或外框顯示 |
| 設備聚焦 | 可自動拉近視角到設備 |
| 重置視角 | 可回到預設視角 |
| 樓層切換 | 可切換 B1、1F、2F、7F 等樓層 |
| 棟別切換 | 可切換不同建築棟別 |
| 綁定狀態顯示 | 已綁定設備、未綁定設備需可區分 |

---

## 5.2 右下方 2D 平面檢視

點擊 3D 設備後，右下方需開啟 2D 平面檢視視窗。

### 2D 視窗內容

| 項目 | 說明 |
|---|---|
| 視窗標題 | 顯示樓層與空間名稱，例如：B1 — 揚水機房 |
| 2D 平面圖 | 顯示該樓層平面圖 |
| 空間標示 | 以框線或半透明色塊標示該設備所屬空間 |
| 設備點位 | 若有設備座標，顯示設備定位點 |
| 關閉按鈕 | 可關閉 2D 視窗 |
| 最大化 | 可放大 2D 平面圖 |
| 回到 3D | 點擊定位標示可回到 3D 設備 |
| 比例縮放 | 支援 zoom in / zoom out |
| 平移 | 支援拖曳平面圖 |

---

## 5.3 2D 平面標示方式

### 5.3.1 空間範圍標示

若設備對應的是一個空間，例如「揚水機房」，系統應在 2D 平面圖上以區域方式標示。

建議樣式：

```text
半透明青色區塊 + 青色外框 + 空間名稱 Label
```

範例：

| 狀態 | 顯示方式 |
|---|---|
| 一般選取 | 青色外框 + 半透明填色 |
| 警報空間 | 紅色外框 + 紅色半透明填色 |
| 故障空間 | 橘色外框 + 故障圖示 |
| 離線空間 | 灰色外框 |
| 重要區域 | 金色外框 |

---

### 5.3.2 設備精確點位標示

若設備有明確 2D 座標，需顯示設備點位。

建議樣式：

```text
圓點 / 圖示 / 設備 Icon / 呼吸動畫
```

範例：

| 設備類型 | Icon 建議 |
|---|---|
| 消防泵浦 | pump / fire pump icon |
| 燈具 | light icon |
| 攝影機 | camera icon |
| 電盤 | electrical panel icon |
| 感測器 | sensor icon |
| 門禁 | access control icon |
| 求救按鈕 | emergency icon |

---

## 6. 重要區域清單功能

右側重要區域清單需支援：

| 功能 | 說明 |
|---|---|
| 區域縮圖 | 顯示機房或區域圖片 |
| 區域名稱 | 消防機房、揚水機房、資訊機房等 |
| 樓層 | B1、1F、7F |
| 查看圖示 | 點擊後定位到 3D 或 2D |
| 選取狀態 | 被選取區域以金色或亮色外框顯示 |
| 取消檢視 | 可取消目前區域選取 |
| 3D 標籤 | 可標示是否已綁定 3D 模型 |

---

## 7. 已綁定設備清單

左下方需顯示該棟或該樓層已綁定的設備清單。

欄位建議：

| 欄位 | 說明 |
|---|---|
| equipment_name | 設備名稱 |
| equipment_code | 設備編號 |
| model_uuid | 3D 模型 UUID |
| floor | 樓層 |
| space_name | 空間名稱 |
| binding_status | 綁定狀態 |
| point_count | 綁定點位數量 |

點擊清單項目時：

1. 3D 模型聚焦該設備。
2. 右下角顯示該樓層 2D 平面圖。
3. 2D 平面圖標示空間與設備位置。
4. 右側重要區域若有對應，需同步選取。

---

# 8. 3D模型設備對應2D平面設定頁面

若要支援上述功能，建議新增一個後台設定頁面。

建議頁面名稱：

```text
3D設備與2D平面對應設定
```

英文名稱：

```text
3D Equipment Floor Plan Mapping Setting
```

---

## 8.1 設定頁面目標

此頁面用於設定：

1. 3D 模型設備對應哪一張 2D 平面圖。
2. 3D 模型設備位於哪一個樓層。
3. 3D 模型設備屬於哪一個空間。
4. 3D 模型設備在 2D 平面圖上的座標位置。
5. 空間範圍框選資料。
6. 設備與空間、圖資、COBie、點位資料的關聯。

---

## 8.2 設定頁面配置建議

```text
┌────────────────────────────────────────────────────────────────────┐
│ 3D設備與2D平面對應設定                                             │
├────────────────────────────────────────────────────────────────────┤
│ [匯入模型清單] [匯入平面圖] [匯入空間清單] [匯入對應表] [匯出範本]    │
├───────────────────────┬────────────────────────────────────────────┤
│ 左側：3D模型設備清單    │ 右側：2D平面圖設定區                       │
│ - 搜尋模型UUID         │ - 選擇棟別 / 樓層                           │
│ - 搜尋設備名稱          │ - 顯示平面圖                                │
│ - 樓層篩選              │ - 框選空間範圍                              │
│ - 綁定狀態篩選          │ - 拖拉設備定位點                            │
├───────────────────────┴────────────────────────────────────────────┤
│ 下方：對應設定表 / 匯入預覽 / 錯誤檢查 / 儲存設定                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8.3 對應設定方式一：手動設定

使用者可在設定頁面：

1. 選擇棟別。
2. 選擇樓層。
3. 上傳或選擇 2D 平面圖。
4. 從左側選取 3D 模型設備。
5. 在 2D 平面圖上點擊設備位置。
6. 若設備屬於一個空間，可用框選工具框出空間範圍。
7. 輸入空間名稱與空間代碼。
8. 儲存對應關係。

### 手動設定資料

| 欄位 | 說明 |
|---|---|
| model_uuid | 3D 模型 UUID |
| equipment_code | 設備編號 |
| building | 棟別 |
| floor | 樓層 |
| floor_plan_id | 平面圖 ID |
| space_id | 空間 ID |
| space_name | 空間名稱 |
| point_x | 2D 平面 X 座標 |
| point_y | 2D 平面 Y 座標 |
| polygon | 空間範圍 Polygon |
| mapping_status | 對應狀態 |

---

## 8.4 對應設定方式二：Excel 匯入對應表

系統需支援透過 Excel 匯入 3D 設備與 2D 平面圖對應資料。

### Excel Sheet：Equipment_2D_Mapping

| 欄位名稱 | 必填 | 說明 |
|---|---|---|
| model_uuid | 是 | 3D 模型 UUID |
| model_unique_id | 否 | 3D 模型唯一 ID |
| equipment_code | 是 | 設備編號 |
| equipment_name | 是 | 設備名稱 |
| building | 是 | 棟別 |
| floor | 是 | 樓層 |
| floor_plan_code | 是 | 平面圖代碼 |
| space_code | 是 | 空間代碼 |
| space_name | 是 | 空間名稱 |
| point_x | 否 | 設備於 2D 平面圖的 X 座標 |
| point_y | 否 | 設備於 2D 平面圖的 Y 座標 |
| polygon_json | 否 | 空間範圍 Polygon JSON |
| display_mode | 否 | space / point / both |
| remark | 否 | 備註 |

---

## 8.5 對應設定方式三：先匯出模型與空間清單再回填

建議提供以下匯出功能：

### 8.5.1 匯出 3D 模型設備清單

```text
Export 3D Equipment Model List
```

欄位：

| 欄位名稱 | 說明 |
|---|---|
| model_uuid | 3D 模型 UUID |
| model_unique_id | 模型唯一 ID |
| model_name | 模型名稱 |
| equipment_code | 設備編號 |
| equipment_name | 設備名稱 |
| building | 棟別 |
| floor | 樓層 |
| system_type | 系統別 |
| equipment_type | 設備類型 |

### 8.5.2 匯出 2D 空間清單

```text
Export 2D Space List
```

欄位：

| 欄位名稱 | 說明 |
|---|---|
| floor_plan_code | 平面圖代碼 |
| building | 棟別 |
| floor | 樓層 |
| space_code | 空間代碼 |
| space_name | 空間名稱 |
| polygon_json | 空間範圍 |
| cobie_space_name | COBie 空間名稱 |
| cobie_space_id | COBie Space ID |

### 8.5.3 工程人員回填對應表

工程人員可將 3D 模型設備與 2D 空間清單進行對應後再匯入。

---

## 9. 2D 平面圖資料格式建議

系統需支援多種 2D 平面圖來源。

| 類型 | 說明 |
|---|---|
| PNG / JPG | 快速使用，適合展示 |
| SVG | 可互動、可縮放、可標示空間 |
| PDF | 圖說來源，需轉圖或轉 SVG |
| CAD / DWG | 需後端或外部工具轉成 SVG / PNG |
| BIM Floor Plan | 從 Revit / IFC / BIM 匯出 |
| GeoJSON | 適合儲存空間 Polygon |
| JSON Canvas | 適合前端互動繪製 |

建議第一版 MVP 使用：

```text
PNG / JPG 平面底圖 + JSON Polygon + 設備座標點
```

第二階段升級：

```text
SVG 平面圖 + 可點擊空間區塊 + 設備定位點
```

---

## 10. Polygon 空間範圍資料格式

空間範圍建議以 JSON 儲存。

```json
{
  "type": "Polygon",
  "points": [
    { "x": 120, "y": 80 },
    { "x": 420, "y": 80 },
    { "x": 420, "y": 210 },
    { "x": 120, "y": 210 }
  ]
}
```

若未設定 polygon，只設定設備點位：

```json
{
  "type": "Point",
  "x": 260,
  "y": 140
}
```

若同時設定空間與設備點位：

```json
{
  "type": "Both",
  "space_polygon": [
    { "x": 120, "y": 80 },
    { "x": 420, "y": 80 },
    { "x": 420, "y": 210 },
    { "x": 120, "y": 210 }
  ],
  "equipment_point": {
    "x": 260,
    "y": 140
  }
}
```

---

## 11. 3D 與 2D 對應邏輯

## 11.1 3D 點擊後取得對應 2D 資料

流程：

```text
使用者點擊 3D 模型設備
        ↓
取得 model_uuid
        ↓
查詢 equipment_2d_mappings
        ↓
取得 building / floor / floor_plan_id / space_id / point_x / point_y / polygon
        ↓
載入對應樓層平面圖
        ↓
在 2D 視窗中標示空間與設備點位
```

---

## 11.2 2D 點擊後反查 3D 設備

流程：

```text
使用者點擊 2D 平面設備點位
        ↓
取得 mapping_id / model_uuid
        ↓
3D Viewer 定位該模型
        ↓
高亮該模型
        ↓
顯示設備資訊卡
```

---

## 12. 建議資料表設計

## 12.1 2D 平面圖資料表

```sql
CREATE TABLE floor_plans (
    id BIGSERIAL PRIMARY KEY,
    floor_plan_code VARCHAR(100) NOT NULL UNIQUE,
    building VARCHAR(100) NOT NULL,
    floor VARCHAR(50) NOT NULL,
    plan_name VARCHAR(255),
    plan_type VARCHAR(50), -- png, jpg, svg, pdf
    file_url TEXT NOT NULL,
    width NUMERIC,
    height NUMERIC,
    scale_ratio NUMERIC,
    version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 12.2 2D 空間資料表

```sql
CREATE TABLE floor_plan_spaces (
    id BIGSERIAL PRIMARY KEY,
    floor_plan_id BIGINT NOT NULL,
    space_code VARCHAR(100) NOT NULL,
    space_name VARCHAR(255) NOT NULL,
    building VARCHAR(100),
    floor VARCHAR(50),
    polygon_json JSONB,
    cobie_space_id VARCHAR(100),
    cobie_space_name VARCHAR(255),
    space_type VARCHAR(100),
    is_important_area BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(floor_plan_id, space_code)
);
```

---

## 12.3 3D 設備與 2D 平面對應資料表

```sql
CREATE TABLE equipment_2d_mappings (
    id BIGSERIAL PRIMARY KEY,
    model_uuid VARCHAR(100) NOT NULL,
    model_unique_id VARCHAR(100),
    equipment_code VARCHAR(100) NOT NULL,
    equipment_name VARCHAR(255),
    building VARCHAR(100) NOT NULL,
    floor VARCHAR(50) NOT NULL,
    floor_plan_id BIGINT NOT NULL,
    space_id BIGINT,
    point_x NUMERIC,
    point_y NUMERIC,
    display_mode VARCHAR(50) DEFAULT 'both', -- space, point, both
    mapping_status VARCHAR(50) DEFAULT 'mapped',
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_uuid, floor_plan_id)
);
```

---

## 12.4 重要區域資料表

```sql
CREATE TABLE important_areas (
    id BIGSERIAL PRIMARY KEY,
    area_code VARCHAR(100) NOT NULL UNIQUE,
    area_name VARCHAR(255) NOT NULL,
    building VARCHAR(100),
    floor VARCHAR(50),
    floor_plan_id BIGINT,
    space_id BIGINT,
    thumbnail_url TEXT,
    model_uuid VARCHAR(100),
    is_visible BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 13. API 規格建議

## 13.1 取得 3D 設備的 2D 對應資料

```http
GET /api/3d-models/{model_uuid}/2d-mapping
```

Response：

```json
{
  "model_uuid": "FP-PMP-001",
  "equipment_code": "FP-PMP-001",
  "equipment_name": "消防泵浦",
  "building": "樂迦",
  "floor": "B1",
  "floor_plan": {
    "floor_plan_id": 1,
    "floor_plan_code": "B1_PLAN",
    "file_url": "/files/floorplans/b1.png",
    "width": 1920,
    "height": 1080
  },
  "space": {
    "space_code": "B1_FIRE_PUMP_ROOM",
    "space_name": "消防機房",
    "polygon_json": {
      "type": "Polygon",
      "points": [
        { "x": 120, "y": 80 },
        { "x": 420, "y": 80 },
        { "x": 420, "y": 210 },
        { "x": 120, "y": 210 }
      ]
    }
  },
  "equipment_point": {
    "x": 260,
    "y": 140
  },
  "display_mode": "both"
}
```

---

## 13.2 取得樓層 2D 平面圖

```http
GET /api/floor-plans?building=樂迦&floor=B1
```

---

## 13.3 取得樓層空間清單

```http
GET /api/floor-plans/{floor_plan_id}/spaces
```

---

## 13.4 建立 3D 與 2D 對應

```http
POST /api/equipment-2d-mappings
```

Body：

```json
{
  "model_uuid": "FP-PMP-001",
  "equipment_code": "FP-PMP-001",
  "equipment_name": "消防泵浦",
  "building": "樂迦",
  "floor": "B1",
  "floor_plan_id": 1,
  "space_id": 10,
  "point_x": 260,
  "point_y": 140,
  "display_mode": "both"
}
```

---

## 13.5 更新 3D 與 2D 對應

```http
PUT /api/equipment-2d-mappings/{mapping_id}
```

---

## 13.6 刪除對應

```http
DELETE /api/equipment-2d-mappings/{mapping_id}
```

---

## 13.7 匯入對應表

```http
POST /api/equipment-2d-mappings/import
Content-Type: multipart/form-data
```

Body：

```text
file: equipment_2d_mapping.xlsx
```

---

## 13.8 匯出對應範本

```http
GET /api/equipment-2d-mappings/template
```

---

## 14. 前端元件建議

建議前端拆成以下元件：

```text
src/
  components/
    viewer3d/
      BimViewer3D.tsx
      EquipmentHighlight.tsx
      EquipmentClickHandler.tsx
    floorplan/
      FloorPlanMiniMap.tsx
      FloorPlanOverlay.tsx
      SpacePolygon.tsx
      EquipmentMarker.tsx
      FloorPlanToolbar.tsx
    equipment/
      EquipmentInfoPanel.tsx
      BoundEquipmentList.tsx
      ImportantAreaList.tsx
    mapping/
      Equipment2DMappingPage.tsx
      EquipmentModelList.tsx
      FloorPlanEditor.tsx
      SpacePolygonEditor.tsx
      MappingDataGrid.tsx
      ImportMappingModal.tsx
```

---

## 15. 2D 平面圖前端互動需求

2D 平面圖需支援：

1. 顯示底圖。
2. 顯示空間 polygon。
3. 顯示設備 marker。
4. 支援縮放。
5. 支援拖曳平移。
6. 支援點擊 marker 後定位 3D 模型。
7. 支援點擊空間後顯示該空間內設備清單。
8. 支援警報狀態改變空間或設備 marker 顏色。
9. 支援最大化檢視。
10. 支援關閉視窗。

---

## 16. 對應設定頁面前端互動需求

設定頁面需支援：

1. 上傳 2D 平面圖。
2. 選擇棟別與樓層。
3. 載入該樓層 2D 平面圖。
4. 從左側選擇 3D 模型設備。
5. 在平面圖上點擊建立設備定位點。
6. 拖曳設備定位點調整位置。
7. 繪製空間 polygon。
8. 編輯 polygon 節點。
9. 選擇已建立空間。
10. 將設備綁定到空間。
11. 儲存對應資料。
12. 匯出 / 匯入 Excel 對應資料。
13. 顯示尚未對應設備。
14. 顯示已對應設備。
15. 提供錯誤檢查結果。

---

## 17. 匯入檢核規則

匯入 Equipment_2D_Mapping 時需檢查：

1. model_uuid 不可空白。
2. equipment_code 不可空白。
3. building 不可空白。
4. floor 不可空白。
5. floor_plan_code 必須存在。
6. space_code 若有填寫，必須存在於該 floor_plan_code。
7. point_x / point_y 若有填寫，必須在平面圖範圍內。
8. polygon_json 格式需合法。
9. display_mode 僅可為 space / point / both。
10. 同一 model_uuid 不可重複綁定同一張平面圖。
11. 匯入前需提供預覽。
12. 匯入失敗需提供錯誤報表下載。

---

## 18. 狀態顏色建議

| 狀態 | 顏色 |
|---|---|
| 目前選取設備 | #22D3EE |
| 目前選取空間 | #06B6D4 |
| 重要區域 | #F59E0B |
| 正常 | #22C55E |
| 警告 | #FACC15 |
| 警報 | #EF4444 |
| 故障 | #FB7185 |
| 離線 | #9CA3AF |
| 未綁定 | #64748B |

---

## 19. 與 COBie / 圖資 / 派工巡檢整合建議

3D 設備與 2D 平面對應完成後，後續可串接：

| 模組 | 整合內容 |
|---|---|
| COBie | Space、Component、Type、Facility、Floor |
| 圖資管理 | 平面圖、竣工圖、維修手冊、設備規格書 |
| 派工巡檢 | 依 2D 空間快速定位報修設備 |
| EMS | 顯示能源設備位置與用電數據 |
| SCADA | 顯示 DI / DO / AI / AO 點位狀態 |
| 告警系統 | 空間、設備、樓層同步告警 |
| DCIM | 機櫃、機房、資產定位 |

---

## 20. 驗收條件

### 20.1 主頁面驗收

- 點擊 3D 設備後，右下方可顯示該樓層 2D 平面圖。
- 2D 平面圖可標示該設備所在空間。
- 2D 平面圖可顯示設備定位點。
- 3D 模型被點擊後可高亮。
- 2D 平面圖 marker 被點擊後可反向定位 3D 模型。
- 可依棟別與樓層切換。
- 可從重要區域清單定位到 3D 與 2D。
- 可關閉與最大化 2D 平面檢視視窗。

### 20.2 設定頁面驗收

- 可上傳或選擇 2D 平面圖。
- 可建立樓層平面資料。
- 可建立空間 polygon。
- 可建立設備定位點。
- 可將 3D model_uuid 綁定到 2D 平面圖。
- 可將 3D 設備綁定到 2D 空間。
- 可匯入 Excel 對應表。
- 可匯出 Excel 範本。
- 匯入錯誤時可顯示原因並下載錯誤報表。
- 已綁定設備可在主頁面正確顯示。

---

## 21. MVP 第一階段

第一階段建議完成：

1. 3D 設備點擊事件。
2. 依 model_uuid 查詢 2D 對應資料。
3. 右下方顯示 2D 平面圖。
4. 2D 平面圖顯示空間矩形框或 polygon。
5. 2D 平面圖顯示設備 marker。
6. 設定頁面可手動設定設備 marker。
7. 設定頁面可匯入 Excel 對應表。
8. 重要區域清單可定位。
9. 已綁定設備清單可定位。

---

## 22. 第二階段擴充

第二階段可加入：

1. SVG 平面圖互動空間。
2. CAD / PDF 自動轉平面底圖。
3. Revit / IFC 樓層與空間自動匯入。
4. COBie Space 自動對應。
5. 2D 空間內設備清單。
6. 2D 平面警報熱區。
7. 設備巡檢路線。
8. 派工人員導航。
9. 多樓層 2D Mini Map。
10. 3D / 2D / 文件 / 工單四合一設備頁。

---

## 23. Vibe Coding 開發 Prompt

請依據本 Markdown 文件，開發一個「3D模型設備對應2D平面檢視」功能，並包含主頁面與設定頁面。

主頁面需求：

1. 主畫面顯示 3D BIM 模型。
2. 使用者點擊 3D 模型設備後，需高亮該設備。
3. 右下方顯示該設備所在樓層的 2D 平面圖。
4. 2D 平面圖需標示該設備對應空間。
5. 若有設備 2D 座標，需顯示設備 marker。
6. 點擊 2D marker 可反向定位 3D 模型。
7. 左下方顯示已綁定設備清單。
8. 右側顯示重要區域清單。
9. 可依棟別與樓層切換。
10. 2D 平面圖需支援縮放、拖曳、關閉、最大化。

設定頁面需求：

1. 可上傳或選擇 2D 平面圖。
2. 可建立棟別、樓層、空間資料。
3. 可從 3D 模型清單選擇設備。
4. 可在 2D 平面圖上點選設備位置。
5. 可繪製空間 polygon。
6. 可將 3D model_uuid 綁定至 2D floor_plan、space 與 equipment marker。
7. 可匯入 Excel 對應表。
8. 可匯出 Excel 範本。
9. 可顯示已對應與未對應設備。
10. 可進行匯入檢核並提供錯誤報表。

請產出：

1. 前端頁面元件。
2. 後端 API。
3. PostgreSQL 資料表。
4. Excel 匯入 / 匯出邏輯。
5. 2D 平面圖 polygon 與 marker 繪製功能。
6. 3D 與 2D 雙向定位功能。
7. 基本測試案例。
8. 工程化、可維護、可擴充的程式架構。
