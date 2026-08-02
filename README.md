# PixMind

> 本地优先的 AI 图片管理与语义搜索桌面应用

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Electron](https://img.shields.io/badge/Electron-32-47848F?logo=electron&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

PixMind 是一款**完全离线运行**的桌面应用，用 AI 语义理解来管理本地图片：
输入一句话（如 `sunset over the sea`）就能搜出相关照片，也能「以图搜图」找出视觉相似的图片。

**所有图片、数据库与模型推理都在你的电脑上完成，不上传、不联网、不依赖任何云服务。**

---

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [架构与目录](#架构与目录)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [工作原理](#工作原理clip-语义检索)
- [模型说明](#模型说明)
- [数据存储位置](#数据存储位置)
- [常见问题](#常见问题)
- [已知限制与路线图](#已知限制与路线图)
- [许可证](#许可证)

---

## 特性

| 功能 | 说明 |
| --- | --- |
| **文本搜图** | 基于 CLIP 模型进行语义检索，理解画面内容，而非匹配文件名 |
| **以图搜图** | 支持库内图片、本地上传、**拖拽图片进窗口**三种方式找相似图 |
| **相似度可视化** | 结果展示相似度百分比，`≥80%` 标记「极相似」并高亮边框 |
| **完全离线** | SQLite 本地存储 + ONNX 本地推理，隐私零外泄 |
| **实时目录监听** | 基于 `chokidar` 监听文件增删，自动增量入库，无需手动刷新 |
| **断点续跑** | 未完成的 Embedding 任务会在下次启动时自动继续 |
| **不阻塞 UI** | 图片编码在独立 `Worker` 线程中执行，浏览与搜索始终流畅 |
| **虚拟滚动网格** | 仅渲染可视区域，万级图库依然顺滑，支持无限滚动与网格缩放 |
| **筛选 + 语义搜索组合** | 可先按目录/标签/收藏筛出候选集，再在其中做向量检索 |
| **标签与收藏** | 自定义彩色标签、批量指派、星标收藏，侧边栏一键筛选 |
| **暗色 / 亮色主题** | 内置双主题切换，设置持久化保存 |
| **跨平台** | macOS (dmg, x64/arm64) / Windows (NSIS) / Linux (AppImage) |

**支持格式**：`jpg` `jpeg` `png` `gif` `webp` `bmp` `tiff` `tif` `avif` `heic`

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | Electron 32（上下文隔离 + 预加载脚本，未开启 nodeIntegration） |
| 前端 | Vue 3 + TypeScript 5 + Vite 5 + Element Plus + Pinia |
| 本地数据库 | better-sqlite3（WAL 模式） |
| AI 推理 | onnxruntime-node（CLIP ViT-B/32，图像 + 文本双编码器） |
| 图片处理 | sharp（缩略图，WebP + EXIF 自动旋转） |
| 文件监听 | chokidar |

---

## 架构与目录

采用 **Electron 主进程（业务）+ Vue 渲染进程（UI）** 分层，通过 IPC 通信，
类型定义集中在 `shared/` 内由双端共享。

```
PixMind/
├── electron/                  # 主进程（Node.js 侧）
│   ├── main.ts                # 入口：窗口创建、协议注册、启动编排
│   ├── preload.ts             # 预加载脚本，向渲染进程暴露受控 API
│   ├── core/bus.ts            # 内部事件总线（进度、图片增删等）
│   ├── db/
│   │   ├── database.ts        # SQLite 初始化与建表
│   │   └── repository.ts      # 仓储层：dirs/images/embeddings/tags/settings
│   ├── embedding/
│   │   ├── clipConfig.ts      # 模型路径与预处理参数
│   │   ├── clipEngine.ts      # ONNX 推理封装（图像 / 文本编码）
│   │   ├── clipTokenizer.ts   # CLIP BPE 分词器
│   │   ├── embedWorker.ts     # 图片编码 Worker 线程
│   │   └── embeddingManager.ts# 任务队列、进度上报、断点续跑
│   ├── ipc/handlers.ts        # 所有 IPC 通道注册
│   ├── scanner/               # 目录扫描、缩略图生成、文件监听
│   └── search/
│       ├── VectorSearchEngine.ts # 向量检索抽象接口
│       ├── MemoryVectorIndex.ts  # 内存索引实现（余弦相似度）
│       ├── engineFactory.ts      # 引擎工厂（切换实现的唯一入口）
│       └── searchService.ts      # 搜索业务层
├── src/                       # 渲染进程（Vue 应用）
│   ├── components/            # 侧边栏 / 工具栏 / 虚拟网格 / 预览抽屉 / 状态栏
│   ├── stores/app.ts          # Pinia 全局状态，封装所有 IPC 调用
│   └── styles/                # 主题与全局样式
├── shared/types.ts            # 双端共享类型 + IPC 通道常量
├── models/                    # CLIP 模型文件（需下载，不入版本库）
└── scripts/download-models.mjs
```

**数据流**

```
添加目录 → 扫描入库 → 生成缩略图 ┐
                                ├→ Worker 编码 512 维向量 → SQLite + 内存索引
文件系统变化（chokidar 监听）  ┘                                    ↓
                       用户输入文本/图片 → 编码为向量 → 余弦相似度检索 → 排序展示
```

---

## 快速开始

### 环境要求

- **Node.js 18+**（推荐 20 LTS）
- 项目依赖 `better-sqlite3`、`sharp`、`onnxruntime-node` 等**原生模块**，首次安装需具备编译环境：
  - **macOS**：Xcode Command Line Tools（`xcode-select --install`）
  - **Windows**：Visual Studio Build Tools（C++ 桌面开发）+ Python 3
  - **Linux**：`build-essential`、`python3`

### 安装与运行

```bash
# 1. 克隆并安装依赖（postinstall 会自动重建原生模块）
git clone https://github.com/geekyzs/pixmind.git
cd pixmind
npm install

# 2. 下载 CLIP 模型（必需，约 580MB，从 Hugging Face 拉取）
npm run download-models

# 3. 启动开发模式（Vite 前端 + Electron 主进程一起拉起）
npm run dev
```

> 模型文件未包含在仓库中，**必须先执行第 2 步**，否则 AI 搜索不可用
> （其余图片管理功能仍可正常使用，详见[模型说明](#模型说明)）。

### 其他命令

```bash
npm run typecheck     # TypeScript 类型检查
npm run build         # 类型检查 + 构建 + 打包当前平台
npm run build:mac     # macOS dmg（x64 + arm64）
npm run build:win     # Windows NSIS 安装包
npm run build:linux   # Linux AppImage
```

产物输出到 `release/` 目录。

### 自动构建（GitHub Actions）

仓库内置两条工作流：

| 工作流 | 触发条件 | 作用 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push / PR 到 `main` | 类型检查 + 编译验证（不打包，反馈快） |
| `.github/workflows/build.yml` | 推送 `v*` 标签，或手动触发 | 并行构建四平台安装包并创建 Release |

发布一个新版本：

```bash
npm version patch        # 更新 package.json 版本号并打 tag
git push --follow-tags   # 推送后自动构建并生成 Release
```

也可在 Actions 页面手动运行 **Build & Release**，可选择是否内置模型、是否创建 Release，
产物会作为 Artifacts 保留 14 天，便于测试构建。

构建矩阵说明：macOS 的两个架构分别在 `macos-14`(arm64) 与 `macos-13`(x64) 上构建，
因为 `better-sqlite3`、`sharp` 等原生模块需针对宿主架构编译，
在单个 runner 上同时产出双架构会得到无法运行的安装包。

> **关于代码签名**：默认配置未启用签名（`CSC_IDENTITY_AUTO_DISCOVERY: false`）。
> 若已有证书，可将证书与密码存入仓库 Secrets（macOS: `CSC_LINK` / `CSC_KEY_PASSWORD`；
> Windows: `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`），并移除该环境变量。

---

## 使用指南

### 1. 添加图片目录

侧边栏「目录」右侧点击 **+**，选择任意本地文件夹。
应用会立即后台扫描、生成缩略图并排队编码，底部状态栏实时显示进度。

目录右侧 `⋯` 菜单可以「重新扫描」「停用/启用监听」「移除目录」
（移除仅清除索引，**不会删除本地文件**）。

### 2. 文本搜图

在顶部搜索框输入画面描述，回车即可，例如：

```
a dog running on the grass      # 推荐使用英文，效果最佳
sunset over the sea
person riding a bicycle
```

> 内置的 CLIP ViT-B/32 是**英文模型**，中文查询效果有限。
> 如需中文语义搜索，可替换为 Chinese-CLIP 的 ONNX 导出版本，详见[模型说明](#模型说明)。

### 3. 以图搜图（三种方式）

| 方式 | 操作 |
| --- | --- |
| 库内图片 | 点击图片打开预览抽屉 → 点击 **以图搜图** |
| 本地上传 | 工具栏 **上传图片搜相似** → 选择任意本地图片 |
| 拖拽 | 直接把图片文件**拖入应用窗口**，松手即搜 |

搜索结果按相似度降序排列，左下角显示百分比：
`≥80%` 绿色高亮并标注「极相似」，`≥60%` 蓝色，其余灰色。

### 4. 筛选、排序与管理

- **筛选**：侧边栏可按目录、标签、收藏组合筛选；工具栏支持按文件名关键词过滤。
  筛选条件同样作用于 AI 搜索（先筛候选集，再做向量检索）。
- **排序**：最新/最早添加、修改时间、文件名、文件大小。
- **收藏**：在网格中**右键图片**可快速切换收藏；预览抽屉内也有收藏按钮。
- **标签**：预览抽屉底部可新建标签并即时指派，标签在侧边栏显示数量。
- **网格缩放**：拖动工具栏滑块调整缩略图尺寸（120–320 px）。
- **删除**：预览抽屉内「删除」会将**原文件移入系统回收站**，并清理索引与向量。

---

## 工作原理：CLIP 语义检索

CLIP（Contrastive Language-Image Pre-Training）把**图像**和**文本**映射到同一个 512 维向量空间，
语义相近的内容在该空间中距离也相近。因此可以直接用文本向量去检索图像向量。

1. **入库编码**：图片经 `sharp` 缩放为 224×224 并做 CLIP 标准归一化，
   由视觉编码器输出 512 维向量，以 `BLOB` 存入 `embeddings` 表，同时写入内存索引。
2. **查询编码**：文本经 BPE 分词补齐到 77 token 后由文本编码器编码；
   以图搜图则直接走视觉编码器。
3. **相似度计算**：所有向量存储前做 **L2 归一化**，检索时点积即为**余弦相似度**，
   通过 Top-K 小顶堆筛选，万级图库检索耗时在毫秒级。

### 可替换的检索引擎

向量检索通过 `VectorSearchEngine` 接口抽象，业务层只依赖接口：

```ts
// electron/search/engineFactory.ts —— 切换实现的唯一位置
export function createSearchEngine(type: EngineType = 'memory'): VectorSearchEngine {
  switch (type) {
    case 'memory': return new MemoryVectorIndex()
    // case 'sqlite-vec': return new SqliteVecIndex()
    // case 'qdrant':     return new QdrantIndex({ url: '...' })
  }
}
```

当图库规模增长到内存索引不再合适时，只需新增一个 Engine 实现，**无需改动任何业务代码**。

### 安全的本地图片加载

渲染进程默认禁止加载 `file://` 资源。应用注册了自定义特权协议 `pixmind://`，
以 `pixmind://<encodeURIComponent(绝对路径)>` 的形式按需读取原图与缩略图，
在保持 `contextIsolation` 的前提下安全访问本地文件。

---

## 模型说明

模型文件体积较大，**未纳入版本库**（见 `.gitignore`），需自行获取到 `models/` 目录：

| 文件 | 说明 | 体积 |
| --- | --- | --- |
| `clip-image-vit-32.onnx` | 图像编码器 | 约 335 MB |
| `clip-text-vit-32.onnx` | 文本编码器 | 约 242 MB |
| `vocab.json` | BPE 词表 | 约 0.8 MB |
| `merges.txt` | BPE merges 规则 | 约 0.5 MB |

合计约 580 MB。

### 自动下载

```bash
npm run download-models
```

脚本从 Hugging Face 仓库 [`Xenova/clip-vit-base-patch32`](https://huggingface.co/Xenova/clip-vit-base-patch32)
拉取 ONNX 模型与词表，已存在的文件会自动跳过。

### 手动准备

若网络受限，可手动下载以下文件并按上表重命名放入 `models/`：

| 目标文件名 | 来源路径 |
| --- | --- |
| `clip-image-vit-32.onnx` | `onnx/vision_model.onnx` |
| `clip-text-vit-32.onnx` | `onnx/text_model.onnx` |
| `vocab.json` | `vocab.json` |
| `merges.txt` | `merges.txt` |

### 优雅降级

**模型缺失时应用不会崩溃**：扫描、浏览、缩略图、收藏、标签、排序、筛选等功能照常可用，
仅文本搜图与以图搜图不可用。补齐模型并重启后，历史图片会自动补做编码。

### 换用中文模型

`clipConfig.ts` 集中定义了模型文件名与预处理参数。若要支持中文查询，
可将 Chinese-CLIP（ViT-B/16 等）导出为 ONNX，替换两个编码器与词表文件，
并按新模型调整 `embeddingDim`、`contextLength` 及分词逻辑。

---

## 数据存储位置

数据库与缩略图缓存位于系统用户数据目录，不污染图片原目录：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/PixMind/` |
| Windows | `%APPDATA%\PixMind\` |
| Linux | `~/.config/PixMind/` |

```
PixMind/
├── data/pixmind.db     # SQLite 数据库（图片索引、向量、标签、设置）
└── thumbnails/         # WebP 缩略图缓存
```

删除该目录即可完全重置应用（不影响你的原始图片）。

---

## 常见问题

<details>
<summary><b>npm install 失败 / 提示 node-gyp 编译错误</b></summary>

原生模块需要本地编译工具链，请先安装对应平台的构建依赖（见[环境要求](#环境要求)），
然后执行 `npm run postinstall` 重建原生模块。
</details>

<details>
<summary><b>搜索无结果或提示「请确认 CLIP 模型已就绪」</b></summary>

1. 检查 `models/` 下四个文件是否齐全且大小正常；
2. 确认状态栏的 Embedding 进度已完成——未编码的图片在网格中会显示时钟图标；
3. 若模型是补齐后放入的，请重启应用以加载。
</details>

<details>
<summary><b>中文搜索效果很差</b></summary>

内置 CLIP ViT-B/32 为英文预训练模型，建议用英文描述查询，
或参考[换用中文模型](#换用中文模型)替换为 Chinese-CLIP。
</details>

<details>
<summary><b>HEIC 图片无法生成缩略图</b></summary>

HEIC 解码依赖 `sharp` 所链接的 libheif 支持，部分平台预编译包未包含该能力。
可改用支持 HEIC 的 sharp 构建，或先将图片转为 JPEG/PNG。
</details>

<details>
<summary><b>图库很大，编码要多久？</b></summary>

CPU 推理下 CLIP ViT-B/32 单张约几十到上百毫秒，编码在 Worker 线程串行执行，
不影响界面操作，可以边编码边浏览。任务中断后下次启动会自动续跑。
</details>

---

## 已知限制与路线图

- [ ] 内存向量索引为暴力检索，约万级图片表现良好，更大规模需接入 `sqlite-vec` / `Qdrant`（接口已预留）
- [ ] 暂不支持批量选择与批量打标签
- [ ] 暂不支持相册/分组、重复图片检测
- [ ] 尚未接入 GPU 推理加速（CoreML / DirectML）
- [ ] 未提供内置的设置面板（`autoEmbed`、`concurrency` 目前仅存于数据库）

欢迎通过 Issue 讨论优先级。

---

## 贡献

欢迎 Issue 与 PR。

项目采用简化的 GitHub Flow：`main` 为稳定发布分支，`develop` 为集成分支，
功能开发请从 `develop` 切出 `feature/*` 分支，完成后向 `develop` 发起 PR。

提交前请确保：

```bash
npm run typecheck   # 类型检查通过
```

代码风格上请沿用现有分层约定：UI 只与 Pinia store 交互，
业务逻辑放在主进程对应模块，跨端类型统一写入 `shared/types.ts`。

详细约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。

CLIP 模型权重版权归其原作者所有，请遵循 [OpenAI CLIP](https://github.com/openai/CLIP)
及对应 Hugging Face 仓库的许可条款使用。

---

## 致谢

- [OpenAI CLIP](https://github.com/openai/CLIP) —— 图文跨模态模型
- [Xenova/transformers.js](https://huggingface.co/Xenova) —— 社区 ONNX 模型导出
- [Electron](https://www.electronjs.org/) · [Vue](https://vuejs.org/) · [Element Plus](https://element-plus.org/) · [sharp](https://sharp.pixelplumbing.com/) · [ONNX Runtime](https://onnxruntime.ai/)
