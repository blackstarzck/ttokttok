import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderH3Prompt, cuesForShot } from './render-h3.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const out = renderH3Prompt(fixture);

test('3필드 라벨이 순서대로 있다', () => {
  const a = out.indexOf('integrated_multimodal_description:');
  const b = out.indexOf('overall_soundscape:');
  const c = out.indexOf('non_diegetic_music:');
  assert.ok(a === 0 && a < b && b < c);
});

test('프리앰블: 스타일 락·세로·88% 규칙·텍스트 금지·내레이터 정의', () => {
  assert.ok(out.includes(fixture.style_lock));
  assert.ok(out.includes('Vertical 9:16 portrait video, 15 seconds, 3 shots'));
  assert.ok(out.includes('central 88% of the frame width'));
  assert.ok(out.includes('Do not render any on-screen text'));
  assert.ok(out.includes(`Recurring on-screen character: ${fixture.character_sheet}`));
  assert.ok(out.includes('(S1) is the narrator and never appears on screen'));
});

test('샷 라벨과 타임코드', () => {
  assert.ok(out.includes('[Shot 1] A gaunt man lying in a narrow bed'));
  assert.ok(out.includes('[Shot 2] At 00:03.000, the camera cuts to a low angle'));
  assert.ok(out.includes('[Shot 3] At 00:10.500, the camera cuts to a wide view'));
});

test('카메라·SFX·보이스오버 대사가 샷 안에 있다', () => {
  assert.ok(out.includes('The camera pushes in with small amplitude at slow speed toward his wide-open eyes.'));
  assert.ok(out.includes('The muffled ticking of an alarm clock.'));
  assert.ok(out.includes("(S1) says in an off-screen voiceover while every on-screen character's lips remain completely closed: <d>[Korean] 아침에 눈을 떴는데</d>"));
  assert.ok(out.includes('<d>[Korean] 몸이 벌레로 변해 있었다 가족은 그를 방에 가뒀고 세상은 아무렇지 않게</d>'));
  assert.ok(out.includes('<d>[Korean] 출근을 재촉했다 카프카, 변신</d>'));
});

test('cuesForShot: start 기준 귀속', () => {
  const [s1, s2, s3] = fixture.shots;
  assert.deepEqual(cuesForShot(fixture, s1).map((c) => c.text_ko), ['아침에 눈을 떴는데']);
  assert.equal(cuesForShot(fixture, s2).length, 3);
  assert.equal(cuesForShot(fixture, s3).length, 2);
});

test('큐 없는 샷은 보이스오버 문장을 생략한다', () => {
  const sb = structuredClone(fixture);
  sb.narration = sb.narration.filter((c) => c.start >= 3);
  const shot1 = renderH3Prompt(sb).split('\n').find((l) => l.startsWith('[Shot 1]'));
  assert.ok(!shot1.includes('<d>'));
});

test('character_sheet가 비면 내레이터 정의만 남는다', () => {
  const sb = structuredClone(fixture);
  sb.character_sheet = '';
  const o = renderH3Prompt(sb);
  assert.ok(!o.includes('Recurring on-screen character'));
  assert.ok(o.includes('(S1) is the narrator and never appears on screen'));
});

test('soundscape·music 본문 포함', () => {
  assert.ok(out.includes(fixture.overall_soundscape));
  assert.ok(out.includes(fixture.non_diegetic_music));
});
