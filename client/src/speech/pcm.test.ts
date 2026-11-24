import { describe, expect, it } from 'vitest';
import { createPcmDecoder, floatToPcm16, resample } from './pcm.ts';

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe('麥克風的聲音轉成 PCM', () => {
  it('幾段聲音依序接起來,-1 到 1 對應到 16 位元整數的範圍', () => {
    expect([...floatToPcm16([new Float32Array([0, 0.5]), new Float32Array([-0.5, 1, -1])])]).toEqual([0, 16384, -16383, 32767, -32767]);
  });

  // 整數溢位會從最大值繞到最小值,聽起來是很大聲的爆音。
  it('太大聲(超出範圍)的值截在上下限,不會繞回去', () => {
    expect([...floatToPcm16([new Float32Array([1.7, -3])])]).toEqual([32767, -32767]);
  });

  it('沒有錄到任何聲音時是空的', () => {
    expect(floatToPcm16([]).length).toBe(0);
  });
});

describe('改變取樣率', () => {
  it('取樣率相同時原樣傳回', () => {
    const samples = new Float32Array([0.1, 0.2]);
    expect(resample(samples, 16000, 16000)).toBe(samples);
  });

  // 伺服器把收到的聲音當成 16 kHz。長度不對的話,老師聽到的會是快轉或慢放的聲音。
  it('48 kHz 降到 16 kHz:長度變成三分之一,聲音的走向不變', () => {
    const ramp = Float32Array.from({ length: 480 }, (_, index) => index / 480);
    const result = resample(ramp, 48000, 16000);
    expect(result.length).toBe(160);
    expect(result[0]).toBeCloseTo(0);
    expect(result[80]).toBeCloseTo(0.5, 2);
  });
});

describe('老師的聲音片段解碼', () => {
  it('兩個位元組一個取樣,低位元組在前', () => {
    const decode = createPcmDecoder();
    const samples = decode(base64([0x00, 0x40, 0x00, 0xc0]));
    expect([...samples]).toEqual([0.5, -0.5]);
  });

  // 片段切在取樣中間時,如果直接丟掉多出來的位元組,後面所有的取樣都會錯位,整段變成雜音。
  it('片段切在取樣中間時,多出來的位元組接到下一段', () => {
    const decode = createPcmDecoder();
    const first = decode(base64([0x00, 0x40, 0x00]));
    const second = decode(base64([0xc0, 0x00, 0x20]));
    expect([...first]).toEqual([0.5]);
    expect([...second]).toEqual([-0.5, 0.25]);
  });
});
