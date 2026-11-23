import type { Stage } from '../../shared/schema.ts';
import { cloze, mcq, reorder, term, vocab } from './build.ts';
import type { StarterLesson } from './types.ts';

// C1 的起始課。文法重點:否定副詞開頭的倒裝。課文 224–280 字,全英文。

const GRAMMAR_POINT = 'inversion after negative adverbials';
const POINT_NAME = 'Inversion after negative adverbials';
const EXPLANATION =
  'When a negative or limiting adverbial begins a sentence, the auxiliary verb moves in front of the subject, as it does in a question: ' +
  '“Never had I seen such a place.” “Not only did it rain, but the tent also leaked.” “Hardly had we arrived when the storm began.” ' +
  'If the sentence has no auxiliary, add do, does or did: “Seldom does he complain.” ' +
  'After only when, only after and not until followed by a clause, the inversion happens in the main clause: “Only when the rain stopped did we leave.” ' +
  'The structure is formal and emphatic. It suits writing and storytelling; in everyday conversation it can sound theatrical if overused.';

export const C1: Record<Stage, StarterLesson> = {
  elementary: {
    topic: 'at the zoo',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Elephant Who Changed My Mind',
      intro:
        'Hello, I’m Emma. Today’s passage is about a zoo visit that turned out to be more than a fun afternoon. ' +
        'We’ll study five words about animals and their protection, and then look at inversion, a way of adding emphasis by changing word order.',
      passage: {
        text:
          'I had anticipated a pleasant but ordinary afternoon at the zoo. Like most children, I wanted to see the lions, eat ice cream, and go home. ' +
          'Little did I know that one animal would change the way I thought about all of them. ' +
          'Near the back of the zoo was a large enclosure with a single elephant named Mali. ' +
          'A keeper explained that Mali had been rescued from a circus, where she had spent twenty years performing tricks in chains. ' +
          'Never had I imagined that an animal could look so tired and so gentle at the same time. ' +
          'Not only did she walk with a limp, but she also swayed from side to side, a habit left over from her years in a small cage. ' +
          'The keeper told us that the zoo’s real work was conservation: it bred endangered species and returned some of them to the wild. ' +
          'Only then did I understand that a zoo could be more than a place for entertainment. ' +
          'On the way out, I didn’t ask for ice cream. Instead, I spent my allowance on a small card that helped pay for Mali’s food. ' +
          'Rarely have I felt so proud of spending so little. I still have that card on my desk. ' +
          'Whenever I look at it, I remember Mali’s slow, patient eyes, and I remind myself that caring about animals begins with paying attention to them.',
        translation: '',
      },
      glossary: [
        term('keeper', 'a person whose job is to look after animals in a zoo'),
        term('circus', 'a traveling show with performers and, in the past, trained animals'),
        term('chains', 'lines of metal rings joined together, used to stop something from moving freely'),
        term('limp', 'an uneven way of walking caused by an injured leg'),
        term('swayed', 'moved slowly from side to side'),
        term('bred', 'kept animals so that they would produce young'),
        term('species', 'a group of animals or plants of the same kind'),
        term('allowance', 'money that parents give a child regularly'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'Why circuses should be more popular',
              'How to become a zookeeper',
              'A zoo visit that changed how the writer saw animals',
              'The best animals to see at a zoo',
            ],
            2,
            'The writer expected an ordinary afternoon but left with a new understanding of animals and of what zoos are for.',
          ),
          mcq(
            'How did the writer feel at the end of the visit?',
            ['Proud of having helped in a small way', 'Disappointed about the ice cream', 'Afraid of the elephant', 'Bored by the keeper’s talk'],
            0,
            '“Rarely have I felt so proud of spending so little” shows quiet pride in the small donation.',
          ),
        ],
        dictation: ['On the way out, I didn’t ask for ice cream.', 'I still have that card on my desk.'],
      },
      reading: {
        questions: [
          mcq(
            'Why did Mali sway from side to side?',
            ['She was hungry.', 'She was greeting the visitors.', 'She was trying to escape.', 'It was a habit from her years in a small cage.'],
            3,
            'The passage calls the swaying “a habit left over from her years in a small cage.”',
          ),
          mcq(
            'According to the keeper, what is the zoo’s real work?',
            [
              'Entertaining families',
              'Breeding endangered species and returning some to the wild',
              'Training animals to perform',
              'Selling cards and ice cream',
            ],
            1,
            'The keeper says the real work is conservation: breeding endangered species and returning some of them to the wild.',
          ),
          mcq(
            'What does “Rarely have I felt so proud of spending so little” suggest?',
            [
              'A small act felt deeply meaningful.',
              'The card was overpriced.',
              'The writer regretted the purchase.',
              'The writer usually spends a lot.',
            ],
            0,
            'The contrast between “so proud” and “so little” shows that the value of the act had nothing to do with its cost.',
          ),
        ],
      },
      vocab: [
        vocab(
          'anticipate',
          'v.',
          'to expect something and prepare for it',
          'Organizers anticipate a large crowd.',
          cloze('We did not ___ such heavy traffic, so we arrived an hour late.', 'anticipate', 'a verb starting with a', 'After “did not” we use the base form: anticipate.'),
        ),
        vocab(
          'enclosure',
          'n.',
          'an area surrounded by a fence or wall, especially one where animals are kept',
          'The pandas have a new enclosure.',
          cloze('The monkeys escaped when someone left the gate of their ___ open.', 'enclosure', 'a noun starting with e', 'A fenced area for zoo animals is an enclosure.'),
        ),
        vocab(
          'rescue',
          'v.',
          'to save someone or something from danger or harm',
          'Volunteers rescue stray dogs every week.',
          cloze('Firefighters ___ three people from the burning building last night.', 'rescued', 'a verb starting with r, in the past form', '“Last night” places the action in the past: rescued.'),
        ),
        vocab(
          'conservation',
          'n.',
          'the protection of animals, plants and natural areas',
          'The fund supports forest conservation.',
          cloze('The government spends millions on the ___ of forests and rivers.', 'conservation', 'a noun starting with c', 'Protecting natural areas such as forests and rivers is conservation.'),
        ),
        vocab(
          'endangered',
          'adj.',
          'at risk of disappearing from the world completely',
          'The Formosan black bear is endangered.',
          cloze('Illegal hunting has made the rhino an ___ species.', 'endangered', 'an adjective starting with e', 'An animal that may die out is an endangered species.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Never had I imagined that an animal could look so tired and so gentle at the same time.',
          'Not only did she walk with a limp, but she also swayed from side to side.',
          'Only then did I understand that a zoo could be more than a place for entertainment.',
        ],
        mcq: [
          mcq(
            'Never before ___ an elephant up close.',
            ['I had seen', 'had I seen', 'I saw', 'did I saw'],
            1,
            'After the negative adverbial never before, the auxiliary had comes in front of the subject I.',
          ),
          mcq(
            'Not only ___ injured animals, but it also teaches visitors about them.',
            ['the zoo protects', 'protects the zoo', 'does the zoo protect', 'the zoo does protect'],
            2,
            'Protects has no auxiliary, so we add does in front of the subject and use the base form protect.',
          ),
        ],
        cloze: [
          cloze(
            'Seldom ___ a single afternoon taught me so much.',
            ['has', 'had'],
            'an auxiliary verb for a perfect tense',
            'Taught is a past participle, so the auxiliary has (or had) moves in front of the subject a single afternoon.',
          ),
        ],
        reorder: [reorder('Rarely have I felt so proud.', 'I have almost never felt this proud.', 'Rarely comes first, so have moves in front of the subject I.')],
      },
      speaking: {
        readAloud: [
          'Little did I know that one animal would change the way I thought about all of them.',
          'Never had I imagined that an animal could look so tired and so gentle at the same time.',
          'Only then did I understand that a zoo could be more than a place for entertainment.',
        ],
        scenario: 'Your teacher wants to hear your views on whether zoos help animals or harm them.',
        opening: 'Do you think zoos are good for animals, or would animals be better off without them?',
      },
      writing: {
        prompt:
          'Are zoos necessary? Present your view, drawing on a visit you remember or something you have read, and respond to one argument from the other side. ' +
          'Use at least two sentences with inversion, beginning with expressions such as Never, Not only or Only then.',
        minWords: 180,
        tips: [
          'State your position in the opening paragraph.',
          'Give one concrete example and explain what it shows.',
          'Answer the strongest objection before you conclude.',
        ],
      },
    },
  },

  junior: {
    topic: 'a school trip',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Trip That Went Wrong',
      intro:
        'Hello, I’m Emma. Today we’ll read about a class trip where almost nothing went according to plan. ' +
        'We’ll learn five vivid words for describing trouble, and then practice inversion, which writers use to make a story more dramatic.',
      passage: {
        text:
          'Our class trip to the mountains was supposed to be the highlight of the year. ' +
          'Our teacher had planned every detail: a morning hike, a barbecue by the lake, and a night under the stars. ' +
          'Hardly had we left the bus when the first drops of rain began to fall. ' +
          'By noon the path had turned into a stream, and the barbecue was abandoned before a single sausage had been cooked. ' +
          'Then came worse news. The road down the mountain was blocked by a fallen tree, so we were stranded until morning. ' +
          'Under no circumstances, our teacher announced, was anyone to leave the campsite. ' +
          'With only one large tent still dry, all twenty-eight of us squeezed into it for shelter. ' +
          'It should have been miserable. Instead, it was ridiculous. ' +
          'Someone began telling ghost stories, someone else produced a bag of slightly wet cookies, ' +
          'and our strict math teacher turned out to know an astonishing number of card tricks. ' +
          'Not until midnight did the laughter finally die down. Never before had our class felt so close. ' +
          'Looking back, I doubt we would remember a perfect trip half as well. ' +
          'Not only did that chaotic night give us a story to tell, but it also taught us that plans matter far less than the people you are with. ' +
          'Seldom do I pass a campsite now without smiling.',
        translation: '',
      },
      glossary: [
        term('highlight', 'the best or most exciting part of something'),
        term('hike', 'a long walk in the countryside or the mountains'),
        term('barbecue', 'an outdoor meal at which food is cooked over a fire'),
        term('stream', 'a small, narrow river'),
        term('campsite', 'a place where people stay in tents'),
        term('squeezed', 'pushed into a space that is too small'),
        term('miserable', 'very unhappy or uncomfortable'),
        term('astonishing', 'very surprising'),
      ],
      listening: {
        questions: [
          mcq(
            'What happened on the trip?',
            [
              'Bad weather ruined the plans, but the class had a memorable night.',
              'The class enjoyed perfect weather.',
              'The trip was canceled before it began.',
              'The students got lost on a hike.',
            ],
            0,
            'Rain spoiled the hike and the barbecue, yet the night in the tent brought the class closer together.',
          ),
          mcq(
            'What lesson does the writer draw from the experience?',
            [
              'Mountains are dangerous.',
              'Teachers should plan more carefully.',
              'Camping is not worth the trouble.',
              'The people you are with matter more than the plan.',
            ],
            3,
            'The night taught them “that plans matter far less than the people you are with.”',
          ),
        ],
        dictation: ['It should have been miserable.', 'Never before had our class felt so close.'],
      },
      reading: {
        questions: [
          mcq(
            'Why couldn’t the class go home that day?',
            ['The bus had broken down.', 'The teacher was ill.', 'A fallen tree had blocked the road.', 'The lake had flooded the campsite.'],
            2,
            'The road down the mountain “was blocked by a fallen tree.”',
          ),
          mcq(
            'What surprised the students about their math teacher?',
            ['He was afraid of ghost stories.', 'He knew a great many card tricks.', 'He had forgotten the food.', 'He wanted to walk home.'],
            1,
            'The strict math teacher “turned out to know an astonishing number of card tricks.”',
          ),
          mcq(
            'What does the writer mean by “I doubt we would remember a perfect trip half as well”?',
            [
              'The writer has a poor memory.',
              'Perfect trips are impossible.',
              'The class has forgotten most of the trip.',
              'The problems are exactly what made the trip unforgettable.',
            ],
            3,
            'A trip without trouble would have left a much weaker impression than this chaotic night did.',
          ),
        ],
      },
      vocab: [
        vocab(
          'stranded',
          'adj.',
          'unable to leave a place because of a problem such as bad weather',
          'The storm left hundreds of passengers stranded.',
          cloze('When the last ferry was canceled, we were ___ on the island overnight.', 'stranded', 'an adjective starting with s', 'With no ferry, there was no way to leave: they were stranded.'),
        ),
        vocab(
          'circumstance',
          'n.',
          'a fact or condition that affects a situation',
          'Each family’s circumstances are different.',
          cloze('Under no ___ should you open this door during the experiment.', ['circumstances', 'circumstance'], 'a noun starting with c, usually plural here', '“Under no circumstances” is a fixed phrase meaning “never, whatever happens.”'),
        ),
        vocab(
          'shelter',
          'n.',
          'protection from bad weather or danger, or a place that gives it',
          'The hikers took shelter in a cave.',
          cloze('When the hail started, we ran to a bus stop for ___.', 'shelter', 'a noun starting with s', 'A covered bus stop gives protection from hail, which is shelter.'),
        ),
        vocab(
          'ridiculous',
          'adj.',
          'so silly or unreasonable that it makes you laugh',
          'He wore a ridiculous hat to the party.',
          cloze('It is ___ to pay that much for a bottle of water.', 'ridiculous', 'an adjective starting with r', 'A price that is absurdly high can be called ridiculous.'),
        ),
        vocab(
          'chaotic',
          'adj.',
          'completely confused and without order',
          'Traffic is chaotic during the festival.',
          cloze('After the power failure, the roads were ___, with cars and people moving in every direction.', 'chaotic', 'an adjective starting with c', 'Cars and people moving everywhere means there was no order at all.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Hardly had we left the bus when the first drops of rain began to fall.',
          'Not until midnight did the laughter finally die down.',
          'Never before had our class felt so close.',
        ],
        mcq: [
          mcq(
            'Hardly ___ our tents when the wind blew two of them over.',
            ['we had put up', 'had we put up', 'we put up', 'did we had put up'],
            1,
            'Hardly… when takes the past perfect with inversion: had comes in front of the subject we.',
          ),
          mcq(
            'Not until the next morning ___ the road.',
            ['workers cleared', 'workers did clear', 'did workers clear', 'cleared workers'],
            2,
            'After not until + time, we add did in front of the subject and keep the base form clear.',
          ),
        ],
        cloze: [
          cloze(
            'Under no circumstances ___ anyone to leave the campsite.',
            ['was', 'is'],
            'a form of be',
            'After under no circumstances, the verb be comes before the subject: was anyone to leave.',
          ),
        ],
        reorder: [reorder('Seldom do I pass a campsite without smiling.', 'I almost always smile when I pass a campsite.', 'Seldom comes first, so we add do before the subject I.')],
      },
      speaking: {
        readAloud: [
          'Hardly had we left the bus when the first drops of rain began to fall.',
          'With only one large tent still dry, all twenty-eight of us squeezed into it for shelter.',
          'Not until midnight did the laughter finally die down.',
        ],
        scenario: 'Your teacher is collecting stories about trips where something unexpected happened.',
        opening: 'Have you ever been on a trip where things went wrong? What happened?',
      },
      writing: {
        prompt:
          'Tell the story of a trip or outing that did not go as planned, and reflect on what you took away from it. ' +
          'Use at least two sentences with inversion, for example with Hardly… when, Never before or Not until.',
        minWords: 180,
        tips: [
          'Describe the plan briefly, then show the moment it fell apart.',
          'Include sensory details: what you saw, heard and felt.',
          'Close with a reflection instead of a simple summary.',
        ],
      },
    },
  },

  senior: {
    topic: 'protecting the environment',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The River Behind Our School',
      intro:
        'Hello, I’m Emma. Today’s passage follows a group of students who decided to find out why their river was dying. ' +
        'We’ll learn five words for discussing public issues, and then practice inversion, which gives formal writing its force.',
      passage: {
        text:
          'For years, the river behind our school was simply part of the scenery. ' +
          'Only when dead fish began floating past the sports field did anyone pay attention. ' +
          'Our biology teacher suggested that, rather than complain, we should investigate. ' +
          'Over the following month, twelve of us collected water samples at five points along the bank. ' +
          'The evidence was hard to ignore: the water below a small dyeing factory was far more polluted than the water above it. ' +
          'At no time had the factory sought consent to release waste into the river, yet nobody had ever challenged it. ' +
          'We wrote a report and started a petition, expecting little. ' +
          'Scarcely had we posted it online when hundreds of residents signed. ' +
          'Not only did the local council agree to meet us, but it also ordered an inspection within a week. ' +
          'The factory was fined and required to install a filter. I would like to say that the river is clean now. It is not. ' +
          'Rivers recover slowly, and one fine does not undo twenty years of neglect. ' +
          'Still, the fish have started to return, and so have the birds that feed on them. ' +
          'Never again will I assume that a problem is too big for ordinary people or that somebody else is already dealing with it. ' +
          'Seldom does change begin with experts. More often, it begins with someone who is willing to look closely and write down what they see.',
        translation: '',
      },
      glossary: [
        term('scenery', 'the natural features of a place, such as hills and rivers'),
        term('samples', 'small amounts of something that are collected for testing'),
        term('bank', 'the land along the side of a river'),
        term('dyeing', 'changing the color of cloth with a special liquid'),
        term('residents', 'people who live in a particular place'),
        term('council', 'the group of people elected to run a town or city'),
        term('inspection', 'an official visit to check that rules are being followed'),
        term('fined', 'made to pay money as a punishment'),
        term('neglect', 'a lack of care or attention'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'A biology lesson about fish',
              'Students who investigated river pollution and prompted official action',
              'The history of a dyeing factory',
              'How to start a business near a river',
            ],
            1,
            'The students gathered evidence, wrote a report and a petition, and the council then ordered an inspection.',
          ),
          mcq(
            'How would you describe the writer’s tone at the end?',
            ['Bitter and defeated', 'Proud that the problem is completely solved', 'Cautiously hopeful', 'Indifferent'],
            2,
            'The river is not clean yet, but the fish and birds are returning and the writer believes ordinary people can act.',
          ),
        ],
        dictation: ['We wrote a report and started a petition, expecting little.', 'Seldom does change begin with experts.'],
      },
      reading: {
        questions: [
          mcq(
            'What first made people notice the river?',
            ['Dead fish floating past the sports field', 'A newspaper article', 'A strange smell in the classrooms', 'A warning from the factory'],
            0,
            'Only when dead fish began floating past the sports field did anyone pay attention.',
          ),
          mcq(
            'What did the water samples show?',
            [
              'The whole river was equally dirty.',
              'The water near the school was the cleanest.',
              'The pollution came from the sports field.',
              'The water below the factory was far more polluted than the water above it.',
            ],
            3,
            'The difference between the samples above and below the factory pointed to it as the source.',
          ),
          mcq(
            'Why does the writer add “It is not”?',
            [
              'To criticize the council',
              'To admit honestly that the problem is only partly solved',
              'To show that the petition failed',
              'To suggest that the factory has closed',
            ],
            1,
            'The writer refuses to exaggerate: one fine cannot undo twenty years of neglect, so recovery is slow.',
          ),
        ],
      },
      vocab: [
        vocab(
          'pollute',
          'v.',
          'to make air, water or land dirty and harmful',
          'Exhaust fumes pollute the air in big cities.',
          cloze('Chemicals from the farm have ___ the lake so badly that nobody swims there.', 'polluted', 'a verb starting with p, as a past participle', 'After have we need the past participle: polluted.'),
        ),
        vocab(
          'consent',
          'n.',
          'official permission or agreement',
          'Doctors need consent before an operation.',
          cloze('Students under eighteen need their parents’ ___ to join the trip.', 'consent', 'a noun starting with c', 'Formal permission from a parent is called consent.'),
        ),
        vocab(
          'evidence',
          'n.',
          'facts or signs that show something is true',
          'There is no evidence that the diet works.',
          cloze('The police had no ___ linking him to the crime.', 'evidence', 'a noun starting with e', 'Facts that connect a person to a crime are evidence; the noun is uncountable.'),
        ),
        vocab(
          'petition',
          'n.',
          'a written request signed by many people, asking someone in authority to act',
          'Neighbors signed a petition against the new road.',
          cloze('More than a thousand people signed the ___ to save the old library.', 'petition', 'a noun starting with p', 'A document that many people sign to demand action is a petition.'),
        ),
        vocab(
          'investigate',
          'v.',
          'to examine a situation carefully in order to find out the truth',
          'Reporters investigate complaints from readers.',
          cloze('The school promised to ___ why the fire alarm had failed.', 'investigate', 'a verb starting with i', 'After “promised to” we use the base form: investigate.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Only when dead fish began floating past the sports field did anyone pay attention.',
          'Scarcely had we posted it online when hundreds of residents signed.',
          'Never again will I assume that a problem is too big for ordinary people.',
        ],
        mcq: [
          mcq(
            'Only after we published the results ___ to our emails.',
            ['the factory replied', 'the factory did reply', 'had the factory reply', 'did the factory reply'],
            3,
            'After only after + clause, the inversion is in the main clause: did comes in front of the subject the factory.',
          ),
          mcq(
            'Scarcely ___ collecting samples when it began to rain.',
            ['had we started', 'we had started', 'did we started', 'we started'],
            0,
            'Scarcely… when takes the past perfect with inversion: had we started.',
          ),
        ],
        cloze: [
          cloze(
            'Not once ___ the factory warn the people living nearby.',
            ['did', 'would'],
            'an auxiliary verb in the past',
            'Warn is a base form, so the auxiliary is did (or would), placed in front of the subject the factory.',
          ),
        ],
        reorder: [reorder('At no time had the factory asked for permission.', 'The factory never asked for permission.', 'At no time comes first, so had moves in front of the subject the factory.')],
      },
      speaking: {
        readAloud: [
          'Only when dead fish began floating past the sports field did anyone pay attention.',
          'Not only did the local council agree to meet us, but it also ordered an inspection within a week.',
          'Rivers recover slowly, and one fine does not undo twenty years of neglect.',
        ],
        scenario: 'Your teacher asks what students can realistically do about an environmental problem close to home.',
        opening: 'Is there an environmental problem in your neighborhood that people tend to ignore?',
      },
      writing: {
        prompt:
          'Describe an environmental problem in your area and propose a realistic course of action for students. ' +
          'Explain why it would work and what might stand in the way. Use at least two sentences with inversion after a negative adverbial.',
        minWords: 180,
        tips: [
          'Define the problem with a specific detail instead of a general statement.',
          'Propose one action and justify it with evidence or an example.',
          'Acknowledge an obstacle and say how you would deal with it.',
        ],
      },
    },
  },

  university: {
    topic: 'backpacking abroad',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Itinerary I Threw Away',
      intro:
        'Hello, I’m Emma. Today’s passage is about a backpacker whose perfect plan collapsed, and what replaced it. ' +
        'We’ll study five words for talking about travel and plans, and then practice inversion for emphasis.',
      passage: {
        text:
          'Before I left for Europe, I had an itinerary that accounted for every hour of three weeks: ' +
          'nine cities, twenty-two museums, and train tickets booked to the minute. ' +
          'It began to unravel on the fourth day, when a rail strike left me stuck in Lisbon. At first I was furious. ' +
          'Not until I had wasted a whole morning refreshing the railway’s website did I accept that I was going nowhere. So I walked. ' +
          'With no plan at all, I wandered uphill through streets I could not name, ' +
          'and in a tiny café I met a retired teacher from Chile who had been traveling for a year with one small bag. ' +
          'Never had I met anyone so unhurried. She asked what I had enjoyed most so far, and I realized, with some embarrassment, ' +
          'that I could barely tell one cathedral from another. ' +
          'My obsession with seeing everything had prevented me from noticing anything. That evening I abandoned the itinerary. ' +
          'I stayed in Lisbon for six days, learned to cook a local fish stew from my landlady, and missed four cities entirely. ' +
          'Rarely have I regretted a decision less. ' +
          'Not only did I spend less money, but I also came home with memories that belonged to me rather than to a guidebook. ' +
          'Under no circumstances would I now plan a trip hour by hour. ' +
          'The encounters I value most were precisely the ones I could not have scheduled.',
        translation: '',
      },
      glossary: [
        term('strike', 'a period when workers refuse to work in order to demand better pay or conditions'),
        term('furious', 'extremely angry'),
        term('wandered', 'walked slowly without a clear direction'),
        term('retired', 'no longer working, usually because of age'),
        term('unhurried', 'relaxed and not rushing'),
        term('cathedral', 'a large and important church'),
        term('stew', 'a dish of fish, meat or vegetables cooked slowly in liquid'),
        term('landlady', 'a woman who rents out a room or a home'),
        term('guidebook', 'a book of information for tourists'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'How to book cheap train tickets in Europe',
              'Why Lisbon is the best city in Europe',
              'The dangers of traveling alone',
              'A traveler who learns that a rigid plan was spoiling the trip',
            ],
            3,
            'The strike forces the writer to slow down, and the writer discovers that the tight schedule had prevented any real experience.',
          ),
          mcq(
            'What changed the writer’s mind?',
            [
              'Meeting a relaxed traveler and realizing how little had been noticed',
              'Running out of money',
              'Advice from a guidebook',
              'Missing a flight home',
            ],
            0,
            'The conversation in the café made the writer realize that one cathedral could barely be told from another.',
          ),
        ],
        dictation: ['Never had I met anyone so unhurried.', 'That evening I abandoned the itinerary.'],
      },
      reading: {
        questions: [
          mcq(
            'Why was the writer stuck in Lisbon?',
            ['The writer had lost a passport.', 'The hotels were full.', 'There was a rail strike.', 'The writer fell ill.'],
            2,
            'The itinerary began to unravel “when a rail strike left me stuck in Lisbon.”',
          ),
          mcq(
            'What did the writer realize when asked about the trip so far?',
            [
              'That the trip had been too expensive',
              'That the sights had blurred together',
              'That Chile would have been a better choice',
              'That the museums were all closed',
            ],
            1,
            'The writer “could barely tell one cathedral from another,” so nothing had really been taken in.',
          ),
          mcq(
            'What does the final sentence imply?',
            [
              'The best experiences cannot be planned in advance.',
              'The writer dislikes meeting strangers.',
              'Schedules make travel cheaper.',
              'The writer will never travel again.',
            ],
            0,
            'The encounters the writer values “were precisely the ones I could not have scheduled.”',
          ),
        ],
      },
      vocab: [
        vocab(
          'itinerary',
          'n.',
          'a detailed plan of a journey, including the places to visit',
          'The tour guide handed out the itinerary.',
          cloze('Our ___ includes two days in Kyoto and three in Osaka.', 'itinerary', 'a noun starting with i', 'A plan listing where you will go and when is an itinerary.'),
        ),
        vocab(
          'unravel',
          'v.',
          '(of a plan or an arrangement) to start to fail or fall apart',
          'The deal began to unravel within days.',
          cloze('His story started to ___ as soon as the detective checked the dates.', 'unravel', 'a verb starting with u', 'When the details stop fitting together, a story starts to unravel.'),
        ),
        vocab(
          'obsession',
          'n.',
          'something you think about too much, in a way that is not healthy',
          'Fitness became an obsession for him.',
          cloze('Her ___ with perfect grades left her no time for friends.', 'obsession', 'a noun starting with o', 'The pattern is an obsession with something.'),
        ),
        vocab(
          'abandon',
          'v.',
          'to give up a plan or stop doing something before it is finished',
          'Rescuers had to abandon the search at nightfall.',
          cloze('Heavy snow forced the climbers to ___ their attempt on the summit.', 'abandon', 'a verb starting with a', 'force someone to do something takes the base form: abandon.'),
        ),
        vocab(
          'encounter',
          'n.',
          'a meeting, especially one that is unexpected',
          'A chance encounter led to a lifelong friendship.',
          cloze('I will never forget my first ___ with a wild bear.', 'encounter', 'a noun starting with e', 'An unexpected meeting is an encounter; the pattern is an encounter with.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Not until I had wasted a whole morning refreshing the railway’s website did I accept that I was going nowhere.',
          'Rarely have I regretted a decision less.',
          'Under no circumstances would I now plan a trip hour by hour.',
        ],
        mcq: [
          mcq(
            'Not until I met her ___ how little I had noticed.',
            ['I realized', 'did I realize', 'I did realize', 'realized I'],
            1,
            'After not until + clause, the main clause is inverted: did comes in front of I, followed by the base form realize.',
          ),
          mcq(
            'Never again ___ twenty-two museums into three weeks.',
            ['I will squeeze', 'will squeeze I', 'I squeeze', 'will I squeeze'],
            3,
            'After never again, the modal will comes in front of the subject I.',
          ),
        ],
        cloze: [
          cloze(
            'Seldom ___ a missed train turned out so well.',
            ['has', 'had'],
            'an auxiliary verb for a perfect tense',
            'Turned is a past participle, so the auxiliary has (or had) moves in front of the subject a missed train.',
          ),
        ],
        reorder: [reorder('Never had I met anyone so unhurried.', 'She was the most relaxed person I had ever met.', 'Never comes first, so had moves in front of the subject I.')],
      },
      speaking: {
        readAloud: [
          'It began to unravel on the fourth day, when a rail strike left me stuck in Lisbon.',
          'My obsession with seeing everything had prevented me from noticing anything.',
          'The encounters I value most were precisely the ones I could not have scheduled.',
        ],
        scenario: 'Your teacher asks whether you prefer a carefully planned trip or a spontaneous one.',
        opening: 'When you travel, do you plan every detail or leave room for surprises?',
      },
      writing: {
        prompt:
          'Is it better to travel with a detailed plan or with none? Argue your position, using an experience of your own or of someone you know, ' +
          'and acknowledge the strongest point on the other side. Use at least two sentences with inversion after a negative adverbial.',
        minWords: 180,
        tips: [
          'Take a clear position and keep to it throughout.',
          'Develop one experience in detail instead of listing several.',
          'Concede a point to the other side before your conclusion.',
        ],
      },
    },
  },
};
