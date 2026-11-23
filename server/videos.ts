import type { Level, Stage, VideoSuggestion } from '../shared/schema.ts';
import { VIDEOS } from './videoList.ts';

// 課後延伸聆聽的影片。清單是事先查證過的固定資料(見 videoList.ts),不由 AI 當場產生:
// AI 會編出不存在的網址。

export interface Video extends VideoSuggestion {
  level: Level;
  /** kids:適合國小;general:國中以上(內容仍然適合所有年齡)。 */
  audience: 'kids' | 'general';
}

/** 把同一系列的影片錯開:依序從每個系列各拿一支,連續兩堂課才不會總是同一個系列。 */
function interleaveBySeries(videos: Video[]): Video[] {
  const series = new Map<string, Video[]>();
  for (const video of videos) series.set(video.seriesUrl, [...(series.get(video.seriesUrl) ?? []), video]);
  const groups = [...series.values()];
  const result: Video[] = [];
  for (let round = 0; result.length < videos.length; round++) {
    for (const group of groups) if (group[round]) result.push(group[round]);
  }
  return result;
}

/**
 * 這堂課之後建議看的影片。
 * - 只挑和課程相同等級的影片。
 * - 國小學生優先給兒童影片;那個等級沒有兒童影片才給一般的。其他學生不給兒童影片。
 * - lessonNumber 是學生在這個等級上的第幾堂課:每堂課換一支,整份清單輪完才重複。
 */
export function pickVideo(level: Level, stage: Stage, lessonNumber: number, videos: Video[] = VIDEOS): VideoSuggestion | null {
  const atLevel = videos.filter((video) => video.level === level);
  const kids = atLevel.filter((video) => video.audience === 'kids');
  const candidates = interleaveBySeries(stage === 'elementary' && kids.length > 0 ? kids : atLevel.filter((video) => video.audience === 'general'));
  if (candidates.length === 0) return null;
  const { url, title, channel, minutes, seriesUrl } = candidates[(Math.max(1, lessonNumber) - 1) % candidates.length]!;
  return { url, title, channel, minutes, seriesUrl };
}
