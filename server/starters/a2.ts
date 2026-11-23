import type { Stage } from '../../shared/schema.ts';
import { cloze, mcq, reorder, term, vocab } from './build.ts';
import type { StarterLesson } from './types.ts';

// A2 的起始課。文法重點:過去簡單式。課文 72–104 字,解說用中文。

const GRAMMAR_POINT = 'past simple (regular and irregular)';
const POINT_NAME = '過去簡單式(Past Simple)';
const EXPLANATION =
  '說「過去已經發生的事」時,動詞要改成過去式。規則動詞加 -ed(walk → walked、visit → visited);' +
  '不規則動詞要背(go → went、find → found、tell → told、win → won)。' +
  '否定句用 didn’t + 原形動詞,例如 I didn’t get a medal。' +
  '常見錯誤:中文的動詞沒有時態變化,所以很容易忘記改,把 I went 說成 I go。';

export const A2: Record<Stage, StarterLesson> = {
  elementary: {
    topic: 'my family',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'A Sunday with Grandma',
      intro: '嗨!我是 Emma 老師。今天要讀一家人去看奶奶的故事,學五個單字,還要練習「過去式」。準備好了嗎?',
      passage: {
        text:
          'Last Sunday my family visited Grandma. She lives in a small town near the sea. Dad drove the car, and Mom sang songs. ' +
          'My little brother slept all the way. Grandma cooked noodles and fish for lunch. They were delicious! After lunch, we walked to the beach. ' +
          'I found three pretty shells and gave one to Grandma. She smiled and hugged me. We went home in the evening. ' +
          'I was tired, but it was a wonderful day.',
        translation:
          '上個星期天,我們全家去看奶奶。她住在海邊的一個小鎮。爸爸開車,媽媽唱歌。我弟弟一路上都在睡覺。' +
          '奶奶煮了麵和魚當午餐,非常好吃!午餐後,我們走路去海灘。我找到三個漂亮的貝殼,送了一個給奶奶。' +
          '她笑了,還抱了我。我們傍晚回家。我很累,但那是很棒的一天。',
      },
      glossary: [
        term('town', '小鎮'),
        term('sea', '海'),
        term('drove', '開車(drive 的過去式)'),
        term('all the way', '一路上'),
        term('noodles', '麵'),
        term('beach', '海灘'),
        term('shells', '貝殼'),
        term('hugged', '擁抱(hug 的過去式)'),
      ],
      listening: {
        questions: [
          mcq('Who did the family visit?', ['Their teacher', 'Grandma', 'A friend', 'Their uncle'], 1, '第一句說 my family visited Grandma。'),
          mcq('How was the day?', ['It was boring.', 'It was sad.', 'It was wonderful.', 'It was scary.'], 2, '最後一句說 it was a wonderful day。'),
        ],
        dictation: ['Dad drove the car, and Mom sang songs.', 'We went home in the evening.'],
      },
      reading: {
        questions: [
          mcq('What did Grandma cook for lunch?', ['Rice and chicken', 'Noodles and fish', 'Soup and bread', 'Pizza'], 1, '文中說 Grandma cooked noodles and fish for lunch。'),
          mcq('What did the writer find at the beach?', ['Three shells', 'A small fish', 'A toy boat', 'Some money'], 0, '文中說 I found three pretty shells。'),
          mcq('Who slept in the car?', ['Dad', 'Mom', 'Grandma', 'The little brother'], 3, '文中說 My little brother slept all the way。'),
        ],
      },
      vocab: [
        vocab('visit', 'v.', '拜訪', 'I visit my aunt on holidays.', cloze('We want to ___ our cousins this summer.', 'visit', '拜訪(v 開頭)', 'want to 後面接原形動詞 visit。')),
        vocab('cook', 'v.', '煮', 'My dad can cook rice.', cloze('Can you ___ dinner tonight?', 'cook', '煮(c 開頭)', 'can 後面接原形動詞 cook。')),
        vocab('delicious', 'adj.', '美味的', 'The soup smells delicious.', cloze('This cake is ___! I want more.', ['delicious', 'wonderful'], '美味的(d 開頭)', '還想再吃,表示很好吃,用 delicious。這一課的 wonderful 放在這裡也說得通。')),
        vocab('find', 'v.', '找到', 'I always find coins on the street.', cloze('I can’t ___ my keys. Where are they?', 'find', '找到(f 開頭)', 'can’t 後面接原形動詞 find。')),
        vocab('wonderful', 'adj.', '很棒的', 'We had a wonderful teacher.', cloze('The trip was ___. We had a great time.', 'wonderful', '很棒的(w 開頭)', '玩得很開心的旅行是 wonderful。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['My family visited Grandma last Sunday.', 'Dad drove the car.', 'We went home in the evening.'],
        mcq: [mcq('Yesterday we ___ to the beach.', ['walk', 'walks', 'walked', 'walking'], 2, 'yesterday 是過去的時間,walk 的過去式是 walked。')],
        cloze: [
          cloze('Grandma ___ noodles for lunch yesterday. (cook)', 'cooked', 'cook 是規則動詞', 'cook 是規則動詞,過去式加 -ed 變成 cooked。'),
          cloze('I ___ a shell on the beach last week. (find)', 'found', 'find 是不規則動詞', 'find 的過去式是 found。'),
        ],
        reorder: [reorder('My brother slept in the car.', '我弟弟在車上睡覺。', 'sleep 的過去式是 slept;地點 in the car 放在最後。')],
      },
      speaking: {
        readAloud: ['Grandma cooked noodles and fish for lunch.', 'After lunch, we walked to the beach.', 'I was tired, but it was a wonderful day.'],
        scenario: '老師想知道你上個週末和家人做了什麼。',
        opening: 'Hi! What did you do with your family last weekend?',
      },
      writing: {
        prompt: '寫 4 到 5 句話,描述你和家人一起度過的一天。記得用過去式。',
        minWords: 30,
        tips: ['用 Last Sunday … 或 Last weekend … 開頭', '說說你們去了哪裡、吃了什麼', '動詞記得改成過去式'],
      },
    },
  },

  junior: {
    topic: 'my favorite sport',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'My First Badminton Competition',
      intro: '哈囉!我是 Emma 老師。今天的短文是一位同學打羽毛球的故事。我們會學五個單字,並且練習過去式。Let’s start!',
      passage: {
        text:
          'My favorite sport is badminton. I started playing two years ago. At first I was terrible. I missed the shuttlecock again and again! ' +
          'But my coach was patient. He showed me how to hold the racket. I practiced every day after school. ' +
          'Last month I entered my first competition. I was nervous, and I lost the first game. Then I won the next two games! ' +
          'My parents cheered loudly. I didn’t get a medal, but I felt proud.',
        translation:
          '我最喜歡的運動是羽毛球。我兩年前開始打。一開始我打得很糟,一次又一次打不到球!但是我的教練很有耐心。' +
          '他教我怎麼握球拍。我每天放學後都練習。上個月我參加了第一次比賽。我很緊張,第一場輸了。' +
          '接著我贏了後面兩場!我爸媽大聲歡呼。我沒有拿到獎牌,但我覺得很驕傲。',
      },
      glossary: [
        term('badminton', '羽毛球(運動)'),
        term('shuttlecock', '羽毛球(球本身)'),
        term('racket', '球拍'),
        term('terrible', '很糟的'),
        term('at first', '一開始'),
        term('cheered', '歡呼(cheer 的過去式)'),
        term('medal', '獎牌'),
      ],
      listening: {
        questions: [
          mcq('What is the writer’s favorite sport?', ['Basketball', 'Tennis', 'Badminton', 'Swimming'], 2, '第一句說 My favorite sport is badminton。'),
          mcq('How did the writer feel at the end?', ['Proud', 'Angry', 'Bored', 'Scared'], 0, '最後一句說 I felt proud。'),
        ],
        dictation: ['But my coach was patient.', 'My parents cheered loudly.'],
      },
      reading: {
        questions: [
          mcq('When did the writer start playing?', ['Last week', 'Two years ago', 'Last month', 'Five years ago'], 1, '文中說 I started playing two years ago。'),
          mcq('What did the coach show the writer?', ['How to run fast', 'How to jump high', 'How to win a medal', 'How to hold the racket'], 3, '文中說 He showed me how to hold the racket。'),
          mcq(
            'What happened in the competition?',
            ['The writer won every game.', 'The writer got a medal.', 'The writer lost the first game and won the next two.', 'The writer did not play.'],
            2,
            '文中說 I lost the first game,接著 I won the next two games。',
          ),
        ],
      },
      vocab: [
        vocab('practice', 'v.', '練習', 'We practice English every morning.', cloze('I need to ___ the piano for thirty minutes every day.', 'practice', '練習(p 開頭)', 'need to 後面接原形動詞 practice。')),
        vocab('coach', 'n.', '教練', 'The coach is very strict.', cloze('Our soccer ___ teaches us new skills.', 'coach', '教練(c 開頭)', '教球隊新技巧的人是 coach。')),
        vocab('patient', 'adj.', '有耐心的', 'Good teachers are patient.', cloze('Please be ___. The bus will come soon.', 'patient', '有耐心的(p 開頭)', '請別人耐心等,用 patient。')),
        vocab('competition', 'n.', '比賽', 'The dance competition is on Saturday.', cloze('Our school won the singing ___ last year.', 'competition', '比賽(c 開頭)', 'singing competition 是歌唱比賽。')),
        vocab('proud', 'adj.', '驕傲的;自豪的', 'I am proud of my sister.', cloze('My mom was ___ of me when I got a good grade.', 'proud', '驕傲的(p 開頭)', 'be proud of 是「以…為榮」。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I started playing two years ago.', 'My coach helped me a lot.', 'I didn’t get a medal.'],
        mcq: [mcq('I ___ my first competition last month.', ['enter', 'entered', 'enters', 'entering'], 1, 'last month 是過去的時間,enter(參加比賽)的過去式是 entered。')],
        cloze: [
          cloze('I ___ the first game, but I didn’t cry. (lose)', 'lost', 'lose 是不規則動詞', 'lose 的過去式是 lost。'),
          cloze('She ___ the next two games yesterday. (win)', 'won', 'win 是不規則動詞', 'win 的過去式是 won。'),
        ],
        reorder: [reorder('I didn’t win the first game.', '我沒有贏第一場比賽。', '過去式的否定用 didn’t + 原形動詞 win,不是 didn’t won。')],
      },
      speaking: {
        readAloud: ['My favorite sport is badminton.', 'I practiced every day after school.', 'I didn’t get a medal, but I felt proud.'],
        scenario: '老師想知道你最喜歡的運動,還有你是什麼時候開始的。',
        opening: 'Hello! What is your favorite sport? When did you start playing it?',
      },
      writing: {
        prompt: '寫 4 到 5 句話,介紹你最喜歡的運動,以及一次難忘的練習或比賽。記得用過去式。',
        minWords: 30,
        tips: ['先說你最喜歡的運動是什麼', '說說那次練習或比賽發生了什麼事', '最後寫你當時的感覺'],
      },
    },
  },

  senior: {
    topic: 'choosing a university major',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Choice Was Mine',
      intro: '你好!我是 Emma 老師。今天的短文和選擇大學科系有關。我們會學五個單字,並且練習過去式。一起開始吧!',
      passage: {
        text:
          'Last week our school held a talk about university majors. A student from a medical school visited us. ' +
          'She told us about her classes and her long nights in the library. I always wanted to be a doctor, so I listened carefully. ' +
          'After the talk, I asked her a question. Was it hard to choose? She laughed and said yes. She changed her mind three times! ' +
          'That evening I talked with my parents. They didn’t push me. They said the choice was mine.',
        translation:
          '上星期我們學校辦了一場關於大學科系的講座。一位醫學院的學生來拜訪我們。她告訴我們她的課程,還有在圖書館熬夜的日子。' +
          '我一直想當醫生,所以聽得很仔細。講座結束後,我問了她一個問題:做選擇很難嗎?她笑著說是的,她改變了三次主意!' +
          '那天晚上我和爸媽談了談。他們沒有逼我。他們說選擇權在我。',
      },
      glossary: [
        term('held', '舉辦(hold 的過去式)'),
        term('talk', '講座'),
        term('medical school', '醫學院'),
        term('library', '圖書館'),
        term('changed her mind', '改變主意'),
        term('push', '逼迫'),
      ],
      listening: {
        questions: [
          mcq('What was the talk about?', ['University majors', 'School sports', 'Summer jobs', 'A school trip'], 0, '第一句說 a talk about university majors。'),
          mcq(
            'What did the writer’s parents say?',
            ['The writer must be a doctor.', 'The choice was the writer’s.', 'The writer should not go to college.', 'The writer should ask a teacher.'],
            1,
            '最後一句說 They said the choice was mine。',
          ),
        ],
        dictation: ['After the talk, I asked her a question.', 'They didn’t push me.'],
      },
      reading: {
        questions: [
          mcq('Who visited the school?', ['A doctor from a hospital', 'A teacher from another school', 'A student from a medical school', 'A parent'], 2, '文中說 A student from a medical school visited us。'),
          mcq('How many times did the student change her mind?', ['Never', 'Once', 'Twice', 'Three times'], 3, '文中說 She changed her mind three times。'),
          mcq(
            'Why did the writer listen carefully?',
            ['Because the writer always wanted to be a doctor.', 'Because the talk was short.', 'Because the teacher was angry.', 'Because there was a test.'],
            0,
            '文中說 I always wanted to be a doctor, so I listened carefully。',
          ),
        ],
      },
      vocab: [
        vocab('major', 'n.', '主修科系', 'Her major is English.', cloze('My sister’s ___ in college is history.', 'major', '主修科系(m 開頭)', '在大學主修的科目叫 major。')),
        vocab('choose', 'v.', '選擇', 'You can choose any seat.', cloze('You can ___ one drink: milk or juice.', 'choose', '選擇(c 開頭)', 'can 後面接原形動詞 choose。')),
        vocab('carefully', 'adv.', '仔細地', 'He drives carefully.', cloze('Please read the question ___ before you answer.', 'carefully', '仔細地(c 開頭)', '修飾動詞 read 要用副詞 carefully。')),
        vocab('change', 'v.', '改變;更換', 'People change over time.', cloze('My seat is too far from the board. Can I ___ it?', 'change', '更換(c 開頭)', '看不到黑板,想換座位;Can I 後面接原形動詞 change。')),
        vocab('choice', 'n.', '選擇', 'That was a good choice.', cloze('Pizza or noodles? It is your ___.', 'choice', '選擇(名詞,c 開頭)', 'your 後面要接名詞 choice,不是動詞 choose。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['A student visited our school last week.', 'She changed her mind three times.', 'My parents didn’t say no.'],
        mcq: [mcq('She ___ us about her classes last week.', ['tell', 'tells', 'told', 'telling'], 2, 'last week 是過去的時間,tell 的過去式是 told。')],
        cloze: [
          cloze('Our school ___ a talk last Friday. (hold)', 'held', 'hold 是不規則動詞', 'hold 的過去式是 held。'),
          cloze('I ___ with my parents that evening. (talk)', 'talked', 'talk 是規則動詞', 'talk 是規則動詞,過去式加 -ed 變成 talked。'),
        ],
        reorder: [reorder('They didn’t push me at all.', '他們一點也沒有逼我。', '過去式的否定用 didn’t + 原形動詞 push;at all 放在句尾加強語氣。')],
      },
      speaking: {
        readAloud: ['She told us about her classes and her long nights in the library.', 'I always wanted to be a doctor, so I listened carefully.', 'They said the choice was mine.'],
        scenario: '老師想知道你以後想讀什麼科系,以及是誰或什麼事影響了你。',
        opening: 'Hi! What do you want to study in college? Why?',
      },
      writing: {
        prompt: '寫 4 到 5 句話,說說你想讀的科系,以及最近和家人或老師討論的經過。記得用過去式。',
        minWords: 30,
        tips: ['先說你想讀的科系', '用過去式寫你和誰談過、對方說了什麼', '最後寫你的決定或感想'],
      },
    },
  },

  university: {
    topic: 'a job interview',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'My First Job Interview',
      intro: '你好!我是 Emma 老師。今天的短文是第一次去面試打工的經過。我們會學五個求職常用的單字,並且練習過去式。開始囉!',
      passage: {
        text:
          'Yesterday I had my first job interview. It was at a small coffee shop near my university. I woke up early and wore a clean white shirt. ' +
          'I arrived ten minutes early. The manager was friendly. She asked about my class schedule and my experience. ' +
          'I didn’t have any experience, so I told her the truth. She smiled and asked me to make a cup of coffee. ' +
          'My hands shook, but the coffee tasted good. This morning she called me. I got the job!',
        translation:
          '昨天我第一次去面試工作,地點在我大學附近的一家小咖啡店。我很早起床,穿了一件乾淨的白襯衫。我提早十分鐘到。' +
          '店長很親切。她問了我的課表和經驗。我沒有任何經驗,所以我老實告訴她。她笑了笑,請我泡一杯咖啡。' +
          '我的手在發抖,但咖啡很好喝。今天早上她打電話給我。我得到這份工作了!',
      },
      glossary: [
        term('coffee shop', '咖啡店'),
        term('woke up', '醒來(wake up 的過去式)'),
        term('wore', '穿(wear 的過去式)'),
        term('schedule', '時間表;課表'),
        term('shook', '發抖(shake 的過去式)'),
        term('tasted', '嚐起來(taste 的過去式)'),
      ],
      listening: {
        questions: [
          mcq('Where was the interview?', ['At a bank', 'At a coffee shop', 'At a school', 'At a hotel'], 1, '文中說 It was at a small coffee shop。'),
          mcq(
            'Did the writer get the job?',
            ['No, the manager was angry.', 'The writer does not know yet.', 'Yes, the manager called this morning.', 'No, the coffee was bad.'],
            2,
            '最後說 This morning she called me. I got the job!',
          ),
        ],
        dictation: ['I arrived ten minutes early.', 'The manager was friendly.'],
      },
      reading: {
        questions: [
          mcq('What did the writer wear?', ['A clean white shirt', 'A black jacket', 'A blue dress', 'A school uniform'], 0, '文中說 wore a clean white shirt。'),
          mcq(
            'What did the writer say about experience?',
            ['The writer had a lot of experience.', 'The writer worked in a hotel before.', 'The writer did not answer.', 'The writer told the truth: no experience.'],
            3,
            '文中說 I didn’t have any experience, so I told her the truth。',
          ),
          mcq('What did the manager ask the writer to do?', ['Clean the tables', 'Make a cup of coffee', 'Count the money', 'Come back tomorrow'], 1, '文中說 asked me to make a cup of coffee。'),
        ],
      },
      vocab: [
        vocab('interview', 'n.', '面試', 'The interview was short.', cloze('I have a job ___ at two o’clock tomorrow.', 'interview', '面試(i 開頭)', 'job interview 是工作面試。')),
        vocab('arrive', 'v.', '抵達', 'Guests arrive at six.', cloze('What time does the train ___ in Taipei?', 'arrive', '抵達(a 開頭)', 'does 的問句裡,動詞用原形 arrive。')),
        vocab('manager', 'n.', '經理;店長', 'The manager opens the shop at nine.', cloze('The ___ of the store hired three new workers.', 'manager', '經理;店長(m 開頭)', '負責僱用員工的人是 manager。')),
        vocab('experience', 'n.', '經驗', 'This job needs no experience.', cloze('She has five years of teaching ___.', 'experience', '經驗(e 開頭)', 'teaching experience 是教學經驗。')),
        vocab('truth', 'n.', '實話;真相', 'Children often tell the truth.', cloze('Don’t lie. Please tell me the ___.', 'truth', '實話(t 開頭)', 'tell the truth 是「說實話」。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I had my first job interview yesterday.', 'The manager asked me many questions.', 'I didn’t have any experience.'],
        mcq: [mcq('I ___ up early yesterday.', ['wake', 'woke', 'wakes', 'waking'], 1, 'yesterday 是過去的時間,wake 的過去式是 woke。')],
        cloze: [
          cloze('She ___ me this morning. (call)', 'called', 'call 是規則動詞', 'call 是規則動詞,過去式加 -ed 變成 called。'),
          cloze('I ___ a white shirt to the interview. (wear)', 'wore', 'wear 是不規則動詞', 'wear 的過去式是 wore。'),
        ],
        reorder: [reorder('I got the job this morning.', '我今天早上得到了這份工作。', 'get 的過去式是 got;時間 this morning 放在句尾。')],
      },
      speaking: {
        readAloud: ['Yesterday I had my first job interview.', 'I didn’t have any experience, so I told her the truth.', 'My hands shook, but the coffee tasted good.'],
        scenario: '你昨天去面試打工,老師想知道面試的經過。',
        opening: 'Hello! I heard you had a job interview. How did it go?',
      },
      writing: {
        prompt: '寫 4 到 5 句話,描述一次面試、比賽或上台報告的經過。記得用過去式。',
        minWords: 30,
        tips: ['先說是什麼時候、在哪裡', '寫當時發生的事和你的心情', '最後寫結果如何'],
      },
    },
  },
};
