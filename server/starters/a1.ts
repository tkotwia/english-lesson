import type { Stage } from '../../shared/schema.ts';
import { cloze, mcq, reorder, term, vocab } from './build.ts';
import type { StarterLesson } from './types.ts';

// A1 的起始課。文法重點:be 動詞(am / is / are)。課文 40–64 字,解說用中文。

const GRAMMAR_POINT = 'be (am/is/are)';
const POINT_NAME = 'be 動詞(am / is / are)';
const EXPLANATION =
  'be 動詞有三個:I 用 am;he、she、it 和單數名詞用 is;you、we、they 和複數名詞用 are。' +
  '否定句在 be 動詞後面加 not,例如 He is not quiet。' +
  '常見錯誤:中文沒有 be 動詞,所以很容易說成 He happy,要記得說 He is happy。';

export const A1: Record<Stage, StarterLesson> = {
  elementary: {
    topic: 'my pet',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'My Dog Bobo',
      intro: '嗨!我是 Emma 老師。今天我們要認識一隻可愛的小狗 Bobo,學幾個形容詞,還要練習 am、is、are。準備好了嗎?Let’s go!',
      passage: {
        text:
          'This is my dog. His name is Bobo. He is three years old. Bobo is small and brown. His ears are long. He is very friendly. ' +
          'My sister and I are happy with him. We are in the park every Sunday. Bobo is not quiet. He is my best friend.',
        translation:
          '這是我的狗。牠的名字叫 Bobo。牠三歲。Bobo 小小的,是棕色的。牠的耳朵很長。牠非常友善。' +
          '我和妹妹跟牠在一起很開心。我們每個星期天都在公園。Bobo 不安靜。牠是我最好的朋友。',
      },
      glossary: [term('ears', '耳朵'), term('park', '公園'), term('every Sunday', '每個星期天'), term('best friend', '最好的朋友'), term('years old', '…歲'), term('sister', '姊姊;妹妹')],
      listening: {
        questions: [
          mcq('What is Bobo?', ['A dog', 'A cat', 'A bird'], 0, '第一句就說 This is my dog,所以 Bobo 是一隻狗。'),
          mcq('Is Bobo quiet?', ['Yes, he is.', 'No, he is not.', 'We do not know.'], 1, '文中說 Bobo is not quiet,所以他不安靜。'),
        ],
        dictation: ['His ears are long.', 'He is my best friend.'],
      },
      reading: {
        questions: [
          mcq('How old is Bobo?', ['Two years old', 'Three years old', 'Five years old'], 1, '文中說 He is three years old。'),
          mcq('What color is Bobo?', ['Black', 'White', 'Brown'], 2, '文中說 Bobo is small and brown,brown 是棕色。'),
          mcq('Where are they every Sunday?', ['In the park', 'At school', 'At home'], 0, '文中說 We are in the park every Sunday。'),
        ],
      },
      vocab: [
        vocab('small', 'adj.', '小的', 'My room is small.', cloze('A mouse is ___, but an elephant is big.', 'small', '小的(s 開頭)', 'small 是「小的」,和 big 相反。')),
        vocab('brown', 'adj.', '棕色的', 'I have brown eyes.', cloze('Chocolate is ___.', 'brown', '棕色的(b 開頭)', '巧克力是棕色的,所以用 brown。')),
        vocab('friendly', 'adj.', '友善的', 'Our new neighbor is friendly.', cloze('My teacher is nice and ___ to everyone.', 'friendly', '友善的(f 開頭)', 'friendly 形容人或動物對別人很好。')),
        vocab('happy', 'adj.', '快樂的', 'The children are happy today.', cloze('It is my birthday today. I am very ___!', 'happy', '快樂的(h 開頭)', '生日很開心,所以用 happy。')),
        vocab('quiet', 'adj.', '安靜的', 'The baby is quiet now.', cloze('Shh! Please be ___ in the library.', 'quiet', '安靜的(q 開頭)', '在圖書館要安靜,所以用 quiet。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I am ten years old.', 'Bobo is small and brown.', 'We are in the park.'],
        mcq: [mcq('My sister and I ___ happy.', ['am', 'is', 'are'], 2, 'My sister and I 是兩個人,等於 we,所以用 are。')],
        cloze: [
          cloze('She ___ my best friend.', 'is', 'she 要用哪一個 be 動詞?', 'she 是第三人稱單數,用 is。'),
          cloze('I ___ not quiet in the park.', 'am', 'I 要用哪一個 be 動詞?', 'I 固定用 am,否定是 I am not。'),
        ],
        reorder: [reorder('His ears are very long.', '他的耳朵非常長。', 'ears 是複數,所以用 are;very 放在形容詞 long 前面。')],
      },
      speaking: {
        readAloud: ['Bobo is small and brown.', 'He is very friendly.', 'We are in the park every Sunday.'],
        scenario: '老師想認識你的寵物,或是你喜歡的動物。',
        opening: 'Hello! Do you have a pet? What is its name?',
      },
      writing: {
        prompt: '寫 3 句話介紹你的寵物,或是你喜歡的一種動物。記得用 am、is、are。',
        minWords: 15,
        tips: ['用 This is my … 開頭', '說說牠的顏色和大小', '用 He is … 或 She is … 描述牠'],
      },
    },
  },

  junior: {
    topic: 'a school club',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Music Club',
      intro: '哈囉!我是 Emma 老師。今天要讀 Leo 介紹他的音樂社,學五個實用的單字,並且練習 am、is、are。開始吧!',
      passage: {
        text:
          'I am Leo. I am in the music club at my school. The club is in Room 205. Twelve students are in the club. Our teacher is Ms. Lin. ' +
          'She is kind and funny. The club is on Tuesday and Friday. My friends are in the club, too. The songs are easy. I am not shy now.',
        translation:
          '我是 Leo。我參加學校的音樂社。社團在 205 教室。社團裡有十二個學生。我們的老師是林老師。' +
          '她親切又有趣。社團時間在星期二和星期五。我的朋友也在這個社團。那些歌很簡單。我現在不害羞了。',
      },
      glossary: [term('music', '音樂'), term('students', '學生'), term('Tuesday', '星期二'), term('Friday', '星期五'), term('songs', '歌曲'), term('too', '也')],
      listening: {
        questions: [
          mcq('Which club is Leo in?', ['The music club', 'The art club', 'The sports club'], 0, 'Leo 說 I am in the music club。'),
          mcq('Which is true about Ms. Lin?', ['She is angry.', 'She is kind and funny.', 'She is shy.'], 1, '文中說 She is kind and funny。'),
        ],
        dictation: ['She is kind and funny.', 'The songs are easy.'],
      },
      reading: {
        questions: [
          mcq('How many students are in the club?', ['Ten', 'Twelve', 'Twenty'], 1, '文中說 Twelve students are in the club,twelve 是十二。'),
          mcq('When is the club?', ['On Monday and Wednesday', 'On Saturday', 'On Tuesday and Friday'], 2, '文中說 The club is on Tuesday and Friday。'),
          mcq('Is Leo shy now?', ['No, he is not.', 'Yes, he is.', 'He is sometimes shy.'], 0, '最後一句說 I am not shy now。'),
        ],
      },
      vocab: [
        vocab('club', 'n.', '社團', 'Our school has a chess club.', cloze('I am in the art ___ at school.', 'club', '社團(c 開頭)', 'art club 是美術社,club 是社團。')),
        vocab('kind', 'adj.', '親切的', 'The nurse is kind to the children.', cloze('My grandma is very ___. She helps everyone.', 'kind', '親切的(k 開頭)', '會幫助別人的人很親切,用 kind。')),
        vocab('funny', 'adj.', '有趣的;好笑的', 'My uncle is funny.', cloze('This movie is ___! I laugh a lot.', 'funny', '好笑的(f 開頭)', '讓人一直笑的東西是 funny。')),
        vocab('easy', 'adj.', '簡單的', 'This game is easy.', cloze('The test is not hard. It is ___.', 'easy', '簡單的(e 開頭)', 'easy 和 hard 相反,意思是簡單。')),
        vocab('shy', 'adj.', '害羞的', 'The new student is shy.', cloze('Amy is ___. She is quiet in class.', 'shy', '害羞的(s 開頭)', '上課很安靜、不太敢說話的人是 shy。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I am twelve years old.', 'She is kind and funny.', 'The songs are easy.'],
        mcq: [mcq('Our teacher ___ Ms. Lin.', ['am', 'is', 'are'], 1, 'Our teacher 是一個人(單數),所以用 is。')],
        cloze: [
          cloze('My friends ___ in the club, too.', 'are', 'friends 是複數', 'friends 是複數名詞,用 are。'),
          cloze('I ___ in the music club.', 'am', 'I 要用哪一個 be 動詞?', 'I 固定用 am。'),
        ],
        reorder: [reorder('The club is on Tuesday.', '社團在星期二。', '主詞 The club 是單數,用 is;星期幾前面用 on。')],
      },
      speaking: {
        readAloud: ['I am in the music club at my school.', 'My friends are in the club, too.', 'I am not shy now.'],
        scenario: '老師想知道你參加什麼社團,或是你想參加哪一個社團。',
        opening: 'Hi! Are you in a club at school? Which club is it?',
      },
      writing: {
        prompt: '寫 3 句話介紹你的社團,或是你想參加的社團。記得用 am、is、are。',
        minWords: 15,
        tips: ['用 I am in the … club 開頭', '介紹社團的老師或同學', '說說社團在星期幾'],
      },
    },
  },

  senior: {
    topic: 'preparing for a big exam',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'Before the Big Exam',
      intro: '你好!我是 Emma 老師。今天的短文是 Jay 在大考前的心情。我們會學五個單字,並且把 am、is、are 練熟。一起開始吧!',
      passage: {
        text:
          'My name is Jay. I am a high school student. The big exam is in June. I am nervous, but I am ready. My desk is clean. ' +
          'My books are on the desk. My notes are short and clear. The library is quiet. My friends are there every evening. ' +
          'We are tired, but we are not sad.',
        translation:
          '我的名字是 Jay。我是高中生。大考在六月。我很緊張,但是我準備好了。我的書桌很乾淨。' +
          '我的書在書桌上。我的筆記簡短又清楚。圖書館很安靜。我的朋友每天晚上都在那裡。我們很累,但是我們不難過。',
      },
      glossary: [term('high school', '高中'), term('June', '六月'), term('desk', '書桌'), term('notes', '筆記'), term('clear', '清楚的'), term('library', '圖書館'), term('evening', '晚上')],
      listening: {
        questions: [
          mcq('When is the big exam?', ['In June', 'In May', 'In July'], 0, '文中說 The big exam is in June。'),
          mcq('How is Jay?', ['He is sad and angry.', 'He is nervous, but he is ready.', 'He is happy and lazy.'], 1, 'Jay 說 I am nervous, but I am ready。'),
        ],
        dictation: ['My desk is clean.', 'The library is quiet.'],
      },
      reading: {
        questions: [
          mcq('Where are Jay’s books?', ['In his bag', 'On the bed', 'On the desk'], 2, '文中說 My books are on the desk。'),
          mcq('Which is true about Jay’s notes?', ['They are long and hard.', 'They are short and clear.', 'They are old and dirty.'], 1, '文中說 My notes are short and clear。'),
          mcq('Where are his friends every evening?', ['At the library', 'At home', 'In the park'], 0, '前一句提到 the library,所以 there 指的是圖書館。'),
        ],
      },
      vocab: [
        vocab('exam', 'n.', '考試', 'The English exam is tomorrow.', cloze('The math ___ is on Friday.', 'exam', '考試(e 開頭)', 'math exam 是數學考試。')),
        vocab('nervous', 'adj.', '緊張的', 'She is nervous on the stage.', cloze('The test is in ten minutes, and I am not ready. I am ___.', 'nervous', '緊張的(n 開頭)', '快要考試了卻還沒準備好,會很緊張,用 nervous。')),
        vocab('ready', 'adj.', '準備好的', 'Are you ready for school?', cloze('Dinner is ___. Let’s eat!', 'ready', '準備好的(r 開頭)', '晚餐好了、可以吃了,用 ready。')),
        vocab('clean', 'adj.', '乾淨的', 'The classroom is clean.', cloze('Wash your hands. Now they are ___.', 'clean', '乾淨的(c 開頭)', '洗過的手是乾淨的,用 clean。')),
        vocab('tired', 'adj.', '累的', 'Dad is tired after work.', cloze('It is late and I am ___. Good night!', 'tired', '累的(t 開頭)', '很晚了想睡覺,用 tired。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I am nervous today.', 'The library is quiet.', 'My books are on the desk.'],
        mcq: [mcq('My notes ___ short and clear.', ['am', 'is', 'are'], 2, 'notes 是複數名詞,所以用 are。')],
        cloze: [
          cloze('The exam ___ in June.', 'is', 'The exam 是單數', 'The exam 是單數名詞,用 is。'),
          cloze('We ___ not sad.', 'are', 'we 要用哪一個 be 動詞?', 'we 用 are,否定是 we are not。'),
        ],
        reorder: [reorder('I am a high school student.', '我是一個高中生。', 'I 用 am;a 放在 high school student 前面。')],
      },
      speaking: {
        readAloud: ['I am nervous, but I am ready.', 'My books are on the desk.', 'We are tired, but we are not sad.'],
        scenario: '大考快到了,老師想知道你現在的心情和準備的情況。',
        opening: 'Hello! The big exam is near. How are you today?',
      },
      writing: {
        prompt: '寫 3 句話說說你考試前的心情和你的書桌。記得用 am、is、are。',
        minWords: 15,
        tips: ['用 I am … 說你的心情', '用 My desk is … 描述書桌', '用 My books are … 說書在哪裡'],
      },
    },
  },

  university: {
    topic: 'living in a dormitory',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'My Room in Dorm B',
      intro: '你好!我是 Emma 老師。今天的短文是 Mia 介紹她的宿舍房間和室友。我們會學五個生活單字,並且練習 am、is、are。開始囉!',
      passage: {
        text:
          'I am Mia. I am a university student. My room is in Dorm B. It is small, but it is clean. My roommate is Sara. ' +
          'She is from Tainan. She is friendly and quiet. Our beds are near the window. The kitchen is on the first floor. ' +
          'It is busy at night. We are happy here.',
        translation:
          '我是 Mia。我是大學生。我的房間在 B 棟宿舍。房間很小,但是很乾淨。我的室友是 Sara。' +
          '她來自台南。她友善又安靜。我們的床靠近窗戶。廚房在一樓。晚上廚房很熱鬧。我們在這裡很快樂。',
      },
      glossary: [term('university', '大學'), term('Dorm', '宿舍'), term('clean', '乾淨的'), term('window', '窗戶'), term('at night', '在晚上'), term('friendly', '友善的')],
      listening: {
        questions: [
          mcq('Who is Sara?', ['Mia’s teacher', 'Mia’s roommate', 'Mia’s sister'], 1, '文中說 My roommate is Sara。'),
          mcq('Which is true about the room?', ['It is small but clean.', 'It is big and dirty.', 'It is old and dark.'], 0, '文中說 It is small, but it is clean。'),
        ],
        dictation: ['My roommate is Sara.', 'We are happy here.'],
      },
      reading: {
        questions: [
          mcq('Where is Sara from?', ['Taipei', 'Tainan', 'Taichung'], 1, '文中說 She is from Tainan。'),
          mcq('Where are the beds?', ['Near the door', 'In the kitchen', 'Near the window'], 2, '文中說 Our beds are near the window。'),
          mcq('Where is the kitchen?', ['On the first floor', 'On the second floor', 'In Dorm A'], 0, '文中說 The kitchen is on the first floor。'),
        ],
      },
      vocab: [
        vocab('roommate', 'n.', '室友', 'My roommate is from Japan.', cloze('I share my room with my ___.', 'roommate', '室友(r 開頭)', '一起住同一個房間的人是 roommate。')),
        vocab('near', 'prep.', '在…附近', 'The park is near my house.', cloze('The bus stop is ___ my school. I walk there.', 'near', '在…附近(n 開頭)', '走路就到,表示很近,用 near。')),
        vocab('kitchen', 'n.', '廚房', 'The kitchen is next to the living room.', cloze('Mom is in the ___. She is the cook today.', 'kitchen', '廚房(k 開頭)', '煮飯的地方是 kitchen。')),
        vocab('floor', 'n.', '樓層', 'The office is on the fifth floor.', cloze('My class is on the third ___.', 'floor', '樓層(f 開頭)', 'the third floor 是三樓。')),
        vocab('busy', 'adj.', '忙碌的;熱鬧的', 'The street is busy in the morning.', cloze('The shop is ___ on Sunday. Many people are there.', 'busy', '忙碌的;熱鬧的(b 開頭)', '人很多、很忙,用 busy。')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I am eighteen years old.', 'Sara is my roommate.', 'The students are friendly.'],
        mcq: [mcq('Our beds ___ near the window.', ['are', 'is', 'am'], 0, 'beds 是複數名詞,所以用 are。')],
        cloze: [
          cloze('The kitchen ___ on the first floor.', 'is', 'The kitchen 是單數', 'The kitchen 是單數名詞,用 is。'),
          cloze('I ___ a university student.', 'am', 'I 要用哪一個 be 動詞?', 'I 固定用 am。'),
        ],
        reorder: [reorder('My roommate is from Tainan.', '我的室友來自台南。', 'My roommate 是單數,用 is;from Tainan 放在最後。')],
      },
      speaking: {
        readAloud: ['It is small, but it is clean.', 'She is friendly and quiet.', 'The kitchen is on the first floor.'],
        scenario: '你剛搬進宿舍,老師想知道你的房間和室友。',
        opening: 'Hi! Is your room in a dorm? Who is your roommate?',
      },
      writing: {
        prompt: '寫 3 句話介紹你的房間和室友(或家人)。記得用 am、is、are。',
        minWords: 15,
        tips: ['用 My room is … 描述房間', '用 My roommate is … 介紹室友', '用 We are … 說你們的感覺'],
      },
    },
  },
};
