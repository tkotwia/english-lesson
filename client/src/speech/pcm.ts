// 即時語音對話用的聲音格式轉換:未壓縮的 16 位元單聲道 PCM。
// 麥克風錄到的是 -1 到 1 的浮點數;伺服器要的、老師的聲音送來的,都是 16 位元整數。

/** 把麥克風錄到的幾段聲音接起來,轉成 16 位元的 PCM。超出範圍的值會被截在上下限,不會繞回去變成雜音。 */
export function floatToPcm16(chunks: Float32Array[]): Int16Array {
  const pcm = new Int16Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    for (const value of chunk) pcm[offset++] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
  }
  return pcm;
}

/** 改變取樣率(線性內插)。瀏覽器沒有照我們要求的取樣率錄音時才會用到。 */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = (i * from) / to;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    result[i] = samples[left]! + (samples[right]! - samples[left]!) * (position - left);
  }
  return result;
}

/**
 * 把伺服器陸續送來的聲音片段(base64 的 PCM)解成可以播放的浮點數。
 * 一個取樣是兩個位元組;片段如果剛好切在取樣中間,多出來的那個位元組留到下一段再接上,否則之後的聲音全部錯位成雜音。
 */
export function createPcmDecoder(): (base64: string) => Float32Array {
  let carry: number | null = null;
  return (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length + (carry === null ? 0 : 1));
    let offset = 0;
    if (carry !== null) bytes[offset++] = carry;
    for (let i = 0; i < binary.length; i++) bytes[offset++] = binary.charCodeAt(i);
    carry = bytes.length % 2 === 1 ? bytes[bytes.length - 1]! : null;
    const samples = new Float32Array(Math.floor(bytes.length / 2));
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    return samples;
  };
}
