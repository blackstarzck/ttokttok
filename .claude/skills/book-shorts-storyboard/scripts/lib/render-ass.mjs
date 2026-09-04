import { toAssTimecode } from './timecode.mjs';
import { wrapCue } from './text.mjs';

/**
 * ASS 자막. 좌표 근거: references/ttokttok-delivery.md
 * - 1440×2560 기준. 좌우 인셋 20%(288px) = 피드 크롭 6% + 크롬 세이프 14%
 * - 하단 마진 15%(384px) = 도서 정보 바 96 CSS px
 * - Sub: 72px, Alignment 2(하단 중앙). Title: 96px, Alignment 5(정중앙)
 */
const HEADER = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 1440',
  'PlayResY: 2560',
  'WrapStyle: 2',
  'ScaledBorderAndShadow: yes',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Sub,Malgun Gothic,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,288,288,384,1',
  'Style: Title,Malgun Gothic,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,5,288,288,0,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
];

const esc = (t) => String(t).replace(/[{}]/g, (m) => `\\${m}`).replace(/\r?\n/g, ' ');

export function renderAss(sb) {
  const lines = [...HEADER];
  // no_subtitle 큐는 H3가 읽기만 하고 화면에는 안 띄운다 — 제목처럼 제목 카드가
  // 이미 보여주는 문구가 하단 자막으로 한 번 더 나오는 중복을 막는다.
  const cues = [...(sb.narration ?? [])].filter((c) => !c.no_subtitle).sort((a, b) => a.start - b.start);
  for (const c of cues) {
    const text = wrapCue(c.text_ko).map(esc).join('\\N');
    lines.push(`Dialogue: 0,${toAssTimecode(c.start)},${toAssTimecode(c.end)},Sub,,0,0,0,,${text}`);
  }
  lines.push(`Dialogue: 0,${toAssTimecode(sb.title_card.at)},${toAssTimecode(sb.duration_sec)},Title,,0,0,0,,${esc(sb.title_card.text_ko)}`);
  return lines.join('\n') + '\n';
}
