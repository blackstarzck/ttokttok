import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_TYPES, AMPLITUDES, SPEEDS, cameraPhrase } from './camera.mjs';

test('static은 amplitude/speed 없이', () => {
  assert.equal(cameraPhrase({ type: 'static' }), 'The camera holds completely static');
});

test('type + amplitude + speed + target', () => {
  assert.equal(
    cameraPhrase({ type: 'push', amplitude: 'small', speed: 'slow', target: 'his face' }),
    'The camera pushes in with small amplitude at slow speed toward his face',
  );
  assert.equal(
    cameraPhrase({ type: 'truck_right', amplitude: 'medium', speed: 'slow' }),
    'The camera trucks right with medium amplitude at slow speed',
  );
});

test('18개 type 전부 문장을 만든다', () => {
  const types = Object.keys(CAMERA_TYPES);
  assert.equal(types.length, 18);
  for (const type of types) {
    const s = cameraPhrase({ type, amplitude: 'small', speed: 'slow' });
    assert.ok(s.startsWith('The camera '), type);
  }
});

test('알 수 없는 type은 throw', () => {
  assert.throws(() => cameraPhrase({ type: 'dolly_zoom', amplitude: 'small', speed: 'slow' }), /dolly_zoom/);
});

test('허용값 목록', () => {
  assert.deepEqual(AMPLITUDES, ['small', 'medium', 'large']);
  assert.deepEqual(SPEEDS, ['slow', 'medium', 'fast']);
});
