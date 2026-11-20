import { useMemo, useState } from 'react';
import type { Lesson } from '../../../shared/schema.ts';
import { FlagButton, type Flagging } from './ExerciseSequence.tsx';

interface Term {
  word: string;
  meaning: string;
  /** 按「我不熟」時送給伺服器的對象代號。 */
  target: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 把課文切成一般文字與「有收錄解釋的字詞」兩種片段。 */
function splitByTerms(text: string, terms: Term[]): { text: string; term?: Term }[] {
  if (terms.length === 0) return [{ text }];
  const byLower = new Map(terms.map((term) => [term.word.toLowerCase(), term]));
  // 長的字詞先比對,「bubble tea」才不會只對到「tea」。
  const pattern = [...byLower.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');

  const parts: { text: string; term?: Term }[] = [];
  let last = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: match[0], term: byLower.get(match[0].toLowerCase()) });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

interface Props {
  lesson: Lesson;
  /** 是否提供中文翻譯的開關。答完閱讀題之前不提供,避免學生只看中文。 */
  allowTranslation: boolean;
  flagging?: Flagging;
}

/** 課文。有收錄解釋的字詞加上底線,點一下顯示意思,並可加入「不熟」。 */
export function Passage({ lesson, allowTranslation, flagging }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);

  const parts = useMemo(() => {
    // 生字表在前:同一個字同時是當課單字時,以當課單字為準(它有練習題可以重考)。
    const terms: Term[] = [
      ...lesson.glossary.map((entry, index) => ({ word: entry.word, meaning: entry.meaning, target: `glossary.${index}` })),
      ...lesson.vocab.map((vocab, index) => ({ word: vocab.word, meaning: `${vocab.pos} ${vocab.meaning}`, target: `vocab.${index}` })),
    ];
    return splitByTerms(lesson.passage.text, terms);
  }, [lesson]);

  return (
    <article className="passage">
      <p className="passage-text">
        {parts.map((part, index) =>
          part.term ? (
            <span key={index} className="gloss-wrap">
              <button type="button" className="gloss" onClick={() => setOpenIndex(openIndex === index ? null : index)}>
                {part.text}
              </button>
              {openIndex === index && (
                <span className="gloss-pop" role="tooltip">
                  <span>
                    <strong>{part.term.word}</strong> {part.term.meaning}
                  </span>
                  {flagging && <FlagButton target={part.term.target} flagging={flagging} />}
                </span>
              )}
            </span>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
      <p className="muted small">有底線的字可以點一下看意思。</p>
      {allowTranslation && lesson.passage.translation && (
        <>
          <button type="button" className="button button-ghost" onClick={() => setShowTranslation(!showTranslation)}>
            {showTranslation ? '隱藏中文翻譯' : '顯示中文翻譯'}
          </button>
          {showTranslation && <p className="passage-translation">{lesson.passage.translation}</p>}
        </>
      )}
    </article>
  );
}
