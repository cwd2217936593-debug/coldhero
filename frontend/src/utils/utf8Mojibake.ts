/**
 * 常见乱码场景：服务端与连接实际已为 UTF-8，但链路某处（如旧库的 latin1、错误导入脚本）
 * 把 UTF-8 字节按单字节读出，会得到「Ã§Â³Â»Ã§Â»Å¸Ã§Â®Â¡Ã§Â...」一类西欧字符混杂串。
 *
 * 本函数在「字符串里暂无汉字」但按字节还原后能解出汉字时做修正；已有正常汉字则不处理。
 */

const HAS_BASIC_CJK = /[\u4e00-\u9fff]/;

/** 仅由「可视为单字节 0–255」字符组成的片段才尝试还原 UTF-8，避免误判 emoji 等 surrogate */
function chunkDecodableAsLatinBytes(chunk: string): boolean {
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk.charCodeAt(i);
    if (c > 255) return false;
  }
  return chunk.length > 0;
}

/**
 * 「您好, xxx」：前缀正常汉字 + 后缀为 UTF-8 误读 —— 只对非汉字分段做 latin1-bytes→UTF-8。
 */
export function repairDisplayNameOrMixed(text: string): string {
  if (!text || !HAS_BASIC_CJK.test(text)) {
    return tryDecodeUtf8Mojibake(text);
  }
  let out = "";
  let chunk = "";
  const flushChunk = () => {
    if (!chunk) return;
    if (HAS_BASIC_CJK.test(chunk)) {
      out += chunk;
      chunk = "";
      return;
    }
    let piece = chunk;
    if (!chunkDecodableAsLatinBytes(piece)) {
      out += piece;
      chunk = "";
      return;
    }
    piece = tryDecodeUtf8Mojibake(piece);
    chunk = "";
    out += piece;
  };
  for (const ch of text) {
    if (HAS_BASIC_CJK.test(ch)) {
      flushChunk();
      out += ch;
    } else chunk += ch;
  }
  flushChunk();
  return out;
}

export function tryDecodeUtf8Mojibake(text: string): string {
  if (!text) return text;
  if (HAS_BASIC_CJK.test(text)) return text;

  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if ((code >= 0xd800 && code <= 0xdfff) || code > 255) return text;
      bytes[i] = code;
    }
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!repaired || repaired.includes("\uFFFD")) return text;
    if (HAS_BASIC_CJK.test(repaired)) return repaired;
  } catch {
    /* ignore */
  }
  return text;
}
