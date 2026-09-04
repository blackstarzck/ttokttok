import { countSyllables, hasLatinOrDigit, wrapCue } from './text.mjs';
import { CAMERA_TYPES, AMPLITUDES, SPEEDS } from './camera.mjs';

/**
 * 검증 상수. 근거는 설계 문서 "검증 규칙" 절.
 * maxSyllables: 한국어 발화 5.5음절/초 × 15초 = 82, 호흡 여유 7 차감.
 * maxLineLen: 자막 폭 864px ÷ 72px 폰트 = 12자.
 */
export const LIMITS = {
  maxSyllables: 75,
  maxLineLen: 12,
  maxLines: 2,
  minCueSec: 0.8,
  warnSyllablesPerSec: 7,
  maxPromptChars: 7000,
  shots: [2, 3],
  panels: [4, 6],
  duration: [4, 15],
};

/**
 * @param sb storyboard.json 객체
 * @param evidence references/evidence.json 객체
 * @param opts.renderPrompt (sb) => string — 주어지면 V4(프롬프트 길이)를 검사한다
 */
export function validateStoryboard(sb, evidence, { renderPrompt } = {}) {
  const errors = [];
  const warnings = [];
  const err = (rule, message) => errors.push({ rule, message });
  const warn = (rule, message) => warnings.push({ rule, message });
  const L = LIMITS;

  // V9 — 식별 정보
  if (!sb.book?.title?.trim()) err('V9', 'book.title이 비어 있음');
  if (!/^[a-z0-9-]+$/.test(sb.book?.slug ?? '')) err('V9', `book.slug는 소문자·숫자·하이픈만 (현재 '${sb.book?.slug}')`);

  // V1 — 샷 구조
  const d = sb.duration_sec;
  if (!Number.isInteger(d) || d < L.duration[0] || d > L.duration[1]) err('V1', `duration_sec는 ${L.duration[0]}~${L.duration[1]} 정수 (현재 ${d})`);
  const shots = Array.isArray(sb.shots) ? sb.shots : [];
  if (shots.length < L.shots[0] || shots.length > L.shots[1]) err('V1', `샷은 ${L.shots[0]}~${L.shots[1]}개 (현재 ${shots.length})`);
  if (shots.length) {
    if (shots[0].start !== 0) err('V1', `shots[0].start는 0 (현재 ${shots[0].start})`);
    shots.forEach((s, i) => {
      if (!(s.end > s.start)) err('V1', `Shot ${s.n}: end(${s.end})가 start(${s.start})보다 커야 함`);
      if (i > 0 && shots[i - 1].end !== s.start) err('V1', `Shot ${s.n}: 이전 샷 end(${shots[i - 1].end})와 start(${s.start})가 다름 — 샷은 빈틈 없이 이어져야 함`);
    });
    const last = shots[shots.length - 1];
    if (last.end !== d) err('V1', `마지막 샷 end(${last.end})가 duration_sec(${d})과 다름`);
  }

  // V6 — 카메라
  for (const s of shots) {
    const c = s.camera;
    if (!c || typeof c !== 'object') { err('V6', `Shot ${s.n}: camera 없음`); continue; }
    if (!(c.type in CAMERA_TYPES)) { err('V6', `Shot ${s.n}: camera.type '${c.type}'는 허용값이 아님 (${Object.keys(CAMERA_TYPES).join('|')})`); continue; }
    if (c.type === 'static') continue;
    if (!AMPLITUDES.includes(c.amplitude)) err('V6', `Shot ${s.n}: camera.amplitude는 ${AMPLITUDES.join('|')} (현재 '${c.amplitude}')`);
    if (!SPEEDS.includes(c.speed)) err('V6', `Shot ${s.n}: camera.speed는 ${SPEEDS.join('|')} (현재 '${c.speed}')`);
  }

  // V2 — 내레이션 총량
  const cues = Array.isArray(sb.narration) ? sb.narration : [];
  const allText = cues.map((c) => c.text_ko ?? '').join(' ');
  const syllables = countSyllables(allText);
  if (syllables > L.maxSyllables) err('V2', `내레이션 ${syllables}음절 — 상한 ${L.maxSyllables} (15초에 읽히지 않음). 문장을 줄이거나 빼라`);
  if (hasLatinOrDigit(allText)) warn('V2w', '대본에 숫자·영문이 있음 — 한글로 풀어 쓰면 TTS 낭독과 음절 계산이 안정됨');

  // V3 — 자막 큐
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  sorted.forEach((c, i) => {
    const text = c.text_ko ?? '';
    // no_subtitle 큐는 화면에 안 뜨므로 줄 제한이 무의미하다. 나머지(길이·겹침·속도)는 H3가 읽으므로 그대로 본다.
    const lines = wrapCue(text, L.maxLineLen);
    if (!c.no_subtitle && lines.length > L.maxLines) err('V3', `큐 "${text}": ${lines.length}줄 — 최대 ${L.maxLines}줄(줄당 ${L.maxLineLen}자). 큐를 나눠라`);
    const dur = c.end - c.start;
    if (!(dur >= L.minCueSec)) err('V3', `큐 "${text}": 표시 ${Number(dur).toFixed(2)}s — 최소 ${L.minCueSec}s`);
    if (c.start < 0 || c.end > d) err('V3', `큐 "${text}": [0, ${d}] 밖 (${c.start}~${c.end})`);
    if (i > 0 && c.start < sorted[i - 1].end) err('V3', `큐 "${text}": 이전 큐(${sorted[i - 1].end}s 종료)와 겹침`);
    if (dur > 0) {
      const sps = countSyllables(text) / dur;
      if (sps > L.warnSyllablesPerSec) warn('V3w', `큐 "${text}": ${sps.toFixed(1)}음절/초 — 너무 빠름 (권장 ≤${L.warnSyllablesPerSec})`);
    }
  });

  // V5 — 컨셉과 근거
  const concepts = Array.isArray(sb.concepts) ? sb.concepts : [];
  if (concepts.length !== 3) err('V5', `컨셉은 정확히 3개 (현재 ${concepts.length}) — 기각안도 기록한다`);
  const primaries = new Set();
  const hooks = new Set();
  for (const c of concepts) {
    const ev = Array.isArray(c.evidence) ? c.evidence : [];
    if (!ev.length) err('V5', `컨셉 ${c.id}: 근거 ID가 없음 — 근거 없는 안은 제시 금지`);
    for (const id of ev) if (!evidence[id]) err('V5', `컨셉 ${c.id}: 근거 '${id}'가 evidence.json에 없음`);
    if (!ev.includes(c.primary_evidence)) err('V5', `컨셉 ${c.id}: primary_evidence '${c.primary_evidence}'가 evidence 목록에 없음`);
    if (primaries.has(c.primary_evidence)) err('V5', `컨셉 ${c.id}: 주근거 '${c.primary_evidence}' 중복 — 3안은 서로 다른 주근거에 기대야 함`);
    primaries.add(c.primary_evidence);
    if (hooks.has(c.hook_type)) err('V5', `컨셉 ${c.id}: 훅 유형 '${c.hook_type}' 중복 — 3안은 서로 다른 훅 유형`);
    hooks.add(c.hook_type);
  }
  const selected = concepts.find((c) => c.id === sb.selected_concept);
  if (!selected) err('V5', `selected_concept '${sb.selected_concept}'에 해당하는 컨셉이 없음`);
  else if ((selected.evidence ?? []).length && selected.evidence.every((id) => evidence[id]?.grade === 'C')) warn('V5w', '선택 컨셉의 근거가 C등급(업계 주장)뿐 — 사용자에게 [C] 표시했는지 확인');

  // V7 — 패널
  const panels = Array.isArray(sb.panels) ? sb.panels : [];
  if (panels.length < L.panels[0] || panels.length > L.panels[1]) err('V7', `패널은 ${L.panels[0]}~${L.panels[1]}개 (현재 ${panels.length})`);
  for (const p of panels) if (!shots.some((s) => s.n === p.shot)) err('V7', `패널 ${p.id}: shot ${p.shot}이 없음`);
  if (!sb.style_lock?.trim()) err('V7', 'style_lock이 비어 있음 — 패널 룩이 갈린다');

  // V8 — 제목 카드
  const last = shots[shots.length - 1];
  if (!sb.title_card?.text_ko?.trim()) err('V8', 'title_card.text_ko가 비어 있음');
  if (last) {
    const at = sb.title_card?.at;
    if (!(at >= last.start && at < last.end)) err('V8', `title_card.at(${at})은 마지막 샷 구간 [${last.start}, ${last.end}) 안이어야 함`);
  }

  // V4 — 프롬프트 길이 (구조 에러가 없고 렌더러가 주어졌을 때만)
  let promptChars = null;
  if (!errors.length && typeof renderPrompt === 'function') {
    try {
      promptChars = renderPrompt(sb).length;
      if (promptChars > L.maxPromptChars) err('V4', `H3 프롬프트 ${promptChars}자 — 상한 ${L.maxPromptChars}. 샷 묘사를 줄여라`);
    } catch (e) {
      err('V4', `H3 프롬프트 렌더 실패: ${e.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: { syllables, cues: cues.length, shots: shots.length, panels: panels.length, promptChars },
  };
}
