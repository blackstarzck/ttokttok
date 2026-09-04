import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStoryboard, LIMITS } from './validate.mjs';

const here = new URL('.', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', here), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../references/evidence.json', here), 'utf8'));
const clone = () => structuredClone(fixture);
const rules = (r) => r.errors.map((e) => e.rule);
const errorsOf = (r, rule) => r.errors.filter((e) => e.rule === rule);

test('픽스처는 에러·경고 없이 통과한다', () => {
  const r = validateStoryboard(fixture, evidence);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ok, true);
  assert.equal(r.metrics.syllables, 49);
  assert.equal(r.metrics.shots, 3);
  assert.equal(r.metrics.panels, 5);
  assert.equal(r.metrics.cues, 6);
});

test('V1: 샷 수·연속성·duration', () => {
  let sb = clone(); sb.shots = [sb.shots[0]]; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.shots[1].start = 3.5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.shots[2].end = 14; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.duration_sec = 15.5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
  sb = clone(); sb.shots[0].start = 0.5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V1'));
});

test('V2: 내레이션 75음절 초과는 에러(경계 75는 통과), 숫자·영문은 경고', () => {
  // 픽스처 49음절. 큐 0(8음절)을 늘려 경계를 짚는다: 49 - 8 + N
  let sb = clone(); sb.narration[0].text_ko = '가'.repeat(12); // 54
  assert.equal(errorsOf(validateStoryboard(sb, evidence), 'V2').length, 0);
  // 큐 여러 개를 2줄 이내로 늘려 정확히 75까지
  sb = clone();
  sb.narration[0].text_ko = '가나다 라마바 사아자 차카타'; // 12 → 54
  sb.narration[1].text_ko = '가나다 라마바 사아자 차카타 파'; // 13 → 57
  sb.narration[2].text_ko = '가나다 라마바 사아자 차카타 파하'; // 14 → 61
  sb.narration[3].text_ko = '가나다 라마바 사아자 차카타 파하'; // 14 → 65
  sb.narration[4].text_ko = '가나다 라마바 사아자 차카'; // 11 → 69
  sb.narration[5].text_ko = '가나다 라마바 사아자 차'; // 10 → 74
  assert.equal(errorsOf(validateStoryboard(sb, evidence), 'V2').length, 0);
  sb.narration[5].text_ko = '가나다 라마바 사아자 차카'; // 11 → 75 (경계 통과)
  assert.equal(errorsOf(validateStoryboard(sb, evidence), 'V2').length, 0);
  sb.narration[5].text_ko = '가나다 라마바 사아자 차카타'; // 12 → 76 (에러)
  assert.equal(errorsOf(validateStoryboard(sb, evidence), 'V2').length, 1);
  sb = clone(); sb.narration[0].text_ko = '1984년 이야기';
  assert.ok(validateStoryboard(sb, evidence).warnings.some((w) => w.rule === 'V2w'));
});

test('V3: 큐 줄수·최소 표시·겹침·범위', () => {
  let sb = clone(); sb.narration[0].text_ko = '가나다 라마바 사아자 차카타 파하가 나다라 마바사'; // 3줄
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
  sb = clone(); sb.narration[0].end = sb.narration[0].start + 0.5;
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
  sb = clone(); sb.narration[1].start = 2.0; // 0번 큐(0.4~2.8)와 겹침
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
  sb = clone(); sb.narration[5].end = 15.5;
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3'));
});

test('V3: no_subtitle 큐는 줄 제한을 면제받되 타이밍은 그대로 검사한다', () => {
  // 자막이 안 되므로 12자·2줄은 무의미하다. 하지만 H3가 읽으므로 길이·겹침·속도는 본다.
  let sb = clone();
  sb.narration[0] = { start: 0.4, end: 2.8, text_ko: '가나다 라마바 사아자 차카타 파하가 나다라 마바사', no_subtitle: true };
  assert.equal(errorsOf(validateStoryboard(sb, evidence), 'V3').length, 0);
  sb = clone();
  sb.narration[0] = { start: 0.4, end: 0.5, text_ko: '짧다', no_subtitle: true };
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V3')); // 최소 표시는 여전히 본다
});

test('V3w: 7음절/초 초과는 경고', () => {
  const sb = clone(); sb.narration[0] = { start: 0.4, end: 1.4, text_ko: '아침에눈을떴는데말이지' }; // 11음절/1초
  assert.ok(validateStoryboard(sb, evidence).warnings.some((w) => w.rule === 'V3w'));
});

test('V4: 렌더러가 주어지면 프롬프트 길이를 본다', () => {
  const r = validateStoryboard(fixture, evidence, { renderPrompt: () => 'x'.repeat(7001) });
  assert.ok(rules(r).includes('V4'));
  assert.equal(r.metrics.promptChars, 7001);
  const ok = validateStoryboard(fixture, evidence, { renderPrompt: () => 'short' });
  assert.equal(ok.metrics.promptChars, 5);
  assert.equal(validateStoryboard(fixture, evidence).metrics.promptChars, null);
});

test('V5: 컨셉 3개·근거 존재·주근거/훅 유형 중복·선택안', () => {
  let sb = clone(); sb.concepts.pop(); assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[0].evidence = []; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[0].evidence = ['Z-9']; sb.concepts[0].primary_evidence = 'Z-9';
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[1].primary_evidence = 'A-2'; sb.concepts[1].evidence = ['A-2', 'B-3'];
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.concepts[1].hook_type = 'curiosity-gap'; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
  sb = clone(); sb.selected_concept = 'Z'; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V5'));
});

test('V5w: 선택 컨셉이 C등급뿐이면 경고', () => {
  const sb = clone(); sb.concepts[0].evidence = ['C-1']; sb.concepts[0].primary_evidence = 'C-1';
  assert.ok(validateStoryboard(sb, evidence).warnings.some((w) => w.rule === 'V5w'));
});

test('V6: 카메라 type·amplitude·speed', () => {
  let sb = clone(); sb.shots[0].camera = { type: 'dolly_zoom', amplitude: 'small', speed: 'slow' };
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V6'));
  sb = clone(); sb.shots[0].camera = { type: 'push', speed: 'slow' };
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V6'));
  sb = clone(); sb.shots[0].camera = { type: 'static' };
  assert.equal(errorsOf(validateStoryboard(sb, evidence), 'V6').length, 0);
  sb = clone(); delete sb.shots[0].camera;
  assert.ok(rules(validateStoryboard(sb, evidence)).includes('V6'));
});

test('V7: 패널 수·shot 참조·style_lock', () => {
  let sb = clone(); sb.panels = sb.panels.slice(0, 3); assert.ok(rules(validateStoryboard(sb, evidence)).includes('V7'));
  sb = clone(); sb.panels[0].shot = 9; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V7'));
  sb = clone(); sb.style_lock = '  '; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V7'));
});

test('V8: 제목 카드 위치·텍스트', () => {
  let sb = clone(); sb.title_card.at = 5; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V8'));
  sb = clone(); sb.title_card.text_ko = ''; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V8'));
});

test('V9: 제목·슬러그', () => {
  let sb = clone(); sb.book.title = ''; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V9'));
  sb = clone(); sb.book.slug = 'Kafka Metamorphosis'; assert.ok(rules(validateStoryboard(sb, evidence)).includes('V9'));
});

test('LIMITS 상수', () => {
  assert.equal(LIMITS.maxSyllables, 75);
  assert.equal(LIMITS.maxLineLen, 12);
  assert.equal(LIMITS.maxPromptChars, 7000);
});
