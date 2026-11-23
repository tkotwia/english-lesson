import type { Stage } from '../../shared/schema.ts';
import { cloze, mcq, reorder, term, vocab } from './build.ts';
import type { StarterLesson } from './types.ts';

// B2 的起始課。文法重點:第三類與混合條件句。課文 160–208 字,全英文(沒有中文輔助)。

const GRAMMAR_POINT = 'third and mixed conditionals';
const POINT_NAME = 'Third and mixed conditionals';
const EXPLANATION =
  'The third conditional imagines a different past and its past result: if + past perfect, would have + past participle. ' +
  '“If I had left earlier, I would have caught the train” means I did not leave earlier, and I missed it. ' +
  'A mixed conditional imagines a different past with a result in the present: if + past perfect, would + base verb. ' +
  '“If I had left earlier, I would be there now.” Time words such as now, today or still in the result clause signal a mixed conditional. ' +
  'A common mistake is putting would in the if-clause: say “if I had known,” not “if I would have known.”';

export const B2: Record<Stage, StarterLesson> = {
  elementary: {
    topic: 'favorite food',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'Grandpa’s Secret Ingredient',
      intro:
        'Hello, I’m Emma. Today’s passage is about a grandfather with a secret. We’ll study five words from the story, ' +
        'and then look at third and mixed conditionals, which let us imagine a different past.',
      passage: {
        text:
          'My favorite food is my grandfather’s dumplings, and for years I had no idea what was really inside them. ' +
          'I used to hate vegetables. If a single piece of spinach appeared on my plate, I would push it to the edge and leave it there. ' +
          'Grandpa never argued with me. Instead, every Saturday he made dumplings, and I ate at least ten of them. ' +
          'Last month I finally helped him in the kitchen, and I became suspicious when I saw a huge bowl of cabbage and spinach on the table. ' +
          'He had never mentioned those. He only admitted afterwards that every dumpling I had ever eaten was full of them. ' +
          'At first I was annoyed. Then I realized how clever he had been. ' +
          'If he had told me the ingredients when I was six, I would have refused to take a single bite. ' +
          'If I hadn’t eaten all those dumplings, I probably wouldn’t be so healthy now. ' +
          'These days I eat vegetables without complaining, and my curiosity about cooking keeps growing. ' +
          'If Grandpa hadn’t tricked me, I would still be afraid of anything green.',
        translation: '',
      },
      glossary: [
        term('dumplings', 'small pieces of dough filled with meat or vegetables'),
        term('spinach', 'a vegetable with dark green leaves'),
        term('edge', 'the outside part of something, farthest from the middle'),
        term('cabbage', 'a large round vegetable with thick pale leaves'),
        term('annoyed', 'slightly angry'),
        term('complaining', 'saying that you are unhappy about something'),
        term('tricked', 'made someone believe something that was not true'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'How to make dumplings step by step',
              'How a grandfather secretly got the writer to eat vegetables',
              'Why vegetables are more expensive than meat',
              'A family argument about cooking',
            ],
            1,
            'The story centers on Grandpa hiding cabbage and spinach in dumplings so that the writer would eat them.',
          ),
          mcq(
            'How does the writer feel about Grandpa’s trick now?',
            ['Still angry about it', 'Embarrassed by it', 'Confused about why he did it', 'Grateful, and impressed by how clever it was'],
            3,
            'The writer says “I realized how clever he had been” and now eats vegetables without complaining.',
          ),
        ],
        dictation: ['I used to hate vegetables.', 'Then I realized how clever he had been.'],
      },
      reading: {
        questions: [
          mcq(
            'What did the writer use to do when spinach appeared on the plate?',
            ['Push it to the edge and leave it', 'Give it to Grandpa', 'Hide it under the rice', 'Eat it very slowly'],
            0,
            'The passage says “I would push it to the edge and leave it there.”',
          ),
          mcq(
            'When did the writer discover what was inside the dumplings?',
            ['At the age of six', 'Every Saturday', 'While helping in the kitchen last month', 'When Grandpa wrote down the recipe'],
            2,
            'The writer became suspicious after seeing the bowl of cabbage and spinach while helping in the kitchen last month.',
          ),
          mcq(
            'What can we infer about Grandpa?',
            [
              'He disliked vegetables himself.',
              'He believed patience would work better than arguing.',
              'He wanted the writer to become a chef.',
              'He was often angry with the writer.',
            ],
            1,
            'He “never argued” and quietly hid the vegetables for years, which shows patience rather than force.',
          ),
        ],
      },
      vocab: [
        vocab(
          'suspicious',
          'adj.',
          'feeling that something is wrong or that someone is not being honest',
          'The guard became suspicious of the unmarked van.',
          cloze('The teacher grew ___ when two students handed in identical essays.', 'suspicious', 'an adjective starting with s', 'Identical essays suggest cheating, so the teacher doubts the students’ honesty.'),
        ),
        vocab(
          'mention',
          'v.',
          'to say something briefly, without giving much detail',
          'She didn’t mention the price.',
          cloze('Did he ___ what time the meeting starts?', 'mention', 'a verb starting with m', 'After “did he” we use the base form: mention.'),
        ),
        vocab(
          'admit',
          'v.',
          'to agree, often unwillingly, that something is true',
          'Few people admit their mistakes quickly.',
          cloze('After an hour of questions, the boy finally ___ that he had broken the window.', 'admitted', 'a verb starting with a, in the past form', 'The event is in the past, and admit doubles the t: admitted.'),
        ),
        vocab(
          'ingredient',
          'n.',
          'one of the foods that are used to make a dish',
          'Flour is the main ingredient in bread.',
          cloze('Sugar is the first ___ listed on the label.', 'ingredient', 'a noun starting with i', 'Food labels list what a product is made of, one ingredient at a time.'),
        ),
        vocab(
          'curiosity',
          'n.',
          'a strong desire to know or learn something',
          'Children are full of curiosity.',
          cloze('Out of ___, I opened the old box in the attic.', 'curiosity', 'a noun starting with c', '“Out of curiosity” is a fixed phrase meaning “because I wanted to know.”'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'If he had told me the ingredients when I was six, I would have refused to take a single bite.',
          'If I hadn’t eaten all those dumplings, I probably wouldn’t be so healthy now.',
          'If Grandpa hadn’t tricked me, I would still be afraid of anything green.',
        ],
        mcq: [
          mcq(
            'If Grandpa had asked me to eat spinach, I ___ no.',
            ['would say', 'would have said', 'had said', 'will say'],
            1,
            'Both the condition and the result are in the imagined past, so the result clause needs would have + past participle.',
          ),
          mcq(
            'If I had never tried those dumplings, I ___ vegetables today.',
            ['wouldn’t have liked', 'won’t like', 'wouldn’t like', 'hadn’t liked'],
            2,
            '“Today” shows a present result of a past condition, so this is a mixed conditional: would + base verb.',
          ),
        ],
        cloze: [
          cloze(
            'If I had noticed the cabbage earlier, I would have ___ him what was inside. (ask)',
            'asked',
            'the past participle of the verb in parentheses',
            'After would have we need the past participle: asked.',
          ),
        ],
        reorder: [reorder('If I had known, I would have complained.', 'I didn’t know, so I didn’t complain.', 'The if-clause takes the past perfect (had known); the result takes would have + past participle.')],
      },
      speaking: {
        readAloud: [
          'Instead, every Saturday he made dumplings, and I ate at least ten of them.',
          'He only admitted afterwards that every dumpling I had ever eaten was full of them.',
          'These days I eat vegetables without complaining, and my curiosity about cooking keeps growing.',
        ],
        scenario: 'Your teacher is curious about a food you love now but disliked when you were younger.',
        opening: 'Is there a food you hated as a child but enjoy now? What changed your mind?',
      },
      writing: {
        prompt:
          'Describe your favorite food and the story behind it. Include at least two sentences that imagine a different past, ' +
          'such as “If my grandmother hadn’t taught me, I would never have learned to cook it.”',
        minWords: 120,
        tips: [
          'Begin by naming the food and saying when you first tried it.',
          'Tell one specific memory connected with it.',
          'Use one third conditional and one mixed conditional.',
        ],
      },
    },
  },

  junior: {
    topic: 'using a smartphone wisely',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Week Without My Phone',
      intro:
        'Hello, I’m Emma. Today we’ll read about a student whose phone took over daily life, pick up five useful words, ' +
        'and practice third and mixed conditionals to talk about how things could have gone differently.',
      passage: {
        text:
          'I got my first smartphone on my thirteenth birthday, and within a month it was running my life. ' +
          'Every notification felt urgent. I checked my messages during dinner, under my desk at school, and long after midnight. ' +
          'My grades dropped, and I was tired all the time. When my parents took the phone away for a week, I resented them deeply. ' +
          'I thought they simply didn’t understand. Looking back, I can see that the restriction saved me. ' +
          'During that week I slept properly for the first time in months, and I even finished a novel. ' +
          'When the phone came back, we agreed on some rules together: no screens at the dinner table, no phone in my bedroom at night, ' +
          'and all notifications off during homework. Gradually, the phone became a tool again rather than a master. ' +
          'If my parents hadn’t stepped in, I would have failed my exams that semester. ' +
          'And if I had never lost my phone for a week, I wouldn’t be as disciplined as I am today. ' +
          'I still love my phone, but now I decide when to pick it up.',
        translation: '',
      },
      glossary: [
        term('urgent', 'needing attention immediately'),
        term('midnight', 'twelve o’clock at night'),
        term('grades', 'letters or numbers that show how good a student’s work is'),
        term('properly', 'in a correct or satisfactory way'),
        term('novel', 'a long written story about imaginary people and events'),
        term('stepped in', 'became involved in a difficult situation in order to help'),
        term('semester', 'one of the two periods that a school year is divided into'),
      ],
      listening: {
        questions: [
          mcq(
            'What problem did the writer have at first?',
            ['The phone was too expensive.', 'The phone kept breaking.', 'The phone was controlling the writer’s daily life.', 'The writer’s friends had better phones.'],
            2,
            'The writer says that within a month the phone “was running my life.”',
          ),
          mcq(
            'What is the writer’s attitude at the end?',
            ['The writer enjoys the phone but stays in control of it.', 'The writer has given up phones completely.', 'The writer is still angry with the parents.', 'The writer wants a newer phone.'],
            0,
            'The last sentence says “I still love my phone, but now I decide when to pick it up.”',
          ),
        ],
        dictation: ['Every notification felt urgent.', 'I thought they simply didn’t understand.'],
      },
      reading: {
        questions: [
          mcq(
            'How did the writer feel when the phone was taken away?',
            ['Relieved', 'Amused', 'Indifferent', 'Resentful toward the parents'],
            3,
            '“I resented them deeply” shows that the writer felt angry and unfairly treated.',
          ),
          mcq(
            'Which rule was NOT part of the agreement?',
            ['No screens at the dinner table', 'No phone on weekends', 'No phone in the bedroom at night', 'Notifications off during homework'],
            1,
            'The passage lists three rules, and none of them mentions weekends.',
          ),
          mcq(
            'What happened during the week without the phone?',
            ['The writer slept well and finished a novel.', 'The writer’s grades dropped further.', 'The writer borrowed a friend’s phone.', 'The writer refused to speak to the family.'],
            0,
            'The writer “slept properly for the first time in months” and “even finished a novel.”',
          ),
        ],
      },
      vocab: [
        vocab(
          'notification',
          'n.',
          'a message or sound from a phone or app telling you that something has happened',
          'A notification popped up on the screen.',
          cloze('My phone showed a ___ saying that the package had arrived.', 'notification', 'a noun starting with n', 'Apps send a notification to tell you about new events.'),
        ),
        vocab(
          'resent',
          'v.',
          'to feel angry about something because you think it is unfair',
          'Some workers resent the new schedule.',
          cloze('Years later, he still ___ his brother for breaking his guitar.', ['resents', 'resented'], 'a verb starting with r, with the right ending', 'With “he” the present form is resents; the past form resented also fits.'),
        ),
        vocab(
          'restriction',
          'n.',
          'a rule that limits what you can do',
          'There is a speed restriction near the school.',
          cloze('The airline has a ___ on the size of carry-on bags.', 'restriction', 'a noun starting with r', 'A limit set by a rule is a restriction.'),
        ),
        vocab(
          'gradually',
          'adv.',
          'slowly, over a period of time',
          'The sky gradually turned dark.',
          cloze('Her English improved ___ over the year, not overnight.', 'gradually', 'an adverb starting with g', '“Not overnight” tells us the change was slow, so gradually fits.'),
        ),
        vocab(
          'disciplined',
          'adj.',
          'able to control your own behavior and follow rules',
          'Athletes must be disciplined about training.',
          cloze('You have to be very ___ to practice the piano every single day.', 'disciplined', 'an adjective starting with d', 'Doing something every day without fail takes self-control.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'If my parents hadn’t stepped in, I would have failed my exams that semester.',
          'If I had never lost my phone for a week, I wouldn’t be as disciplined as I am today.',
          'If I had kept my old habits, my grades would have dropped even further.',
        ],
        mcq: [
          mcq(
            'If my parents hadn’t taken the phone away, I ___ that novel.',
            ['wouldn’t finish', 'won’t finish', 'hadn’t finished', 'wouldn’t have finished'],
            3,
            'Finishing the novel belongs to the past, so the imagined result is also past: would have + past participle.',
          ),
          mcq(
            'If we had never agreed on those rules, I ___ exhausted every morning now.',
            ['would be', 'would have been', 'will be', 'had been'],
            0,
            '“Now” points to a present result of a past condition, so this is a mixed conditional: would + base verb.',
          ),
        ],
        cloze: [
          cloze(
            'If I had ___ my phone in another room, I would have slept better. (leave)',
            'left',
            'the past participle of leave',
            'The if-clause of a third conditional uses had + past participle: had left.',
          ),
        ],
        reorder: [
          reorder(
            'If they hadn’t stopped me, I would have failed.',
            'They stopped me, so I didn’t fail.',
            'The if-clause takes the past perfect (hadn’t stopped); the result takes would have + past participle.',
          ),
        ],
      },
      speaking: {
        readAloud: [
          'I got my first smartphone on my thirteenth birthday, and within a month it was running my life.',
          'Gradually, the phone became a tool again rather than a master.',
          'I still love my phone, but now I decide when to pick it up.',
        ],
        scenario: 'Your teacher is asking the class how they manage their screen time.',
        opening: 'How many hours a day do you spend on your phone, and are you happy with that?',
      },
      writing: {
        prompt:
          'Write about your own phone habits. Which rules do you follow, or which rules should you follow? ' +
          'Include at least two sentences that imagine a different past, using third or mixed conditionals.',
        minWords: 120,
        tips: [
          'Describe a real situation when your phone caused a problem or solved one.',
          'Explain one rule and the reason behind it.',
          'Use “If I had…” or “If I hadn’t…” to show what could have happened.',
        ],
      },
    },
  },

  senior: {
    topic: 'a part-time job experience',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'A Summer at the Bookstore',
      intro:
        'Hello, I’m Emma. Today’s passage describes a difficult afternoon in a summer job. We’ll learn five words for talking about work, ' +
        'and then use third and mixed conditionals to imagine how things might have turned out.',
      passage: {
        text:
          'Last summer I worked in a small bookstore near the station, and it taught me more than any class had. ' +
          'The job looked easy, but the customers could be demanding. One afternoon a man accused me of giving him the wrong change. ' +
          'He raised his voice, and everyone in the store turned to look. I was sure I had counted correctly, yet I had no way to prove it. ' +
          'My manager, Mrs. Lin, calmly checked the register and found that I was right. The man left without apologizing. ' +
          'I expected her to dismiss the whole thing, but instead she spent ten minutes showing me how to count change aloud so that nobody could argue. ' +
          'If she hadn’t taught me that habit, I would have faced the same problem again and again. ' +
          'I also learned to appreciate how hard people work for modest pay. ' +
          'If I hadn’t taken that job, I would still think money came easily. ' +
          'I earned very little that summer, but I would not trade the experience for anything.',
        translation: '',
      },
      glossary: [
        term('change', 'the money you get back when you pay more than something costs'),
        term('prove', 'to show that something is true'),
        term('calmly', 'in a quiet and relaxed way'),
        term('register', 'the machine in a store that holds money and records each sale'),
        term('aloud', 'in a voice that other people can hear'),
        term('habit', 'something you do regularly, often without thinking'),
        term('trade', 'to exchange one thing for another'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            ['How to open a bookstore', 'What the writer learned from a summer job', 'Why customers are always right', 'The best books to read in summer'],
            1,
            'The writer describes the job and the lessons it taught, from handling a complaint to valuing money.',
          ),
          mcq(
            'How does the writer feel about the job now?',
            ['It was a mistake to take it.', 'It was easy and relaxing.', 'It paid surprisingly well.', 'It was valuable even though the pay was low.'],
            3,
            'The last sentence says the writer earned very little but would not trade the experience for anything.',
          ),
        ],
        dictation: ['The job looked easy, but the customers could be demanding.', 'The man left without apologizing.'],
      },
      reading: {
        questions: [
          mcq(
            'What did the customer claim?',
            ['That a book was damaged', 'That the store was too noisy', 'That he had been given the wrong change', 'That the writer had been rude'],
            2,
            'He “accused me of giving him the wrong change.”',
          ),
          mcq(
            'How was the disagreement settled?',
            ['The manager checked the register.', 'The customer apologized.', 'The writer paid the difference.', 'Another customer spoke up.'],
            0,
            'Mrs. Lin “calmly checked the register and found that I was right.”',
          ),
          mcq(
            'What did Mrs. Lin do after the customer left?',
            ['She told the writer to forget about it.', 'She taught the writer to count change aloud.', 'She gave the writer the rest of the day off.', 'She reduced the writer’s pay.'],
            1,
            'Instead of dismissing the incident, she spent ten minutes showing the writer how to count change aloud.',
          ),
        ],
      },
      vocab: [
        vocab(
          'demanding',
          'adj.',
          'expecting a lot of effort or attention from other people',
          'She has a demanding boss.',
          cloze('Young children can be very ___; they want your attention all day.', 'demanding', 'an adjective starting with d', 'Someone who needs constant attention is demanding.'),
        ),
        vocab(
          'accuse',
          'v.',
          'to say that someone has done something wrong',
          'Don’t accuse people without evidence.',
          cloze('After the match, the coach ___ the other team of cheating.', 'accused', 'a verb starting with a, in the past form', 'The pattern is accuse someone of doing something; the event is past, so accused.'),
        ),
        vocab(
          'dismiss',
          'v.',
          'to decide that something is not important enough to think about',
          'Doctors should never dismiss a patient’s worries.',
          cloze('It would be a mistake to ___ his idea just because he is young.', 'dismiss', 'a verb starting with d', 'After “to” we use the base form: dismiss.'),
        ),
        vocab(
          'appreciate',
          'v.',
          'to understand how valuable or important something is',
          'You appreciate good health after being sick.',
          cloze('Living abroad made me ___ my mother’s cooking.', 'appreciate', 'a verb starting with a', 'make someone do something takes the base form: made me appreciate.'),
        ),
        vocab(
          'modest',
          'adj.',
          'not large in amount or size',
          'They live in a modest apartment.',
          cloze('He started the business with a ___ amount of money and grew it slowly.', 'modest', 'an adjective starting with m', 'A small, unimpressive amount is a modest amount.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'If she hadn’t taught me that habit, I would have faced the same problem again and again.',
          'If I hadn’t taken that job, I would still think money came easily.',
          'If the man had apologized, I would have forgotten the whole afternoon.',
        ],
        mcq: [
          mcq(
            'If Mrs. Lin hadn’t checked the register, nobody ___ me.',
            ['would have believed', 'would believe', 'believed', 'will believe'],
            0,
            'The condition and its result both belong to the imagined past, so use would have + past participle.',
          ),
          mcq(
            'If I had spent that summer at home, I ___ much less about people today.',
            ['will know', 'would know', 'had known', 'would have known'],
            1,
            '“Today” points to the present, so the result uses would + base verb: a mixed conditional.',
          ),
        ],
        cloze: [
          cloze(
            'If I had ___ the money aloud, the man could not have argued. (count)',
            'counted',
            'the past participle of the verb in parentheses',
            'The if-clause of a third conditional uses had + past participle: had counted.',
          ),
        ],
        reorder: [reorder('If she had blamed me, I would have quit.', 'She didn’t blame me, so I stayed in the job.', 'The if-clause takes the past perfect (had blamed); the result takes would have + past participle.')],
      },
      speaking: {
        readAloud: [
          'One afternoon a man accused me of giving him the wrong change.',
          'I was sure I had counted correctly, yet I had no way to prove it.',
          'I earned very little that summer, but I would not trade the experience for anything.',
        ],
        scenario: 'Your teacher is asking about jobs that students have done, or would like to do, during summer vacation.',
        opening: 'Have you ever had a part-time job, or is there one you would like to try?',
      },
      writing: {
        prompt:
          'Describe a part-time job you have had, or a time you helped someone with their work. What did it teach you? ' +
          'Use at least two third or mixed conditional sentences to show what would have been different.',
        minWords: 120,
        tips: [
          'Set the scene: where, when, and what you had to do.',
          'Focus on one difficult moment and how it was handled.',
          'Finish with what you would not know today if it hadn’t happened.',
        ],
      },
    },
  },

  university: {
    topic: 'working part-time while studying',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'Twenty Hours Too Many',
      intro:
        'Hello, I’m Emma. Today’s passage is about a student who tried to combine a job with a full course load. ' +
        'We’ll learn five words for study and work, and practice third and mixed conditionals to reflect on past decisions.',
      passage: {
        text:
          'In my second year of college, I assumed I could work twenty hours a week as a waiter and still keep up with my studies. ' +
          'I was wrong. The restaurant often asked me to cover an extra shift, and I rarely said no because I needed the money for rent. ' +
          'By November I was falling asleep in lectures. Then I failed statistics, a compulsory course that I had to pass in order to graduate. ' +
          'That result shocked me into changing things. I cut my hours to ten a week, told my manager I was unavailable during exam periods, ' +
          'and began planning each week on Sunday night. It took a full semester to recover, but I passed the course the second time. ' +
          'I don’t regret working. If I hadn’t had that job, I would have graduated with far more debt. ' +
          'But if I had been more organized from the start, I wouldn’t have a failed course on my transcript now. ' +
          'Work and study can fit together, but only if you are honest about how many hours a day really has.',
        translation: '',
      },
      glossary: [
        term('waiter', 'a person who serves food and drinks in a restaurant'),
        term('rent', 'money paid regularly to live in a room or an apartment'),
        term('lectures', 'talks given to a class of university students'),
        term('statistics', 'the study of collecting and understanding numbers and data'),
        term('graduate', 'to complete a university degree'),
        term('unavailable', 'not free to do something'),
        term('regret', 'to feel sorry about something you did'),
        term('debt', 'money that you owe to someone'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the main point of the passage?',
            [
              'Students should never take jobs.',
              'Waiters earn too little money.',
              'Statistics is the hardest course in college.',
              'Combining work and study takes honest planning.',
            ],
            3,
            'The final sentence sums it up: work and study fit together only if you are honest about your time.',
          ),
          mcq(
            'Does the writer regret having worked?',
            ['Yes, because it led to a failed course.', 'No, because the job reduced the writer’s debt.', 'Yes, because the manager was unfair.', 'No, because the job was easy.'],
            1,
            'The writer says “I don’t regret working” and explains that the job meant graduating with less debt.',
          ),
        ],
        dictation: ['By November I was falling asleep in lectures.', 'That result shocked me into changing things.'],
      },
      reading: {
        questions: [
          mcq(
            'Why did the writer rarely refuse extra shifts?',
            ['The money was needed for rent.', 'The manager would have been angry.', 'The work was enjoyable.', 'There was nothing else to do.'],
            0,
            'The writer “rarely said no because I needed the money for rent.”',
          ),
          mcq(
            'What did the writer change after failing statistics?',
            ['The writer quit the job completely.', 'The writer moved to a cheaper room.', 'The writer cut working hours and planned each week.', 'The writer changed majors.'],
            2,
            'The writer cut the hours to ten a week, blocked exam periods, and began planning every Sunday night.',
          ),
          mcq(
            'What does the last sentence suggest?',
            [
              'Days are getting shorter.',
              'You must be realistic about how much time you have.',
              'Employers should pay students more.',
              'Studying is more important than working.',
            ],
            1,
            'Being “honest about how many hours a day really has” means accepting the real limits of your time.',
          ),
        ],
      },
      vocab: [
        vocab(
          'assume',
          'v.',
          'to believe that something is true without checking',
          'Never assume the answer is obvious.',
          cloze('Don’t ___ that the store is open; call first.', 'assume', 'a verb starting with a', 'After “don’t” we use the base form: assume.'),
        ),
        vocab(
          'compulsory',
          'adj.',
          'required by a rule or a law',
          'Wearing a seat belt is compulsory.',
          cloze('In many countries, education is ___ until the age of sixteen.', 'compulsory', 'an adjective starting with c', 'Something the law requires everyone to do is compulsory.'),
        ),
        vocab(
          'shift',
          'n.',
          'a period of work in a place where people work at different times of day',
          'Nurses often work the night shift.',
          cloze('My ___ at the café ends at ten, so I get home late.', 'shift', 'a noun starting with s', 'A set period of working hours is a shift.'),
        ),
        vocab(
          'recover',
          'v.',
          'to return to a normal state after a difficult time',
          'The economy took years to recover.',
          cloze('It took her two weeks to ___ from the flu.', 'recover', 'a verb starting with r', 'The pattern is recover from something; after “to” use the base form.'),
        ),
        vocab(
          'organized',
          'adj.',
          'able to plan your work and your time well',
          'An organized person plans the week ahead.',
          cloze('She is so ___ that she never misses a deadline.', ['organized', 'organised'], 'an adjective starting with o', 'People who plan well and meet deadlines are organized.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'If I hadn’t had that job, I would have graduated with far more debt.',
          'If I had been more organized from the start, I wouldn’t have a failed course on my transcript now.',
          'If the restaurant had paid more, I would have needed fewer shifts.',
        ],
        mcq: [
          mcq(
            'If I had refused those extra shifts, I ___ statistics the first time.',
            ['would pass', 'passed', 'would have passed', 'will pass'],
            2,
            'Both parts refer to the imagined past, so the result clause needs would have + past participle.',
          ),
          mcq(
            'If I had planned my weeks from the beginning, I ___ less stressed today.',
            ['would have been', 'would be', 'will be', 'had been'],
            1,
            '“Today” marks a present result of a past condition, so this is a mixed conditional: would + base verb.',
          ),
        ],
        cloze: [
          cloze(
            'If I had ___ to my manager earlier, she would have reduced my hours. (speak)',
            'spoken',
            'the past participle of the verb in parentheses',
            'The if-clause of a third conditional uses had + past participle: had spoken, not had spoke.',
          ),
        ],
        reorder: [reorder('If I had slept more, I would have passed.', 'I didn’t sleep enough, so I failed.', 'The if-clause takes the past perfect (had slept); the result takes would have + past participle.')],
      },
      speaking: {
        readAloud: [
          'Then I failed statistics, a compulsory course that I had to pass in order to graduate.',
          'It took a full semester to recover, but I passed the course the second time.',
          'If I hadn’t had that job, I would have graduated with far more debt.',
        ],
        scenario: 'A classmate is thinking about taking a part-time job, and your teacher asks for your opinion.',
        opening: 'Do you think students should work while they study? Why or why not?',
      },
      writing: {
        prompt:
          'Should university students work part-time? Give your opinion with reasons and an example from your own life or from someone you know. ' +
          'Include at least two third or mixed conditional sentences.',
        minWords: 120,
        tips: [
          'State your opinion clearly in the first two sentences.',
          'Support it with one concrete example and its consequences.',
          'Use a conditional to show what would have happened otherwise.',
        ],
      },
    },
  },
};
