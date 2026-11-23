import express from 'express';
import type { WordList, WordListItem } from '../../shared/api.ts';
import { lessonExercises } from '../../shared/lesson.ts';
import { LevelSchema, SessionStateSchema, type Lesson, type Level } from '../../shared/schema.ts';
import { gradeExercise, wrongResponses } from '../../shared/scoring.ts';
import type { ItemStatus } from '../../shared/srs.ts';
import type { Db } from '../db.ts';
import { getUserRow, parseId } from './users.ts';

interface TaughtRow {
  id: number;
  local_date: string;
  lesson_json: string;
  state_json: string;
}

/**
 * 某個等級上過的重點單字,新的在前面。
 * 「當初有沒有答錯」看的是第一次上那堂課時的作答;重上是練習,不算在內。
 */
export function wordList(db: Db, userId: number, level: Level): WordList {
  const sessions = db
    .prepare(
      `SELECT id, local_date, lesson_json, state_json FROM sessions
       WHERE user_id = ? AND level = ? AND status = 'completed' AND retake_of IS NULL ORDER BY local_date DESC, id DESC`,
    )
    .all(userId, level) as unknown as TaughtRow[];
  const statuses = new Map(
    (db.prepare(`SELECT item_key, status FROM items WHERE user_id = ? AND kind = 'vocab'`).all(userId) as unknown as { item_key: string; status: ItemStatus }[]).map(
      (item) => [item.item_key, item.status],
    ),
  );

  const words: WordListItem[] = [];
  for (const session of sessions) {
    const lesson = JSON.parse(session.lesson_json) as Lesson;
    const state = SessionStateSchema.parse(JSON.parse(session.state_json));
    const exercises = new Map(lessonExercises(lesson).map((exercise) => [exercise.key, exercise]));
    lesson.vocab.forEach((vocab, index) => {
      const key = `vocab.${index}`;
      const exercise = exercises.get(key)!.exercise;
      const answer = state.answers[key];
      words.push({
        word: vocab.word,
        pos: vocab.pos,
        meaning: vocab.meaning,
        example: vocab.example,
        sessionId: session.id,
        date: session.local_date,
        lessonTitle: lesson.title,
        outcome: gradeExercise(exercise, answer).outcome,
        wrongAnswers: wrongResponses(exercise, answer),
        flagged: state.flags.includes(key),
        status: statuses.get(`vocab:${vocab.word.toLowerCase()}`) ?? null,
      });
    });
  }
  return { level, words };
}

export function wordsRouter(db: Db): express.Router {
  const router = express.Router();

  // 單字表:預設是使用者目前的等級,也可以指定其他等級。
  router.get('/', (req, res) => {
    const user = getUserRow(db, parseId(req.query.userId));
    const level = req.query.level === undefined ? user.level : LevelSchema.parse(req.query.level);
    res.json(wordList(db, user.id, level));
  });

  return router;
}
