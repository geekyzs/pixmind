# 贡献指南

感谢你对 PixMind 的关注！

## 分支模型

项目采用简化的 GitHub Flow：

| 分支 | 用途 | 说明 |
| --- | --- | --- |
| `main` | 稳定分支 | 始终可构建、可发布。仅接受来自 `develop` 或 hotfix 的合并 |
| `develop` | 集成分支 | 日常开发的汇合点，功能分支从此切出并合回 |
| `feature/*` | 功能开发 | 从 `develop` 切出，如 `feature/batch-tagging` |
| `fix/*` | 问题修复 | 从 `develop` 切出，如 `fix/heic-thumbnail` |
| `hotfix/*` | 紧急修复 | 从 `main` 切出，修复后同时合回 `main` 与 `develop` |

版本发布通过在 `main` 上打 `v*` 标签触发自动构建。

## 开发流程

```bash
# 1. Fork 并克隆仓库
git clone git@github.com:<你的用户名>/pixmind.git
cd pixmind

# 2. 从 develop 切出功能分支
git checkout develop
git checkout -b feature/your-feature

# 3. 安装依赖并下载模型
npm install
npm run download-models

# 4. 开发
npm run dev

# 5. 提交前确保类型检查通过
npm run typecheck
```

完成后向 `develop` 分支发起 Pull Request。

## 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <描述>
```

常用 type：

| type | 含义 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `perf` | 性能优化 |
| `refactor` | 重构（不改变外部行为） |
| `docs` | 文档 |
| `build` | 构建配置、依赖变更 |
| `chore` | 杂项 |

scope 建议与模块对应：`electron`、`renderer`、`embedding`、`search`、`scanner`、`db`、`ci`。

示例：

```
feat(search): 支持按相似度阈值过滤结果
fix(scanner): 修复 HEIC 缩略图生成失败
perf(embedding): 批量写入向量减少事务开销
```

## 代码约定

项目为 Electron 主进程 / 渲染进程分层架构，请遵循既有边界：

- **UI 层（`src/`）**只与 Pinia store 交互，不直接调用 `window.api` 之外的能力
- **业务逻辑**放在主进程对应模块（`electron/`），通过 IPC 暴露
- **跨端类型**统一定义在 `shared/types.ts`，IPC 通道名使用 `IPC` 常量而非字符串字面量
- **向量检索**若要替换实现，只需实现 `VectorSearchEngine` 接口并在 `engineFactory.ts` 注册
- 新增 IPC 通道需同步更新 `shared/types.ts`、`electron/ipc/handlers.ts`、`electron/preload.ts` 与 `src/global.d.ts`
- 使用 TypeScript，避免 `any`；注释说明「为什么」而非「做了什么」

## 提交 Issue

- **Bug 报告**请附上操作系统、应用版本、复现步骤，以及开发者工具中的报错信息
- **功能建议**请说明使用场景，而非仅描述实现方案
- 提问前请先查阅 README 的[常见问题](./README.md#常见问题)

## 许可

提交贡献即表示同意你的代码以 [MIT License](./LICENSE) 授权。
