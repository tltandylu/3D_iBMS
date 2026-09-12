# 3D 監控管理平台：自主移動機器人（AMR/AGV）即時動態位置顯示模組 規劃設計規格書

---

## 1. 文件資訊與修訂紀錄

### 1.1 文件資訊
* **文件名稱**：3D 監控管理平台自主移動機器人（AMR/AGV）即時動態位置顯示模組規劃設計規格書
* **文件版本**：V1.0.0
* **適用範疇**：3D 數位雙生（Digital Twin）、BIM 智慧監控管理平台、AMR/AGV 車隊即時姿態可視化子系統
* **文件密等**：內部技術規範 / 系統開發指引

### 1.2 修訂紀錄
| 版本 | 日期 | 修訂人員 | 變更說明 | 審核狀態 |
| :--- | :--- | :--- | :--- | :--- |
| V1.0.0 | 2026-09-12 | 系統規劃組 | 初版建立，定義資料流、通訊協定、坐標轉換、平滑插值演算法與視角追蹤機制 | 正式發布 |

---

## 2. 專案背景與需求分析

### 2.1 專案背景
現有 3D 監控管理平台已具備靜態 BIM/CAD 建築空間架構、機電設備（HVAC、給排水、電力迴路）之監控能力。隨著廠區/樓宇內部導入自主移動機器人（AMR）、自動導引車（AGV）及自動巡檢機器人，既有 2D 平面監控介面已無法滿足現代戰情中心對於「立體空間分佈」、「動態干涉分析」與「沉浸式巡檢聯動」之高維度管理需求。

因此，需在現行 3D 平台架構下，擴充具備高即時性、平滑運動渲染、高精度空間對齊之機器人行動位置動態顯示模組。

### 2.2 核心目標與驗收指標 (KPI)
1. **端到端延遲（End-to-End Latency）**：從機器人本體 SLAM/UWB 定位運算完成，至 3D 監控畫面渲染更新，整體網路與運算延遲 **< 200 ms**。
2. **畫面更新與渲染幀率（Render FPS）**：
   * 在承載 20 台以上動態機器人併行更新條件下，3D 引擎主迴圈幀率維持 **≥ 50 FPS**。
   * 車體位移無視覺跳格（Jitter）、無位置穿牆、無非預期迴旋。
3. **坐標映射精度（Positional Accuracy）**：現場實體基準點與 3D 模型虛擬世界坐標之轉換誤差 **≤ 0.15 m**。
4. **弱網與斷線恢復能力**：具備網路抖動死推算（Dead Reckoning）緩衝，並於中斷重連後 1 秒內自動完成狀態校準。

---

## 3. 系統整體架構規劃

本模組採邊緣端（機器人/定位系統）、後端數據中繼層（Gateway/Broker）與前端 3D 呈現層之三層解耦架構。

```
┌─────────────────────────────────────────────────────────────┐
│                 邊緣感知與定位層 (Edge & Localization)         │
│  [ AMR / AGV 本體 (ROS 2) ]        [ UWB 基站定位伺服器 ]     │
│         │ (SLAM / IMU / Odom)                 │             │
└─────────┼─────────────────────────────────────┼─────────────┘
          │ (Wi-Fi 6 / 5G Dedicated Network)    │ (TCP/IP)
          ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 後端數據匯流與轉發層 (Backend Service)        │
│  ┌──────────────────────┐         ┌──────────────────────┐  │
│  │   MQTT / ROSBridge   │         │ 頻率節流與坐標前處理  │  │
│  │   IoT Ingestion      │ ──────> │ (Throttling & Filter)│  │
│  └──────────────────────┘         └──────────┬───────────┘  │
│                                              │              │
│                                   ┌──────────▼───────────┐  │
│                                   │ WebSocket Push Svc   │  │
│                                   │ (TLS WSS / 10-15Hz)  │  │
│                                   └──────────┬───────────┘  │
└──────────────────────────────────────────────┼──────────────┘
                                               │ (JSON / Protobuf)
                                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 前端 3D 視覺渲染層 (Web 3D / Digital Twin)    │
│  ┌──────────────────────┐         ┌──────────────────────┐  │
│  │ WebSocket Client     │ ──────> │ 空間矩陣校準模組     │  │
│  │ (Heartbeat/Recon)    │         │ (Matrix4 Transform)  │  │
│  └──────────────────────┘         └──────────┬───────────┘  │
│                                              │              │
│                                   ┌──────────▼───────────┐  │
│                                   │ 運動平滑插值引擎     │  │
│                                   │ (LERP / SLERP Loop)  │  │
│                                   └──────────┬───────────┘  │
│                                              │              │
│         ┌────────────────────────────────────┴───────────┐  │
│         ▼                                                ▼  │
│  [ 機器人動態模型渲染 ]                         [ 視角追蹤與 HUD ]   │
│  (GLB / Dynamic Trajectory / Status LED)        (Chase Cam / CSS2D) │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 通訊協議與資料封包規範

### 4.1 傳輸通訊機制
* **傳輸通道**：前端與遙測中繼服務採用 **WebSocket (WSS)** 長連接。
* **資料推播頻率**：後端固定每秒推播 **10 Hz ~ 15 Hz**（每 66ms ~ 100ms 一幀）。
* **壓縮與編碼**：以標準 JSON 為基礎；在多台設備（>50 台）高頻場景下可擴充至 Protocol Buffers (Protobuf)。

### 4.2 遙測封包資料字典（Telemetry Downlink Schema）

```json
{
  "version": "1.0",
  "msg_type": "ROBOT_TELEMETRY",
  "device_id": "AMR-P01",
  "device_name": "無人物料搬運車 01",
  "timestamp": 1789205400125,
  "floor_id": "FL-02",
  "pose": {
    "x": 24.524,
    "y": 0.000,
    "z": 15.308,
    "yaw": 182.4,
    "pitch": 0.0,
    "roll": 0.0
  },
  "motion": {
    "linear_velocity": 0.75,
    "angular_velocity": 0.02
  },
  "status": {
    "state": "RUNNING",
    "battery_pct": 82,
    "alarm_level": 0,
    "current_task_id": "TASK-202609-089",
    "target_station": "ST-A03"
  }
}
```

#### 欄位定義表
| 欄位名稱 | 型別 | 單位 | 說明 |
| :--- | :--- | :--- | :--- |
| `device_id` | String | - | 機器人唯一識別碼 |
| `timestamp` | Int64 | ms | 採樣時間戳記（Unix Epoch Milliseconds） |
| `floor_id` | String | - | 所在樓層代碼（用於多樓層 3D 空間層級切換） |
| `pose.x, pose.y, pose.z` | Float | m | 機器人本體坐標（原生導航坐標系） |
| `pose.yaw` | Float | deg | 水平朝向旋轉角（$0^\circ \sim 360^\circ$） |
| `motion.linear_velocity`| Float | m/s | 當前移動線速度 |
| `status.state` | String | - | 狀態枚舉：`IDLE`、`RUNNING`、`CHARGING`、`BLOCKED`、`ERROR`、`OFFLINE` |
| `status.battery_pct` | Int | % | 即時剩餘電量百分比（0 ~ 100） |
| `status.alarm_level` | Int | - | 告警等級：0 (正常)、1 (警告)、2 (嚴重故障停機) |

---

## 5. 空間坐標系對齊與校準機制

### 5.1 坐標系定義差異
* **機器人 SLAM 地圖坐標系**：通常以建圖起點為原點，採右手系（$X$ 軸朝前、$Y$ 軸朝左、$Z$ 軸朝上，即 ROS 標準）。
* **3D 建築世界坐標系（Web 3D / BIM）**：通常以建築柱網焦點或大地基準為原點，Web 3D 常見為右手系（$X$ 軸朝右、$Y$ 軸朝上、$Z$ 軸朝後/前，如 Three.js）。

### 5.2 數學轉換模型（Affine Transform）
為將機器人原生坐標轉換為 3D 模型世界坐標，需建立 $4 	imes 4$ 齊次轉換矩陣 $\mathbf{M}_{align}$：

$$\mathbf{P}_{3D} = \mathbf{M}_{align} \cdot \mathbf{P}_{robot}$$

矩陣展開式：
$$\mathbf{M}_{align} = egin{bmatrix}
r_{11} & r_{12} & r_{13} & t_x \
r_{21} & r_{22} & r_{23} & t_y \
r_{31} & r_{32} & r_{33} & t_z \
0 & 0 & 0 & 1
\end{bmatrix}$$

其中包含：
1. **平移矩陣 $\mathbf{T}$**：將機器人地圖原點平移至 3D 空間對應點 $(t_x, t_y, t_z)$。
2. **旋轉矩陣 $\mathbf{R}$**：修正兩者指南方向與偏角偏差（主要為 Yaw 軸偏角 $	heta_y$）。
3. **縮放係數 $\mathbf{S}$**：比例尺校正（若 SLAM 地圖單位與 3D 幾何單位不一致）。

### 5.3 現場標定與校正程序 (Calibration SOP)
1. **參考錨點選定**：在現場空間選取至少 3 個明顯且不可移動的基準特徵點（例如柱體邊角、充電樁定位銷、防火門框邊線），記錄現場精確量測之 SLAM 坐標與 3D BIM 坐標。
2. **最小平方法矩陣求解**：透過奇異值分解（SVD）或 Umeyama 演算法求解最佳剛體轉換矩陣（Rigid Body Transformation），使空間均方根誤差（RMSE）極小化。
3. **外部配置化管理**：轉換參數儲存於 `calibration_profiles.json`，支援後台熱加載，無須重新編譯前端程式碼。

---

## 6. 前端 3D 渲染與運動呈現核心機制

### 6.1 模型資產與幾何規範
* **模型格式**：採精簡優化之 **GLTF / GLB** 格式。
* **拓撲面數**：單一機器人本體三角面數（Triangles）控制在 **3,000 ~ 6,000 面** 內。
* **幾何中心與錨點（Pivot Point）**：
  * 模型底部接地中心點必須嚴格對齊為 $(0, 0, 0)$ 原點。
  * 朝向向量（Forward Vector）必須與模型預設正前方向一致（預設為 $+Z$ 軸或 $+X$ 軸）。

### 6.2 動態位姿平滑演算（LERP & SLERP）
為消除網路傳輸週期性延遲產生的卡頓或抽搐，前端採用雙緩衝目標插值法：

```
[收到新封包 P_target] ──> 更新目標坐標與目標旋轉四元數
                             │
[每幀 Render Tick] ───────> 計算位移: P_current = Lerp(P_current, P_target, alpha)
                             │
                             └─> 計算旋轉: Q_current = Slerp(Q_current, Q_target, alpha_rot)
```

* **線性位移插值（LERP）**：
  $$\mathbf{P}(t) = \mathbf{P}_{current} + (\mathbf{P}_{target} - \mathbf{P}_{current}) 	imes (1 - e^{-\lambda \cdot \Delta t})$$
  * 使用指數衰減阻尼（Exponential Damping）可確保在幀率浮動時仍具備恆定時間收斂特性。
* **旋轉球面插值（SLERP）**：
  * 朝向使用四元數（Quaternion）進行球面插值，避免歐拉角（Euler Angles）在 $0^\circ \leftrightarrow 360^\circ$ 切換時的非預期 360 度急轉現象及萬向節死鎖（Gimbal Lock）。

### 6.3 3D 狀態標籤與視覺反饋（3D UI HUD）
* 每個機器人上方掛載一個動態 3D 看板（CSS2DObject 或 Sprite）。
* **即時顯示資訊**：
  * 車體識別號（Tag Name）
  * 電量條動態百分比（動態綠/黃/紅變色）
  * 當前狀態標籤（巡檢中、前往充電樁、避障中）
* **光效與邊框提示**：
  * 車身底座疊加動態光環（動態呼吸發光 Shader），告警時切換為高頻閃爍紅光。

### 6.4 歷史軌跡殘影（Breadcrumb Line）
* 採用動態幾何頂點緩存（BufferGeometry）。
* 當車體移動超過閾值（如 $\Delta d \ge 0.3	ext{ m}$）時新增頂點，限制最大保留頂點數（如 200 點）。
* 頂點顏色帶 Alpha 漸層衰減，呈現尾跡消退效果。

---

## 7. 視角控制與使用者互動設計

| 視角模式 | 操作邏輯 | 技術實作細節 |
| :--- | :--- | :--- |
| **全局概覽模式 (Global Orbit)** | 使用者透過滑鼠自由旋轉、平移與縮放 3D 廠區場景。 | OrbitControls 模式，機器人在場景中動態穿梭，互不干涉視角。 |
| **鎖定跟隨模式 (Chase Camera)** | 在設備清單中雙擊特定機器人，鏡頭平滑飛越（FlyTo）並鎖定在車體後上方。 | 於 Render Tick 中計算鏡頭目標位置：<br>`CameraPos = RobotPos - Forward * Distance + Up * Height`<br>鏡頭位移同樣套用平滑阻尼，避免車輛急轉時產生眩暈感。 |
| **第一人稱視角 (POV / FPV)** | 切換至機器人機載視角，沉浸式觀察前方動態。 | 鏡頭直接掛載於車體攝影機安裝節點（Child of Robot Mesh）；右下角可動態啟用機載 WebRTC 即時視訊子視窗。 |
| **跨樓層自適應 (Floor Culling)**| 當機器人搭乘電梯至不同樓層時觸發。 | 根據報文 `floor_id` 動態啟用特定樓層之 3D 模型圖層，其餘樓層自動轉為線框（Wireframe）或隱藏。 |

---

## 8. 效能優化與異常容錯防護

### 8.1 大規模併行渲染優化
1. **視錐體剔除（Frustum Culling）**：不在當前畫面可視範圍內的機器人，停止其粒子光效與 HUD 標籤的 DOM 重繪。
2. **動態 LOD（Level of Detail）**：
   * 遠距離（> 50 米）：簡化為發光圓點圖標與精簡坐標點。
   * 中距離（15 ~ 50 米）：載入 Low-Poly 車體無貼圖模型。
   * 近距離（< 15 米）：載入高細節模型與狀態燈。

### 8.2 異常連線處理與容錯機制
* **心跳監控（Heartbeat Timeout）**：
  * 若超過 3.0 秒未收到某台機器人之位姿報文，系統判定為 `SIGNAL_LOST`。
  * 車體模型轉為半透明灰色（Ghost Mode），狀態 HUD 標記「離線 / 訊號遺失」，停止航位推算。
* **位置跳躍防護（Sanity Check）**：
  * 若單一報文計算所得之瞬間速度超過物理上限（如 $> 3.5	ext{ m/s}$），判定為定位漂移異常值，捨棄該幀並發出告警日誌。

---

## 9. 前端核心代碼架構範例（TypeScript / Three.js 原型）

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export interface RobotTelemetry {
  deviceId: string;
  floorId: string;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  lastUpdate: number;
}

export class Robot3DManager {
  private scene: THREE.Scene;
  private robots: Map<string, {
    mesh: THREE.Group;
    targetPos: THREE.Vector3;
    targetQuat: THREE.Quaternion;
    lastUpdate: number;
  }> = new Map();

  // 空間校準仿射矩陣 (由現場標定配置載入)
  private alignmentMatrix: THREE.Matrix4 = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public setAlignmentMatrix(elements: number[]): void {
    this.alignmentMatrix.fromArray(elements);
  }

  public updateTelemetry(data: any): void {
    let robot = this.robots.get(data.device_id);
    if (!robot) {
      this.spawnRobot(data.device_id);
      return;
    }

    // 1. 原始原生坐標轉為向量
    const rawPos = new THREE.Vector3(data.pose.x, data.pose.y, data.pose.z);
    
    // 2. 套用空間矩陣轉換至 3D 建築坐標系
    const alignedPos = rawPos.applyMatrix4(this.alignmentMatrix);
    
    // 3. 姿態角轉換為四元數
    const targetEuler = new THREE.Euler(0, THREE.MathUtils.degToRad(data.pose.yaw), 0, 'YXZ');
    const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);

    // 4. 更新目標緩存
    robot.targetPos.copy(alignedPos);
    robot.targetQuat.copy(targetQuat);
    robot.lastUpdate = performance.now();
  }

  // 於主 Render Loop 中每幀呼叫 (如 requestAnimationFrame)
  public tick(deltaTime: number): void {
    const smoothingFactor = 1.0 - Math.exp(-12.0 * deltaTime);

    this.robots.forEach((robot) => {
      // 指數衰減平滑位移 (LERP)
      robot.mesh.position.lerp(robot.targetPos, smoothingFactor);

      // 球面平滑旋轉 (SLERP)
      robot.mesh.quaternion.slerp(robot.targetQuat, smoothingFactor);

      // 超時判定 (3秒未更新變更狀態)
      if (performance.now() - robot.lastUpdate > 3000) {
        (robot.mesh as any).traverse((child: any) => {
          if (child.isMesh && child.material) {
            child.material.opacity = 0.4;
            child.material.transparent = true;
          }
        });
      }
    });
  }

  private spawnRobot(deviceId: string): void {
    // 載入精簡 Low-Poly GLB 模型
    const loader = new GLTFLoader();
    loader.load('/assets/models/amr_unit.glb', (gltf) => {
      const model = gltf.scene;
      model.name = deviceId;
      this.scene.add(model);
      this.robots.set(deviceId, {
        mesh: model,
        targetPos: new THREE.Vector3(),
        targetQuat: new THREE.Quaternion(),
        lastUpdate: performance.now()
      });
    });
  }
}
```

---

## 10. 開發時程與驗收里程碑 (WBS)

```
[階段一：通訊與坐標對齊] (W1 ~ W2)
 ├── 通訊轉發服務建立 (WebSocket / MQTT 橋接)
 ├── 坐標系轉換數學模型與標定配置模組開發
 └── 單元測試：坐標映射誤差檢測 (驗收基準：RMSE < 0.15m)

[階段二：3D 核心渲染引擎擴充] (W3 ~ W4)
 ├── AMR Low-Poly 模型載入與材質規範落地
 ├── LERP / SLERP 雙緩衝平滑插值演算法實作
 ├── 3D CSS2D HUD 狀態看板與底盤呼吸燈 Shader 開發
 └── 歷史軌跡殘影（Breadcrumbs）動態頂點繪製

[階段三：視角互動與系統整合] (W5 ~ W6)
 ├── 第三人稱追蹤視角與相機平滑彈簧臂阻尼
 ├── 既有 SCADA/BMS 設備樹與告警事件聯動
 └── 壓力測試與優化（20台車併行，瀏覽器幀率維持 ≥ 50 FPS）
```
