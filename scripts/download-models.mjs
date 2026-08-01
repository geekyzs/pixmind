/**
 * 下载 CLIP ViT-B/32 ONNX 模型与 tokenizer 词表到 models/ 目录。
 *
 * 用法: node scripts/download-models.mjs
 *
 * 模型来源: Hugging Face（Xenova/clip-vit-base-patch32，社区导出的 ONNX 版本）
 * 若下载失败，可手动将以下文件放入项目根的 models/ 目录：
 *   - clip-image-vit-32.onnx  (视觉编码器)
 *   - clip-text-vit-32.onnx   (文本编码器)
 *   - vocab.json              (BPE 词表)
 *   - merges.txt              (BPE merges)
 */
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.join(__dirname, '..', 'models')

if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true })

const BASE = 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main'

const FILES = [
  { url: `${BASE}/onnx/vision_model.onnx`, out: 'clip-image-vit-32.onnx' },
  { url: `${BASE}/onnx/text_model.onnx`, out: 'clip-text-vit-32.onnx' },
  { url: `${BASE}/vocab.json`, out: 'vocab.json' },
  { url: `${BASE}/merges.txt`, out: 'merges.txt' }
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(url, { headers: { 'User-Agent': 'PixMind' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(dest)
        return download(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let done = 0
      res.on('data', (chunk) => {
        done += chunk.length
        if (total) {
          process.stdout.write(
            `\r  ${path.basename(dest)}: ${((done / total) * 100).toFixed(1)}%   `
          )
        }
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        process.stdout.write('\n')
        resolve()
      })
    })
    req.on('error', reject)
  })
}

;(async () => {
  console.log('下载 CLIP ONNX 模型到 models/ ...')
  for (const f of FILES) {
    const dest = path.join(MODELS_DIR, f.out)
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`  已存在，跳过: ${f.out}`)
      continue
    }
    console.log(`下载 ${f.out}`)
    try {
      await download(f.url, dest)
    } catch (e) {
      console.error(`  失败: ${f.out} - ${e.message}`)
      console.error('  请手动下载后放入 models/ 目录')
    }
  }
  console.log('完成。')
})()
