import fs from 'node:fs'
import { getModelPath, MODEL_FILES, CLIP_CONFIG } from './clipConfig'

/**
 * CLIP 简化版 BPE Tokenizer
 * 参照 OpenAI CLIP 的 SimpleTokenizer 实现，将文本编码为 token id 序列。
 * 仅在文本编码器可用时使用。
 */
export class ClipTokenizer {
  private encoder: Record<string, number> = {}
  private bpeRanks: Map<string, number> = new Map()
  private byteEncoder: Record<number, string> = {}
  private cache = new Map<string, string>()
  private sot = 49406 // <|startoftext|>
  private eot = 49407 // <|endoftext|>
  private ready = false

  load(): boolean {
    try {
      const vocabPath = getModelPath(MODEL_FILES.vocab)
      const mergesPath = getModelPath(MODEL_FILES.merges)
      if (!fs.existsSync(vocabPath) || !fs.existsSync(mergesPath)) return false

      this.encoder = JSON.parse(fs.readFileSync(vocabPath, 'utf-8'))
      const merges = fs
        .readFileSync(mergesPath, 'utf-8')
        .split('\n')
        .slice(1)
        .filter((l) => l.trim())
      merges.forEach((m, i) => this.bpeRanks.set(m, i))
      this.byteEncoder = this.bytesToUnicode()
      this.ready = true
      return true
    } catch {
      return false
    }
  }

  isReady(): boolean {
    return this.ready
  }

  private bytesToUnicode(): Record<number, string> {
    const bs: number[] = []
    for (let i = 33; i <= 126; i++) bs.push(i)
    for (let i = 161; i <= 172; i++) bs.push(i)
    for (let i = 174; i <= 255; i++) bs.push(i)
    const cs = [...bs]
    let n = 0
    for (let b = 0; b < 256; b++) {
      if (!bs.includes(b)) {
        bs.push(b)
        cs.push(256 + n)
        n++
      }
    }
    const out: Record<number, string> = {}
    bs.forEach((b, i) => (out[b] = String.fromCharCode(cs[i])))
    return out
  }

  private getPairs(word: string[]): Set<string> {
    const pairs = new Set<string>()
    for (let i = 0; i < word.length - 1; i++) pairs.add(`${word[i]} ${word[i + 1]}`)
    return pairs
  }

  private bpe(token: string): string {
    if (this.cache.has(token)) return this.cache.get(token)!
    let word = [...token.slice(0, -1), token.slice(-1) + '</w>']
    let pairs = this.getPairs(word)
    if (!pairs.size) return token + '</w>'

    while (true) {
      let minRank = Infinity
      let bigram = ''
      for (const pair of pairs) {
        const rank = this.bpeRanks.get(pair)
        if (rank !== undefined && rank < minRank) {
          minRank = rank
          bigram = pair
        }
      }
      if (!bigram) break
      const [first, second] = bigram.split(' ')
      const newWord: string[] = []
      let i = 0
      while (i < word.length) {
        const j = word.indexOf(first, i)
        if (j === -1) {
          newWord.push(...word.slice(i))
          break
        }
        newWord.push(...word.slice(i, j))
        i = j
        if (word[i] === first && i < word.length - 1 && word[i + 1] === second) {
          newWord.push(first + second)
          i += 2
        } else {
          newWord.push(word[i])
          i += 1
        }
      }
      word = newWord
      if (word.length === 1) break
      pairs = this.getPairs(word)
    }
    const result = word.join(' ')
    this.cache.set(token, result)
    return result
  }

  /** 将文本编码为固定长度 (contextLength) 的 token id 数组 */
  encode(text: string): number[] {
    const clean = text.toLowerCase().trim()
    const tokens: number[] = [this.sot]
    const pat = /'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/gu
    const matches = clean.match(pat) || []
    for (const match of matches) {
      const bytes = Array.from(Buffer.from(match, 'utf-8'))
        .map((b) => this.byteEncoder[b])
        .join('')
      const bpeTokens = this.bpe(bytes).split(' ')
      for (const bt of bpeTokens) {
        const id = this.encoder[bt]
        if (id !== undefined) tokens.push(id)
      }
    }
    tokens.push(this.eot)

    // padding / 截断到 contextLength
    const ctx = CLIP_CONFIG.contextLength
    if (tokens.length > ctx) {
      const truncated = tokens.slice(0, ctx)
      truncated[ctx - 1] = this.eot
      return truncated
    }
    while (tokens.length < ctx) tokens.push(0)
    return tokens
  }
}
