# 模型文件

本应用使用 CLIP ViT-B/32 离线生成图片与文本 Embedding，需要将以下模型文件放入本目录：

| 文件名 | 说明 |
| --- | --- |
| `clip-image-vit-32.onnx` | 图像编码器 |
| `clip-text-vit-32.onnx` | 文本编码器 |
| `vocab.json` | BPE 词表（文本搜图用） |
| `merges.txt` | BPE merges（文本搜图用） |

## 自动下载

在项目根目录执行：

```bash
npm run download-models
```

脚本会从 Hugging Face 的 `Xenova/clip-vit-base-patch32` 下载 ONNX 模型与词表。

## 手动准备

若自动下载失败（网络原因），可手动从任意 CLIP ViT-B/32 的 ONNX 导出获取上述四个文件放入本目录。

> 若模型缺失，应用仍可正常进行图片管理、扫描、浏览、收藏、标签等操作，仅 AI 语义搜索（文本搜图 / 以图搜图）不可用。
