# 截图素材

README 中引用的界面截图存放于此目录。

## 需要的截图

按以下清单补齐后，README 中对应位置会自动显示。**文件名必须完全一致**。

| 文件名 | 内容 | 拍摄要点 |
| --- | --- | --- |
| `overview.png` | 应用主界面全貌 | 暗色主题，图库已填充较多图片，侧边栏含 2-3 个目录与几个彩色标签 |
| `text-search.png` | 文本搜图结果 | 搜索一个语义明确的英文短语（如 `sunset over the sea`），画面中能看到多个绿色「极相似」角标与相似度百分比 |
| `image-search.png` | 以图搜图结果 | 工具栏搜索标签显示「以图搜图」，结果按相似度降序，能看到百分比徽章的绿/蓝/灰分级 |
| `preview.png` | 预览抽屉 | 展示大图 + 元信息（尺寸/大小/格式/路径）+ 标签区域，抽屉内三个操作按钮可见 |
| `light-theme.png` | 亮色主题 | 与 `overview.png` 同一视角，便于对比双主题 |

## 拍摄建议

- **窗口尺寸**统一为 `1440×900`（应用默认尺寸），保证各图比例一致
- macOS 用 `Cmd + Shift + 4` 后按空格键，可截取带圆角与阴影的窗口
- 图库中请使用**可公开的图片**，避免个人隐私内容
- 截图前确认状态栏的 Embedding 进度已完成，避免出现时钟图标（未编码状态）
- 单张控制在 500 KB 以内；过大可用 `pngquant` 或 `oxipng` 压缩：

  ```bash
  # macOS: brew install pngquant
  pngquant --quality=70-90 --ext .png --force docs/screenshots/*.png
  ```

## 关于动图

如需录制操作演示（如拖拽图片进窗口触发以图搜图），命名为 `demo.gif`
并控制在 5 MB 以内，可用 [Gifski](https://gif.ski/) 或 `ffmpeg` 压制。
