import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { CalendarDay, CalendarMonth, ProgressSummary } from '../../../shared/api.ts';
import { addDays, addMonths, localDate, monthOf, monthRange, weekday } from '../../../shared/dates.ts';
import { LEVEL_UP_THRESHOLD } from '../../../shared/levelup.ts';
import { SECTION_LABELS } from '../../../shared/schema.ts';
import { api, errorMessage } from '../api.ts';
import { LevelUpBanner } from '../components/LevelUpBanner.tsx';
import { useActiveUser } from '../userContext.tsx';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 分數對應的顏色等級,用在月曆格子上。 */
export function scoreTone(score: number): string {
  if (score >= LEVEL_UP_THRESHOLD) return 'tone-top';
  if (score >= 80) return 'tone-good';
  if (score >= 60) return 'tone-fair';
  return 'tone-low';
}

/** 月曆格子:前面補空格讓 1 號落在正確的星期。 */
function monthCells(month: string): (string | null)[] {
  const { from, to } = monthRange(month);
  const cells: (string | null)[] = Array.from({ length: weekday(from) }, () => null);
  for (let date = from; date <= to; date = addDays(date, 1)) cells.push(date);
  return cells;
}

export function Calendar() {
  const user = useActiveUser();
  const today = localDate();
  const [month, setMonth] = useState(monthOf(today));
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [calendar, summary] = await Promise.all([api.getCalendar(user.id, month), api.getProgress(user.id)]);
      setData(calendar);
      setProgress(summary);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [user.id, month]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  const byDate = new Map<string, CalendarDay>((data?.days ?? []).map((day) => [day.date, day]));
  const selectedDay = selected ? byDate.get(selected) : undefined;
  const [year, monthNumber] = month.split('-');

  return (
    <section className="page">
      <h1>學習日曆</h1>
      {error && <p className="alert alert-error">{error}</p>}
      {progress?.suggestion && <LevelUpBanner suggestion={progress.suggestion} onDecided={load} />}

      <div className="card">
        <div className="calendar-head">
          <button type="button" className="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="上個月">
            ‹
          </button>
          <h2>
            {year} 年 {Number(monthNumber)} 月
          </h2>
          <button type="button" className="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="下個月" disabled={month >= monthOf(today)}>
            ›
          </button>
        </div>

        <p className="calendar-average">
          月平均:
          {data?.average == null ? (
            <span className="muted"> 這個月還沒有上課紀錄</span>
          ) : (
            <>
              <strong className={scoreTone(data.average)}> {data.average} 分</strong>
              <span className="muted">
                (上課 {data.days.length} 天。整個月平均達 {LEVEL_UP_THRESHOLD} 分,下個月會建議升級)
              </span>
            </>
          )}
        </p>

        <div className="calendar-grid" role="grid" aria-label="月曆">
          {WEEKDAYS.map((name) => (
            <div key={name} className="calendar-weekday" role="columnheader">
              {name}
            </div>
          ))}
          {monthCells(month).map((date, index) => {
            if (!date) return <div key={`blank-${index}`} className="calendar-cell is-blank" />;
            const day = byDate.get(date);
            const classes = ['calendar-cell', day ? scoreTone(day.score) : '', date === today ? 'is-today' : '', date === selected ? 'is-selected' : '']
              .filter(Boolean)
              .join(' ');
            return (
              <button key={date} type="button" className={classes} disabled={!day} onClick={() => setSelected(date)} role="gridcell">
                <span className="calendar-date">{Number(date.slice(8))}</span>
                {day && <span className="calendar-score">{Math.round(day.score)}</span>}
              </button>
            );
          })}
        </div>
        <p className="muted small">有分數的日子可以點開看當天的明細。</p>
      </div>

      {selectedDay && (
        <div className="card">
          <h2>
            {selectedDay.date}:當日分數 {selectedDay.score} 分
          </h2>
          {selectedDay.sessions.map((session) => (
            <div key={session.id} className="day-session">
              <div className="day-session-head">
                <strong>{session.title}</strong>
                <span className="muted">
                  {session.level} · {session.score} 分
                </span>
              </div>
              <div className="day-session-sections">
                {session.sections.map((section) => (
                  <span key={section.section} className="tag">
                    {SECTION_LABELS[section.section]} {Math.round(section.percent)}%
                  </span>
                ))}
                <span className={`tag${session.weakCount > 0 ? ' tag-unfamiliar' : ''}`}>不會 / 不熟 {session.weakCount} 項</span>
              </div>
              <Link to={`/sessions/${session.id}`}>查看完整結果與不會、不熟的內容</Link>
              {session.retakes.length > 0 && (
                <p className="muted small retakes-line">
                  之後重上 {session.retakes.length} 次(不計入分數):
                  {session.retakes.map((item) => (
                    <Link key={item.id} to={`/sessions/${item.id}`}>
                      {item.date} {Math.round(item.score)} 分
                    </Link>
                  ))}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
