import type { Stage } from '../../shared/schema.ts';
import { cloze, mcq, reorder, term, vocab } from './build.ts';
import type { StarterLesson } from './types.ts';

// C2 的起始課。文法重點:語體轉換與文體選擇。課文 264–320 字,全英文。

const GRAMMAR_POINT = 'register shifts and stylistic choice';
const POINT_NAME = 'Register shifts and stylistic choice';
const EXPLANATION =
  'Register is the level of formality a speaker or writer chooses. The same idea can be dressed formally (“The committee has elected to terminate the program”), ' +
  'neutrally (“The committee has decided to end the plan”) or informally (“They’ve scrapped it”). ' +
  'Formal English favors Latinate vocabulary, abstract nouns, passives and full forms; informal English favors phrasal verbs, contractions, short sentences and concrete words. ' +
  'Skilled writers shift register on purpose. Inflated language applied to a small subject produces irony, ' +
  'and a sudden drop into plain speech after elaborate language can create humor or sincerity. ' +
  'The useful question is never “Which version is correct?” but “What effect does this choice have on this reader?”';

export const C2: Record<Stage, StarterLesson> = {
  elementary: {
    topic: 'playing in the park',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'A Recreational Amenity',
      intro:
        'Hello, I’m Emma. Today’s passage sets the official description of a park against a child’s experience of it. ' +
        'We’ll study five precise words, and then examine register: how the same idea changes when it is expressed formally or plainly.',
      passage: {
        text:
          'The sign at the entrance describes our local park as a “recreational amenity for residents of all ages.” ' +
          'This is, to put it mildly, an understatement. To the city council, the park is a line in a budget. To a seven-year-old, it is a kingdom. ' +
          'I spent most of my childhood there, and I can report that nothing that happened on those swings was merely recreational. ' +
          'It was on the jungle gym that I first learned to negotiate, when four of us wanted the top and only one could have it. ' +
          'It was beside the sandbox that I experienced genuine humiliation, having announced that I could jump the whole thing and then landed precisely in the middle. ' +
          'And it was on the long slide, which older children guarded like a border, that I discovered the futility of arguing with anyone two years my senior. ' +
          'Adults tend to regard play with a sort of affectionate contempt, as though it were what children do until real life begins. They are mistaken. ' +
          'Play is where we rehearse nearly everything that matters: how to lose, how to wait, how to make a rule and what to do when someone breaks it. ' +
          'No classroom taught me those things half so well. ' +
          'So when I hear officials speak of “optimizing the utilization of green space,” I want to translate for them. ' +
          'What they mean is this: kids need somewhere to run around. They need mud, and a bit of danger, and friends who will not let them win. ' +
          'The sign can call it whatever it likes. We called it the park, and it was the most serious place I knew.',
        translation: '',
      },
      glossary: [
        term('amenity', 'a useful or pleasant facility in a place where people live'),
        term('budget', 'a plan of how money will be spent'),
        term('merely', 'only; nothing more than'),
        term('sandbox', 'a low box filled with sand for children to play in'),
        term('affectionate', 'showing gentle fondness'),
        term('rehearse', 'to practice something before doing it for real'),
        term('optimizing', 'making something as effective as possible'),
        term('utilization', 'the act of using something'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the writer’s main argument?',
            [
              'Parks cost the city too much money.',
              'Play is a serious form of learning, not mere recreation.',
              'Children should spend less time outdoors.',
              'Official signs ought to be written by children.',
            ],
            1,
            'The writer insists that play is “where we rehearse nearly everything that matters.”',
          ),
          mcq(
            'What is the writer’s attitude toward official language about the park?',
            ['Admiring', 'Confused', 'Angry', 'Gently mocking'],
            3,
            'The writer quotes the official phrases and offers to “translate,” which treats them with mild irony rather than anger.',
          ),
        ],
        dictation: ['To a seven-year-old, it is a kingdom.', 'No classroom taught me those things half so well.'],
      },
      reading: {
        questions: [
          mcq(
            'What did the writer learn on the jungle gym?',
            ['How to climb safely', 'How to avoid older children', 'How to negotiate', 'How to jump a long distance'],
            2,
            'It was on the jungle gym that the writer “first learned to negotiate.”',
          ),
          mcq(
            'Why does the writer quote “optimizing the utilization of green space”?',
            [
              'To contrast inflated official language with a simple truth',
              'To show approval of the council’s plans',
              'To explain a technical term',
              'To prove that the park is too small',
            ],
            0,
            'The phrase is immediately “translated” as “kids need somewhere to run around,” exposing how much the jargon hides.',
          ),
          mcq(
            'What is the effect of the final sentence?',
            [
              'It admits that the sign was accurate.',
              'It suggests that the writer disliked the park.',
              'It changes the subject to school.',
              'It overturns the idea that play is trivial by calling the park “serious.”',
            ],
            3,
            'Calling a playground “the most serious place I knew” reverses the adult view and sums up the argument.',
          ),
        ],
      },
      vocab: [
        vocab(
          'understatement',
          'n.',
          'a description that makes something seem smaller or less important than it really is',
          'Calling the storm “a bit of rain” was an understatement.',
          cloze('To say she was pleased is an ___; she was overjoyed.', 'understatement', 'a noun starting with u', '“Pleased” is far weaker than “overjoyed,” so it understates her feelings.'),
        ),
        vocab(
          'negotiate',
          'v.',
          'to try to reach an agreement through discussion',
          'Unions negotiate with employers over pay.',
          cloze('The two sides met to ___ an end to the strike.', 'negotiate', 'a verb starting with n', 'Reaching an agreement through talks is negotiating; after “to” use the base form.'),
        ),
        vocab(
          'humiliation',
          'n.',
          'a feeling of deep shame after losing your dignity in front of others',
          'Losing 9–0 at home was a humiliation.',
          cloze('He never forgot the ___ of forgetting his lines on stage.', 'humiliation', 'a noun starting with h', 'Public failure produces humiliation, which is stronger than embarrassment.'),
        ),
        vocab(
          'futility',
          'n.',
          'the fact of having no chance of success',
          'The film shows the futility of war.',
          cloze('After an hour of bailing water, they recognized the ___ of trying to save the boat.', 'futility', 'a noun starting with f', 'An effort that cannot succeed is futile; the noun is futility.'),
        ),
        vocab(
          'contempt',
          'n.',
          'the feeling that someone or something deserves no respect',
          'She spoke of liars with contempt.',
          cloze('The critic made no effort to hide his ___ for the film.', 'contempt', 'a noun starting with c', 'The pattern is contempt for something.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Formal: “a recreational amenity for residents of all ages.” Plain: “the park.”',
          'Formal: “optimizing the utilization of green space.” Plain: “kids need somewhere to run around.”',
          'Mock-formal: “I can report that nothing that happened on those swings was merely recreational.”',
        ],
        mcq: [
          mcq(
            'Which sentence expresses “kids need somewhere to run around” in the most formal register?',
            [
              'Kids gotta have a place to let off steam.',
              'Children require access to space for physical activity.',
              'Children need a place to run.',
              'Little ones should get to run about a bit.',
            ],
            1,
            'Latinate vocabulary (require, access, physical activity) and noun phrases mark the formal register.',
          ),
          mcq(
            'What effect does the writer create by placing “optimizing the utilization of green space” next to “kids need somewhere to run around”?',
            [
              'It exposes inflated language by setting it beside plain speech.',
              'It makes the passage more formal overall.',
              'It shows that the writer misunderstands the officials.',
              'It suggests that the officials are right.',
            ],
            0,
            'The abrupt drop in register makes the official phrase sound empty and the plain version sound true.',
          ),
        ],
        cloze: [
          cloze(
            'Informal: “You can’t bring dogs in.” Formal: “Dogs are not ___ in the park.”',
            ['permitted', 'allowed', 'admitted'],
            'a formal past participle, starting with p',
            'Formal notices prefer the passive and Latinate verbs such as permit.',
          ),
        ],
        reorder: [
          reorder(
            'The sign can call it whatever it likes.',
            'The official name does not matter.',
            'This short, plain sentence deliberately abandons the formal register of the sign it is mocking.',
          ),
        ],
      },
      speaking: {
        readAloud: [
          'To the city council, the park is a line in a budget.',
          'They need mud, and a bit of danger, and friends who will not let them win.',
          'We called it the park, and it was the most serious place I knew.',
        ],
        scenario: 'Your teacher asks whether children today have enough freedom to play outdoors.',
        opening: 'Where did you play as a child, and what do you think you learned there?',
      },
      writing: {
        prompt:
          'Write a short essay arguing that play is, or is not, a serious part of education. Shift register deliberately at least twice, ' +
          'for instance by quoting official or academic language and then restating it plainly, and make sure each shift serves a purpose.',
        minWords: 220,
        tips: [
          'Settle on your default register first, so that your shifts stand out.',
          'Put a formal phrase in quotation marks, then translate it into plain English.',
          'End on a short, plain sentence for emphasis.',
        ],
      },
    },
  },

  junior: {
    topic: 'video games and homework',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'The Notice on the Refrigerator',
      intro:
        'Hello, I’m Emma. Today’s passage is a comic account of a family argument conducted entirely in writing. ' +
        'We’ll study five formal words, and then look at register: how a change of tone can win an argument or end one.',
      passage: {
        text:
          'My mother does not shout. When she is truly displeased, she writes. ' +
          'So it was that I came home one Thursday to find a typed notice on the refrigerator, composed with all the solemnity of a government edict. ' +
          '“Effective immediately,” it began, “access to electronic entertainment shall be conditional upon the satisfactory completion of all assigned schoolwork.” ' +
          'In other words: no games until my homework was done. I was thirteen, and I responded as any reasonable diplomat would. I drafted a reply. ' +
          '“While the undersigned acknowledges the concerns raised,” I wrote, “he respectfully submits that brief intervals of recreation enhance concentration.” ' +
          'Translation: let me play for half an hour first, and I’ll work better. I was rather proud of it. ' +
          'My mother read my reply, took out a red pen, corrected two spelling mistakes, and wrote a single word at the bottom: “No.” ' +
          'There is nothing quite so final as one syllable after forty. What surprised me was what happened next. ' +
          'Homework, which I had always found tedious, became a kind of race. ' +
          'I wanted the controller, so I learned to dispatch a page of math in twenty minutes instead of dragging it out over two hours. ' +
          'My grades improved, which I had to concede was annoying. Years later, I asked her why she had bothered with all that formal language. She shrugged. ' +
          '“If I’d just yelled, you would have yelled back,” she said. “But you can’t argue with a document.” She was right, of course. ' +
          'I have since noticed that the people who win arguments are rarely the loudest. ' +
          'They are the ones who choose their words, and their tone, as carefully as she chose hers.',
        translation: '',
      },
      glossary: [
        term('displeased', 'annoyed or not satisfied'),
        term('conditional upon', 'depending on something else happening first'),
        term('diplomat', 'a person who represents a government in its dealings with other countries'),
        term('the undersigned', 'a formal way of referring to the person who has signed a document'),
        term('intervals', 'short periods of time between activities'),
        term('syllable', 'one unit of sound in a word'),
        term('controller', 'a handheld device used to play video games'),
        term('shrugged', 'raised the shoulders to show that something is obvious or unimportant'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'Why video games improve concentration',
              'How to write a formal letter',
              'How a mother’s formal written rule changed the writer’s habits',
              'A student who stopped playing games forever',
            ],
            2,
            'The notice on the refrigerator led the writer to finish homework faster and, later, to see the power of tone.',
          ),
          mcq(
            'How would you describe the tone of the passage?',
            ['Humorous and affectionate', 'Bitter and resentful', 'Neutral and factual', 'Anxious and apologetic'],
            0,
            'The mock-formal letters and the admiring conclusion show amusement and affection for the mother.',
          ),
        ],
        dictation: ['My mother does not shout.', 'I was rather proud of it.'],
      },
      reading: {
        questions: [
          mcq(
            'What did the mother’s notice actually mean?',
            [
              'Games were banned for good.',
              'There would be no games until the homework was done.',
              'Homework had to be done on a computer.',
              'The writer had to write a formal apology.',
            ],
            1,
            'The writer translates it directly: “no games until my homework was done.”',
          ),
          mcq(
            'Why did homework become “a kind of race”?',
            [
              'The mother timed it with a clock.',
              'The writer was competing with classmates.',
              'The teacher set shorter deadlines.',
              'The writer wanted to finish quickly in order to play.',
            ],
            3,
            '“I wanted the controller,” so the writer learned to finish a page of math in twenty minutes.',
          ),
          mcq(
            'According to the mother, why did she write instead of shouting?',
            [
              'Shouting invites shouting back, but a document cannot be argued with.',
              'She enjoyed practicing formal writing.',
              'She was too tired to speak.',
              'She wanted to improve the writer’s spelling.',
            ],
            0,
            'She says, “If I’d just yelled, you would have yelled back… But you can’t argue with a document.”',
          ),
        ],
      },
      vocab: [
        vocab(
          'solemnity',
          'n.',
          'the quality of being very serious and formal',
          'The ceremony was conducted with great solemnity.',
          cloze('The judge read the verdict with a ___ that silenced the room.', 'solemnity', 'a noun starting with s', 'A grave, formal manner is solemnity.'),
        ),
        vocab(
          'edict',
          'n.',
          'an official order given by someone in authority',
          'The emperor issued an edict banning the festival.',
          cloze('The principal’s latest ___ bans phones from every classroom.', 'edict', 'a noun starting with e', 'An order handed down from above, with no discussion, is an edict.'),
        ),
        vocab(
          'tedious',
          'adj.',
          'boring and continuing for too long',
          'Filling out the forms was tedious.',
          cloze('Copying the same sentence fifty times is a ___ punishment.', 'tedious', 'an adjective starting with t', 'Something long, repetitive and dull is tedious.'),
        ),
        vocab(
          'concede',
          'v.',
          'to admit, often unwillingly, that something is true',
          'Even his critics concede that he works hard.',
          cloze('After seeing the data, she had to ___ that her theory was wrong.', 'concede', 'a verb starting with c', 'Admitting something reluctantly is conceding it; after “had to” use the base form.'),
        ),
        vocab(
          'dispatch',
          'v.',
          'to deal with a task quickly and efficiently',
          'She can dispatch a crossword in ten minutes.',
          cloze('An experienced editor can ___ a short article in a matter of minutes.', 'dispatch', 'a verb starting with d', 'In formal or humorous use, to dispatch a task is to finish it swiftly.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Formal: “access to electronic entertainment shall be conditional upon the satisfactory completion of all assigned schoolwork.” Plain: “no games until my homework was done.”',
          'Mock-formal: “he respectfully submits that brief intervals of recreation enhance concentration.” Plain: “let me play for half an hour first.”',
          'Blunt: “No.” A single syllable in reply to a formal letter.',
        ],
        mcq: [
          mcq(
            'Which is the plainest way of saying “Failure to comply will result in the forfeiture of privileges”?',
            [
              'Non-compliance shall incur the loss of privileges.',
              'Those who do not comply will forfeit their privileges.',
              'If you don’t do it, you’ll lose your games.',
              'Privileges are subject to forfeiture.',
            ],
            2,
            'Short everyday words, contractions and a direct “you” carry the same message without the legal vocabulary.',
          ),
          mcq(
            'Why is the mother’s one-word reply, “No,” so effective?',
            [
              'The abrupt drop from formal to blunt makes the refusal feel final.',
              'It shows that she did not read the letter.',
              'It is more polite than a long answer.',
              'It matches the formal register of the earlier notes.',
            ],
            0,
            'After two elaborate documents, a single plain syllable lands with far more force than another paragraph would.',
          ),
        ],
        cloze: [
          cloze(
            'Formal: “Your request has been ___.” Plain: “No, you can’t.”',
            ['denied', 'declined', 'refused', 'rejected'],
            'a formal past participle meaning “turned down”',
            'Formal refusals use the passive and a verb such as deny or decline, which hides the person who is refusing.',
          ),
        ],
        reorder: [
          reorder(
            'But you can’t argue with a document.',
            'A written rule leaves no room for shouting back.',
            'After two mock-formal letters, the mother explains herself in plain spoken English: a contraction and everyday words.',
          ),
        ],
      },
      speaking: {
        readAloud: [
          'When she is truly displeased, she writes.',
          'There is nothing quite so final as one syllable after forty.',
          'They are the ones who choose their words, and their tone, as carefully as she chose hers.',
        ],
        scenario: 'Your teacher asks how rules about games and homework are decided in your home.',
        opening: 'Who sets the rules about screen time in your home, and how are disagreements settled?',
      },
      writing: {
        prompt:
          'Write two versions of the same request to a parent or a teacher: one in a formal register and one in an informal register. ' +
          'Then explain, in a final paragraph, which version would be more persuasive and why.',
        minWords: 220,
        tips: [
          'Keep the content of the two versions identical so that only the register changes.',
          'In the formal version, use full forms, abstract nouns and at least one passive.',
          'In your commentary, name the specific word choices that create each effect.',
        ],
      },
    },
  },

  senior: {
    topic: 'volunteering in the community',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'What the Application Left Out',
      intro:
        'Hello, I’m Emma. Today’s passage compares what a student wrote about volunteering on an application with what really happened. ' +
        'We’ll study five words, and then consider register: what formal language can express, and what it tends to erase.',
      passage: {
        text:
          'On my university application, I wrote that volunteering at a homeless shelter had been ' +
          '“a profoundly enriching experience that deepened my engagement with the community.” ' +
          'Every word of that sentence is true, and none of it tells you anything. Here is what actually happened. ' +
          'I signed up because I needed the hours. For the first month I ladled soup with brisk efficiency and went home feeling virtuous. ' +
          'I was polite, punctual, and entirely detached. Then, one freezing Tuesday, an elderly man named Mr. Hsu asked whether I played chess. ' +
          'I said I did, badly. He beat me in eleven moves and told me, quite kindly, that I played like someone in a hurry. He was right. ' +
          'We played every week after that. He had been an engineer, and he talked about bridges the way other people talk about their children. ' +
          'Over those months, he quietly dismantled every assumption I had brought with me: that the people I served were different from me, ' +
          'that I was there to give and they were there to receive, that an hour of my time was a gift rather than an exchange. ' +
          'I learned far more from him than he ever got from me, and the soup had very little to do with it. ' +
          'When I came to write my application, I found that none of this fit the form. Admissions officers, I was told, want “demonstrated impact.” ' +
          'So I wrote the sentence they expected, in the language they expected, and I got in. I don’t regret it. ' +
          'But I notice that whenever I describe that year in formal terms, Mr. Hsu disappears from it. Only plain words seem able to hold him.',
        translation: '',
      },
      glossary: [
        term('profoundly', 'deeply; to a very great degree'),
        term('enriching', 'making a person’s life or mind richer and more meaningful'),
        term('ladled', 'served liquid food with a large, deep spoon'),
        term('virtuous', 'feeling or showing that you are morally good'),
        term('punctual', 'arriving or doing things at the agreed time'),
        term('Admissions officers', 'university staff who decide which applicants are accepted'),
        term('demonstrated', 'shown clearly by evidence'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'How to write a successful university application',
              'Why homeless shelters need more volunteers',
              'The rules of chess',
              'How a real friendship taught the writer more than official language can express',
            ],
            3,
            'The weekly chess games with Mr. Hsu changed the writer, yet none of it fit the formal language of the application.',
          ),
          mcq(
            'How does the writer regard the sentence on the application?',
            ['As a clever lie', 'As true but empty', 'As the best summary of the year', 'As an embarrassing mistake'],
            1,
            '“Every word of that sentence is true, and none of it tells you anything.”',
          ),
        ],
        dictation: ['I signed up because I needed the hours.', 'We played every week after that.'],
      },
      reading: {
        questions: [
          mcq(
            'Why did the writer begin volunteering?',
            ['To complete required hours', 'To meet Mr. Hsu', 'To learn to cook', 'To research an essay'],
            0,
            'The writer admits, “I signed up because I needed the hours.”',
          ),
          mcq(
            'What did Mr. Hsu’s remark that the writer “played like someone in a hurry” suggest?',
            [
              'That the writer was a talented player',
              'That the shelter was about to close',
              'That the writer rushed through things without real attention',
              'That Mr. Hsu disliked chess',
            ],
            2,
            'It applied to more than chess: the writer had been efficient but detached, and admits “He was right.”',
          ),
          mcq(
            'Why does Mr. Hsu “disappear” when the year is described in formal terms?',
            [
              'Because the writer has forgotten him',
              'Because abstract, formal language erases the individual person',
              'Because he asked not to be mentioned',
              'Because the application had a word limit',
            ],
            1,
            'Phrases such as “engagement with the community” have no room for one man, a chessboard and his bridges.',
          ),
        ],
      },
      vocab: [
        vocab(
          'engagement',
          'n.',
          'active involvement in something',
          'The school encourages student engagement in local projects.',
          cloze('The mayor praised the residents’ ___ in planning the new park.', 'engagement', 'a noun starting with e', 'Taking an active part in something is engagement; the pattern is engagement in or with.'),
        ),
        vocab(
          'detached',
          'adj.',
          'not emotionally involved',
          'A good judge remains detached.',
          cloze('He described the accident in a strangely ___ voice, as if it had happened to someone else.', 'detached', 'an adjective starting with d', 'Speaking without emotion about something personal sounds detached.'),
        ),
        vocab(
          'dismantle',
          'v.',
          'to take something apart piece by piece, or to gradually end a system or belief',
          'Workers will dismantle the stage tonight.',
          cloze('The lawyer began to ___ the witness’s story, one detail at a time.', 'dismantle', 'a verb starting with d', '“One detail at a time” suggests taking something apart piece by piece.'),
        ),
        vocab(
          'assumption',
          'n.',
          'something you accept as true without proof',
          'The plan rests on a risky assumption.',
          cloze('Her whole argument depends on the ___ that prices will keep rising.', 'assumption', 'a noun starting with a', 'A belief taken for granted without proof is an assumption.'),
        ),
        vocab(
          'brisk',
          'adj.',
          'quick, energetic and businesslike',
          'We set off at a brisk pace.',
          cloze('We went for a ___ walk around the lake to warm up.', 'brisk', 'an adjective starting with b', 'A brisk walk is a quick, energetic one.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Formal: “a profoundly enriching experience that deepened my engagement with the community.” Plain: “I learned far more from him than he ever got from me.”',
          'Institutional: “demonstrated impact.” Plain: “proof that I actually helped someone.”',
          'Plain and understated: “I said I did, badly.”',
        ],
        mcq: [
          mcq(
            'Which sentence restates “a profoundly enriching experience that deepened my engagement with the community” in a plain, informal register?',
            [
              'It constituted a transformative period of civic participation.',
              'I got a lot out of it, and I feel closer to the people around here.',
              'The experience yielded considerable personal enrichment.',
              'My community engagement was significantly enhanced.',
            ],
            1,
            'Phrasal verbs (got a lot out of), contractions and concrete words (the people around here) mark the informal register.',
          ),
          mcq(
            'Why does the writer follow the application sentence with “Here is what actually happened”?',
            [
              'To apologize for lying on the application',
              'To introduce a more formal account',
              'To show that the shelter was badly run',
              'To signal a shift from official language to honest, plain narration',
            ],
            3,
            'The short, blunt sentence marks the turn from the register of the application to the register of personal truth.',
          ),
        ],
        cloze: [
          cloze(
            'Formal: “Volunteers must ___ from using their phones during meals.” Plain: “Don’t use your phone while people are eating.”',
            ['refrain', 'abstain', 'desist'],
            'a formal verb that is followed by “from” and means “not do something”',
            'Formal rules avoid a direct “don’t” and use a Latinate verb with from, most often refrain from.',
          ),
        ],
        reorder: [
          reorder(
            'Only plain words seem able to hold him.',
            'Formal language cannot capture what he was like.',
            'The closing sentence is itself made of short, plain words, so its form matches its claim.',
          ),
        ],
      },
      speaking: {
        readAloud: [
          'Every word of that sentence is true, and none of it tells you anything.',
          'He beat me in eleven moves and told me, quite kindly, that I played like someone in a hurry.',
          'I learned far more from him than he ever got from me, and the soup had very little to do with it.',
        ],
        scenario: 'Your teacher asks what volunteering really gives the volunteer, beyond what looks good on an application.',
        opening: 'Have you ever volunteered, and did it turn out the way you expected?',
      },
      writing: {
        prompt:
          'Describe an experience of helping others twice: first in the formal register of an application statement (about 60 words), ' +
          'then as an honest personal account. Finish by commenting on what each version leaves out.',
        minWords: 220,
        tips: [
          'Let the formal version rely on abstract nouns, and let the personal version rely on people and details.',
          'Mark the shift between the two versions with a short, plain sentence.',
          'In your commentary, be specific about which facts each register cannot carry.',
        ],
      },
    },
  },

  university: {
    topic: 'remote work and study',
    grammarPoint: GRAMMAR_POINT,
    lesson: {
      title: 'College in Our Pajamas',
      intro:
        'Hello, I’m Emma. Today’s passage weighs the gains and losses of a semester spent online, as described by administrators and by students. ' +
        'We’ll study five words, and then look at register: how institutional and personal language tell different versions of the same event.',
      passage: {
        text:
          'The email from the dean announced “an agile pivot to digitally mediated pedagogy.” ' +
          'My roommate’s summary was more succinct: “So we’re doing college in our pajamas.” ' +
          'Both descriptions were accurate, and the distance between them tells you most of what you need to know about that year. ' +
          'Officially, the online semester was a triumph of flexibility. Lectures were recorded, deadlines were extended, and nobody had to commute. ' +
          'Unofficially, we were lonely, and our backs hurt. I do not want to be unfair. ' +
          'There was something genuinely liberating about attending a seminar from my kitchen, ' +
          'and students who had jobs or children gained hours they had never had before. ' +
          'I wrote two of my best essays that winter, largely because no one could interrupt me. ' +
          'Yet something was lost that no survey managed to measure. A class used to convene; now it merely logged on. ' +
          'The small accidents of campus life, such as the argument continued in the hallway or the stranger who became a friend ' +
          'because the only free seat was next to her, simply stopped happening. ' +
          'Administrators spoke of “engagement metrics.” We spoke of staring at a grid of black squares, wondering whether anyone was there. ' +
          'What I notice now is the slow erosion of the line between working and resting. ' +
          'When your desk is also your dining table, the day never quite ends; it only fades into a general weariness. ' +
          'I have kept some habits from that time, and I am glad of the freedom. ' +
          'But I have also started walking to the library again, for no better reason than that other people are there. ' +
          'Flexibility, it turns out, is a fine thing to have and a poor thing to live on.',
        translation: '',
      },
      glossary: [
        term('dean', 'a senior official in charge of a college or a faculty'),
        term('agile', 'able to change direction quickly'),
        term('pivot', 'a sudden change of direction or strategy'),
        term('pedagogy', 'the methods and practice of teaching'),
        term('commute', 'to travel regularly between home and work or school'),
        term('seminar', 'a small university class based on discussion'),
        term('metrics', 'numbers used to measure how well something is working'),
        term('grid', 'a pattern of squares arranged in rows'),
      ],
      listening: {
        questions: [
          mcq(
            'What is the passage mainly about?',
            [
              'The real gains and the hidden losses of a semester online',
              'Why universities should close their campuses',
              'How to write better essays at home',
              'The technical problems of video calls',
            ],
            0,
            'The writer credits the flexibility of online study but argues that something was lost “that no survey managed to measure.”',
          ),
          mcq(
            'What is the writer’s overall position?',
            [
              'Online study is better in every way.',
              'Online study was a complete failure.',
              'Flexibility is valuable, but being among other people matters more.',
              'Students should not have jobs.',
            ],
            2,
            'The writer is “glad of the freedom” yet walks to the library simply because “other people are there.”',
          ),
        ],
        dictation: ['Unofficially, we were lonely, and our backs hurt.', 'I do not want to be unfair.'],
      },
      reading: {
        questions: [
          mcq(
            'Which benefit of online study does the writer acknowledge?',
            [
              'Lectures became shorter.',
              'Grades improved for everyone.',
              'Tuition fees were reduced.',
              'Students with jobs or children gained time.',
            ],
            3,
            'Students who had jobs or children “gained hours they had never had before.”',
          ),
          mcq(
            'What does “A class used to convene; now it merely logged on” imply?',
            [
              'Online classes started later.',
              'Gathering in person meant something that logging on does not.',
              'Students forgot their passwords.',
              'Classes had become more formal.',
            ],
            1,
            'The dignified verb convene is set against the flat, mechanical logged on to show what the class had lost.',
          ),
          mcq(
            'Why has the writer started walking to the library again?',
            ['To be around other people', 'To borrow more books', 'To avoid the roommate', 'To get some exercise'],
            0,
            'The writer goes “for no better reason than that other people are there.”',
          ),
        ],
      },
      vocab: [
        vocab(
          'succinct',
          'adj.',
          'expressed clearly in very few words',
          'Her succinct reply ended the debate.',
          cloze('Keep your summary ___: three sentences at most.', 'succinct', 'an adjective starting with s', 'A summary of three sentences is brief and clear, which is what succinct means.'),
        ),
        vocab(
          'convene',
          'v.',
          'to come together for a formal meeting',
          'The committee will convene on Monday.',
          cloze('The board will ___ next week to vote on the proposal.', 'convene', 'a verb starting with c', 'A board that gathers formally is said to convene; after “will” use the base form.'),
        ),
        vocab(
          'erosion',
          'n.',
          'the gradual destruction or weakening of something',
          'The erosion of trust took years.',
          cloze('Critics warn of a steady ___ of privacy in the digital age.', 'erosion', 'a noun starting with e', 'A slow, continuous loss is described as erosion.'),
        ),
        vocab(
          'liberating',
          'adj.',
          'making you feel free from limits or worries',
          'Selling the car was oddly liberating.',
          cloze('She found it ___ to delete all her social media accounts.', 'liberating', 'an adjective starting with l', 'The pattern is find it + adjective + to do something.'),
        ),
        vocab(
          'weariness',
          'n.',
          'great tiredness, especially after long effort',
          'His voice was heavy with weariness.',
          cloze('After months of overtime, a deep ___ settled over the whole team.', 'weariness', 'a noun starting with w', 'Long effort produces weariness, a more literary word than tiredness.'),
        ),
      ],
      grammar: {
        point: POINT_NAME,
        explanation: EXPLANATION,
        examples: [
          'Formal: “an agile pivot to digitally mediated pedagogy.” Informal: “college in our pajamas.”',
          'Institutional: “engagement metrics.” Concrete: “staring at a grid of black squares.”',
          'Plain, for effect: “Unofficially, we were lonely, and our backs hurt.”',
        ],
        mcq: [
          mcq(
            'Which phrase is the informal equivalent of “an agile pivot to digitally mediated pedagogy”?',
            [
              'a rapid transition to technology-enhanced instruction',
              'a strategic realignment of teaching delivery',
              'a quick switch to online classes',
              'an adaptive reconfiguration of learning modalities',
            ],
            2,
            'Short everyday words (quick, switch, online classes) replace the abstract Latinate vocabulary of the original.',
          ),
          mcq(
            'What is the effect of placing “engagement metrics” next to “a grid of black squares”?',
            [
              'It shows that the administrators were dishonest.',
              'It contrasts abstract institutional language with concrete lived experience.',
              'It proves that online classes were more engaging.',
              'It makes the passage more technical.',
            ],
            1,
            'The abstract phrase measures; the concrete image shows what the students actually saw.',
          ),
        ],
        cloze: [
          cloze(
            'Formal: “The seminar has been ___ until Friday.” Informal: “They’ve put the seminar off until Friday.”',
            ['postponed', 'deferred', 'delayed'],
            'a single formal verb that replaces the phrasal verb in the informal version',
            'Formal English prefers a one-word Latinate verb (postpone) to a phrasal verb (put off).',
          ),
        ],
        reorder: [
          reorder(
            'Officially, the online semester was a triumph of flexibility.',
            'According to the university, studying online was a great success.',
            'The sentence adverb officially marks what follows as the institution’s version, told in the institution’s vocabulary (a triumph of flexibility).',
          ),
        ],
      },
      speaking: {
        readAloud: [
          'Both descriptions were accurate, and the distance between them tells you most of what you need to know about that year.',
          'When your desk is also your dining table, the day never quite ends; it only fades into a general weariness.',
          'Flexibility, it turns out, is a fine thing to have and a poor thing to live on.',
        ],
        scenario: 'Your teacher asks whether you would choose to study or work remotely if you had the option.',
        opening: 'If you could choose, would you rather study online or in person, and why?',
      },
      writing: {
        prompt:
          'Write a balanced evaluation of remote study or remote work. Quote or invent at least one piece of official language and restate it in plain words, ' +
          'and vary your register deliberately to mark the difference between institutional claims and personal experience.',
        minWords: 220,
        tips: [
          'Give the advantages their due before you turn to the costs.',
          'Pair each abstract claim with one concrete image.',
          'Close with a sentence that weighs both sides instead of repeating either.',
        ],
      },
    },
  },
};
