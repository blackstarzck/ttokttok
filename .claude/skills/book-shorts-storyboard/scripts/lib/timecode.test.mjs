import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toH3Timecode, toAssTimecode } from './timecode.mjs';

test('toH3Timecode: MM:SS.mmm', () => {
  assert.equal(toH3Timecode(0), '00:00.000');
  assert.equal(toH3Timecode(3.5), '00:03.500');
  assert.equal(toH3Timecode(10.5), '00:10.500');
  assert.equal(toH3Timecode(75.25), '01:15.250');
});

test('toAssTimecode: H:MM:SS.cc', () => {
  assert.equal(toAssTimecode(0.4), '0:00:00.40');
  assert.equal(toAssTimecode(15), '0:00:15.00');
  assert.equal(toAssTimecode(75.25), '0:01:15.25');
  assert.equal(toAssTimecode(3661.5), '1:01:01.50');
});
