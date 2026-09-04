/**
 * 한국어 대본·자막 텍스트 유틸.
 * 음절 = 한글 완성형 글자 하나. 숫자·영문·문장부호·자모는 세지 않는다 —
 * 대본은 숫자를 한글로 풀어 쓰는 것이 규칙이다 (SKILL.md).
 */
const HANGUL_SYLLABLE = /[가-힣]/g;

export function countSyllables(text) {
  return (String(text ?? '').match(HANGUL_SYLLABLE) ?? []).length;
}

export function hasLatinOrDigit(text) {
  return /[0-9A-Za-z]/.test(String(text ?? ''));
}

/**
 * 자막 한 큐를 줄로 나눈다. maxLen 안에서 마지막 공백을 우선하고,
 * 공백이 없는 긴 단어는 maxLen 단위로 강제 분할한다.
 * 글자수는 공백 포함 — 폭 기준으로 보수적이다.
 */
export function wrapCue(text, maxLen = 12) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (w.length > maxLen) {
      if (cur) { lines.push(cur); cur = ''; }
      let i = 0;
      for (; i + maxLen < w.length; i += maxLen) lines.push(w.slice(i, i + maxLen));
      cur = w.slice(i);
      continue;
    }
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxLen) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
