# 3D監控管理平台多RVT輕量化模型匯入與BIM瀏覽功能開發規格

## 1. 功能目標

本功能用於 3D 監控管理平台，支援匯入一個以上由 Autodesk Revit 建置完成並經過輕量化處理的建築資訊模型，模型內容需包含：

- 建築模型
- 結構模型
- MEP 機電模型
- 設備元件模型
- 樓層與空間資訊
- 設備靜態參數

平台需可對各個輕量化 BIM 模型進行瀏覽、切換、量測、查詢、定位與靜態參數檢視，並作為後續 EMS、SCADA、BMS、DCIM、COBie、圖資管理與設備點位綁定的基礎。

---

## 2. 頁面名稱

建議頁面名稱：

```text
BIM模型管理與瀏覽設定
```

英文名稱：

```text
BIM Model Management and Viewer Setting
```

---

## 3. 使用情境

### 3.1 匯入多個輕量化模型

系統需支援一次或分批匯入多個模型，例如：

| 模型類型 | 範例 |
|---|---|
| 建築模型 | Architecture.rvt 輕量化檔 |
| 結構模型 | Structure.rvt 輕量化檔 |
| 機電模型 | MEP.rvt 輕量化檔 |
| 消防模型 | FireFighting.rvt 輕量化檔 |
| 空調模型 | HVAC.rvt 輕量化檔 |
| 電氣模型 | Electrical.rvt 輕量化檔 |
| 弱電模型 | ELV.rvt 輕量化檔 |
| 給排水模型 | Plumbing.rvt 輕量化檔 |

---

### 3.2 3D BIM 瀏覽操作

使用者進入 3D 監控管理平台後，可執行：

1. 模型縮小。
2. 模型放大。
3. 模型平移。
4. 模型旋轉。
5. 第一人稱漫遊。
6. 樓層切換。
7. 模型顯示 / 隱藏。
8. 設備元件點選。
9. 靜態參數查詢。
10. 長度、面積、角度量測。

---

## 4. 整體功能模組

| 模組 | 說明 |
|---|---|
| 模型匯入管理 | 上傳與管理多個輕量化 BIM 模型 |
| 模型轉換狀態 | 顯示模型處理、轉換、索引狀態 |
| 模型圖層控制 | 建築、結構、MEP 各模型顯示控制 |
| 3D Viewer | 提供 BIM 模型瀏覽與互動 |
| 第一人稱漫遊 | 可模擬人員於建築內行走 |
| 量測工具 | 長度、面積、角度量測 |
| 設備參數檢視 | 點選設備後顯示靜態參數 |
| 模型樹 | 依棟別、樓層、系統、類別顯示模型元件 |
| 搜尋定位 | 依設備名稱、UUID、Revit ID 搜尋定位 |
| 權限管理 | 控制誰可匯入、刪除、瀏覽、量測模型 |

---

# 5. 模型匯入與管理頁面

## 5.1 頁面配置建議

```text
┌────────────────────────────────────────────────────────────────────┐
│ BIM模型管理與瀏覽設定                                               │
├────────────────────────────────────────────────────────────────────┤
│ [新增模型] [批次上傳] [模型轉換] [匯出模型清單] [重新索引] [刪除]      │
├────────────────────────────────────────────────────────────────────┤
│ 搜尋：模型名稱 / 專案代碼 / 棟別 / 樓層 / 系統別                      │
├────────────────────────────────────────────────────────────────────┤
│ 模型清單                                                            │
│ ┌────┬──────────┬────────┬────────┬────────┬────────┬──────────┐ │
│ │狀態│模型名稱   │模型類型 │棟別     │樓層範圍 │檔案大小 │操作      │ │
│ └────┴──────────┴────────┴────────┴────────┴────────┴──────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5.2 模型匯入欄位

| 欄位 | 必填 | 說明 |
|---|---|---|
| project_code | 是 | 專案代碼 |
| project_name | 是 | 專案名稱 |
| building_code | 是 | 棟別代碼 |
| building_name | 是 | 棟別名稱 |
| model_name | 是 | 模型名稱 |
| model_type | 是 | architecture / structure / mep / fire / hvac / electrical / plumbing / elv |
| original_file_name | 是 | 原始檔名 |
| lightweight_file_name | 是 | 輕量化模型檔名 |
| model_format | 是 | glb / gltf / svf / svf2 / ifc / 3dtiles |
| version | 是 | 模型版本 |
| coordinate_system | 否 | 座標系統 |
| origin_x | 否 | 模型原點 X |
| origin_y | 否 | 模型原點 Y |
| origin_z | 否 | 模型原點 Z |
| scale | 否 | 模型比例 |
| unit | 是 | mm / cm / m |
| description | 否 | 備註 |

---

## 5.3 模型狀態

| 狀態 | 說明 |
|---|---|
| uploaded | 已上傳 |
| converting | 轉換中 |
| converted | 已轉換 |
| indexing | 索引中 |
| ready | 可瀏覽 |
| failed | 失敗 |
| archived | 已封存 |

---

## 5.4 模型格式建議

實務上，前端不建議直接載入原始 `.rvt` 檔案，而是應先由後端或轉檔服務將 RVT 轉成輕量化瀏覽格式。

建議支援格式：

| 格式 | 用途 |
|---|---|
| GLB / GLTF | Web 3D 快速瀏覽 |
| IFC | BIM 開放格式交換 |
| SVF / SVF2 | Autodesk Viewer 常用格式 |
| 3D Tiles | 大型園區或多棟建築串流載入 |
| OBJ / FBX | 備用模型格式 |
| JSON Metadata | 設備靜態參數與屬性資料 |

MVP 建議：

```text
GLB / GLTF + JSON Metadata
```

第二階段可擴充：

```text
IFC / SVF2 / 3D Tiles
```

---

# 6. 3D BIM Viewer 主頁面功能

## 6.1 主頁面配置建議

```text
┌────────────────────────────────────────────────────────────────────┐
│ 工具列：選取｜平移｜旋轉｜縮放｜漫遊｜量測｜剖切｜重置視角｜全螢幕      │
├───────────────┬──────────────────────────────────────┬─────────────┤
│ 模型樹         │              3D BIM Viewer            │ 屬性面板      │
│ - 建築模型      │                                      │ - 基本資料    │
│ - 結構模型      │                                      │ - 靜態參數    │
│ - MEP模型       │                                      │ - COBie資料   │
│ - 樓層          │                                      │ - 點位資訊    │
│ - 系統別        │                                      │ - 文件連結    │
├───────────────┴──────────────────────────────────────┴─────────────┤
│ 下方：量測結果 / 選取物件 / 操作提示 / 模型載入狀態                  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6.2 基本模型操作

3D Viewer 需支援以下 BIM 基本瀏覽功能：

| 功能 | 說明 |
|---|---|
| 縮小 | 滾輪或按鈕縮小模型 |
| 放大 | 滾輪或按鈕放大模型 |
| 平移 | 滑鼠右鍵或工具模式平移 |
| 旋轉 | 滑鼠左鍵拖曳旋轉 |
| 模型選取 | 點擊設備或構件 |
| 模型高亮 | 選取後高亮顯示 |
| 重置視角 | 回到模型預設視角 |
| 全螢幕 | 進入全螢幕瀏覽 |
| 視角保存 | 儲存常用視角 |
| 視角切換 | 前視、後視、左視、右視、上視、等角視角 |

---

## 6.3 第一人稱漫遊

第一人稱漫遊需支援：

| 功能 | 說明 |
|---|---|
| 啟用漫遊 | 切換到第一人稱模式 |
| WASD 移動 | 前後左右移動 |
| 滑鼠視角 | 滑鼠控制視角 |
| 樓層高度限制 | 不可穿越樓板，除非開啟穿牆模式 |
| 碰撞檢查 | 可選擇是否啟用 |
| 移動速度 | 支援快慢調整 |
| 重力模式 | 可選擇是否模擬人物高度 |
| 回到預設點 | 回到指定起始位置 |
| 導覽路徑 | 可預設巡覽路線 |

---

## 6.4 模型圖層控制

需可控制每個模型或圖層的顯示狀態。

| 功能 | 說明 |
|---|---|
| 顯示 / 隱藏建築模型 | Architecture |
| 顯示 / 隱藏結構模型 | Structure |
| 顯示 / 隱藏 MEP 模型 | MEP |
| 顯示 / 隱藏消防 | Fire Fighting |
| 顯示 / 隱藏空調 | HVAC |
| 顯示 / 隱藏電氣 | Electrical |
| 顯示 / 隱藏弱電 | ELV |
| 顯示 / 隱藏給排水 | Plumbing |
| 透明度調整 | 每個模型或系統可調整透明度 |
| 隔離選取物件 | 只顯示選取設備 |
| 隱藏選取物件 | 隱藏選取設備 |
| 還原所有模型 | 清除隔離 / 隱藏狀態 |

---

# 7. 量測工具

## 7.1 長度量測

使用者可在模型上點選兩點，系統顯示兩點距離。

需求：

1. 支援 3D 空間距離。
2. 支援水平距離。
3. 支援垂直高度差。
4. 顯示單位 m / cm / mm。
5. 可保留量測標註。
6. 可清除量測標註。

範例結果：

```text
長度：12.45 m
水平距離：12.10 m
高度差：1.25 m
```

---

## 7.2 面積量測

使用者可點選多個點形成封閉區域，系統計算面積。

需求：

1. 至少支援三點形成面積。
2. 支援多邊形面積。
3. 顯示 m²。
4. 可顯示邊長與總面積。
5. 可清除面積標註。

範例：

```text
面積：35.80 m²
周長：28.50 m
```

---

## 7.3 角度量測

使用者可點選三點，系統計算夾角。

需求：

1. 第一點為起點。
2. 第二點為角度中心點。
3. 第三點為終點。
4. 顯示角度。
5. 可保留角度標註。
6. 可清除量測。

範例：

```text
角度：90.00°
```

---

# 8. 設備元件靜態參數檢視

## 8.1 點選設備後顯示屬性面板

當使用者點擊 BIM 模型中的設備元件時，右側需顯示設備靜態參數。

### 基本資料

| 欄位 | 說明 |
|---|---|
| element_id | BIM 元件 ID |
| model_uuid | 模型 UUID |
| revit_id | Revit Element ID |
| ifc_guid | IFC GUID |
| equipment_code | 設備編號 |
| equipment_name | 設備名稱 |
| category | Revit Category |
| family_name | Family 名稱 |
| type_name | Type 名稱 |
| building | 棟別 |
| floor | 樓層 |
| space_name | 空間 |
| system_type | 系統別 |
| model_type | 模型類型 |

---

## 8.2 靜態參數分類

屬性面板需依分類顯示參數。

| 分類 | 說明 |
|---|---|
| Identity Data | 識別資料 |
| Dimensions | 尺寸資料 |
| Mechanical | 機械參數 |
| Electrical | 電氣參數 |
| Fire Protection | 消防參數 |
| Plumbing | 給排水參數 |
| Location | 位置資訊 |
| Manufacturer | 製造商資料 |
| Maintenance | 維護資料 |
| COBie | COBie 對應資料 |
| Custom Parameters | 自訂參數 |

---

## 8.3 靜態參數範例

```json
{
  "element_id": "BIM-EQ-000001",
  "revit_id": "123456",
  "ifc_guid": "3h5Jk9...",
  "equipment_code": "FP-PMP-001",
  "equipment_name": "消防泵浦",
  "category": "Mechanical Equipment",
  "family_name": "Fire Pump",
  "type_name": "Vertical Fire Pump",
  "building": "A棟",
  "floor": "B1",
  "space_name": "消防機房",
  "parameters": {
    "Manufacturer": "ABC Pump",
    "Model": "FP-100",
    "Flow": "1000 LPM",
    "Head": "80 m",
    "Power": "75 kW",
    "Voltage": "380V",
    "InstallDate": "2026-01-01"
  }
}
```

---

# 9. 模型樹與設備搜尋

## 9.1 模型樹

模型樹需支援下列階層：

```text
專案
  └─ 棟別
      └─ 模型類型
          └─ 樓層
              └─ 系統別
                  └─ 設備類型
                      └─ 設備元件
```

範例：

```text
樂迦社區
  └─ A棟
      ├─ 建築模型
      ├─ 結構模型
      └─ MEP模型
          └─ B1
              └─ 消防系統
                  └─ 消防泵浦 FP-PMP-001
```

---

## 9.2 搜尋功能

需可依下列條件搜尋：

| 搜尋欄位 | 說明 |
|---|---|
| model_uuid | 模型 UUID |
| revit_id | Revit Element ID |
| ifc_guid | IFC GUID |
| equipment_code | 設備編號 |
| equipment_name | 設備名稱 |
| family_name | Family |
| type_name | Type |
| floor | 樓層 |
| system_type | 系統別 |
| category | Revit Category |

搜尋結果點擊後：

1. 3D Viewer 聚焦該設備。
2. 高亮該設備。
3. 右側顯示靜態參數。
4. 模型樹同步展開到該設備節點。

---

# 10. 模型輕量化與轉換流程

## 10.1 建議流程

```text
Autodesk Revit RVT 原始模型
        ↓
模型清理與分層
        ↓
依專業拆分：建築 / 結構 / MEP
        ↓
匯出 IFC / FBX / GLB / SVF2
        ↓
模型壓縮與材質簡化
        ↓
萃取設備元件屬性 JSON
        ↓
建立模型索引與元件索引
        ↓
上傳至 3D 監控管理平台
        ↓
Web 端載入輕量化模型
```

---

## 10.2 輕量化處理原則

| 項目 | 建議 |
|---|---|
| 幾何面數 | 移除不必要細節 |
| 材質 | 簡化材質與貼圖 |
| 元件分類 | 保留設備與空間關聯 |
| 屬性資料 | 保留 Revit Element ID、IFC GUID、設備編號 |
| 樓層資訊 | 保留 Level / Floor |
| 空間資訊 | 保留 Room / Space |
| 坐標資訊 | 保留原點與座標系統 |
| 模型拆分 | 大型模型依棟別、樓層、專業拆分 |
| LOD | 依瀏覽需求產生多層級模型 |

---

## 10.3 不建議直接載入原始 RVT

前端 Web Viewer 通常不直接載入 `.rvt` 原始檔，原因：

1. 檔案過大。
2. 格式封閉。
3. Web 端解析困難。
4. 效能不佳。
5. 不利於多模型串流載入。
6. 不易做即時監控狀態變色。

因此平台應管理原始 RVT 的轉換結果，而不是直接把 RVT 當成 Web 模型載入格式。

---

# 11. 建議資料表設計

## 11.1 BIM 模型資料表

```sql
CREATE TABLE bim_models (
    id BIGSERIAL PRIMARY KEY,
    project_code VARCHAR(100) NOT NULL,
    project_name VARCHAR(255),
    building_code VARCHAR(100),
    building_name VARCHAR(255),
    model_name VARCHAR(255) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    original_file_name VARCHAR(255),
    lightweight_file_name VARCHAR(255),
    model_format VARCHAR(50),
    file_url TEXT,
    metadata_url TEXT,
    version VARCHAR(50),
    unit VARCHAR(20) DEFAULT 'm',
    origin_x NUMERIC DEFAULT 0,
    origin_y NUMERIC DEFAULT 0,
    origin_z NUMERIC DEFAULT 0,
    scale NUMERIC DEFAULT 1,
    status VARCHAR(50) DEFAULT 'uploaded',
    is_visible BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 11.2 BIM 元件資料表

```sql
CREATE TABLE bim_elements (
    id BIGSERIAL PRIMARY KEY,
    bim_model_id BIGINT NOT NULL,
    element_id VARCHAR(100) NOT NULL,
    model_uuid VARCHAR(100),
    revit_id VARCHAR(100),
    ifc_guid VARCHAR(100),
    equipment_code VARCHAR(100),
    equipment_name VARCHAR(255),
    category VARCHAR(100),
    family_name VARCHAR(255),
    type_name VARCHAR(255),
    building VARCHAR(100),
    floor VARCHAR(50),
    space_name VARCHAR(255),
    system_type VARCHAR(100),
    equipment_type VARCHAR(100),
    bbox JSONB,
    transform JSONB,
    parameters JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bim_model_id, element_id)
);
```

---

## 11.3 模型視角資料表

```sql
CREATE TABLE bim_saved_views (
    id BIGSERIAL PRIMARY KEY,
    view_name VARCHAR(255) NOT NULL,
    project_code VARCHAR(100),
    building_code VARCHAR(100),
    camera_position JSONB,
    camera_target JSONB,
    camera_up JSONB,
    model_visibility JSONB,
    description TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 11.4 量測紀錄資料表

```sql
CREATE TABLE bim_measurements (
    id BIGSERIAL PRIMARY KEY,
    measurement_type VARCHAR(50) NOT NULL, -- length, area, angle
    project_code VARCHAR(100),
    building_code VARCHAR(100),
    points JSONB NOT NULL,
    result_value NUMERIC,
    result_unit VARCHAR(20),
    label TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

# 12. API 規格建議

## 12.1 取得模型清單

```http
GET /api/bim/models
```

Query：

```text
project_code=
building_code=
model_type=
status=
keyword=
```

---

## 12.2 新增模型

```http
POST /api/bim/models
Content-Type: multipart/form-data
```

Body：

```text
project_code
project_name
building_code
building_name
model_name
model_type
model_format
unit
file
metadata_file
```

---

## 12.3 更新模型狀態

```http
PATCH /api/bim/models/{model_id}/status
```

---

## 12.4 取得模型元件清單

```http
GET /api/bim/models/{model_id}/elements
```

---

## 12.5 取得指定元件靜態參數

```http
GET /api/bim/elements/{element_id}
```

---

## 12.6 搜尋 BIM 元件

```http
GET /api/bim/elements/search
```

Query：

```text
keyword=
revit_id=
ifc_guid=
equipment_code=
equipment_name=
floor=
system_type=
category=
```

---

## 12.7 儲存視角

```http
POST /api/bim/views
```

---

## 12.8 儲存量測紀錄

```http
POST /api/bim/measurements
```

---

# 13. 前端元件建議

```text
src/
  pages/
    BimModelManagementPage.tsx
    BimViewerPage.tsx
  components/
    bim/
      BimViewer.tsx
      BimToolbar.tsx
      ModelTree.tsx
      ModelLayerPanel.tsx
      ElementPropertyPanel.tsx
      FirstPersonWalkthrough.tsx
      MeasurementTools.tsx
      SavedViewPanel.tsx
      ModelUploadModal.tsx
      ModelConversionStatus.tsx
      ElementSearchPanel.tsx
```

---

# 14. Viewer 工具列建議

工具列需包含：

| 工具 | 說明 |
|---|---|
| 選取 | 點選模型元件 |
| 平移 | 移動畫面 |
| 旋轉 | 旋轉模型 |
| 縮放 | 放大縮小 |
| 第一人稱 | 啟用漫遊 |
| 長度量測 | 兩點量測距離 |
| 面積量測 | 多點量測面積 |
| 角度量測 | 三點量測角度 |
| 剖切 | X / Y / Z 剖切模型 |
| 隔離 | 只顯示選取物件 |
| 隱藏 | 隱藏選取物件 |
| 透明 | 調整透明度 |
| 重置 | 重置模型狀態 |
| 全螢幕 | 全螢幕檢視 |

---

# 15. 權限控管

| 功能 | 權限 |
|---|---|
| 瀏覽模型 | viewer |
| 搜尋設備 | viewer |
| 查看靜態參數 | viewer |
| 使用量測工具 | engineer |
| 儲存量測紀錄 | engineer |
| 上傳模型 | bim_manager |
| 刪除模型 | admin |
| 重新索引模型 | bim_manager |
| 管理模型版本 | admin |

---

# 16. 效能需求

1. 支援多模型載入。
2. 大型模型需支援延遲載入。
3. 模型元件需建立索引，避免搜尋過慢。
4. 模型顯示 / 隱藏不可造成畫面卡頓。
5. 3D Viewer 操作 FPS 建議維持 30 FPS 以上。
6. 單一模型過大時需支援分層或分區載入。
7. 支援模型壓縮，例如 Draco、Meshopt 或 3D Tiles。
8. 屬性資料應與幾何模型分離載入。
9. 搜尋設備時只查 Metadata，不應掃描整個 3D 場景。
10. 第一人稱漫遊需可設定碰撞與移動速度，避免操作不順。

---

# 17. 驗收條件

## 17.1 模型匯入驗收

- 可匯入一個以上輕量化 BIM 模型。
- 可區分建築、結構、MEP 等模型類型。
- 可顯示模型匯入狀態。
- 可啟用 / 停用指定模型。
- 可管理模型版本。
- 可查詢模型檔案資訊與 Metadata。

## 17.2 3D Viewer 驗收

- 可放大、縮小、平移、旋轉模型。
- 可切換第一人稱漫遊模式。
- 可切換不同模型顯示 / 隱藏。
- 可依樓層、系統、專業模型切換顯示。
- 可選取 BIM 設備元件。
- 可高亮選取設備。
- 可重置視角。
- 可全螢幕瀏覽。

## 17.3 量測驗收

- 可進行長度量測。
- 可進行面積量測。
- 可進行角度量測。
- 量測結果需顯示單位。
- 可清除量測標註。
- 可選擇是否儲存量測紀錄。

## 17.4 靜態參數驗收

- 點選設備後可顯示靜態參數。
- 可顯示 Revit Element ID。
- 可顯示 IFC GUID。
- 可顯示設備名稱、設備編號、樓層、空間。
- 可依參數分類顯示。
- 可搜尋設備並定位至模型。
- 模型樹需同步選取該設備。

---

# 18. MVP 第一階段

第一階段建議完成：

1. BIM 模型清單管理。
2. 支援匯入 GLB / GLTF 輕量化模型。
3. 支援匯入 Metadata JSON。
4. 3D Viewer 顯示多個模型。
5. 模型顯示 / 隱藏。
6. 放大、縮小、平移、旋轉。
7. 點選設備元件。
8. 右側屬性面板顯示靜態參數。
9. 設備搜尋與定位。
10. 長度量測。
11. 基本模型樹。
12. 模型版本與狀態管理。

---

# 19. 第二階段擴充

第二階段可加入：

1. 第一人稱漫遊。
2. 面積與角度量測。
3. 剖切工具。
4. 模型透明度控制。
5. 多棟建築模型串流載入。
6. 3D Tiles 支援。
7. IFC 屬性解析。
8. COBie 資料整合。
9. 設備點位 DI / DO / AI / AO 綁定。
10. 2D 平面圖對應定位。
11. 圖資管理與維修文件連結。
12. 派工巡檢與報修紀錄整合。

---

# 20. Vibe Coding 開發 Prompt

請依據本 Markdown 文件，開發一個「3D監控管理平台多RVT輕量化模型匯入與BIM瀏覽功能」。

請注意：前端不需要直接解析原始 `.rvt` 檔案，系統應支援上傳經轉換與輕量化後的 Web 可瀏覽模型，例如 GLB / GLTF / SVF2 / IFC / 3D Tiles，並搭配 Metadata JSON 儲存 Revit Element ID、IFC GUID、設備名稱、設備編號、樓層、空間與靜態參數。

功能需求：

1. 可匯入一個以上輕量化 BIM 模型。
2. 可管理建築、結構、MEP 等不同模型類型。
3. 可顯示模型清單、模型版本與處理狀態。
4. 3D Viewer 可同時載入多個模型。
5. 可對模型進行縮小、放大、平移、旋轉。
6. 可支援第一人稱漫遊模式。
7. 可切換模型圖層顯示 / 隱藏。
8. 可點選 BIM 設備元件。
9. 可顯示設備元件靜態參數。
10. 可依 Revit ID、IFC GUID、設備編號、設備名稱搜尋設備。
11. 可定位並高亮選取設備。
12. 可進行長度、面積、角度量測。
13. 可建立模型樹。
14. 可儲存常用視角。
15. 可管理量測紀錄。
16. 需設計 PostgreSQL 資料表。
17. 需提供後端 API。
18. 需提供前端元件架構。
19. 需考量大型模型效能與分層載入。
20. 程式需具備良好可維護性與擴充性。

請產出：

1. 前端頁面與元件。
2. 後端 API。
3. PostgreSQL Schema。
4. 模型 Metadata JSON 格式。
5. 量測工具邏輯。
6. 模型樹資料結構。
7. 第一人稱漫遊功能。
8. 測試案例。
9. 工程化、可維護、可擴充的程式架構。
