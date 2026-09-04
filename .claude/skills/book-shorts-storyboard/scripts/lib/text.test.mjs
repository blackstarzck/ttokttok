import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllables, hasLatinOrDigit, wrapCue } from './text.mjs';

test('countSyllables: 한글 완성형만 센다', () => {
  assert.equal(countSyllables('아침에 눈을 떴는데'), 8);
  assert.equal(countSyllables('1984년, Big Brother!'), 1);
  assert.equal(countSyllables(''), 0);
  assert.equal(countSyllables('ㄱㄴㄷ'), 0); // 자모는 음절이 아니다
});

test('hasLatinOrDigit', () => {
  assert.equal(hasLatinOrDigit('아침에 눈을 떴는데'), false);
  assert.equal(hasLatinOrDigit('1984년'), true);
  assert.equal(hasLatinOrDigit('Big Brother'), true);
});

test('wrapCue: 12자 이내면 한 줄', () => {
  assert.deepEqual(wrapCue('아침에 눈을 떴는데'), ['아침에 눈을 떴는데']);
});

test('wrapCue: 공백에서 줄을 바꾼다', () => {
  assert.deepEqual(wrapCue('몸이 벌레로 변해 있었다'), ['몸이 벌레로 변해', '있었다']);
  assert.deepEqual(wrapCue('세상은 아무 일 없다는 듯 출근을 재촉했다'), ['세상은 아무 일 없다는', '듯 출근을 재촉했다']);
});

test('wrapCue: 공백 없는 긴 단어는 강제 분할', () => {
  assert.deepEqual(wrapCue('가나다라마바사아자차카타파하'), ['가나다라마바사아자차카타', '파하']);
});

test('wrapCue: maxLen 인자', () => {
  assert.deepEqual(wrapCue('가나 다라 마바', 5), ['가나 다라', '마바']);
});
