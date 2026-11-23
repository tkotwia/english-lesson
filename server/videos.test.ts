import { describe, expect, it } from 'vitest';
import { LEVELS, type Level } from '../shared/schema.ts';
import { VIDEOS } from './videoList.ts';
import { pickVideo, type Video } from './videos.ts';

const video = (level: Level, audience: Video['audience'], series: string, name: string): Video => ({
  level,
  audience,
  url: `https://www.youtube.com/watch?v=${name}`,
  title: name,
  channel: series,
  minutes: 5,
  seriesUrl: `https://www.youtube.com/@${series}`,
});

const LIST: Video[] = [
  video('A1', 'kids', 'kids-a', 'k1'),
  video('A1', 'kids', 'kids-a', 'k2'),
  video('A1', 'kids', 'kids-b', 'k3'),
  video('A1', 'general', 'easy', 'g1'),
  video('A1', 'general', 'easy', 'g2'),
  video('B1', 'general', 'talks', 't1'),
];
const titles = (level: Level, stage: Parameters<typeof pickVideo>[1], count: number) =>
  Array.from({ length: count }, (_, index) => pickVideo(level, stage, index + 1, LIST)?.title);

describe('課後建議的影片', () => {
  // 影片是用來補輸入量的;太難聽不懂、太簡單沒幫助,所以只給和課程同一個等級的。
  it('只給和這堂課相同等級的影片', () => {
    expect(pickVideo('B1', 'senior', 1, LIST)?.title).toBe('t1');
    expect(titles('A1', 'junior', 2)).toEqual(['g1', 'g2']);
  });

  it('國小學生給兒童影片;其他學生不給兒童影片', () => {
    expect(titles('A1', 'elementary', 3).every((title) => title?.startsWith('k'))).toBe(true);
    expect(titles('A1', 'university', 4).every((title) => title?.startsWith('g'))).toBe(true);
  });

  // 國小學生程度到 B1 時,那個等級沒有兒童影片;沒有影片可看比看一般影片更糟。
  it('那個等級沒有兒童影片時,國小學生給一般的影片', () => {
    expect(pickVideo('B1', 'elementary', 1, LIST)?.title).toBe('t1');
  });

  // 每堂課後都是同一支,學生第二天就不會點了。
  it('每堂課換一支,整份清單輪完才重複', () => {
    const picks = titles('A1', 'elementary', 6);
    expect(new Set(picks.slice(0, 3)).size).toBe(3);
    expect(picks.slice(3)).toEqual(picks.slice(0, 3));
  });

  it('連續兩堂課盡量來自不同的系列', () => {
    const [first, second] = [pickVideo('A1', 'elementary', 1, LIST)!, pickVideo('A1', 'elementary', 2, LIST)!];
    expect(first.seriesUrl).not.toBe(second.seriesUrl);
  });

  it('這個等級沒有任何影片時不建議', () => {
    expect(pickVideo('C2', 'university', 1, LIST)).toBeNull();
  });
});

// 清單是寫死的資料,打錯一個字學生就會點到壞掉的連結。
describe('內建的影片清單', () => {
  it('每個等級都有國中以上可以看的影片,A1 與 A2 另外有兒童影片', () => {
    for (const level of LEVELS) {
      expect(VIDEOS.filter((item) => item.level === level && item.audience === 'general').length, level).toBeGreaterThanOrEqual(8);
    }
    for (const level of ['A1', 'A2'] as const) {
      expect(VIDEOS.filter((item) => item.level === level && item.audience === 'kids').length, level).toBeGreaterThanOrEqual(8);
    }
  });

  it('每一支都是 YouTube 的影片連結,不重複,而且有標題、頻道與同系列的連結', () => {
    const urls = VIDEOS.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const item of VIDEOS) {
      expect(item.url, item.title).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
      expect(item.seriesUrl, item.title).toMatch(/^https:\/\/www\.youtube\.com\//);
      expect(item.title.trim().length, item.url).toBeGreaterThan(0);
      expect(item.channel.trim().length, item.url).toBeGreaterThan(0);
    }
  });

  it('每個等級至少來自兩個不同的系列', () => {
    for (const level of LEVELS) {
      expect(new Set(VIDEOS.filter((item) => item.level === level).map((item) => item.seriesUrl)).size, level).toBeGreaterThanOrEqual(2);
    }
  });
});
