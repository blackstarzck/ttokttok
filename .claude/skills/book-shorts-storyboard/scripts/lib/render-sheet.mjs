import { toH3Timecode } from './timecode.mjs';
import { panelFileName, renderPanelPrompt } from './render-panels.mjs';

/**
 * 콘티 시트 HTML. 레이아웃 = VIDEO 노트 │ 9:16 패널 │ AUDIO 노트, 행 = 패널.
 * 한글 텍스트는 이미지 모델에 맡기지 않고 여기서 조판한다.
 */
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function audioLines(note) {
  return String(note ?? '').split(/\s\/\s/).map((s) => s.trim()).filter(Boolean);
}

function renderRow(sb, panel, panelExists) {
  const shot = sb.shots.find((s) => s.n === panel.shot);
  const file = panelFileName(panel.id);
  const media = panelExists(file)
    ? `<img src="${file}" alt="">`
    : `<div class="placeholder"><b>panel-${escapeHtml(panel.id)}</b>${escapeHtml(renderPanelPrompt(sb, panel))}</div>`;
  const audio = audioLines(panel.audio_note_ko).map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  return `  <section class="row">
    <div class="note video"><div class="shot">Shot ${shot.n} · ${toH3Timecode(shot.start)}–${toH3Timecode(shot.end)}</div>${escapeHtml(panel.video_note_ko)}</div>
    <div class="panel">${media}</div>
    <div class="note audio">${audio}</div>
  </section>`;
}

function renderEvidence(sb, evidence) {
  const c = sb.concepts.find((x) => x.id === sb.selected_concept);
  if (!c) return '';
  const items = (c.evidence ?? []).map((id) => {
    const e = evidence[id];
    return e ? `<b>${id}</b> [${e.grade}] ${escapeHtml(e.claim_ko)} — ${escapeHtml(e.source)}` : `<b>${id}</b> (미등록)`;
  });
  return `근거 · ${escapeHtml(c.hook_type)} × ${escapeHtml(c.tone)}<br>${items.join('<br>')}`;
}

export function renderContiSheet(sb, template, { panelExists = () => false, evidence = {} } = {}) {
  const concept = sb.concepts.find((x) => x.id === sb.selected_concept);
  const rows = sb.panels.map((p) => renderRow(sb, p, panelExists)).join('\n');
  return template
    .replaceAll('{{TITLE}}', escapeHtml(sb.book.title))
    .replaceAll('{{AUTHOR}}', escapeHtml(sb.book.author ?? ''))
    .replaceAll('{{CONCEPT}}', concept ? `${escapeHtml(concept.hook_type)} × ${escapeHtml(concept.tone)} × ${escapeHtml(concept.visual_style)}` : '')
    .replaceAll('{{DURATION}}', String(sb.duration_sec))
    .replaceAll('{{PANEL_COUNT}}', String(sb.panels.length))
    .replaceAll('{{ROWS}}', rows)
    .replaceAll('{{EVIDENCE}}', renderEvidence(sb, evidence));
}
