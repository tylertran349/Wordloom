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
 *   tags            optional labels for filtering/search
 *
 * These arrays hold vocabulary only. Example sentences and translation
 * exercises are not authored here — they are generated with AI when the
 * learner asks for exercises, then cached in local progress.
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
      tags: ['greetings', 'basics'],
    },
    {
      id: 'cam-on',
      term: 'cảm ơn',
      pronunciation: 'gam uhn',
      partOfSpeech: 'phrase · verb',
      definition: 'Thank you. An expression of gratitude, also used as a verb meaning to thank someone.',
      definitionTarget: 'Lời nói thể hiện sự biết ơn khi ai đó giúp đỡ hoặc làm điều tốt cho mình.',
      tags: ['politeness', 'basics'],
    },
    {
      id: 'an',
      term: 'ăn',
      pronunciation: 'an',
      partOfSpeech: 'verb',
      definition: 'To eat; to consume food.',
      definitionTarget: 'Đưa thức ăn vào cơ thể; dùng bữa.',
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
      tags: ['weather', 'daily life'],
    },
    {
      id: 'du-lich',
      term: 'du lịch',
      pronunciation: 'zoo lik',
      partOfSpeech: 'noun · verb',
      definition: 'Travel or tourism; to travel for pleasure.',
      definitionTarget: 'Đi đến những nơi khác để nghỉ ngơi, khám phá hoặc tìm hiểu.',
      tags: ['travel', 'leisure'],
    },
    {
      id: 'hieu',
      term: 'hiểu',
      pronunciation: 'hee-oh',
      partOfSpeech: 'verb',
      definition: 'To understand; to comprehend a meaning, situation, or person.',
      definitionTarget: 'Nắm được ý nghĩa của điều gì đó.',
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
      tags: ['environment', 'society'],
    },
    {
      id: 'quyet-dinh',
      term: 'quyết định',
      pronunciation: 'kwyet dinh',
      partOfSpeech: 'verb · noun',
      definition: 'To decide; a decision or choice made after thinking.',
      definitionTarget: 'Chọn một phương án sau khi suy nghĩ; sự lựa chọn đó.',
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
      tags: ['society', 'cause & effect'],
    },
    {
      id: 'phat-trien',
      term: 'phát triển',
      pronunciation: 'faht treen',
      partOfSpeech: 'verb · noun',
      definition: 'To develop; growth or development.',
      definitionTarget: 'Làm cho lớn lên, tiến bộ; sự tăng trưởng.',
      tags: ['growth', 'economy'],
    },
    {
      id: 'thuyet-phuc',
      term: 'thuyết phục',
      pronunciation: 'twyeet fook',
      partOfSpeech: 'verb',
      definition: 'To persuade or convince someone.',
      definitionTarget: 'Làm cho người khác tin hoặc đồng ý làm theo.',
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
      tags: ['planning', 'business'],
    },
    {
      id: 'xu-huong',
      term: 'xu hướng',
      pronunciation: 'soo hwung',
      partOfSpeech: 'noun',
      definition: 'A trend, tendency, or general direction of change.',
      definitionTarget: 'Chiều hướng thay đổi chung trong một khoảng thời gian.',
      tags: ['analysis', 'society'],
    },
    {
      id: 'tri-hoan',
      term: 'trì hoãn',
      pronunciation: 'chee hwahn',
      partOfSpeech: 'verb',
      definition: 'To postpone, delay, or put off.',
      definitionTarget: 'Dời việc gì đó sang một thời điểm muộn hơn.',
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
      tags: ['nuance', 'communication'],
    },
    {
      id: 'sac-sao',
      term: 'sắc sảo',
      pronunciation: 'sak sao',
      partOfSpeech: 'adjective',
      definition: 'Astute, sharp, or keen in perception and judgment.',
      definitionTarget: 'Nhạy bén, chính xác và sâu sắc trong nhận xét.',
      tags: ['nuance', 'description'],
    },
    {
      id: 'thoa-dang',
      term: 'thỏa đáng',
      pronunciation: 'twa dahng',
      partOfSpeech: 'adjective',
      definition: 'Satisfactory, adequate, or acceptable.',
      definitionTarget: 'Đủ tốt để đáp ứng yêu cầu; làm hài lòng.',
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
