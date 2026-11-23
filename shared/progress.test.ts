import { describe, expect, it } from 'vitest';
import { addDays, addMonths, isValidDate, monthRange, previousMonth, weekRange } from './dates.ts';
import { dailyScores, monthlyAverage, type ScoredSession } from './scores.ts';
import { afterCorrect, afterLearned, afterManualFlag, afterMiss, isDue, type SrsState } from './srs.ts';

const session = (localDate: string, score: number): ScoredSession => ({ localDate, score });

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

describe('間隔重複', () => {
  const today = '2026-11-19';

  it('答錯或不熟的項目,明天就再出現', () => {
    expect(afterMiss('unknown', today)).toEqual({ status: 'unknown', intervalDays: 1, dueDate: '2026-11-20' });
    expect(afterMiss('unfamiliar', today)).toEqual({ status: 'unfamiliar', intervalDays: 1, dueDate: '2026-11-20' });
  });

  it('錯過的項目複習答對後間隔加倍:1 → 2 → 4 → 8 → 16 → 32 → 64 天', () => {
    let state: SrsState = afterMiss('unknown', today);
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      state = afterCorrect(state, today);
      intervals.push(state.intervalDays);
    }
    expect(intervals).toEqual([2, 4, 8, 16, 32, 64]);
    expect(state.dueDate).toBe('2027-01-22');
  });

  it('答對一次後,「不會」降為「不熟」', () => {
    expect(afterCorrect(afterMiss('unknown', today), today).status).toBe('unfamiliar');
  });

  // 隔了兩個月還記得,才算真的學會;在那之前都會繼續出現。半個月就停的話,很多字之後還是會忘。
  it('間隔達 64 天又答對,標為已掌握,之後不再到期;16 天還不算', () => {
    const atSixteen: SrsState = { status: 'unfamiliar', intervalDays: 16, dueDate: today };
    expect(afterCorrect(atSixteen, today)).toMatchObject({ status: 'unfamiliar', intervalDays: 32 });

    const atSixtyFour: SrsState = { status: 'unfamiliar', intervalDays: 64, dueDate: today };
    const mastered = afterCorrect(atSixtyFour, today);
    expect(mastered.status).toBe('mastered');
    expect(isDue(mastered, '2030-01-01')).toBe(false);
  });

  // 剛看完單字表就答對只代表短期記憶。不複習的話,這些字學過就丟。
  it('新學的單字第一次就答對,也要從明天開始複習', () => {
    expect(afterLearned(today)).toEqual({ status: 'learning', intervalDays: 1, dueDate: '2026-11-20' });
  });

  // 每個新單字都要複習,題數是新單字的好幾倍。沒錯過的字間隔拉得快,時間才能留給會錯的字。
  it('新學的單字只要沒錯過,間隔拉得比較快:1 → 4 → 16 → 64 天,之後才算已掌握', () => {
    let state = afterLearned(today);
    const steps: string[] = [];
    for (let i = 0; i < 4; i++) {
      state = afterCorrect(state, today);
      steps.push(`${state.status} ${state.intervalDays}`);
    }
    expect(steps).toEqual(['learning 4', 'learning 16', 'learning 64', 'mastered 64']);
  });

  it('新學的單字一旦答錯,就和其他錯過的項目一樣:明天再來,之後間隔只加倍', () => {
    const missed = afterMiss('unknown', today);
    expect(missed).toMatchObject({ status: 'unknown', intervalDays: 1 });
    expect(afterCorrect(missed, today)).toMatchObject({ status: 'unfamiliar', intervalDays: 2 });
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
