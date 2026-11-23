import type { PlacementTest } from '../../shared/placement.ts';
import { mcq } from '../starters/build.ts';

/** 內建的分級測驗:第一次測驗時使用,不需要等 AI 出題。 */
export const BUILTIN_PLACEMENT_TEST: PlacementTest = {
  bands: [
    {
      level: 'A1',
      vocab: [
        mcq('I am hungry. I want to ___ an apple.', ['drink', 'eat', 'read', 'wear'], 1, '肚子餓了想「吃」蘋果,所以用 eat。'),
        mcq('A ___ has seven days.', ['day', 'month', 'year', 'week'], 3, '一個星期(week)有七天。'),
      ],
      grammar: [
        mcq('My brother and I ___ students.', ['am', 'is', 'are', 'be'], 2, 'My brother and I 是兩個人(複數),be 動詞用 are。'),
        mcq('She ___ to school by bus every day.', ['goes', 'go', 'going', 'to go'], 0, '主詞 She 是第三人稱單數,現在簡單式的 go 要變成 goes。'),
        mcq('This is my sister. ___ name is Amy.', ['She', 'His', 'Hers', 'Her'], 3, 'sister 是女生,「她的」名字要用 Her。'),
      ],
      reading: {
        passage:
          'Tom is nine years old. He has a small dog. Its name is Coco. Coco is brown and white. ' +
          'Every morning, Tom and Coco walk in the park. Coco likes to run after balls. Tom loves his dog very much.',
        questions: [
          mcq('Where do Tom and Coco walk every morning?', ['At school', 'On the beach', 'In the park', 'In the house'], 2, '文中說 Tom and Coco walk in the park。'),
          mcq('What does Coco like to do?', ['Run after balls', 'Sleep on the bed', 'Swim in the lake', 'Eat apples'], 0, '文中說 Coco likes to run after balls。'),
        ],
      },
      listening: {
        script: 'Hello, my name is Anna. I am ten years old. I have two brothers and one sister.',
        questions: [mcq('How many brothers does Anna have?', ['One', 'Two', 'Three', 'Ten'], 1, 'Anna 說 I have two brothers,所以是兩個。')],
      },
    },
    {
      level: 'A2',
      vocab: [
        mcq('This jacket is too ___. I don’t have enough money to buy it.', ['expensive', 'cheap', 'heavy', 'dirty'], 0, '錢不夠買,表示這件外套太「貴」,用 expensive。'),
        mcq('Can I ___ your pen? I left mine at home.', ['lend', 'sell', 'borrow', 'send'], 2, '向別人「借來」用是 borrow;lend 是把東西借給別人。'),
      ],
      grammar: [
        mcq(
          'I ___ my homework last night because I was very tired.',
          ['don’t do', 'didn’t do', 'didn’t did', 'wasn’t do'],
          1,
          'last night 是過去的時間,過去式的否定用 didn’t + 原形動詞。',
        ),
        mcq('My new school is ___ than my old one.', ['big', 'biggest', 'more big', 'bigger'], 3, '後面有 than,要用比較級 bigger。'),
        mcq('How ___ milk do we need for the cake?', ['much', 'many', 'some', 'any'], 0, 'milk 是不可數名詞,問數量要用 How much。'),
      ],
      reading: {
        passage:
          'Last weekend, Mia and her dad went camping near a lake. On Saturday morning, they put up their tent and then went fishing. ' +
          'Mia caught two small fish, but her dad didn’t catch any. In the evening it started to rain, so they ate dinner inside the tent. ' +
          'Mia was a little cold that night, but she wants to go camping again next month.',
        questions: [
          mcq('Who caught fish?', ['Both Mia and her dad', 'Only Mia’s dad', 'Nobody', 'Only Mia'], 3, '文中說 Mia 釣到兩條小魚,但爸爸一條也沒釣到。'),
          mcq(
            'Why did they eat dinner inside the tent?',
            ['It was too cold outside.', 'It started to rain.', 'They were very tired.', 'The lake was too far away.'],
            1,
            '文中說 it started to rain, so they ate dinner inside the tent。',
          ),
        ],
      },
      listening: {
        script: 'Hi Ben, it’s Lucy. I’m sorry, but I won’t be at your party on Saturday. I have to visit my grandmother that day. Have a great time!',
        questions: [
          mcq(
            'What is Lucy going to do on Saturday?',
            ['Go to Ben’s party', 'Stay home and study', 'Visit her grandmother', 'Have a party at her house'],
            2,
            'Lucy 說她星期六要去看祖母,所以不能去派對。',
          ),
        ],
      },
    },
    {
      level: 'B1',
      vocab: [
        mcq(
          'I was ___ with the hotel. The room was dirty and the bed was uncomfortable.',
          ['pleased', 'bored', 'impressed', 'disappointed'],
          3,
          '房間很髒、床也不舒服,所以對旅館感到「失望」(disappointed)。',
        ),
        mcq(
          'My grandmother has a lot of ___ with children. She was a teacher for thirty years.',
          ['excitement', 'experience', 'exercise', 'education'],
          1,
          '當了三十年老師,表示她和孩子相處很有「經驗」(experience)。',
        ),
      ],
      grammar: [
        mcq(
          'I ___ in this town since I was five years old.',
          ['live', 'lived', 'have lived', 'am living'],
          2,
          'since 表示從過去一直持續到現在,要用現在完成式 have lived。',
        ),
        mcq(
          'If I ___ more free time, I would learn to play the guitar.',
          ['had', 'have', 'will have', 'would have'],
          0,
          '和現在事實相反的假設(第二類條件句),if 子句用過去式 had。',
        ),
        mcq(
          'This bridge ___ more than a hundred years ago.',
          ['built', 'was built', 'has built', 'was building'],
          1,
          '橋是「被建造」的,而且發生在過去,要用過去式的被動 was built。',
        ),
      ],
      reading: {
        passage:
          'When Daniel moved to a new city for work, he didn’t know anyone. At first, he spent his evenings alone, watching videos in his small apartment. ' +
          'One day, he saw a poster for a free running club that met in the park every Tuesday. He had never liked running, but he decided to try it anyway. ' +
          'The first few weeks were hard, and his legs hurt after every run. However, the other runners were friendly and always waited for him. ' +
          'Now Daniel never misses a Tuesday, and two of the runners have become his closest friends.',
        questions: [
          mcq(
            'How did Daniel find out about the running club?',
            ['He saw a poster.', 'A coworker told him about it.', 'He read about it online.', 'A neighbor invited him.'],
            0,
            '文中說 he saw a poster for a free running club。',
          ),
          mcq(
            'Why did Daniel most likely decide to try the running club?',
            ['He had always enjoyed running.', 'He wanted to win races.', 'His doctor told him to exercise.', 'He wanted to meet new people.'],
            3,
            '他在新城市誰也不認識、晚上都一個人過,而且本來並不喜歡跑步,可以推論他是想認識新朋友。',
          ),
        ],
      },
      listening: {
        script:
          'Attention, players. Because of the heavy rain, this afternoon’s soccer practice won’t be on the field. ' +
          'We’ll meet in the gym instead, at four o’clock as usual. Please bring indoor shoes. And remember, Saturday’s game has not been canceled.',
        questions: [
          mcq(
            'What is different about today’s soccer practice?',
            ['It has been canceled.', 'It will start later than usual.', 'It will be in a different place.', 'It has been moved to Saturday.'],
            2,
            '因為下大雨,練習從球場改到體育館(in the gym instead);時間照舊,也沒有取消。',
          ),
        ],
      },
    },
    {
      level: 'B2',
      vocab: [
        mcq(
          'She was ___ to lend him the money because he had never paid back his previous loans.',
          ['eager', 'ashamed', 'reluctant', 'delighted'],
          2,
          'He had never repaid earlier loans, so she was unwilling (“reluctant”) to lend him more.',
        ),
        mcq(
          'The company had to ___ the project when it ran out of money.',
          ['abandon', 'launch', 'expand', 'promote'],
          0,
          'With no money left, the company had to give the project up, which is what “abandon” means.',
        ),
      ],
      grammar: [
        mcq(
          'We missed the train by one minute. If we had left ten minutes earlier, we ___ it.',
          ['would catch', 'would have caught', 'had caught', 'will have caught'],
          1,
          'The third conditional describes an unreal past: “if” + past perfect, then “would have” + past participle.',
        ),
        mcq(
          'The streets are completely wet this morning. It ___ during the night.',
          ['must rain', 'can’t have rained', 'should rain', 'must have rained'],
          3,
          '“Must have” + past participle expresses a confident deduction about the past from present evidence.',
        ),
        mcq(
          '___ the long delay at the airport, we still arrived in time for dinner.',
          ['Despite', 'Although', 'However', 'Even though'],
          0,
          '“Despite” is followed by a noun phrase, whereas “although” and “even though” need a full clause.',
        ),
      ],
      reading: {
        passage:
          'For decades, open offices were promoted as the best way to encourage teamwork. Without walls, the theory went, employees would talk more and share ideas freely. ' +
          'Recent studies, however, suggest the opposite. When one company removed the walls between desks, face-to-face conversations actually dropped, ' +
          'while the number of emails rose sharply. Researchers believe that workers who feel constantly watched protect their privacy in other ways: ' +
          'they put on headphones, avoid eye contact, and choose to send messages rather than speak. Open offices do save money, since more people fit into less space. ' +
          'But companies that choose them hoping for livelier discussion may end up with a room full of people working silently side by side.',
        questions: [
          mcq(
            'According to the passage, what happened when one company removed the walls between desks?',
            [
              'Employees began sharing more ideas during meetings.',
              'Employees wore headphones and stopped sending emails.',
              'Employees talked in person less and emailed more.',
              'Employees asked for permission to work from home.',
            ],
            2,
            'The passage says face-to-face conversations dropped while the number of emails rose sharply.',
          ),
          mcq(
            'Which statement would the writer most likely agree with?',
            [
              'Open offices are often a poor choice for companies trying to cut costs.',
              'Walls between desks tend to make it harder for employees to share ideas.',
              'Employees who feel watched tend to concentrate better on their work.',
              'An office designed to encourage conversation can end up reducing it.',
            ],
            3,
            'Open offices were meant to make people talk more, yet removing the walls reduced face-to-face conversation.',
          ),
        ],
      },
      listening: {
        script:
          'Before we finish, a quick word about next week’s field trip. I know many of you were hoping to visit the science museum, ' +
          'but it’s closed for repairs until spring. So instead, we’ll be going to the botanical garden. ' +
          'It may not sound as exciting, but trust me, the tropical greenhouse alone is worth the trip.',
        questions: [
          mcq(
            'What does the speaker think about the visit to the botanical garden?',
            [
              'It is a disappointing replacement for the museum.',
              'It will be more enjoyable than it sounds.',
              'It should be postponed until the spring.',
              'It is too far away to be worth the trip.',
            ],
            1,
            'The speaker admits it may not sound as exciting but insists that the greenhouse alone is worth the trip.',
          ),
        ],
      },
    },
    {
      level: 'C1',
      vocab: [
        mcq(
          'Her research is known for its ___ attention to detail; every figure is checked three times.',
          ['meticulous', 'superficial', 'sporadic', 'arbitrary'],
          0,
          'Checking every figure three times shows extremely careful and precise work, which is what “meticulous” means.',
        ),
        mcq(
          'Constant criticism from her manager gradually ___ her confidence.',
          ['bolstered', 'compiled', 'undermined', 'overlooked'],
          2,
          'Repeated criticism wears confidence down; to “undermine” something is to weaken it little by little.',
        ),
      ],
      grammar: [
        mcq(
          'Not until the results were published ___ how serious the problem was.',
          ['we realized', 'we did realize', 'realized we', 'did we realize'],
          3,
          'A fronted negative adverbial such as “not until …” requires subject–auxiliary inversion in the main clause.',
        ),
        mcq(
          'It was only after the funding ran out ___ the team admitted its mistake.',
          ['when', 'that', 'then', 'which'],
          1,
          'An “it” cleft that emphasizes a time expression (“it was only after …”) is completed with “that,” not “when.”',
        ),
        mcq(
          '___ twice by the same trick, he was determined not to fall for it again.',
          ['Having fooled', 'Fooling', 'Having been fooled', 'To be fooled'],
          2,
          'He was the one deceived, and earlier, so the clause needs the perfect passive participle “having been fooled.”',
        ),
      ],
      reading: {
        passage:
          'Ask people how long a task will take, and they will almost always underestimate it. Psychologists call this the planning fallacy, ' +
          'and it is remarkably resistant to experience: someone who has missed a dozen deadlines will confidently predict meeting the thirteenth. ' +
          'The explanation seems to lie in how we imagine the future. When planning, we picture a single smooth scenario in which each step follows the last ' +
          'without interruption, and we overlook the countless small obstacles—an illness, a lost file, an unexpected request—that are individually unlikely ' +
          'but collectively almost certain. Curiously, the bias weakens when we judge other people’s projects, perhaps because we see them from the outside, ' +
          'as one case among many rather than as a story we are telling about ourselves. The most reliable remedy is therefore not greater determination ' +
          'but a simple question: how long did similar tasks take in the past?',
        questions: [
          mcq(
            'According to the passage, why do people underestimate how long a task will take?',
            [
              'They want to impress other people by promising early deadlines.',
              'They picture an ideal scenario and forget that something will go wrong.',
              'They have too little experience with similar tasks to judge them well.',
              'They pay more attention to other people’s projects than to their own.',
            ],
            1,
            'The passage says we picture “a single smooth scenario” and overlook the small obstacles that are collectively almost certain.',
          ),
          mcq(
            'Which person is following the writer’s advice?',
            [
              'A designer who plans every step of her project in great detail.',
              'A student who promises himself that he will work harder this time.',
              'A writer who feels sure this book will go faster than the last one.',
              'A builder who looks up how long his last few jobs actually took.',
            ],
            3,
            'The writer’s remedy is to ask how long similar tasks took in the past, not to imagine the plan more vividly or to try harder.',
          ),
        ],
      },
      listening: {
        script:
          'I’d like to push back a little on the idea that technology is making us more forgetful. True, few of us memorize phone numbers anymore. ' +
          'But memory has never been just about storing facts; it’s about knowing where to find them. People once feared that writing would ruin our memories, ' +
          'and later said the same about printed books. So perhaps what we’re seeing isn’t decline at all, but simply another change in what we choose to remember.',
        questions: [
          mcq(
            'What is the speaker’s main point?',
            [
              'Technology is changing what we remember rather than weakening our memory.',
              'People should try harder to memorize facts such as phone numbers.',
              'Writing and printed books did more harm to memory than modern technology.',
              'Technology has weakened our memory, but its benefits outweigh the cost.',
            ],
            0,
            'The speaker rejects the idea of decline and concludes that this is “another change in what we choose to remember.”',
          ),
        ],
      },
    },
    {
      level: 'C2',
      vocab: [
        mcq(
          'He gave the contract only a ___ glance before signing it, and so missed the error on the first page.',
          ['thorough', 'cursory', 'piercing', 'lingering'],
          1,
          'A “cursory” glance is hasty and superficial, which explains how he missed an obvious error.',
        ),
        mcq(
          'After weeks of resisting, her parents finally ___ to her request and let her keep the stray kitten.',
          ['objected', 'aspired', 'alluded', 'acquiesced'],
          3,
          'To “acquiesce” is to accept something reluctantly, which fits giving in after weeks of resistance.',
        ),
      ],
      grammar: [
        mcq(
          '___ as she might, she could not persuade the committee to reconsider its decision.',
          ['Try', 'Tried', 'Trying', 'To try'],
          0,
          'This concessive pattern fronts the bare infinitive: “Try as she might” means “however hard she tried.”',
        ),
        mcq(
          'You ___ at least have warned me that the meeting was canceled; I drove all the way there for nothing.',
          ['must', 'may', 'might', 'can'],
          2,
          '“Might at least have” + past participle expresses reproach for something that was not done; the other modals cannot.',
        ),
        mcq(
          'Critics complain that the design is old-fashioned. ___, it remains the company’s best-selling model.',
          ['By the same token', 'As it were', 'If anything', 'Be that as it may'],
          3,
          '“Be that as it may” concedes the previous point while introducing a fact that matters more.',
        ),
      ],
      reading: {
        passage:
          'It is a commonplace of management that what gets measured gets managed; less often remarked is that what gets measured also gets distorted. ' +
          'A hospital judged by its wait times may quietly redefine when the wait begins. A school ranked by test scores may steer weaker students away ' +
          'from demanding courses. In neither case has anyone lied, exactly; the numbers are accurate, and that is precisely the problem. ' +
          'An indicator earns our trust because it once reflected, without anyone trying, the thing we cared about. The moment rewards are attached to it, ' +
          'people begin to pursue the indicator rather than the thing, and the two drift apart. None of this is an argument for abandoning measurement, ' +
          'as some weary professionals would like. It is an argument for humility: for treating figures as evidence to be questioned rather than verdicts ' +
          'to be obeyed, and for remembering that a number everyone is striving to improve has, by that very striving, become harder to believe.',
        questions: [
          mcq(
            'What does the writer mean by “that is precisely the problem”?',
            [
              'The figures are too detailed for most managers to interpret.',
              'Collecting accurate figures costs more than the information is worth.',
              'Figures can be correct yet no longer reflect what really matters.',
              'Accurate figures leave institutions with no excuse for poor performance.',
            ],
            2,
            'Both examples involve accurate numbers that have drifted away from the quality they were supposed to indicate.',
          ),
          mcq(
            'Which response to a sudden rise in a school’s test scores would the writer most likely recommend?',
            [
              'Asking how the rise was achieved before taking it at face value.',
              'Checking that the scores were recorded correctly, then trusting them.',
              'Accepting the scores, since such figures are difficult to falsify.',
              'Abandoning test scores as a measure of how well schools perform.',
            ],
            0,
            'The writer wants figures treated as “evidence to be questioned,” neither obeyed blindly nor abandoned.',
          ),
        ],
      },
      listening: {
        script:
          'Now, I’m told this building won an award when it opened, and I can easily believe it. The judges, after all, didn’t have to work here. ' +
          'They never sat through a winter beside those magnificent glass walls, or hunted for a meeting room that didn’t echo. ' +
          'I don’t doubt it photographs beautifully. But a building, to my mind, is a little like a pair of shoes: admire it all you like, ' +
          'the real test is whether you can stand to spend the day in it.',
        questions: [
          mcq(
            'What is the speaker’s opinion of the building?',
            [
              'It fully deserved the award it won.',
              'It looks impressive but is unpleasant to work in.',
              'It is practical to work in but unattractive to look at.',
              'It was better when it first opened than it is now.',
            ],
            1,
            'The speaker ironically grants that it photographs beautifully while complaining about the cold glass walls and echoing rooms.',
          ),
        ],
      },
    },
  ],
};
