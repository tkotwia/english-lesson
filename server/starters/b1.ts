import type { Stage } from '../../shared/schema.ts';
import { cloze, mcq, reorder, term, vocab } from './build.ts';
import type { StarterLesson } from './types.ts';

// B1 的起始課。文法重點:現在完成式與過去簡單式。課文 112–152 字,解說用簡單英文加中文註解。

const GRAMMAR_POINT = 'present perfect (vs past simple)';
const POINT_NAME = 'Present perfect vs past simple(現在完成式與過去簡單式)';
const EXPLANATION =
  'Use the present perfect (have/has + past participle) for experiences, or for things that started in the past and are still true now: ' +
  'I have known her since first grade. Use the past simple for a finished time in the past: I met her in 2020. ' +
  'Words like for, since, never, ever, yet, already and just often go with the present perfect. ' +
  '(現在完成式講「到現在為止」的經驗或狀態;句子裡有明確的過去時間就用過去簡單式。' +
  '中文沒有這種區別,所以常有人把 I have known her since 2020 說成 I know her since 2020。)';

export const B1: Record<Stage, StarterLesson> = {
  elementary: {
    topic: 'a day at school',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Strangest Day at School',
      intro:
        'Hello! I’m Emma. Today we will read about a very strange school day, learn five useful words, and practice the present perfect. ' +
        '(今天要讀一篇「學校裡最奇怪的一天」,並練習現在完成式。)',
      passage: {
        text:
          'I have been at Green Hill Elementary School for four years, and today was the strangest day so far. ' +
          'It started in the morning when a small bird flew into our classroom. Everyone screamed, but our teacher stayed calm. ' +
          'She opened all the windows and waited. The bird sat on the fan for ten minutes! We have never had such an unusual visitor before. ' +
          'Then, at lunch, I realized that my lunchbox was still at home. My best friend shared her sandwich with me. ' +
          'I have known her since first grade, and she has always been generous. In the afternoon we had a science quiz. ' +
          'I haven’t seen my score yet, but I feel confident. School is never boring!',
        translation:
          '我在青山國小已經四年了,今天是到目前為止最奇怪的一天。早上有一隻小鳥飛進我們的教室。大家都尖叫,但老師保持冷靜。' +
          '她把所有窗戶打開,然後等待。那隻鳥在電風扇上待了十分鐘!我們從來沒有過這麼特別的訪客。' +
          '接著,午餐時我發現便當盒還在家裡。我最好的朋友把她的三明治分給我。我從一年級就認識她了,她一直都很大方。' +
          '下午我們有自然科小考。我還沒看到分數,但我很有信心。學校從來不無聊!',
      },
      glossary: [
        term('strangest', '最奇怪的'),
        term('so far', '到目前為止'),
        term('screamed', '尖叫'),
        term('fan', '電風扇'),
        term('visitor', '訪客'),
        term('lunchbox', '便當盒'),
        term('quiz', '小考'),
        term('score', '分數'),
      ],
      listening: {
        questions: [
          mcq(
            'What unusual thing happened in the morning?',
            ['A bird flew into the classroom.', 'The teacher was late.', 'There was a fire drill.', 'A new student arrived.'],
            0,
            'The passage says a small bird flew into the classroom. (早上有小鳥飛進教室。)',
          ),
          mcq(
            'How does the writer feel about school?',
            ['It is too difficult.', 'It is always the same.', 'It is never boring.', 'It is too far from home.'],
            2,
            'The last sentence is “School is never boring!” (最後一句說學校從不無聊。)',
          ),
        ],
        dictation: ['Everyone screamed, but our teacher stayed calm.', 'School is never boring!'],
      },
      reading: {
        questions: [
          mcq(
            'How long has the writer been at this school?',
            ['One year', 'Four years', 'Two years', 'Six years'],
            1,
            'The first sentence says “for four years.” (第一句說已經四年。)',
          ),
          mcq(
            'What did the writer’s best friend do at lunch?',
            ['She bought a new lunchbox.', 'She told the teacher.', 'She went home.', 'She shared her sandwich.'],
            3,
            'The friend shared her sandwich with the writer. (朋友把三明治分給作者。)',
          ),
          mcq(
            'What do we know about the science quiz?',
            ['The writer failed it.', 'The writer got a perfect score.', 'The writer does not know the score yet.', 'The quiz was canceled.'],
            2,
            '“I haven’t seen my score yet” means the score is still unknown. (還沒看到分數。)',
          ),
        ],
      },
      vocab: [
        vocab('calm', 'adj.', '冷靜的', 'The sea was calm this morning.', cloze('When the fire alarm rang, our teacher told us to stay ___ and walk outside slowly.', 'calm', '冷靜的 (starts with c)', 'Stay calm means do not panic. (保持冷靜。)')),
        vocab('unusual', 'adj.', '不尋常的', 'She has an unusual name.', cloze('It is ___ to see snow in Taiwan.', 'unusual', '不尋常的 (starts with u)', 'Snow is rare in Taiwan, so it is unusual. (很少見所以不尋常。)')),
        vocab(
          'realize',
          'v.',
          '發現;意識到',
          'People often realize their mistakes too late.',
          cloze('When I got to school, I ___ that it was Saturday.', 'realized', '發現 (starts with r, past form)', 'The story is in the past, so use realized. (過去的事用過去式。)'),
        ),
        vocab('generous', 'adj.', '慷慨的;大方的', 'It was generous of you to help.', cloze('My uncle is very ___. He always gives us presents.', 'generous', '大方的 (starts with g)', 'Someone who gives a lot is generous. (常送東西的人很大方。)')),
        vocab('confident', 'adj.', '有信心的', 'He is a confident speaker.', cloze('She practiced a lot, so she was ___ that she could win.', 'confident', '有信心的 (starts with c)', 'Be confident that… means you are sure you can do it. (有信心能做到。)')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I have been at this school for four years.', 'We have never had such an unusual visitor before.', 'Our teacher opened all the windows this morning.'],
        mcq: [
          mcq(
            'I ___ my best friend since first grade.',
            ['know', 'knew', 'have known', 'am knowing'],
            2,
            '“Since first grade” shows a state that continues until now, so use the present perfect. (從過去持續到現在,用現在完成式。)',
          ),
          mcq(
            'Yesterday a bird ___ into our classroom.',
            ['has flown', 'flew', 'flies', 'have flown'],
            1,
            '“Yesterday” is a finished past time, so use the past simple. (有明確過去時間,用過去簡單式。)',
          ),
        ],
        cloze: [cloze('I haven’t ___ my score yet. (see)', 'seen', 'past participle of see', 'After have/haven’t we use the past participle: seen. (have 後面接過去分詞。)')],
        reorder: [reorder('She has always been generous.', '她一直都很大方。', 'The order is has + always + past participle. (always 放在 has 和過去分詞之間。)')],
      },
      speaking: {
        readAloud: ['We have never had such an unusual visitor before.', 'My best friend shared her sandwich with me.', 'I haven’t seen my score yet, but I feel confident.'],
        scenario: 'Your teacher wants to hear about the most unusual day you have had at school. (老師想聽你在學校最特別的一天。)',
        opening: 'Hi! Have you ever had a strange or funny day at school? What happened?',
      },
      writing: {
        prompt:
          'Write about an unusual day at your school. Say what happened, and use the present perfect at least twice, for example “I have never….” ' +
          '(寫一篇短文描述你在學校特別的一天,至少用兩次現在完成式。)',
        minWords: 70,
        tips: [
          'Start with when it happened. (先說是什麼時候發生的。)',
          'Use the past simple for the story and the present perfect for experiences. (故事用過去式,經驗用現在完成式。)',
          'End with how you feel now. (最後寫你現在的感覺。)',
        ],
      },
    },
  },

  junior: {
    topic: 'a night market visit',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'Sophie’s First Stinky Tofu',
      intro:
        'Hello! I’m Emma. Today’s passage is about taking a foreign friend to a night market. We will learn five words and practice the present perfect. ' +
        '(今天的短文是帶外國朋友逛夜市,並練習現在完成式。)',
      passage: {
        text:
          'I have lived in Tainan all my life, but last Friday I took a foreign friend to a night market for the first time. ' +
          'My classmate Sophie moved here from Canada two months ago. “I have tried bubble tea, but I have never eaten stinky tofu,” she told me. ' +
          'When we arrived, the market was already crowded. The smell of grilled squid filled the air. Sophie took photos of everything. ' +
          'At first she refused to taste the stinky tofu, so I ate a piece to show her. Finally she tried it and actually liked it! ' +
          'We also played a balloon game, and she won a small prize. Sophie says it was the best evening she has had in Taiwan so far. ' +
          'I have already promised to take her again.',
        translation:
          '我這輩子都住在台南,但上星期五我第一次帶外國朋友去夜市。我的同學 Sophie 兩個月前從加拿大搬來。' +
          '她告訴我:「我喝過珍珠奶茶,但從來沒吃過臭豆腐。」我們到的時候,夜市已經很擠了。空氣中充滿烤魷魚的味道。Sophie 什麼都拍。' +
          '一開始她不肯嚐臭豆腐,所以我先吃一塊給她看。最後她試了,而且居然很喜歡!我們還玩了射氣球,她贏了一個小獎品。' +
          'Sophie 說這是她到目前為止在台灣最棒的一個晚上。我已經答應要再帶她去。',
      },
      glossary: [
        term('bubble tea', '珍珠奶茶'),
        term('stinky tofu', '臭豆腐'),
        term('crowded', '擁擠的'),
        term('smell', '氣味'),
        term('grilled squid', '烤魷魚'),
        term('actually', '其實;居然'),
        term('balloon', '氣球'),
      ],
      listening: {
        questions: [
          mcq(
            'Where did the writer take Sophie?',
            ['To a museum', 'To a concert', 'To the beach', 'To a night market'],
            3,
            'The writer took a foreign friend to a night market. (作者帶朋友去夜市。)',
          ),
          mcq(
            'What did Sophie think of the evening?',
            ['It was too noisy.', 'It was the best evening she has had in Taiwan.', 'It was boring.', 'It was too expensive.'],
            1,
            'Sophie says it was the best evening she has had in Taiwan so far. (她說是在台灣最棒的一晚。)',
          ),
        ],
        dictation: ['Sophie took photos of everything.', 'The smell of grilled squid filled the air.'],
      },
      reading: {
        questions: [
          mcq('Where is Sophie from?', ['Canada', 'Japan', 'Australia', 'France'], 0, 'She moved here from Canada two months ago. (她從加拿大搬來。)'),
          mcq(
            'Why did the writer eat a piece of stinky tofu first?',
            ['Because the writer was very hungry.', 'Because it was free.', 'To show Sophie that it was fine to try.', 'Because Sophie asked for it.'],
            2,
            'Sophie refused at first, so the writer ate a piece to show her. (先吃給她看。)',
          ),
          mcq(
            'What had Sophie NOT done before this visit?',
            ['Tried bubble tea', 'Moved to Taiwan', 'Lived in Canada', 'Eaten stinky tofu'],
            3,
            'Sophie said, “I have never eaten stinky tofu.” (她說她從沒吃過臭豆腐。)',
          ),
        ],
      },
      vocab: [
        vocab('foreign', 'adj.', '外國的', 'He collects foreign coins.', cloze('She speaks two ___ languages: English and Japanese.', 'foreign', '外國的 (starts with f)', 'Languages from other countries are foreign languages. (外語。)')),
        vocab(
          'refuse',
          'v.',
          '拒絕',
          'Babies often refuse new food.',
          cloze('He was full, so he ___ a second bowl of rice.', 'refused', '拒絕 (starts with r, past form)', 'The sentence is in the past, so use refused. (過去式。)'),
        ),
        vocab('taste', 'v.', '品嚐', 'Chefs taste the soup before serving it.', cloze('Would you like to ___ this soup? It’s my grandma’s recipe.', 'taste', '品嚐 (starts with t)', 'After “would you like to” use the base form. (接原形動詞。)')),
        vocab('prize', 'n.', '獎品', 'First prize is a bicycle.', cloze('The winner of the race gets a ___.', 'prize', '獎品 (starts with p)', 'A winner gets a prize. (贏的人得到獎品。)')),
        vocab('promise', 'v.', '答應;承諾', 'Friends promise to keep secrets.', cloze('I ___ I will call you tonight.', 'promise', '答應 (starts with p)', 'I promise means I say I will surely do it. (我保證。)')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['She has tried bubble tea.', 'We arrived at the market at seven o’clock.', 'I have known Sophie for two months.'],
        mcq: [
          mcq(
            'Sophie ___ here from Canada two months ago.',
            ['has moved', 'moved', 'moves', 'have moved'],
            1,
            '“Two months ago” is a finished past time, so use the past simple. (有 ago,用過去簡單式。)',
          ),
          mcq(
            'I ___ in Tainan all my life.',
            ['live', 'lived', 'am living', 'have lived'],
            3,
            '“All my life” continues until now, so use the present perfect. (持續到現在,用現在完成式。)',
          ),
        ],
        cloze: [cloze('I have never ___ stinky tofu. (eat)', 'eaten', 'past participle of eat', 'After have never we use the past participle: eaten. (have 後面接過去分詞。)')],
        reorder: [reorder('I have already promised to take her again.', '我已經答應要再帶她去一次。', 'already goes between have and the past participle. (already 放在 have 和過去分詞之間。)')],
      },
      speaking: {
        readAloud: ['My classmate Sophie moved here from Canada two months ago.', 'We also played a balloon game, and she won a small prize.', 'Finally she tried it and actually liked it!'],
        scenario: 'A foreign friend is visiting you, and your teacher asks where you have taken them. (外國朋友來找你,老師想知道你帶他們去過哪裡。)',
        opening: 'Hi! Have you ever taken a friend to a night market? What did you eat there?',
      },
      writing: {
        prompt:
          'Write about a place in your town that you have taken a friend to, or want to take a friend to. What did you do there? ' +
          'Use the present perfect and the past simple. (介紹一個你帶朋友去過或想帶朋友去的地方。)',
        minWords: 70,
        tips: [
          'Say how long you have known the place. (先說你認識這個地方多久了。)',
          'Tell the story of one visit in the past simple. (用過去式寫一次去那裡的經過。)',
          'Use never or already at least once. (至少用一次 never 或 already。)',
        ],
      },
    },
  },

  senior: {
    topic: 'social media and friendship',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'Friends Online and Offline',
      intro:
        'Hello! I’m Emma. Today we will read about how social media has changed one student’s friendships, learn five words, and practice the present perfect. ' +
        '(今天的主題是社群媒體與友誼,並練習現在完成式。)',
      passage: {
        text:
          'I have used social media since junior high, and it has changed the way I make friends. ' +
          'Last year I joined an online group for people who love drawing. I have met some talented artists there, although I have never seen most of them in person. ' +
          'One of them, Kai, lives in Kaohsiung. We have chatted almost every day for eight months. However, social media has also caused problems. ' +
          'In March I posted a joke about a classmate, and she felt hurt. I deleted it immediately and apologized to her face to face. ' +
          'That experience taught me to think before I post. I haven’t stopped using social media, but I have become more careful. ' +
          'Real friendship needs honesty, both online and offline.',
        translation:
          '我從國中開始使用社群媒體,它改變了我交朋友的方式。去年我加入了一個喜歡畫畫的人組成的線上社團。' +
          '我在那裡認識了一些很有才華的創作者,雖然大部分的人我從沒見過本人。其中一位叫 Kai,住在高雄。這八個月來我們幾乎每天聊天。' +
          '不過,社群媒體也造成了一些問題。三月時我貼了一則關於同學的玩笑,讓她很受傷。我立刻刪除,並且當面向她道歉。' +
          '那次經驗教會我發文前要先想一想。我沒有停止使用社群媒體,但我變得更小心了。真正的友誼需要誠實,不論在網路上或現實中。',
      },
      glossary: [
        term('social media', '社群媒體'),
        term('in person', '本人;親自'),
        term('chatted', '聊天'),
        term('caused', '造成'),
        term('hurt', '受傷的;難過的'),
        term('immediately', '立刻'),
        term('face to face', '面對面'),
        term('offline', '離線;現實生活中'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            ['How social media has affected the writer’s friendships', 'How to become a professional artist', 'Why students should not use phones', 'How to move to Kaohsiung'],
            0,
            'The whole passage describes good and bad effects of social media on friendship. (全文在講社群媒體對友誼的影響。)',
          ),
          mcq(
            'What did the writer learn from the problem in March?',
            ['To stop using social media', 'To think before posting', 'To post more jokes', 'To make fewer friends'],
            1,
            '“That experience taught me to think before I post.” (發文前要先想。)',
          ),
        ],
        dictation: ['However, social media has also caused problems.', 'That experience taught me to think before I post.'],
      },
      reading: {
        questions: [
          mcq('How did the writer meet Kai?', ['At school', 'In an online drawing group', 'At a party', 'Through a classmate'], 1, 'Kai is one of the artists from the online drawing group. (在線上畫畫社團認識的。)'),
          mcq(
            'What did the writer do after the classmate felt hurt?',
            ['Ignored her', 'Posted another joke', 'Left the online group', 'Deleted the post and apologized in person'],
            3,
            'The writer deleted it immediately and apologized face to face. (立刻刪除並當面道歉。)',
          ),
          mcq(
            'Which sentence is true?',
            ['The writer has seen all the online friends in person.', 'The writer has stopped using social media.', 'The writer has become more careful online.', 'Kai and the writer have chatted for two years.'],
            2,
            '“I have become more careful.” The other sentences do not match the passage. (作者變得更小心。)',
          ),
        ],
      },
      vocab: [
        vocab('talented', 'adj.', '有才華的', 'He is a talented young chef.', cloze('She is a ___ singer. Everyone loves her voice.', 'talented', '有才華的 (starts with t)', 'Someone with natural ability is talented. (有天分。)')),
        vocab('post', 'v.', '發布(貼文)', 'Many people post photos of their meals.', cloze('Think carefully before you ___ a photo online.', 'post', '發布 (starts with p)', 'To post is to put something online. (在網路上發布。)')),
        vocab('delete', 'v.', '刪除', 'You can delete the file later.', cloze('I want to ___ these old messages from my phone.', 'delete', '刪除 (starts with d)', 'After “want to” use the base form delete. (接原形動詞。)')),
        vocab('apologize', 'v.', '道歉', 'Polite people apologize for mistakes.', cloze('You should ___ to him for being late.', 'apologize', '道歉 (starts with a)', 'apologize to someone for something. (向某人為某事道歉。)')),
        vocab('honesty', 'n.', '誠實', 'Honesty is the best policy.', cloze('Thank you for your ___. I’m glad you told me the truth.', 'honesty', '誠實 (starts with h)', 'Telling the truth shows honesty. (說實話就是誠實。)')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I have used social media since junior high.', 'I have met some talented artists there.', 'In March I posted a joke about a classmate.'],
        mcq: [
          mcq(
            'Last year I ___ an online group for people who love drawing.',
            ['have joined', 'join', 'joined', 'has joined'],
            2,
            '“Last year” is a finished past time, so use the past simple. (有明確過去時間,用過去簡單式。)',
          ),
          mcq(
            'We ___ almost every day for eight months.',
            ['chat', 'have chatted', 'has chatted', 'chatting'],
            1,
            '“For eight months” up to now needs the present perfect, and “we” takes have. (持續到現在,we 用 have。)',
          ),
        ],
        cloze: [cloze('I haven’t ___ using social media. (stop)', 'stopped', 'past participle of stop', 'After haven’t we use the past participle: stopped. (haven’t 後面接過去分詞。)')],
        reorder: [reorder('I have become more careful online.', '我在網路上變得更小心了。', 'have + past participle become, then the adjective phrase. (have 後面接過去分詞 become。)')],
      },
      speaking: {
        readAloud: ['We have chatted almost every day for eight months.', 'I deleted it immediately and apologized to her face to face.', 'Real friendship needs honesty, both online and offline.'],
        scenario: 'Your teacher asks how you use social media with your friends. (老師想知道你和朋友怎麼使用社群媒體。)',
        opening: 'Hello! How long have you used social media? Has it helped your friendships?',
      },
      writing: {
        prompt:
          'Has social media made your friendships better or worse? Write about your own experience. Use the present perfect and the past simple. ' +
          '(社群媒體讓你的友誼變好還是變差?寫下你自己的經驗。)',
        minWords: 70,
        tips: [
          'Say how long you have used social media. (先說你用社群媒體多久了。)',
          'Describe one good or bad event in the past simple. (用過去式描述一件好事或壞事。)',
          'Finish with what you have learned. (最後寫你學到了什麼。)',
        ],
      },
    },
  },

  university: {
    topic: 'an internship experience',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'What My Internship Has Taught Me',
      intro:
        'Hello! I’m Emma. Today’s passage is about a student’s first internship. We will learn five workplace words and practice the present perfect. ' +
        '(今天的短文是第一次實習的經驗,並練習現在完成式。)',
      passage: {
        text:
          'I have just finished a two-month internship at a small design company, and I have learned more than I expected. ' +
          'On my first day, I made a serious mistake. I sent a client the wrong file, and my supervisor had to call and explain. ' +
          'I felt embarrassed, but she didn’t shout at me. Instead, she showed me how to check my work. ' +
          'Since then, I have never sent an email without reading it twice. I have also improved my communication skills. ' +
          'In July I presented my ideas to the whole team for the first time. My voice shook, yet everyone listened. ' +
          'The company has offered me a part-time job, but I haven’t decided yet. Whatever I choose, this internship has given me real confidence.',
        translation:
          '我剛結束在一家小型設計公司兩個月的實習,學到的比我預期的還多。第一天我就犯了一個嚴重的錯誤:我把錯的檔案寄給客戶,' +
          '主管只好打電話去解釋。我覺得很尷尬,但她沒有對我大吼,而是教我怎麼檢查自己的工作。' +
          '從那之後,我寄出每一封電子郵件前一定會讀兩遍。我的溝通能力也進步了。七月時我第一次向整個團隊報告我的想法。' +
          '我的聲音在發抖,但大家都在聽。公司提供我一份兼職工作,但我還沒決定。不管我怎麼選,這次實習給了我真正的自信。',
      },
      glossary: [
        term('expected', '預期'),
        term('serious', '嚴重的'),
        term('client', '客戶'),
        term('file', '檔案'),
        term('shout', '大吼'),
        term('communication skills', '溝通能力'),
        term('presented', '報告;發表'),
        term('part-time', '兼職的'),
      ],
      listening: {
        questions: [
          mcq(
            'What has the writer just finished?',
            ['A university degree', 'A two-month internship', 'A design competition', 'A language course'],
            1,
            'The first sentence says “a two-month internship.” (剛結束兩個月的實習。)',
          ),
          mcq(
            'How does the writer feel about the experience overall?',
            ['It was a waste of time.', 'It was too stressful.', 'It gave the writer real confidence.', 'It was boring.'],
            2,
            'The last sentence says the internship has given the writer real confidence. (實習帶來自信。)',
          ),
        ],
        dictation: ['On my first day, I made a serious mistake.', 'I have also improved my communication skills.'],
      },
      reading: {
        questions: [
          mcq(
            'What mistake did the writer make?',
            ['Arrived late on the first day', 'Forgot a meeting', 'Broke a computer', 'Sent a client the wrong file'],
            3,
            '“I sent a client the wrong file.” (把錯的檔案寄給客戶。)',
          ),
          mcq(
            'How did the supervisor react?',
            ['She showed the writer how to check the work.', 'She shouted at the writer.', 'She fired the writer.', 'She ignored the problem.'],
            0,
            'She didn’t shout; she showed the writer how to check the work. (她沒有罵人,而是教作者檢查。)',
          ),
          mcq(
            'What has the writer NOT done yet?',
            ['Finished the internship', 'Presented ideas to the team', 'Decided about the part-time job', 'Improved communication skills'],
            2,
            '“I haven’t decided yet.” (還沒決定要不要接兼職。)',
          ),
        ],
      },
      vocab: [
        vocab(
          'internship',
          'n.',
          '實習',
          'Her internship starts in June.',
          cloze('Many students do an ___ during the summer to get work experience.', 'internship', '實習 (starts with i)', 'An internship is a short period of work for experience. (為了取得經驗的短期工作。)'),
        ),
        vocab('supervisor', 'n.', '主管', 'The supervisor checks our reports.', cloze('Ask your ___ before you leave the office early.', 'supervisor', '主管 (starts with s)', 'A supervisor is the person in charge of your work. (負責管理你工作的人。)')),
        vocab('embarrassed', 'adj.', '尷尬的', 'He looked embarrassed after the joke.', cloze('I felt ___ when I forgot my teacher’s name.', 'embarrassed', '尷尬的 (starts with e)', 'You feel embarrassed when you make a mistake in front of others. (在別人面前出錯會尷尬。)')),
        vocab('improve', 'v.', '改善;進步', 'Exercise can improve your sleep.', cloze('Reading every day will ___ your English.', 'improve', '進步 (starts with i)', 'After will use the base form improve. (will 後面接原形動詞。)')),
        vocab('confidence', 'n.', '自信', 'She answered with confidence.', cloze('Practice gives you the ___ to speak in public.', 'confidence', '自信 (starts with c)', 'After “the” we need the noun confidence, not the adjective confident. (the 後面接名詞。)')),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: ['I have just finished a two-month internship.', 'I have never sent an email without reading it twice.', 'In July I presented my ideas to the whole team.'],
        mcq: [
          mcq(
            'On my first day, I ___ a serious mistake.',
            ['made', 'have made', 'make', 'has made'],
            0,
            '“On my first day” is a finished past time, so use the past simple. (有明確過去時間,用過去簡單式。)',
          ),
          mcq(
            'The company ___ me a part-time job, but I haven’t decided yet.',
            ['offer', 'has offered', 'have offered', 'offering'],
            1,
            'The offer is still open now, so use the present perfect; “the company” takes has. (到現在仍有效,用 has offered。)',
          ),
        ],
        cloze: [cloze('I haven’t ___ yet. (decide)', 'decided', 'past participle of decide', 'After haven’t we use the past participle: decided. (haven’t 後面接過去分詞。)')],
        reorder: [reorder('This internship has given me real confidence.', '這次實習給了我真正的自信。', 'has + past participle given, then the two objects. (has 後面接過去分詞 given。)')],
      },
      speaking: {
        readAloud: ['I felt embarrassed, but she didn’t shout at me.', 'Since then, I have never sent an email without reading it twice.', 'My voice shook, yet everyone listened.'],
        scenario: 'You have just finished an internship, and your teacher asks what you have learned. (你剛結束實習,老師想知道你學到了什麼。)',
        opening: 'Hi! Have you ever done an internship or a part-time job? What did you learn?',
      },
      writing: {
        prompt:
          'Describe a work, internship or volunteer experience. What happened, and what have you learned from it? ' +
          '(描述一次工作、實習或志工的經驗,以及你學到了什麼。)',
        minWords: 70,
        tips: [
          'Use the past simple to tell what happened. (用過去式說明發生的事。)',
          'Use the present perfect for what you have learned. (用現在完成式說你學到了什麼。)',
          'Include one mistake and how you fixed it. (寫一個錯誤以及你怎麼改正。)',
        ],
      },
    },
  },
};
