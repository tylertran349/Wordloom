import type { CEFRLevel, VocabEntry, VocabWord } from '../types';
import { CEFR_LEVELS } from '../types';

/**
 * ✏️  VOCABULARY CONTENT
 * ---------------------------------------------------------------------------
 * Populate each CEFR level with as many words as you like. Every entry needs:
 *
 *   id              unique slug (used in URLs and saved progress)
 *   term            the word in the language being learned
 *   pronunciation   optional, a helpful phonetic hint
 *   partOfSpeech    optional label
 *   definition      meaning in the learner's native language
 *   definitionTarget optional meaning written in the target language
 *   examples        [{ target: "...", native: "..." }]
 *   practice        native-language sentences the learner translates
 *   tags            optional labels for filtering/search
 *
 * Tip: keep 5 practice sentences per word. If you provide fewer, examples are
 * used to fill the exercise list, and the AI practice generator can add more.
 *
 * The seed content below is Vietnamese ↔ English. Later vocabulary sets can be
 * added by following the same shape.
 */
export const VOCABULARY: Record<CEFRLevel, VocabEntry[]> = {
  A1: [
    {
      id: 'xin-chao',
      term: 'xin chào',
      pronunciation: 'sin chow',
      partOfSpeech: 'greeting',
      definition: 'Hello. A polite greeting used when meeting someone or starting a conversation.',
      definitionTarget: 'Lời chào lịch sự khi gặp gỡ hoặc bắt đầu cuộc trò chuyện.',
      examples: [
        { target: 'Xin chào! Tôi tên là Lan.', native: 'Hello! My name is Lan.' },
        { target: 'Xin chào, rất vui được gặp bạn.', native: 'Hello, nice to meet you.' },
        { target: 'Cô ấy mỉm cười và nói xin chào.', native: 'She smiled and said hello.' },
      ],
      practice: [
        'Hello, my name is Minh.',
        'She smiled and said hello to everyone.',
        'Hello! How are you today?',
        'He always says hello when he enters the office.',
        'I said hello to my new neighbor this morning.',
      ],
      tags: ['greetings', 'basics'],
    },
    {
      id: 'cam-on',
      term: 'cảm ơn',
      pronunciation: 'gam uhn',
      partOfSpeech: 'phrase · verb',
      definition: 'Thank you. An expression of gratitude, also used as a verb meaning to thank someone.',
      definitionTarget: 'Lời nói thể hiện sự biết ơn khi ai đó giúp đỡ hoặc làm điều tốt cho mình.',
      examples: [
        { target: 'Cảm ơn bạn đã giúp tôi.', native: 'Thank you for helping me.' },
        {
          target: 'Tôi muốn cảm ơn mọi người vì sự ủng hộ.',
          native: 'I want to thank everyone for their support.',
        },
        { target: 'Cô ấy mỉm cười và cảm ơn vị khách.', native: 'She smiled and thanked the guest.' },
      ],
      practice: [
        'Thank you for the delicious meal.',
        'She thanked him for the beautiful flowers.',
        'We should thank the teacher before we leave.',
        'Thank you very much for your time.',
        'He thanked his parents for their advice.',
      ],
      tags: ['politeness', 'basics'],
    },
    {
      id: 'an',
      term: 'ăn',
      pronunciation: 'an',
      partOfSpeech: 'verb',
      definition: 'To eat; to consume food.',
      definitionTarget: 'Đưa thức ăn vào cơ thể; dùng bữa.',
      examples: [
        { target: 'Tôi ăn cơm mỗi ngày.', native: 'I eat rice every day.' },
        { target: 'Bạn đã ăn sáng chưa?', native: 'Have you eaten breakfast yet?' },
        {
          target: 'Chúng ta ăn tối ở nhà hàng đó nhé.',
          native: "Let's have dinner at that restaurant.",
        },
      ],
      practice: [
        "I eat breakfast at seven o'clock.",
        'What do you want to eat for lunch?',
        'We ate dinner together last night.',
        "She doesn't eat meat.",
        "Let's eat something before the movie.",
      ],
      tags: ['food', 'daily life'],
    },
  ],
  A2: [
    {
      id: 'thoi-tiet',
      term: 'thời tiết',
      pronunciation: 'tuh-ee tee-et',
      partOfSpeech: 'noun',
      definition: 'Weather; the state of the atmosphere at a particular time and place.',
      definitionTarget: 'Trạng thái khí quyển tại một thời điểm và địa điểm nhất định.',
      examples: [
        { target: 'Hôm nay thời tiết rất đẹp.', native: 'The weather is very nice today.' },
        {
          target: 'Thời tiết thay đổi nhanh ở thành phố này.',
          native: 'The weather changes quickly in this city.',
        },
        {
          target: 'Tôi thường kiểm tra thời tiết trước khi ra ngoài.',
          native: 'I usually check the weather before going out.',
        },
      ],
      practice: [
        'The weather is cold today.',
        'We checked the weather before our trip.',
        'The weather in Da Nang is often sunny in July.',
        'Bad weather delayed our flight.',
        'I like the weather in autumn.',
      ],
      tags: ['weather', 'daily life'],
    },
    {
      id: 'du-lich',
      term: 'du lịch',
      pronunciation: 'zoo lik',
      partOfSpeech: 'noun · verb',
      definition: 'Travel or tourism; to travel for pleasure.',
      definitionTarget: 'Đi đến những nơi khác để nghỉ ngơi, khám phá hoặc tìm hiểu.',
      examples: [
        { target: 'Tôi thích du lịch vào mùa hè.', native: 'I like to travel in the summer.' },
        {
          target: 'Du lịch giúp chúng ta hiểu thêm về thế giới.',
          native: 'Travel helps us understand more about the world.',
        },
        {
          target: 'Họ đang lên kế hoạch du lịch Đà Nẵng.',
          native: 'They are planning a trip to Da Nang.',
        },
      ],
      practice: [
        'She loves to travel around Asia.',
        'We are planning a trip to Vietnam next year.',
        'Tourism brings a lot of money to this town.',
        'Traveling alone can be difficult but exciting.',
        'He works in the travel industry.',
      ],
      tags: ['travel', 'leisure'],
    },
    {
      id: 'hieu',
      term: 'hiểu',
      pronunciation: 'hee-oh',
      partOfSpeech: 'verb',
      definition: 'To understand; to comprehend a meaning, situation, or person.',
      definitionTarget: 'Nắm được ý nghĩa của điều gì đó.',
      examples: [
        { target: 'Tôi hiểu câu hỏi của bạn.', native: 'I understand your question.' },
        { target: 'Bạn có hiểu tiếng Việt không?', native: 'Do you understand Vietnamese?' },
        {
          target: 'Cô giáo giải thích rõ nên tôi hiểu ngay.',
          native: 'The teacher explained clearly, so I understood right away.',
        },
      ],
      practice: [
        "I don't understand this word.",
        'She understands more Vietnamese than she speaks.',
        'Do you understand what I mean?',
        'It is important to understand the local culture.',
        'He finally understood why she was upset.',
      ],
      tags: ['communication', 'learning'],
    },
  ],
  B1: [
    {
      id: 'kinh-nghiem',
      term: 'kinh nghiệm',
      pronunciation: 'kin nyem',
      partOfSpeech: 'noun',
      definition: 'Experience; knowledge or skill gained from doing or living through something.',
      definitionTarget: 'Hiểu biết hoặc kỹ năng có được nhờ trải qua hoặc làm việc gì đó.',
      examples: [
        {
          target: 'Cô ấy có nhiều kinh nghiệm dạy học.',
          native: 'She has a lot of teaching experience.',
        },
        {
          target: 'Kinh nghiệm này đã thay đổi cách tôi làm việc.',
          native: 'This experience changed the way I work.',
        },
        {
          target: 'Chúng tôi học được nhiều điều từ kinh nghiệm đó.',
          native: 'We learned a lot from that experience.',
        },
      ],
      practice: [
        'He has five years of experience as a nurse.',
        'Traveling alone was a valuable experience.',
        'We learn from experience.',
        'She shared her experience with the new employees.',
        'No experience is required for this job.',
      ],
      tags: ['work', 'personal growth'],
    },
    {
      id: 'moi-truong',
      term: 'môi trường',
      pronunciation: 'moy truhng',
      partOfSpeech: 'noun',
      definition:
        'Environment; the natural world, or the conditions and surroundings in which someone lives or works.',
      definitionTarget: 'Thế giới tự nhiên hoặc các điều kiện xung quanh con người.',
      examples: [
        { target: 'Chúng ta cần bảo vệ môi trường.', native: 'We need to protect the environment.' },
        {
          target: 'Môi trường làm việc ở đây rất thân thiện.',
          native: 'The working environment here is very friendly.',
        },
        {
          target: 'Ô nhiễm đang gây hại cho môi trường.',
          native: 'Pollution is harming the environment.',
        },
      ],
      practice: [
        'Plastic pollution is harming the environment.',
        'This company cares about the environment.',
        'Children need a safe environment to learn.',
        'The new law will protect the natural environment.',
        'A quiet environment helps me focus.',
      ],
      tags: ['environment', 'society'],
    },
    {
      id: 'quyet-dinh',
      term: 'quyết định',
      pronunciation: 'kwyet dinh',
      partOfSpeech: 'verb · noun',
      definition: 'To decide; a decision or choice made after thinking.',
      definitionTarget: 'Chọn một phương án sau khi suy nghĩ; sự lựa chọn đó.',
      examples: [
        { target: 'Tôi đã quyết định học tiếng Việt.', native: 'I decided to learn Vietnamese.' },
        { target: 'Đây là một quyết định khó khăn.', native: 'This is a difficult decision.' },
        {
          target: 'Họ sẽ quyết định vào ngày mai.',
          native: 'They will decide tomorrow.',
        },
      ],
      practice: [
        'We decided to stay one more day.',
        'She has not made a decision yet.',
        'It was the best decision of my life.',
        'You need to decide before Friday.',
        'The government will announce its decision tomorrow.',
      ],
      tags: ['choices', 'work'],
    },
  ],
  B2: [
    {
      id: 'anh-huong',
      term: 'ảnh hưởng',
      pronunciation: 'anh huh-ung',
      partOfSpeech: 'verb · noun',
      definition: 'To influence or affect; influence or impact.',
      definitionTarget: 'Tác động đến ai hoặc điều gì; sự tác động.',
      examples: [
        {
          target: 'Mạng xã hội ảnh hưởng đến giới trẻ.',
          native: 'Social media influences young people.',
        },
        {
          target: 'Khí hậu ảnh hưởng lớn đến nông nghiệp.',
          native: 'Climate has a big impact on agriculture.',
        },
        {
          target: 'Quyết định này sẽ ảnh hưởng đến hàng nghìn người.',
          native: 'This decision will affect thousands of people.',
        },
      ],
      practice: [
        'Her advice influenced my decision.',
        'The economy is affected by global events.',
        'Parents have a strong influence on their children.',
        'This policy will affect thousands of workers.',
        'Social media can negatively affect mental health.',
      ],
      tags: ['society', 'cause & effect'],
    },
    {
      id: 'phat-trien',
      term: 'phát triển',
      pronunciation: 'faht treen',
      partOfSpeech: 'verb · noun',
      definition: 'To develop; growth or development.',
      definitionTarget: 'Làm cho lớn lên, tiến bộ; sự tăng trưởng.',
      examples: [
        {
          target: 'Thành phố đang phát triển rất nhanh.',
          native: 'The city is developing very quickly.',
        },
        {
          target: 'Giáo dục góp phần vào sự phát triển của đất nước.',
          native: "Education contributes to the country's development.",
        },
        {
          target: 'Công ty đang phát triển một ứng dụng mới.',
          native: 'The company is developing a new app.',
        },
      ],
      practice: [
        'The company plans to develop a new app.',
        'Reading helps children develop their language skills.',
        'Economic development has created new jobs.',
        'The team is developing a plan to reduce waste.',
        'Sustainable development requires long-term thinking.',
      ],
      tags: ['growth', 'economy'],
    },
    {
      id: 'thuyet-phuc',
      term: 'thuyết phục',
      pronunciation: 'twyeet fook',
      partOfSpeech: 'verb',
      definition: 'To persuade or convince someone.',
      definitionTarget: 'Làm cho người khác tin hoặc đồng ý làm theo.',
      examples: [
        { target: 'Anh ấy đã thuyết phục tôi tham gia.', native: 'He persuaded me to join.' },
        {
          target: 'Rất khó để thuyết phục cô ấy thay đổi ý kiến.',
          native: 'It is hard to persuade her to change her mind.',
        },
        {
          target: 'Lập luận của bạn rất thuyết phục.',
          native: 'Your argument is very convincing.',
        },
      ],
      practice: [
        'She persuaded her boss to approve the project.',
        'I tried to convince him to stay.',
        'It is not easy to persuade people to change.',
        'The advertisement is designed to persuade customers.',
        'He was persuaded by his friends to apply.',
      ],
      tags: ['debate', 'communication'],
    },
  ],
  C1: [
    {
      id: 'kha-thi',
      term: 'khả thi',
      pronunciation: 'kha tee',
      partOfSpeech: 'adjective',
      definition: 'Feasible, viable, or practicable.',
      definitionTarget: 'Có thể thực hiện được trong điều kiện thực tế.',
      examples: [
        {
          target: 'Kế hoạch này không khả thi về mặt tài chính.',
          native: 'This plan is not financially feasible.',
        },
        {
          target: 'Chúng tôi đang tìm một giải pháp khả thi hơn.',
          native: 'We are looking for a more feasible solution.',
        },
        {
          target: 'Ý tưởng hay nhưng liệu có khả thi không?',
          native: 'It is a good idea, but is it feasible?',
        },
      ],
      practice: [
        'The proposal is technically feasible.',
        'Is it feasible to finish the project by June?',
        'We need a feasible alternative to fossil fuels.',
        'The plan sounded good but was not financially feasible.',
        'They are studying whether the project is viable.',
      ],
      tags: ['planning', 'business'],
    },
    {
      id: 'xu-huong',
      term: 'xu hướng',
      pronunciation: 'soo hwung',
      partOfSpeech: 'noun',
      definition: 'A trend, tendency, or general direction of change.',
      definitionTarget: 'Chiều hướng thay đổi chung trong một khoảng thời gian.',
      examples: [
        {
          target: 'Xu hướng làm việc từ xa đang gia tăng.',
          native: 'The trend of remote work is growing.',
        },
        {
          target: 'Ông ấy có xu hướng trì hoãn mọi việc.',
          native: 'He has a tendency to put everything off.',
        },
        {
          target: 'Báo cáo xác nhận xu hướng tăng này.',
          native: 'The report confirms the upward trend.',
        },
      ],
      practice: [
        'There is a growing trend toward electric cars.',
        'The report identifies three key trends in education.',
        'He tends to exaggerate his achievements.',
        'Consumer trends change quickly.',
        'The data confirms the upward trend.',
      ],
      tags: ['analysis', 'society'],
    },
    {
      id: 'tri-hoan',
      term: 'trì hoãn',
      pronunciation: 'chee hwahn',
      partOfSpeech: 'verb',
      definition: 'To postpone, delay, or put off.',
      definitionTarget: 'Dời việc gì đó sang một thời điểm muộn hơn.',
      examples: [
        {
          target: 'Cuộc họp đã bị trì hoãn đến thứ Sáu.',
          native: 'The meeting was postponed until Friday.',
        },
        {
          target: 'Đừng trì hoãn việc học ngoại ngữ.',
          native: "Don't put off learning a foreign language.",
        },
        {
          target: 'Họ trì hoãn quyết định cho đến tháng sau.',
          native: 'They postponed the decision until next month.',
        },
      ],
      practice: [
        'We had to postpone the wedding because of the storm.',
        'Stop procrastinating and start writing.',
        'The flight was delayed by three hours.',
        'He keeps putting off his dentist appointment.',
        'They postponed the decision until next month.',
      ],
      tags: ['time', 'habits'],
    },
  ],
  C2: [
    {
      id: 'mo-ho',
      term: 'mơ hồ',
      pronunciation: 'muh hoh',
      partOfSpeech: 'adjective',
      definition: 'Ambiguous, vague, or unclear; open to more than one interpretation.',
      definitionTarget: 'Không rõ ràng, có thể hiểu theo nhiều cách khác nhau.',
      examples: [
        { target: 'Câu trả lời của anh ấy rất mơ hồ.', native: 'His answer was very vague.' },
        {
          target: 'Điều khoản này trong hợp đồng khá mơ hồ.',
          native: 'This clause in the contract is rather ambiguous.',
        },
        {
          target: 'Cái kết của cuốn tiểu thuyết rất mơ hồ.',
          native: 'The ending of the novel is wonderfully ambiguous.',
        },
      ],
      practice: [
        'The instructions were too vague to follow.',
        "Her expression was ambiguous; I couldn't tell if she was angry.",
        'The law remains ambiguous on this issue.',
        'He gave a deliberately vague answer.',
        'The ending of the novel is wonderfully ambiguous.',
      ],
      tags: ['nuance', 'communication'],
    },
    {
      id: 'sac-sao',
      term: 'sắc sảo',
      pronunciation: 'sak sao',
      partOfSpeech: 'adjective',
      definition: 'Astute, sharp, or keen in perception and judgment.',
      definitionTarget: 'Nhạy bén, chính xác và sâu sắc trong nhận xét.',
      examples: [
        {
          target: 'Cô ấy là một nhà phân tích sắc sảo.',
          native: 'She is an astute analyst.',
        },
        {
          target: 'Bài viết của ông đưa ra những nhận định sắc sảo.',
          native: 'His article offers keen observations.',
        },
        {
          target: 'Cô ấy có khiếu hài hước rất sắc sảo.',
          native: 'She has a very sharp sense of humor.',
        },
      ],
      practice: [
        'She is an astute observer of human behavior.',
        'His analysis of the market was particularly sharp.',
        'The novel offers a keen insight into rural life.',
        'He made an astute remark about the negotiations.',
        'Her writing is known for its sharp wit.',
      ],
      tags: ['nuance', 'description'],
    },
    {
      id: 'thoa-dang',
      term: 'thỏa đáng',
      pronunciation: 'twa dahng',
      partOfSpeech: 'adjective',
      definition: 'Satisfactory, adequate, or acceptable.',
      definitionTarget: 'Đủ tốt để đáp ứng yêu cầu; làm hài lòng.',
      examples: [
        {
          target: 'Chúng tôi chưa tìm được giải pháp thỏa đáng.',
          native: 'We have not yet found a satisfactory solution.',
        },
        {
          target: 'Câu trả lời đó chưa thỏa đáng.',
          native: 'That answer is not satisfactory.',
        },
        {
          target: 'Hai bên đã đạt được một thỏa thuận thỏa đáng.',
          native: 'Both sides reached a satisfactory agreement.',
        },
      ],
      practice: [
        'The explanation was not satisfactory.',
        'We need an adequate solution before winter.',
        'Her performance was satisfactory but not outstanding.',
        'The company offered a satisfactory compensation package.',
        'No satisfactory answer has been given.',
      ],
      tags: ['evaluation', 'formal'],
    },
  ],
};

const levelOrder = new Map<CEFRLevel, number>(CEFR_LEVELS.map((level, index) => [level, index]));

export const ALL_WORDS: VocabWord[] = CEFR_LEVELS.flatMap((level) =>
  (VOCABULARY[level] ?? []).map((word) => ({ ...word, level })),
);

export const WORD_BY_ID: Record<string, VocabWord> = Object.fromEntries(
  ALL_WORDS.map((word) => [word.id, word]),
);

export const LEVEL_WORDS: Record<CEFRLevel, VocabWord[]> = Object.fromEntries(
  CEFR_LEVELS.map((level) => [level, ALL_WORDS.filter((word) => word.level === level)]),
) as Record<CEFRLevel, VocabWord[]>;

export const LEVEL_COUNTS: Record<CEFRLevel, number> = Object.fromEntries(
  CEFR_LEVELS.map((level) => [level, LEVEL_WORDS[level].length]),
) as Record<CEFRLevel, number>;

export function sortByLevel(a: VocabWord, b: VocabWord): number {
  return (levelOrder.get(a.level) ?? 0) - (levelOrder.get(b.level) ?? 0);
}
