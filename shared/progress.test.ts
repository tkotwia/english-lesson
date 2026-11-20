import { describe, expect, it } from 'vitest';
import { addDays, addMonths, isValidDate, monthRange, previousMonth, weekRange } from './dates.ts';
import { dailyScores, levelUpSuggestion, monthlyAverage, type ScoredSession } from './levelup.ts';
import type { Level } from './schema.ts';
import { afterCorrect, afterManualFlag, afterMiss, isDue, type SrsState } from './srs.ts';

const session = (localDate: string, score: number, level: Level = 'A2'): ScoredSession => ({ localDate, score, level });

describe('日期計算', () => {
  it('加減天數會正確跨月、跨年與閏年', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('上個月會正確跨年', () => {
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
  });

  it('月份範圍涵蓋第一天到最後一天', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  // 「本週回顧」與月曆的一列要對得上:週日到週六。
  it('一週是週日到週六', () => {
    // 2026-11-19 是週四
    expect(weekRange('2026-11-19')).toEqual({ from: '2026-11-15', to: '2026-11-21' });
    expect(weekRange('2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-21' });
  });

  it('拒絕不存在的日期', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-11-19')).toBe(true);
  });
});

describe('每日分數與月分數', () => {
  it('同一天上兩堂課,當日分數取平均', () => {
    expect(dailyScores([session('2026-10-05', 100), session('2026-10-05', 80)]).get('2026-10-05')).toBe(90);
  });

  // 一天上很多堂的日子不該比只上一堂的日子佔更多比重。
  it('月分數是「每日分數」的平均,不是所有課程的平均', () => {
    const sessions = [session('2026-10-01', 100), session('2026-10-01', 100), session('2026-10-01', 100), session('2026-10-02', 60)];
    expect(monthlyAverage(sessions, '2026-10')).toBe(80);
  });

  it('沒上課的日子不計入平均;整個月沒上課時沒有月分數', () => {
    expect(monthlyAverage([session('2026-10-03', 96)], '2026-10')).toBe(96);
    expect(monthlyAverage([session('2026-10-03', 96)], '2026-09')).toBeNull();
  });
});

describe('升級建議', () => {
  const base = { today: '2026-11-19', level: 'A2' as Level, decidedMonths: [] as string[] };

  it('上個月平均 95.0 建議升級,94.9 不建議', () => {
    expect(levelUpSuggestion({ ...base, sessions: [session('2026-10-10', 95)] })).toEqual({ month: '2026-10', average: 95, from: 'A2', to: 'B1' });
    expect(levelUpSuggestion({ ...base, sessions: [session('2026-10-10', 94.9)] })).toBeNull();
  });

  // 使用者選擇「只看平均、不限天數」:一個月只上一天也算。
  it('不限上課天數:上個月只上一天且達 95 分也會建議', () => {
    expect(levelUpSuggestion({ ...base, sessions: [session('2026-10-31', 97)] })?.to).toBe('B1');
  });

  it('只看上個月:這個月還沒結束,分數再高也不建議', () => {
    expect(levelUpSuggestion({ ...base, sessions: [session('2026-11-10', 100)] })).toBeNull();
  });

  it('更早的月份不會被拿來判定', () => {
    expect(levelUpSuggestion({ ...base, sessions: [session('2026-09-10', 100)] })).toBeNull();
  });

  it('已經是 C2 就不再建議', () => {
    expect(levelUpSuggestion({ ...base, level: 'C2', sessions: [session('2026-10-10', 100, 'C2')] })).toBeNull();
  });

  // 否則按了「先不要」或已經升級後,每次打開都會再跳出同一個建議。
  it('同一個月份回應過就不再建議', () => {
    expect(levelUpSuggestion({ ...base, decidedMonths: ['2026-10'], sessions: [session('2026-10-10', 100)] })).toBeNull();
  });

  // 升級(或手動改等級)之後,舊等級拿到的高分不代表新等級也已精熟。
  it('只計入在目前等級上的課', () => {
    expect(levelUpSuggestion({ ...base, level: 'B1', sessions: [session('2026-10-10', 100, 'A2')] })).toBeNull();
    const mixed = [session('2026-10-10', 100, 'A2'), session('2026-10-11', 90, 'B1')];
    expect(levelUpSuggestion({ ...base, level: 'B1', sessions: mixed })).toBeNull();
  });
});

describe('間隔重複', () => {
  const today = '2026-11-19';

  it('答錯或不熟的項目,明天就再出現', () => {
    expect(afterMiss('unknown', today)).toEqual({ status: 'unknown', intervalDays: 1, dueDate: '2026-11-20' });
    expect(afterMiss('unfamiliar', today)).toEqual({ status: 'unfamiliar', intervalDays: 1, dueDate: '2026-11-20' });
  });

  it('複習答對後間隔加倍:1 → 2 → 4 → 8 → 16 天', () => {
    let state: SrsState = afterMiss('unknown', today);
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = afterCorrect(state, today);
      intervals.push(state.intervalDays);
    }
    expect(intervals).toEqual([2, 4, 8, 16]);
    expect(state.dueDate).toBe('2026-12-05');
  });

  it('答對一次後,「不會」降為「不熟」', () => {
    expect(afterCorrect(afterMiss('unknown', today), today).status).toBe('unfamiliar');
  });

  // 隔了 16 天還記得,才算真的學會;在那之前都會繼續出現。
  it('間隔達 16 天又答對,標為已掌握,之後不再到期', () => {
    const atSixteen: SrsState = { status: 'unfamiliar', intervalDays: 16, dueDate: today };
    const mastered = afterCorrect(atSixteen, today);
    expect(mastered.status).toBe('mastered');
    expect(isDue(mastered, '2030-01-01')).toBe(false);
  });

  it('到期日當天與之後都算到期,之前不算', () => {
    const state: SrsState = { status: 'unfamiliar', intervalDays: 2, dueDate: '2026-11-20' };
    expect(isDue(state, '2026-11-19')).toBe(false);
    expect(isDue(state, '2026-11-20')).toBe(true);
    expect(isDue(state, '2026-11-25')).toBe(true);
  });

  it('手動按「我不熟」:新項目記為不熟;原本是不會的維持不會', () => {
    expect(afterManualFlag(null, today).status).toBe('unfamiliar');
    expect(afterManualFlag({ status: 'unknown', intervalDays: 4, dueDate: '2026-11-30' }, today)).toEqual({
      status: 'unknown',
      intervalDays: 1,
      dueDate: '2026-11-20',
    });
    expect(afterManualFlag({ status: 'mastered', intervalDays: 16, dueDate: '2026-10-01' }, today).status).toBe('unfamiliar');
  });
});
