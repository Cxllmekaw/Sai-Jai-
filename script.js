'use strict';



// ใช้ key เดิม เพื่อให้ข้อมูลจากเว็บ Blood Pressure Tracker และ BloomCare ยังอ่านได้

const STORAGE_KEY = 'bloodPressure';

const AI_CHAT_KEY = 'saiJaiKhunJaiDeeChat';

const REMINDER_KEY = 'saiJaiDailyReminderV2';

const AGE_GROUP_KEY = 'saiJaiAgeGroupV2';

const el = (id) => document.getElementById(id);



const form = el('recordForm');

const dateInput = el('dateInput');

const timeInput = el('timeInput');

const sysInput = el('sysInput');

const diaInput = el('diaInput');

const pulseInput = el('pulseInput');

const noteInput = el('noteInput');



const assistantMessages = el('assistantMessages');

const assistantForm = el('assistantForm');

const assistantInput = el('assistantInput');

const clearChatBtn = el('clearChatBtn');

const quickQuestions = document.querySelectorAll('.quick-chip');



let records = [];

let savedRecords = [];

let demoMode = false;

let showAll = false;

let toastTimer;

let storageAvailable = true;

let aiTypingTimer;



function pad(n) { return String(n).padStart(2, '0'); }

function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function localTime(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function resetDateTime() {

  const now = new Date();

  dateInput.value = localDate(now);

  dateInput.max = localDate(now);

  timeInput.value = localTime(now);

}

function validDate(value) {

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const d = new Date(value + 'T12:00:00');

  return !Number.isNaN(d.getTime()) && localDate(d) === value;

}

function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }

function displayDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {

  if (!validDate(value)) return value;

  return new Intl.DateTimeFormat('th-TH', options).format(new Date(value + 'T12:00:00'));

}

function timestamp(r) { return `${r.date}T${r.time}:00`; }

function sortRecords() { records.sort((a, b) => timestamp(b).localeCompare(timestamp(a))); }

function normalise(raw, index) {

  if (!raw || typeof raw !== 'object') return null;

  const date = String(raw.date ?? '');

  const time = String(raw.time ?? '00:00').slice(0, 5);

  const sys = Number(raw.sys), dia = Number(raw.dia), pulse = Number(raw.pulse);

  if (!validDate(date) || !validTime(time) || ![sys, dia, pulse].every(Number.isFinite)) return null;

  if ([sys, dia, pulse].some(value => !Number.isInteger(value) || value < 0 || value > 999)) return null;

  return { id: String(raw.id || `legacy-${index}`), date, time, sys, dia, pulse, note: String(raw.note ?? '').slice(0, 300) };

}

function notify(message, isError = false) {

  const toast = el('toast');

  toast.textContent = message;

  toast.classList.toggle('error', isError);

  toast.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => toast.classList.remove('show'), 3700);

}

function loadRecords() {

  try {

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

    if (!Array.isArray(parsed)) throw new Error('Not an array');

    records = parsed.map(normalise).filter(Boolean);

    sortRecords();

    savedRecords = records.slice();

  } catch (error) {

    records = [];

    storageAvailable = false;

    notify('อ่านข้อมูลในเบราว์เซอร์ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าพื้นที่เก็บข้อมูล', true);

  }

}

function persist() {

  if (!storageAvailable) {

    notify('บันทึกไม่ได้ เพราะไม่สามารถอ่านพื้นที่จัดเก็บเดิมอย่างปลอดภัย', true);

    return false;

  }

  try {

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

    savedRecords = records.slice();

    return true;

  } catch (error) {

    notify('บันทึกไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์', true);

    return false;

  }

}

function avg(key) {

  return records.length ? Math.round(records.reduce((sum, r) => sum + r[key], 0) / records.length) : '—';

}

function renderSummary() {

  const latest = records[0];

  el('latestSys').textContent = latest ? latest.sys : '—';

  el('latestDia').textContent = latest ? latest.dia : '—';

  el('latestPulse').textContent = latest ? latest.pulse : '—';

  el('avgSys').textContent = avg('sys');

  el('avgDia').textContent = avg('dia');

  el('recordCount').textContent = records.length.toLocaleString('th-TH');

  el('latestTime').textContent = latest ? `บันทึกเมื่อ ${displayDate(latest.date)} เวลา ${latest.time} น.` : 'ยังไม่มีข้อมูลที่บันทึก';

}

function svg(tag, attrs = {}, label) {

  const node = document.createElementNS('http\://www.w3.org/2000/svg', tag);

  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));

  if (label !== undefined) node.textContent = label;

  return node;

}

function renderChart() {

  const chart = el('pressureChart');

  const empty = el('chartEmpty');

  const range = el('chartRange').value;

  const selected = (range === 'all' ? records : records.slice(0, Number(range))).slice().reverse();

  chart.replaceChildren();

  chart.hidden = !selected.length;

  chart.style.display = selected.length ? 'block' : 'none';

  empty.hidden = selected.length > 0;

  el('chartCaption').textContent = selected.length ? `${demoMode ? 'ข้อมูลตัวอย่าง · ' : ''}แสดง ${selected.length} รายการ เรียงตามวันและเวลาที่บันทึก · ใช้ดูแนวโน้มเท่านั้น` : 'กราฟจะปรากฏเมื่อมีข้อมูล';

  if (!selected.length) return;



  const W = 690, H = 296, L = 44, R = 17, T = 24, B = 46;

  const bottom = H - B;

  const values = selected.flatMap(r => [r.sys, r.dia]);

  let low = Math.max(0, Math.floor((Math.min(...values) - 12) / 10) * 10);

  let high = Math.ceil((Math.max(...values) + 12) / 10) * 10;

  if (high <= low) high = low + 20;

  const x = (i) => L + (selected.length === 1 ? (W - L - R) / 2 : (W - L - R) * i / (selected.length - 1));

  const y = (v) => T + (high - v) * (bottom - T) / (high - low);

  const textAttrs = { 'font-family': 'Prompt, sans-serif', 'font-size': '11', fill: '#B7A8B4' };

  for (let i = 0; i <= 4; i++) {

    const val = low + (high - low) * i / 4;

    const yy = y(val);

    chart.append(svg('line', { x1: L, y1: yy, x2: W - R, y2: yy, stroke: '#F3E9EF', 'stroke-dasharray': '4 6' }));

    chart.append(svg('text', { ...textAttrs, x: L - 10, y: yy + 4, 'text-anchor': 'end' }, String(Math.round(val))));

  }

  const labelIndexes = [...new Set([0, Math.floor((selected.length - 1) / 4), Math.floor((selected.length - 1) / 2), Math.floor((selected.length - 1) * 3 / 4), selected.length - 1])];

  labelIndexes.forEach(i => chart.append(svg('text', { ...textAttrs, x: x(i), y: H - 17, 'text-anchor': 'middle' }, displayDate(selected[i].date, { day: 'numeric', month: 'short' }))));



  [{ key: 'sys', color: '#EAA0B9' }, { key: 'dia', color: '#AD94DF' }].forEach(series => {

    const coords = selected.map((record, i) => [x(i), y(record[series.key])]);

    if (coords.length > 1) chart.append(svg('polyline', {

      points: coords.map(p => p.map(n => n.toFixed(2)).join(',')).join(' '),

      stroke: series.color, 'stroke-width': 3.3, fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'

    }));

    coords.forEach(([xx, yy], i) => {

      const dot = svg('circle', { cx: xx, cy: yy, r: selected.length > 25 ? 3.3 : 5, fill: series.color, stroke: '#fff', 'stroke-width': 2 });

      dot.append(svg('title', {}, `${series.key.toUpperCase()}: ${selected[i][series.key]} mmHg • ${displayDate(selected[i].date)} ${selected[i].time}`));

      chart.append(dot);

    });

  });

}

function cell(value, className = '') {

  const td = document.createElement('td');

  td.textContent = String(value);

  if (className) td.className = className;

  return td;

}

function renderHistory() {

  const tbody = el('historyBody');

  tbody.replaceChildren();

  el('historyEmpty').hidden = records.length > 0;

  (showAll ? records : records.slice(0, 5)).forEach(record => {

    const tr = document.createElement('tr');

    tr.append(

      cell(`${displayDate(record.date)} · ${record.time} น.`),

      cell(record.sys), cell(record.dia), cell(record.pulse)

    );

    const note = cell(record.note || '—', 'note-cell');

    note.title = record.note || 'ไม่มีหมายเหตุ';

    tr.append(note);

    const action = document.createElement('td');

    const del = document.createElement('button');

    del.className = 'delete-btn';

    del.type = 'button';

    del.textContent = '×';

    del.title = 'ลบรายการ';

    del.setAttribute('aria-label', `ลบบันทึกวันที่ ${displayDate(record.date)} เวลา ${record.time}`);

    del.disabled = demoMode;

    if (demoMode) del.title = 'โหมดทดลองไม่แก้ไขข้อมูลจริง';

    del.addEventListener('click', () => removeRecord(record.id));

    action.append(del);

    tr.append(action);

    tbody.append(tr);

  });

  el('historyCount').textContent = `ทั้งหมด ${records.length.toLocaleString('th-TH')} รายการ`;

  el('showAllBtn').hidden = records.length <= 5;

  el('showAllBtn').textContent = showAll ? 'ดูน้อยลง ↑' : `ดูทั้งหมด ${records.length} รายการ ↓`;

}

function render() {

  renderSummary();

  renderChart();

  renderHistory();

  renderStatus();

  el('demoBanner').hidden = !demoMode;

  el('demoControls').hidden = demoMode || records.length > 0;

  el('exportBtn').disabled = demoMode;

  el('printReportBtn').disabled = demoMode;

}

// ยืนยันการลบรายการความดันโดยใช้กล่องเดียวกับดีไซน์ลบแชต

const deleteRecordModal = el('deleteRecordModal');

const cancelDeleteRecord = el('cancelDeleteRecord');

const confirmDeleteRecord = el('confirmDeleteRecord');

let recordToDeleteId = null;

let recordDeleteFocus = null;



function removeRecord(id) {

  if (demoMode) {

    notify('กรุณาออกจากโหมดทดลองก่อนลบข้อมูลจริง', true);

    return;

  }

  if (!records.some(record => record.id === id)) {

    notify('ไม่พบบันทึกที่ต้องการลบ กรุณารีเฟรชหน้าเว็บ', true);

    return;

  }

  recordToDeleteId = id;

  recordDeleteFocus = document.activeElement;

  deleteRecordModal.hidden = false;

  document.body.style.overflow = 'hidden';

  cancelDeleteRecord.focus();

}



function closeDeleteRecordModal({ restoreFocus = true } = {}) {

  deleteRecordModal.hidden = true;

  document.body.style.overflow = '';

  recordToDeleteId = null;

  if (restoreFocus && recordDeleteFocus?.isConnected) recordDeleteFocus.focus();

  recordDeleteFocus = null;

}



cancelDeleteRecord.addEventListener('click', () => closeDeleteRecordModal());

deleteRecordModal.addEventListener('click', event => {

  if (event.target === deleteRecordModal) closeDeleteRecordModal();

});

document.addEventListener('keydown', event => {

  if (deleteRecordModal.hidden) return;

  if (event.key === 'Escape') {

    event.preventDefault();

    closeDeleteRecordModal();

  }

  if (event.key === 'Tab') {

    const buttons = [cancelDeleteRecord, confirmDeleteRecord];

    const current = buttons.indexOf(document.activeElement);

    if (event.shiftKey && current === 0) {

      event.preventDefault();

      confirmDeleteRecord.focus();

    } else if (!event.shiftKey && current === 1) {

      event.preventDefault();

      cancelDeleteRecord.focus();

    }

  }

});

confirmDeleteRecord.addEventListener('click', () => {

  const id = recordToDeleteId;

  if (id === null) return;

  const previous = records;

  const updated = records.filter(record => record.id !== id);

  if (updated.length === previous.length) {

    closeDeleteRecordModal();

    notify('ไม่พบบันทึกที่ต้องการลบ', true);

    return;

  }

  records = updated;

  if (!persist()) {

    records = previous;

    closeDeleteRecordModal();

    render();

    return;

  }

  closeDeleteRecordModal({ restoreFocus: false });

  render();

  notify('ลบบันทึกเรียบร้อยแล้วค่ะ ♡');

  const heading = el('history-title');

  heading.setAttribute('tabindex', '-1');

  heading.focus({ preventScroll: true });

});



function getError() {

  if (!validDate(dateInput.value) || !validTime(timeInput.value)) return 'กรุณาระบุวันที่และเวลาให้ถูกต้อง';

  if (timestamp({ date: dateInput.value, time: timeInput.value }) > `${localDate()}T${localTime()}:00`) return 'ไม่สามารถเลือกวันที่หรือเวลาในอนาคตได้';

  for (const [input, label, min, max] of [

    [sysInput, 'ความดันตัวบน', 40, 350], [diaInput, 'ความดันตัวล่าง', 20, 250], [pulseInput, 'ชีพจร', 20, 250]

  ]) {

    const value = Number(input.value);

    if (!input.value.trim() || !Number.isInteger(value) || value < min || value > max) return `กรุณากรอก${label}เป็นจำนวนเต็มระหว่าง ${min}–${max}`;

  }

  if (Number(sysInput.value) <= Number(diaInput.value)) return 'กรุณาตรวจสอบอีกครั้ง: ความดันตัวบนควรมากกว่าตัวล่าง';

  return '';

}

form.addEventListener('submit', (event) => {

  event.preventDefault();

  const error = getError();

  el('formError').hidden = !error;

  el('formError').textContent = error;

  if (error) return;

  const record = {

    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sj-${Date.now()}-${Math.random().toString(36).slice(2)}`,

    date: dateInput.value,

    time: timeInput.value,

    sys: Number(sysInput.value),

    dia: Number(diaInput.value),

    pulse: Number(pulseInput.value),

    note: noteInput.value.trim()

  };

  const original = records;

  const wasDemo = demoMode;

  if (demoMode) { demoMode = false; records = savedRecords.slice(); }

  records = [...records, record];

  sortRecords();

  if (!persist()) { records = original; demoMode = wasDemo; render(); return; }

  form.reset();

  resetDateTime();

  render();

  notify('บันทึกสำเร็จแล้ว ขอบคุณที่ใส่ใจตัวเอง ♡');

  saveChatState();

});



el('showAllBtn').addEventListener('click', () => { showAll = !showAll; renderHistory(); });

el('chartRange').addEventListener('change', renderChart);



// Prevent CSV formula injection when opening user notes in a spreadsheet program.

function csvCell(value) {

  let s = String(value ?? '');

  if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s;

  return '"' + s.replace(/"/g, '""') + '"';

}

el('exportBtn').addEventListener('click', () => {

  if (demoMode) { notify('กรุณาออกจากโหมดทดลองก่อนส่งออกข้อมูลจริง', true); return; }

  if (!records.length) { notify('ยังไม่มีข้อมูลสำหรับส่งออก', true); return; }

  const rows = [['Date', 'Time', 'SYS (mmHg)', 'DIA (mmHg)', 'Pulse (bpm)', 'Note'], ...records.map(r => [r.date, r.time, r.sys, r.dia, r.pulse, r.note])];

  const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));

  const link = document.createElement('a');

  link.href = url;

  link.download = `SaiJai-Health-${localDate()}.csv`;

  document.body.append(link);

  link.click();

  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);

  notify('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว ♡');

});



// ===== อ่านค่าสี: ใช้กรอบอ้างอิง AHA 2025 สำหรับผู้ใหญ่เท่านั้น =====

// สีเหลืองรวม Elevated และ Stage 1 เพื่อให้มองง่าย แต่คำอธิบายแยกให้ชัด

function classifyBP(sys, dia) {

  if (sys > 180 || dia > 120) return { tone: 'red', label: 'ค่าที่สูงมาก · ควรขอความช่วยเหลือทางการแพทย์', text: 'พัก 1 นาทีแล้ววัดซ้ำ หากยังสูงมาก ให้ติดต่อบุคลากรทางการแพทย์ทันที หากมีอาการฉุกเฉินร่วม เช่น เจ็บหน้าอก หายใจลำบาก หรืออ่อนแรงกะทันหัน ให้เรียกบริการฉุกเฉินในพื้นที่' };

  if (sys >= 140 || dia >= 90) return {tone:'red', label:'สูงกว่าช่วงอ้างอิง', text:'ค่าอยู่ในช่วงที่ควรปรึกษาแพทย์หากวัดซ้ำแล้วยังสูง (Stage 2 ตามเกณฑ์ผู้ใหญ่ของ AHA)'};

  if (sys >= 130 || dia >= 80) return {tone:'yellow',label:'ควรติดตาม',text:'อยู่ในช่วงที่ต้องติดตามเพิ่ม (Stage 1 ตามเกณฑ์ผู้ใหญ่ของ AHA) ควรวัดซ้ำหลายวันและปรึกษาบุคลากรทางการแพทย์'};

  if (sys >= 120) return {tone:'yellow',label:'เริ่มสูงกว่าเกณฑ์ปกติ',text:'ค่า SYS อยู่ในช่วง 120–129 โดย DIA ต่ำกว่า 80 (Elevated ตามเกณฑ์ผู้ใหญ่ของ AHA)'};

  if (sys < 90 || dia < 60) return {tone:'blue',label:'ค่าค่อนข้างต่ำ',text:'ค่าอาจต่ำกว่าช่วงที่พบได้ทั่วไป ควรดูอาการและปรึกษาบุคลากรทางการแพทย์หากกังวลหรือมีอาการร่วม'};

  return {tone:'green',label:'ช่วงปกติ (เกณฑ์ผู้ใหญ่)',text:'ค่าตัวบนต่ำกว่า 120 และตัวล่างต่ำกว่า 80 ไม่ได้แปลว่าปลอดจากปัญหาสุขภาพทุกอย่าง'};

}

function renderStatus() {

  const card = el('bpStatusCard');

  const group = el('ageGroup').value;

  const latest = records[0];

  let status = {tone:'none',label:'ยังไม่มีข้อมูล',text:'บันทึกค่าความดันเพื่อดูสถานะเบื้องต้น'};

  if (latest) {

    if (group !== 'adult') status = {tone:'neutral',label:'ไม่จัดระดับสำหรับผู้ต่ำกว่า 18 ปี',text:'การแปลผลเด็กและวัยรุ่นขึ้นกับอายุและข้อมูลทางการแพทย์อื่น ๆ โปรดปรึกษาบุคลากรทางการแพทย์'};

    else status = classifyBP(latest.sys, latest.dia);

  }

  card.className = 'bp-status-card status-' + status.tone;

  el('bpStatusLabel').textContent = (demoMode && latest ? 'ข้อมูลทดลอง · ' : '') + status.label;

  el('bpStatusValue').textContent = latest ? `${latest.sys} / ${latest.dia} mmHg` : '— / — mmHg';

  el('bpStatusDetails').textContent = status.text;

}

el('ageGroup').addEventListener('change', () => {

  try { localStorage.setItem(AGE_GROUP_KEY, el('ageGroup').value); } catch (_) {}

  renderStatus();

});

function buildDemoRecords() {

  const sample = [[118,77,69],[120,78,71],[126,79,74],[129,81,73],[124,78,70],[132,83,75],[121,79,72]];

  return sample.map(([sys,dia,pulse],i) => {

    const day = new Date();

    day.setDate(day.getDate() - (sample.length - i - 1));

    return {id:'demo-'+i,date:localDate(day),time:'08:00',sys,dia,pulse,note:'ข้อมูลจำลองสำหรับสาธิต'};

  }).reverse();

}

function enterDemo() {

  if (demoMode) return;

  demoMode = true;

  records = buildDemoRecords();

  showAll = false;

  render();

  notify('เริ่มทดลองกราฟและประวัติแล้ว · ข้อมูลจริงยังปลอดภัย ♡');

  el('trends').scrollIntoView({behavior:'smooth',block:'start'});

}

function exitDemo() {

  if (!demoMode) return;

  demoMode = false;

  records = savedRecords.slice();

  showAll = false;

  render();

  notify('กลับไปแสดงประวัติจริงแล้ว ♡');

}

el('demoBtn').addEventListener('click',enterDemo);

el('exitDemoBtn').addEventListener('click',exitDemo);



// ===== รายงานสำหรับพิมพ์ / บันทึก PDF =====

// ใช้ Print to PDF ของเบราว์เซอร์ เพื่อรักษาภาษาไทยและกราฟ SVG ให้คมชัด

function preparePrintReport() {

  const latest = records[0];

  el('reportPrintedAt').textContent = 'จัดทำเมื่อ ' + new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeStyle:'short'}).format(new Date());

  el('reportLatest').textContent = latest ? `${latest.sys}/${latest.dia} mmHg · ${latest.pulse} bpm` : '—';

  el('reportAverage').textContent = `${avg('sys')}/${avg('dia')} mmHg`;

  el('reportTotal').textContent = String(records.length) + ' รายการ';

  const reportBody = el('reportBody');

  reportBody.replaceChildren();

  records.forEach(rec => {

    const tr = document.createElement('tr');

    [displayDate(rec.date)+' '+rec.time, rec.sys, rec.dia, rec.pulse, rec.note || '—'].forEach(value => tr.append(cell(value)));

    reportBody.append(tr);

  });

  const rangeSelect = el('chartRange');

  const previousRange = rangeSelect.value;

  rangeSelect.value = '30';

  renderChart();

  const cloned = el('pressureChart').cloneNode(true);

  cloned.removeAttribute('id');

  el('reportChart').replaceChildren(cloned);

  rangeSelect.value = previousRange;

  renderChart();

}

el('printReportBtn').addEventListener('click', () => {

  if (demoMode) {notify('กรุณาออกจากโหมดทดลองก่อนทำรายงานสุขภาพจริง',true);return;}

  if (!records.length) {notify('กรุณาบันทึกข้อมูลก่อนทำรายงาน PDF',true);return;}

  preparePrintReport();

  notify('หน้าต่างพิมพ์จะเปิด เลือก “Save as PDF / บันทึกเป็น PDF” เพื่อเก็บรายงาน ♡');

  window.print();

});



// ===== แจ้งเตือน (ขณะหน้าเว็บเปิดอยู่) =====

let reminderSettings = {enabled:false,time:'08:00',lastSent:''};

function loadReminder() {

  try {

    const parsed = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');

    if (parsed && typeof parsed === 'object') {

      if (validTime(parsed.time)) reminderSettings.time = parsed.time;

      reminderSettings.enabled = parsed.enabled === true;

      reminderSettings.lastSent = typeof parsed.lastSent === 'string' ? parsed.lastSent : '';

    }

  } catch (_) {}

  el('reminderTime').value = reminderSettings.time;

  renderReminderState();

}

function saveReminder() { try {localStorage.setItem(REMINDER_KEY,JSON.stringify(reminderSettings));} catch (_) {} }

function canNotify() {return 'Notification' in window && window.isSecureContext;}

function renderReminderState() {

  const on = reminderSettings.enabled;

  el('enableReminderBtn').textContent = on ? 'บันทึกเวลาใหม่' : 'เปิดการแจ้งเตือน';

  el('disableReminderBtn').hidden = !on;

  el('reminderStatus').textContent = on ? `เปิดเตือนเวลา ${reminderSettings.time} น. · ต้องเปิดเว็บไซต์ค้างไว้` : 'ยังไม่ได้เปิดการแจ้งเตือน';

  if (!canNotify()) el('reminderStatus').textContent += ' · อุปกรณ์/เว็บไซต์นี้ไม่รองรับ Browser Notification';

}

function sendReminderMessage() {

  notify('คุณใจดีมาเตือนแล้ว ♡ ได้เวลาวัดความดันตามที่ตั้งไว้');

  if (canNotify() && Notification.permission === 'granted') {

    try { new Notification('Sai Jai ♡ คุณใจดีเตือนแล้ว', {body:'ถึงเวลาวัดความดันแล้วน้า อย่าลืมบันทึกค่าไว้ด้วยนะคะ ♡',icon:'favicon.svg'}); }

    catch (_) { /* mobile browser may not support constructor */ }

  }

}

function checkReminder() {

  if (!reminderSettings.enabled || !validTime(reminderSettings.time)) return;

  const now = new Date();

  const today = localDate(now);

  if (reminderSettings.lastSent === today) return;

  const mins = now.getHours() * 60 + now.getMinutes();

  const [hours,minutes] = reminderSettings.time.split(':').map(Number);

  const due = hours * 60 + minutes;

  if (mins >= due && mins <= due + 5) {

    reminderSettings.lastSent = today;

    saveReminder();

    sendReminderMessage();

  }

}

el('enableReminderBtn').addEventListener('click',async () => {

  const time = el('reminderTime').value;

  if (!validTime(time)) {notify('กรุณาเลือกเวลาที่ต้องการเตือน',true);return;}

  if (!canNotify()) {notify('การแจ้งเตือนต้องใช้ HTTPS (เช่น Vercel) และเบราว์เซอร์ที่รองรับ',true);return;}

  let permission = Notification.permission;

  if (permission === 'default') permission = await Notification.requestPermission();

  if (permission !== 'granted') {notify('ยังไม่ได้อนุญาตการแจ้งเตือน สามารถเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์',true);return;}

  reminderSettings = {...reminderSettings,enabled:true,time,lastSent:reminderSettings.time === time ? reminderSettings.lastSent : ''};

  saveReminder(); renderReminderState();

  notify('ตั้งเวลาเตือนเรียบร้อยแล้ว ♡');

});

el('disableReminderBtn').addEventListener('click', () => {

  reminderSettings.enabled = false;

  saveReminder(); renderReminderState(); notify('ปิดการแจ้งเตือนแล้ว');

});

window.setInterval(checkReminder,30000);

document.addEventListener('visibilitychange',() => {if(!document.hidden)checkReminder();});



function getTrendDirection() {

  if (records.length < 2) return '';

  const [latest, previous] = records;

  const sysDiff = latest.sys - previous.sys;

  const diaDiff = latest.dia - previous.dia;

  const pulseDiff = latest.pulse - previous.pulse;

  const describe = (value, label) => {

    if (value === 0) return `${label}ใกล้เคียงเดิม`;

    return `${label}${Math.abs(value)} ${value > 0 ? 'สูงขึ้น' : 'ลดลง'}`;

  };

  return `เมื่อเทียบกับครั้งก่อน: ${describe(sysDiff, 'SYS ')} · ${describe(diaDiff, 'DIA ')} · ${describe(pulseDiff, 'ชีพจร ')}`;

}



function normaliseQuestion(text) {

  return text.toLowerCase().trim();

}



function getLatestSummaryText() {

  if (!records.length) {

    return 'ตอนนี้ยังไม่มีข้อมูลที่บันทึกไว้เลยค่ะ ลองเพิ่มค่าความดันครั้งแรกก่อน แล้วคุณใจดีจะช่วยสรุปให้ได้ทั้งค่าล่าสุด ค่าเฉลี่ย และแนวโน้มเบื้องต้นนะคะ ♡';

  }

  const latest = records[0];

  const averageSys = avg('sys');

  const averageDia = avg('dia');

  const averagePulse = records.length ? Math.round(records.reduce((sum, r) => sum + r.pulse, 0) / records.length) : '—';

  const notePart = latest.note ? `

หมายเหตุล่าสุด: ${latest.note}` : '';

  const trend = getTrendDirection();

  return `${demoMode ? 'นี่คือข้อมูลตัวอย่างสำหรับทดลองเว็บ ไม่ใช่ค่าจริงของคุณนะคะ ♡\n\n' : ''}สรุปข้อมูลล่าสุดของคุณตอนนี้นะคะ



• ค่าล่าสุด: ${latest.sys}/${latest.dia} mmHg

• ชีพจรล่าสุด: ${latest.pulse} bpm

• บันทึกเมื่อ: ${displayDate(latest.date)} เวลา ${latest.time} น.

• ค่าเฉลี่ยทั้งหมด: ${averageSys}/${averageDia} mmHg

• ชีพจรเฉลี่ย: ${averagePulse} bpm

• จำนวนบันทึกทั้งหมด: ${records.length} รายการ${notePart}${trend ? `

• ${trend}` : ''}



คุณใจดีช่วยสรุปให้ดูง่าย ๆ ได้ แต่ถ้าค่าดูผิดปกติบ่อย ๆ หรือมีอาการร่วม เช่น เวียนหัว แน่นหน้าอก ปวดศีรษะมาก ควรปรึกษาแพทย์นะคะ`;

}



// ===== Sai Jai ♡ ตอบหลายประเด็นในคำถามเดียว (Rule-based, ไม่ใช้ API) =====
// ทำงานก่อนระบบตอบคำถามแบบเดิม หากไม่มีหลายประเด็นจะคืนค่า null
function getContextualAssistantReply(q) {
  const bpMatch = q.match(/(?:^|[^\d])(\d{2,3})\s*[/／]\s*(\d{2,3})(?!\d)/);
  const hasBP = Boolean(bpMatch) && (/(ความดัน|วัด|mmhg|bp|ค่าที่ได้|ปกติ)/.test(q) || /^\d{2,3}\s*[/／]\s*\d{2,3}$/.test(q));

  // แต่ละหัวข้อเก็บเป็นข้อความสั้น ๆ เพื่อเชื่อมเข้ากับคำตอบหลัก
  const topics = [];
  const add = (name, pattern, detail) => {
    if (pattern.test(q)) topics.push({ name, detail });
  };

  add('sleep', /(นอนดึก|นอนไม่พอ|อดนอน|นอนน้อย|พักผ่อนไม่พอ|นอนไม่หลับ|หลับไม่สนิท|นอนหลับ)/,
    'การพักผ่อนไม่เพียงพออาจเกี่ยวข้องกับความดันที่สูงขึ้นได้ แต่ยังสรุปไม่ได้ว่าเป็นสาเหตุของค่าที่วัดครั้งใดครั้งหนึ่งค่ะ');
  add('stress', /(เครียด|วิตก|กังวล|ตื่นเต้น|ประหม่า)/,
    'ความเครียดหรือความกังวลอาจทำให้ความดันเปลี่ยนชั่วคราวได้ ลองพักอย่างสงบก่อนวัดซ้ำค่ะ');
  add('caffeine', /(กาแฟ|ชาเขียว|ชาไทย|คาเฟอีน|เครื่องดื่มชูกำลัง)/,
    'คาเฟอีนอาจมีผลต่อค่าความดันชั่วคราว ควรเลี่ยงเครื่องดื่มคาเฟอีนอย่างน้อย 30 นาทีก่อนวัดค่ะ');
  add('salt', /(กินเค็ม|อาหารเค็ม|โซเดียม|บะหมี่กึ่งสำเร็จรูป|ของเค็ม)/,
    'การกินอาหารที่มีโซเดียมสูงเป็นประจำอาจส่งผลต่อความดันในระยะยาว แต่ระบุสาเหตุจากอาหารมื้อเดียวไม่ได้ค่ะ');
  add('exercise', /(ออกกำลังกาย|เพิ่งวิ่ง|หลังวิ่ง|ปั่นจักรยาน|เล่นกีฬา|ฟิตเนส)/,
    'ถ้าวัดทันทีหลังออกกำลังกาย ตัวเลขอาจต่างจากค่าขณะพัก ควรเว้นอย่างน้อย 30 นาทีหลังออกกำลังกาย แล้วนั่งพัก 5 นาทีก่อนวัดค่ะ');
  add('symptoms', /(เวียนหัว|หน้ามืด|ปวดหัว|ปวดศีรษะ|ใจสั่น)/,
    'อาการที่เล่ามาควรพิจารณาร่วมกับความดัน หากเป็นมาก เป็นต่อเนื่อง หรือรู้สึกไม่ปลอดภัย ควรแจ้งผู้ใหญ่ที่ไว้ใจและขอคำแนะนำจากบุคลากรทางการแพทย์ค่ะ');

  // ตอบแบบเชื่อมโยงเมื่อมีตัวเลขพร้อมบริบท หรือพบตั้งแต่สองหัวข้อขึ้นไป
  if (!(hasBP && topics.length > 0) && topics.length < 2) return null;

  const parts = ['คุณใจดีลองเชื่อมเรื่องที่เล่ามาให้นะคะ 💗'];

  if (hasBP) {
    const sys = Number(bpMatch[1]);
    const dia = Number(bpMatch[2]);
    if (sys < 40 || sys > 350 || dia < 20 || dia > 250 || sys <= dia) {
      parts.push(`ค่า ${sys}/${dia} mmHg อาจกรอกผิดหรือสลับตัวบน-ตัวล่าง ลองตรวจสอบจากเครื่องอีกครั้งนะคะ`);
      return parts.join('\n\n');
    }
    parts.push(`ค่าที่แจ้ง: ${sys}/${dia} mmHg (ตัวบน SYS ${sys} / ตัวล่าง DIA ${dia})`);

    // ค่าที่สูงมากต้องเน้นการขอความช่วยเหลือก่อนให้คำแนะนำไลฟ์สไตล์
    if (sys > 180 || dia > 120) {
      parts.push('ค่านี้สูงมาก ควรพัก 1 นาทีแล้ววัดซ้ำ หากยังสูงมากให้ติดต่อบุคลากรทางการแพทย์ทันที หากมีอาการฉุกเฉิน เช่น เจ็บหน้าอก หายใจลำบาก หรืออ่อนแรงกะทันหัน ให้ขอความช่วยเหลือฉุกเฉิน (ประเทศไทย 1669) ค่ะ');
      return parts.join('\n\n');
    }

    const ageGroup = document.getElementById('ageGroup')?.value;
    if (/(ตั้งครรภ์|ท้องอยู่|กำลังท้อง)/.test(q)) {
      parts.push('ระหว่างตั้งครรภ์ต้องใช้เกณฑ์ประเมินเฉพาะ ควรนำค่าที่วัดได้ไปปรึกษาบุคลากรทางการแพทย์ค่ะ');
    } else if (ageGroup !== 'adult') {
      parts.push('ตอนนี้เว็บเลือกช่วงอายุต่ำกว่า 18 ปี จึงไม่จัดระดับจากเกณฑ์ผู้ใหญ่ การแปลผลควรให้บุคลากรทางการแพทย์พิจารณาตามอายุและข้อมูลอื่นค่ะ');
    } else {
      const result = classifyBP(sys, dia);
      parts.push(`ตามตัวเลือกเกณฑ์ผู้ใหญ่ของเว็บ: ${result.label}\n${result.text}`);
    }
  }

  // ไม่สรุปเป็นเหตุและผลจากประโยคเดียว และจำกัดข้อความให้เหมาะกับหน้าจอแชต
  const chosen = topics.slice(0, 3);
  parts.push(`เรื่องที่อาจเกี่ยวข้อง:\n${chosen.map(t => '♡ ' + t.detail).join('\n')}`);
  if (topics.length > chosen.length) parts.push('ยังมีปัจจัยอื่นที่คุณเล่ามาด้วย ควรพิจารณาร่วมกันนะคะ');

  parts.push(hasBP
    ? 'แนะนำให้นั่งพักอย่างน้อย 5 นาที วัดซ้ำอย่างถูกวิธี และจดวันเวลาไว้เปรียบเทียบหลายครั้งนะคะ ผลครั้งเดียวไม่ใช่การวินิจฉัย ♡'
    : 'ลองดูแลตัวเองทีละเรื่องและสังเกตอาการนะคะ หากกังวลหรือมีอาการต่อเนื่อง ควรปรึกษาบุคลากรทางการแพทย์ค่ะ ♡');

  return parts.join('\n\n');
}

// ===== Sai Jai ♡ ฐานความรู้การอ่านค่าความดัน (AHA/ACC 2025) =====
// อ้างอิง https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know
// และ https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home
// เป็นข้อมูลการศึกษา ไม่ใช้วินิจฉัย ผู้ต่ำกว่า 18 ปีและผู้ตั้งครรภ์ต้องใช้การประเมินเฉพาะ
function getResearchAssistantReply(q) {
  const ageGroup = document.getElementById('ageGroup')?.value;
  const isMinor = ageGroup !== 'adult';
  const special = 'เด็ก วัยรุ่น และผู้ตั้งครรภ์ควรได้รับการประเมินตามเกณฑ์เฉพาะจากบุคลากรทางการแพทย์';

  if (/(เกณฑ์|ระดับ|แบ่งระดับ|ตาราง|แต่ละช่วง|ตัวเลข.*บอกอะไร|ความดัน.*มีกี่ระดับ)/.test(q)
      && /(ความดัน|mmhg|bp|ค่าบน|ค่าล่าง|ตัวเลข)/.test(q)) {
    if (isMinor) return `คุณใจดีช่วยอธิบายได้ค่ะ 💗\n\nSYS คือตัวบนขณะหัวใจบีบตัว ส่วน DIA คือตัวล่างขณะหัวใจคลายตัว หน่วยเป็น mmHg\n\nตอนนี้เว็บเลือกช่วงอายุต่ำกว่า 18 ปี จึงไม่แสดงเกณฑ์จัดระดับสำหรับผู้ใหญ่ค่ะ ${special}นะคะ`;
    return `เกณฑ์การอ่านความดันสำหรับผู้ใหญ่ ตาม AHA/ACC ปี 2025 ค่ะ 💗\n\n♡ ปกติ: SYS ต่ำกว่า 120 และ DIA ต่ำกว่า 80\n♡ สูงกว่าปกติ (Elevated): SYS 120–129 และ DIA ต่ำกว่า 80\n♡ Stage 1: SYS 130–139 หรือ DIA 80–89\n♡ Stage 2: SYS ตั้งแต่ 140 หรือ DIA ตั้งแต่ 90\n♡ สูงมาก: SYS มากกว่า 180 หรือ DIA มากกว่า 120 ต้องได้รับคำแนะนำทางการแพทย์โดยเร็ว\n\nใช้ระดับที่สูงกว่าระหว่างตัวบนและตัวล่าง และต้องพิจารณาจากการวัดอย่างถูกวิธีหลายครั้ง ไม่ใช่ผลวัดครั้งเดียวค่ะ\n\n${special}นะคะ ♡`;
  }

  if (/(ชีพจร|อัตราการเต้นของหัวใจ|heart rate|pulse)/.test(q)
      && /(ปกติ|เท่าไหร่|กี่ครั้ง|กี่ bpm|กี่ครั้งต่อนาที|สูง|ต่ำ)/.test(q)) {
    return `ชีพจร (Pulse) คือจำนวนครั้งที่หัวใจเต้นในหนึ่งนาที หน่วย bpm ค่ะ 💗\n\nสำหรับผู้ใหญ่ส่วนใหญ่ ขณะพักอย่างสงบ มักอยู่ราว 60–100 ครั้ง/นาที แต่ช่วงอายุ กิจกรรม ความเครียด และสุขภาพทำให้แตกต่างกันได้ค่ะ\n\nตัวเลขเพียงครั้งเดียวไม่ได้บอกว่ามีโรคหรือไม่ หากมีอาการผิดปกติร่วมด้วยหรือกังวล ควรปรึกษาบุคลากรทางการแพทย์นะคะ`;
  }

  if (/(วัดวันละกี่ครั้ง|วัดกี่ครั้ง|เช้าหรือเย็น|เช้า.*เย็น|ก่อนนอน|วัด.*สัปดาห์|ต้องวัดทุกวัน|ต้องวัดทุกเดือน)/.test(q)
      && /(วัด|ความดัน|เช้า|เย็น)/.test(q)) {
    return `ถ้าต้องติดตามความดันที่บ้าน คุณใจดีแนะนำแบบนี้ค่ะ ⏰\n\n♡ วัดในเวลาใกล้เคียงกันตามที่บุคลากรทางการแพทย์แนะนำ\n♡ ก่อนวัด นั่งพักอย่างน้อย 5 นาที หลังพิง เท้าวางราบ แขนอยู่ระดับหัวใจ\n♡ แต่ละครั้งอาจวัด 2 รอบ ห่างกันประมาณ 1 นาที และจดผลไว้\n♡ หากได้รับคำแนะนำให้วัดช่วงเช้าและเย็น ให้ใช้ตารางที่เหมาะกับแผนติดตามของตัวเอง\n\nไม่จำเป็นว่าทุกคนต้องวัดเช้าและก่อนนอนติดต่อกัน 7 วันทุกเดือนนะคะ ความถี่ขึ้นอยู่กับเหตุผลที่ติดตามและคำแนะนำจากผู้เชี่ยวชาญ ♡`;
  }

  if (/(sys|dia|systolic|diastolic|ตัวบน|ตัวล่าง|ค่าบน|ค่าล่าง)/.test(q)
      && /(อะไร|หมายถึง|คืออะไร|แปลว่า|บอกอะไร)/.test(q)) {
    return `ตัวเลขความดันมี 2 ค่าค่ะ 💗\n\n♡ SYS (Systolic) คือความดันในหลอดเลือดแดงขณะหัวใจบีบตัว เป็นค่าตัวบน\n♡ DIA (Diastolic) คือความดันในหลอดเลือดแดงขณะหัวใจคลายตัว เป็นค่าตัวล่าง\n\nตัวอย่าง 120/80 mmHg หมายถึง SYS 120 และ DIA 80 โดยไม่ได้หมายความว่าค่านี้เป็นเกณฑ์ปกติในทุกช่วงอายุนะคะ`;
  }

  if (/(ปกติ|มาตรฐาน|เท่าไหร่)/.test(q)
      && /(ความดัน|blood pressure|ค่าความดัน|bp)/.test(q)) {
    if (isMinor) return `ค่าความดันต้องแปลผลตามช่วงอายุค่ะ 💗\n\nขณะนี้เว็บเลือกผู้ต่ำกว่า 18 ปี จึงไม่ใช้ช่วงอ้างอิงของผู้ใหญ่มาจัดระดับให้โดยตรง ${special}ค่ะ`;
    return `สำหรับผู้ใหญ่ AHA/ACC 2025 ระบุว่าความดันปกติ คือค่าตัวบน (SYS) ต่ำกว่า 120 และค่าตัวล่าง (DIA) ต่ำกว่า 80 mmHg ค่ะ 💗\n\nหาก SYS 120–129 โดย DIA ต่ำกว่า 80 เรียก Elevated; ถ้า SYS 130–139 หรือ DIA 80–89 อยู่ในช่วง Stage 1 ตามเกณฑ์ผู้ใหญ่\n\nไม่ควรใช้ตัวเลข 90–140/60–90 เป็นช่วงปกติแบบเหมารวม และไม่ใช้ผลครั้งเดียววินิจฉัยนะคะ ♡`;
  }

  return null;
}

// ===== คุณใจดี: ชุดคำตอบเสริม (ฟรี ไม่เชื่อม API) =====
function getExtraAssistantReply(q) {
  // ให้คำเตือนเรื่องภาวะฉุกเฉินก่อนตรวจจับหัวข้อทั่วไป
  if (/(เจ็บหน้าอก|หายใจไม่ออก|หายใจลำบาก|หมดสติ|อ่อนแรงครึ่งซีก|พูดไม่ชัดกะทันหัน)/.test(q)) {
    return `คุณใจดีเป็นห่วงนะคะ 💗\n\nอาการที่เล่ามาอาจเป็นภาวะฉุกเฉินได้ค่ะ หากมีอาการเหล่านี้อยู่ตอนนี้ ควรแจ้งคนใกล้ตัวและขอความช่วยเหลือทางการแพทย์ทันที\n\nในประเทศไทยโทร 1669 เพื่อขอความช่วยเหลือฉุกเฉินได้ค่ะ อย่ารอคำตอบจากแชตบอตแทนการรักษานะคะ ♡`;
  }

  // จับบริบทหลายเรื่องก่อน (หลังเช็กเหตุฉุกเฉิน)
  const contextualReply = getContextualAssistantReply(q);
  if (contextualReply !== null) return contextualReply;

  const researchReply = getResearchAssistantReply(q);
  if (researchReply !== null) return researchReply;

  // ค่าความดันที่ผู้ใช้พิมพ์โดยตรง เช่น 135/85
  const match = q.match(/(?:^|[^\d])(\d{2,3})\s*[/／]\s*(\d{2,3})(?!\d)/);
  if (match && (/(ความดัน|วัด|mmhg|bp|ค่าที่ได้|ปกติ)/.test(q) || /^\d{2,3}\s*[/／]\s*\d{2,3}$/.test(q))) {
    const sys = Number(match[1]);
    const dia = Number(match[2]);
    if (sys <= dia || sys > 350 || sys < 40 || dia < 20 || dia > 250) {
      return `คุณใจดีอ่านค่า ${sys}/${dia} ได้แล้วค่ะ ♡\n\nแต่ตัวเลขอาจสลับกันหรือไม่ถูกต้อง ลองตรวจสอบจากเครื่องวัดอีกครั้งนะคะ`;
    }
    if (sys > 180 || dia > 120) {
      return `ค่าที่แจ้งคือ ${sys}/${dia} mmHg ค่ะ 💗\n\nเป็นค่าที่สูงมาก ให้พักสัก 1 นาทีแล้ววัดซ้ำ หากยังสูงมากควรติดต่อบุคลากรทางการแพทย์ทันที หากมีอาการฉุกเฉินร่วม เช่น เจ็บหน้าอก หายใจลำบาก หรืออ่อนแรงกะทันหัน ให้ขอความช่วยเหลือฉุกเฉินค่ะ\n\nคุณใจดีไม่สามารถวินิจฉัยจากตัวเลขครั้งเดียวได้นะคะ`;
    }
    const ageGroup = document.getElementById('ageGroup')?.value;
    if (ageGroup !== 'adult') {
      return `คุณใจดีได้รับค่า ${sys}/${dia} mmHg แล้วค่ะ ♡\n\nสำหรับเด็กและวัยรุ่น การประเมินความดันต้องพิจารณาอายุและข้อมูลอื่นร่วมด้วย ไม่สามารถจัดระดับจากตัวเลขนี้เพียงอย่างเดียวได้ค่ะ\n\nลองจดบันทึกและปรึกษาบุคลากรทางการแพทย์เพื่อแปลผลให้เหมาะกับช่วงอายุนะคะ 💗`;
    }
    const status = classifyBP(sys, dia);
    return `คุณใจดีอ่านค่าให้แล้วนะคะ 💗\n\n♡ SYS: ${sys} mmHg\n♡ DIA: ${dia} mmHg\n\nผลเบื้องต้นตามเกณฑ์ผู้ใหญ่: ${status.label}\n\n${status.text}\n\nผลครั้งเดียวใช้วินิจฉัยโรคไม่ได้ ควรติดตามหลายครั้งและปรึกษาบุคลากรทางการแพทย์เมื่อกังวลนะคะ ♡`;
  }

  if (/(นอน|หลับ|ง่วง|พักผ่อน)/.test(q)) {
    return `การนอนสำคัญต่อสุขภาพนะคะ 🌙💗\n\n♡ เข้านอนและตื่นให้ใกล้เคียงกันทุกวัน\n♡ ลดการเล่นโทรศัพท์ก่อนนอน\n♡ จัดห้องให้เงียบและสบาย\n♡ หลีกเลี่ยงคาเฟอีนช่วงเย็น\n♡ ทำกิจกรรมผ่อนคลายก่อนเข้านอน\n\nโดยทั่วไปวัยรุ่นควรนอน 8–10 ชั่วโมง ส่วนผู้ใหญ่ส่วนใหญ่ควรนอนอย่างน้อย 7 ชั่วโมงค่ะ หากนอนไม่หลับต่อเนื่องจนกระทบชีวิตประจำวัน ควรปรึกษาบุคลากรทางการแพทย์นะคะ ♡`;
  }

  if (/(เครียด|กังวล|เหนื่อยใจ|วิตก|ไม่สบายใจ)/.test(q)) {
    return `วันนี้มีเรื่องให้กังวลอยู่หรือเปล่าคะ 💗\n\nลองพักจากสิ่งที่ทำให้เครียดสักครู่ หายใจช้า ๆ อย่างสบาย ฟังเพลงที่ชอบ หรือพูดคุยกับคนที่ไว้ใจค่ะ\n\nหากความเครียดรบกวนชีวิตประจำวันมาก ๆ ควรพูดคุยกับผู้เชี่ยวชาญด้วยนะคะ\n\nคุณใจดีเป็นแชตบอตที่ตอบตามหัวข้อที่ตั้งไว้ จึงยังไม่เข้าใจทุกเรื่องเหมือนคนจริง ๆ ค่ะ ♡`;
  }

  if (/(อาหาร|กินอะไร|ทานอะไร|โภชนาการ|โซเดียม|ลดเค็ม|กินเค็ม)/.test(q)) {
    return `เรื่องอาหารสำคัญต่อสุขภาพด้วยค่ะ 🥗💗\n\n♡ รับประทานอาหารให้หลากหลายและเพียงพอ\n♡ เพิ่มผักและผลไม้\n♡ เลือกโปรตีนและธัญพืชหลากหลาย\n♡ ลดอาหารโซเดียมสูงที่กินเป็นประจำ\n♡ ดื่มน้ำให้เพียงพอตามความเหมาะสม\n\nไม่จำเป็นต้องงดอาหารที่ชอบทั้งหมดนะคะ ดูแลตัวเองแบบสมดุลและต่อเนื่องจะเหมาะกว่าค่ะ ♡`;
  }

  if (/(ออกกำลังกาย|เดินเล่น|วิ่ง|โยคะ|ฟิตเนส|ขยับร่างกาย)/.test(q)) {
    return `การขยับร่างกายช่วยดูแลสุขภาพได้ค่ะ 🌷\n\nลองเลือกกิจกรรมที่ชอบ เช่น เดินเล่น ปั่นจักรยาน เต้น เล่นกีฬา หรือยืดเหยียดเบา ๆ\n\nเริ่มตามความพร้อมของตัวเองและพักเมื่อเหนื่อย หากมีอาการผิดปกติระหว่างออกกำลังกายควรหยุดและขอคำแนะนำจากบุคลากรทางการแพทย์นะคะ ♡`;
  }

  if (/(เวลาไหน|ตอนไหน|ช่วงไหน|ตอนเช้า|ตอนเย็น)/.test(q) && /(วัด|ความดัน)/.test(q)) {
    return `ถ้าอยากติดตามแนวโน้มความดัน แนะนำให้วัดอย่างสม่ำเสมอค่ะ ⏰\n\n♡ วัดในเวลาใกล้เคียงกัน\n♡ นั่งพักอย่างน้อย 5 นาทีก่อนวัด\n♡ เลี่ยงคาเฟอีนและการออกกำลังกายก่อนวัดอย่างน้อย 30 นาที\n♡ จดวันที่ เวลา และค่าที่วัด\n\nหากแพทย์นัดเวลาวัดไว้ ควรทำตามคำแนะนำแพทย์นะคะ ♡`;
  }

  if (/(ข้อมูลปลอดภัย|ความเป็นส่วนตัว|เก็บข้อมูลที่ไหน|localstorage|ข้อมูลหาย)/.test(q)) {
    return `ข้อมูลสุขภาพของคุณสำคัญมากค่ะ 🔒💗\n\nSai Jai เวอร์ชันนี้เก็บบันทึกไว้ใน localStorage ของเบราว์เซอร์บนอุปกรณ์ที่ใช้งาน\n\n♡ ไม่มีการส่งคำถามไปยัง AI API\n♡ ไม่ซิงก์ข้ามอุปกรณ์อัตโนมัติ\n♡ หากล้างข้อมูลเว็บไซต์ ประวัติอาจหายได้\n♡ ส่งออกบันทึกความดันเป็น CSV เพื่อสำรองได้\n\nหากใช้อุปกรณ์ร่วมกับผู้อื่น ควรระวังเรื่องความเป็นส่วนตัวด้วยนะคะ ♡`;
  }

  return null; // ใช้คำตอบเดิมต่อเมื่อหัวข้อใหม่ไม่ตรง
}

function getAssistantReply(question) {

  const q = normaliseQuestion(question);

  const extraReply = getExtraAssistantReply(q);
  if (extraReply !== null) return extraReply;


  if (!q) return 'พิมพ์คำถามมาได้เลยนะคะ คุณใจดีพร้อมช่วยตอบอย่างอ่อนโยนเสมอ ♡';



  if (/(สรุป|ข้อมูลล่าสุด|ค่าล่าสุด|ของฉัน|บันทึกของฉัน|แนวโน้ม)/.test(q)) {

    return getLatestSummaryText();

  }



  if (/(sys|dia|ตัวบน|ตัวล่าง)/.test(q) && /(คือ|อะไร|แปล)/.test(q)) {

    return `SYS คือค่าความดันตัวบน เป็นแรงดันตอนหัวใจบีบตัวค่ะ ส่วน DIA คือค่าความดันตัวล่าง เป็นแรงดันตอนหัวใจคลายตัว



สรุปง่าย ๆ

• SYS = ตัวบน

• DIA = ตัวล่าง



เวลาบันทึกใน Sai Jai เราจะเห็นเป็นรูปแบบ เช่น 120/80 mmHg โดย 120 คือ SYS และ 80 คือ DIA นะคะ`;

  }



  if (/(ปกติ|มาตรฐาน|เท่าไหร่)/.test(q) && /(ความดัน|bp|blood pressure|ค่าความดัน)/.test(q)) {

    return `โดยทั่วไปสำหรับผู้ใหญ่ ค่าความดันที่มักพบว่าอยู่ในเกณฑ์ปกติจะใกล้เคียงประมาณ 120/80 mmHg ค่ะ



แต่การแปลผลจริงควรดูหลายอย่างร่วมกัน เช่น

• อายุ

• โรคประจำตัว

• เวลาที่วัด

• วัดซ้ำหลายครั้งหรือไม่



ถ้าค่าสูงหรือต่ำผิดปกติบ่อย ๆ ควรจดบันทึกไว้แล้วนำไปปรึกษาแพทย์นะคะ`;

  }



  if (/(วัด|แม่น|ถูกต้อง|ยังไง|อย่างไร)/.test(q) && /(ความดัน|bp|blood pressure)/.test(q)) {

    return `วิธีวัดความดันให้แม่นขึ้นแบบง่าย ๆ ค่ะ



1 ) พักอย่างน้อย 5 นาที ก่อนวัด

2 ) งดชา กาแฟ บุหรี่ และออกกำลังกายหนักก่อนวัดสักพัก

3 ) นั่งหลังพิง เก้าอี้ เท้าวางราบ ไม่ไขว่ห้าง

4 ) วางแขนให้อยู่ระดับเดียวกับหัวใจ

5 ) พันผ้าพันแขนให้พอดี

6 ) วัดในเวลาใกล้เคียงกันแต่ละวัน

7 ) ถ้าวัดครั้งแรกสูง ลองพักแล้ววัดซ้ำอีก 1–2 ครั้ง



ถ้าต้องการ คุณสามารถถามต่อว่า “ควรวัดเวลาไหนดีที่สุด” ได้เลยนะคะ ♡`;

  }



  if (/(สูง|เกิน|ขึ้นสูง|ความดันสูง)/.test(q)) {

    return `ถ้าค่าความดันดูสูงกว่าปกติ สิ่งที่ทำได้เบื้องต้นคือ



• นั่งพักให้สบาย 5–10 นาที

• วัดซ้ำอีกครั้งอย่างถูกวิธี

• บันทึกค่า เวลา และอาการร่วม เช่น ปวดหัว เวียนหัว แน่นหน้าอก



ถ้าค่าสูงมาก หรือมีอาการผิดปกติร่วมด้วย ควรติดต่อบุคลากรทางการแพทย์ทันทีนะคะ เพราะคุณใจดีให้ได้เพียงข้อมูลทั่วไป ไม่สามารถวินิจฉัยโรคได้ ♡`;

  }



  if (/(ต่ำ|ความดันต่ำ)/.test(q)) {

    return `ถ้าความดันดูต่ำกว่าปกติและมีอาการ เช่น เวียนหัว หน้ามืด อ่อนแรง ควรนั่งหรือนอนพักก่อน และดื่มน้ำถ้าไม่มีข้อห้ามค่ะ



ถ้าอาการไม่ดีขึ้น เป็นบ่อย หรือมีอาการมาก ควรไปพบแพทย์นะคะ โดยเฉพาะถ้ามีอาการหน้ามืดจนเกือบเป็นลม`;

  }



  if (/(ชีพจร|pulse)/.test(q)) {

    return `ชีพจรคือจำนวนครั้งที่หัวใจเต้นต่อนาที หรือ bpm ค่ะ การอ่านค่าชีพจรควรดูร่วมกับอาการและบริบท เช่น พักผ่อนอยู่ ออกกำลังกาย หรือกำลังกังวลอยู่



ใน Sai Jai เราเก็บค่าชีพจรไว้คู่กับความดัน เพื่อให้เห็นภาพรวมของสุขภาพได้ดีขึ้นนะคะ`;

  }



  if (/(ใช้งาน|ใช้ยังไง|เว็บนี้|บันทึกยังไง|csv|ส่งออก)/.test(q)) {

    return `วิธีใช้ Sai Jai แบบเร็ว ๆ ค่ะ



• ไปที่ส่วน “บันทึกค่าความดัน” แล้วกรอกวันที่ เวลา SYS DIA และชีพจร

• กดปุ่มบันทึก เพื่อเก็บข้อมูลลงในเบราว์เซอร์ของเครื่องนี้

• ดูค่าล่าสุดและค่าเฉลี่ยได้ที่ด้านบน

• ดูแนวโน้มได้จากกราฟ

• ดูย้อนหลังหรือลบรายการได้ในส่วนประวัติ

• กด “ส่งออก CSV” เพื่อดาวน์โหลดข้อมูลเก็บไว้ได้



ถ้าต้องการ คุณใจดีช่วยอธิบายทีละขั้นตอนได้ด้วยนะคะ`;

  }



  if (/(สวัสดี|hello|hi|หวัดดี)/.test(q)) {

    return `สวัสดีค่า เราคือ “คุณใจดี” AI ผู้ช่วยตัวน้อยของ Sai Jai ♡ ถามเรื่องความดัน การดูแลตัวเองเบื้องต้น หรือวิธีใช้เว็บนี้ได้เลยนะคะ`;

  }



  return `คุณใจดีพอเข้าใจคำถามแล้วนะคะ แต่ยังตอบได้ดีที่สุดในเรื่องต่อไปนี้ค่ะ



• ค่าความดันปกติเท่าไหร่

• วิธีวัดความดันให้แม่น

• SYS / DIA คืออะไร

• ถ้าค่าสูงหรือต่ำควรทำอย่างไรเบื้องต้น

• สรุปข้อมูลล่าสุดของฉัน

• วิธีใช้เว็บ Sai Jai



ลองพิมพ์สั้น ๆ ใหม่อีกนิดได้เลยนะคะ ♡`;

}



function createAvatar(role) {

  const avatar = document.createElement('div');

  avatar.className = 'chat-avatar';

  if (role === 'assistant') {

    const img = document.createElement('img');

    img.src = 'images/jaidee-avatar.webp';

    img.alt = 'คุณใจดี';

    avatar.append(img);

  } else {

    avatar.textContent = 'คุณ';

    avatar.style.fontSize = '11px';

    avatar.style.fontWeight = '700';

    avatar.style.color = '#7F6E8D';

    avatar.style.background = '#F4EDFF';

    avatar.style.borderColor = '#E4D8FB';

  }

  return avatar;

}



function addMessage(role, text, meta) {

  const row = document.createElement('div');

  row.className = `message-row ${role}`;



  if (role === 'assistant') row.append(createAvatar(role));



  const bubble = document.createElement('div');

  bubble.className = role === 'assistant' ? 'assistant-bubble' : 'user-bubble';

  if (meta) {

    const metaEl = document.createElement('span');

    metaEl.className = 'message-meta';

    metaEl.textContent = meta;

    bubble.append(metaEl);

  }

  bubble.append(document.createTextNode(text));

  row.append(bubble);



  if (role === 'user') row.append(createAvatar(role));



  assistantMessages.append(row);

  assistantMessages.scrollTop = assistantMessages.scrollHeight;

}



function serializeChat() {

  return [...assistantMessages.querySelectorAll('.message-row')].map(row => {

    const role = row.classList.contains('user') ? 'user' : 'assistant';

    const bubble = row.querySelector('.user-bubble, .assistant-bubble');

    const meta = bubble.querySelector('.message-meta')?.textContent || '';

    const text = bubble.childNodes[bubble.childNodes.length - 1]?.textContent || bubble.textContent;

    return { role, meta, text };

  });

}



function saveChatState() {

  try {

    localStorage.setItem(AI_CHAT_KEY, JSON.stringify(serializeChat().slice(-20)));

  } catch (_) {

    // ignore storage errors for chat history

  }

}



function loadChatState() {

  assistantMessages.replaceChildren();

  let loaded = false;

  try {

    const raw = JSON.parse(localStorage.getItem(AI_CHAT_KEY) || '[]');

    if (Array.isArray(raw) && raw.length) {

      raw.forEach(item => {

        if (item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string') {

          addMessage(item.role, item.text, item.meta || (item.role === 'assistant' ? 'คุณใจดี AI' : 'คำถามของคุณ'));

          loaded = true;

        }

      });

    }

  } catch (_) {

    // ignore parse errors and fall back to welcome

  }

  if (!loaded) {

    addMessage('assistant',

      'สวัสดีค่า เราคือ “คุณใจดี” ผู้ช่วยตอบคำถามอัตโนมัติของ Sai Jai ♡\n\nถามได้เลยนะคะ เช่น\n• ค่าความดันปกติเท่าไหร่\n• วิธีวัดความดันให้แม่น\n• SYS DIA คืออะไร\n• สรุปข้อมูลล่าสุดของฉัน\n\nเราจะช่วยตอบแบบอ่านง่ายและนุ่มนวลค่ะ',

      'คุณใจดี AI');

    saveChatState();

  }

}



let assistantPending = false;

function addTypingIndicator() {

  const row = document.createElement('div');

  row.id = 'assistantTyping';

  row.className = 'typing-indicator';

  row.setAttribute('role','status');

  row.setAttribute('aria-label','คุณใจดีกำลังคิด');

  const avatar = createAvatar('assistant');

  const pill = document.createElement('div');

  pill.className = 'typing-pill';

  pill.textContent = 'คุณใจดีกำลังคิด';

  const dots = document.createElement('span');

  dots.className = 'typing-dots';

  for(let i=0;i<3;i++) dots.append(document.createElement('i'));

  pill.append(dots);

  row.append(avatar,pill);

  assistantMessages.append(row);

  assistantMessages.scrollTop = assistantMessages.scrollHeight;

}

function clearTypingIndicator(){document.getElementById('assistantTyping')?.remove();}

function askAssistant(question) {

  const trimmed = question.trim();

  if (!trimmed || assistantPending) return;

  assistantPending = true;

  addMessage('user', trimmed, 'คำถามของคุณ');

  assistantInput.value = '';

  assistantForm.querySelector('button[type="submit"]').disabled = true;

  quickQuestions.forEach(button => {button.disabled = true;});

  saveChatState();

  addTypingIndicator();

  aiTypingTimer = setTimeout(() => {

    clearTypingIndicator();

    const reply = getAssistantReply(trimmed);

    addMessage('assistant', reply, 'คุณใจดี · ผู้ช่วยตอบคำถามอัตโนมัติ');

    reactMascot('happy', 1700);

    assistantPending = false;

    assistantForm.querySelector('button[type="submit"]').disabled = false;

    quickQuestions.forEach(button => {button.disabled = false;});

    saveChatState();

  }, 1300);

}



assistantForm.addEventListener('submit', (event) => {

  event.preventDefault();

  askAssistant(assistantInput.value);

});



quickQuestions.forEach(button => {

  button.addEventListener('click', () => askAssistant(button.textContent || ''));

});



const clearChatModal = el('clearChatModal');

const cancelClearChat = el('cancelClearChat');

const confirmClearChat = el('confirmClearChat');

let clearChatPreviousFocus = null;



function closeClearChatModal() {

  clearChatModal.hidden = true;

  document.body.style.overflow = '';

  (clearChatPreviousFocus || clearChatBtn).focus();

}

clearChatBtn.addEventListener('click', () => {

  clearChatPreviousFocus = document.activeElement;

  clearChatModal.hidden = false;

  document.body.style.overflow = 'hidden';

  cancelClearChat.focus();

});

cancelClearChat.addEventListener('click', closeClearChatModal);

clearChatModal.addEventListener('click', (event) => {

  if (event.target === clearChatModal) closeClearChatModal();

});

document.addEventListener('keydown', (event) => {

  if (clearChatModal.hidden) return;

  if (event.key === 'Escape') { event.preventDefault(); closeClearChatModal(); }

  if (event.key === 'Tab') {

    const buttons = [cancelClearChat, confirmClearChat];

    const i = buttons.indexOf(document.activeElement);

    if (event.shiftKey && i === 0) { event.preventDefault(); confirmClearChat.focus(); }

    else if (!event.shiftKey && i === 1) { event.preventDefault(); cancelClearChat.focus(); }

  }

});

confirmClearChat.addEventListener('click', () => {

  closeClearChatModal();

  clearTimeout(aiTypingTimer);

  clearTypingIndicator();

  assistantPending = false;

  assistantForm.querySelector('button[type="submit"]').disabled = false;

  quickQuestions.forEach(button => {button.disabled = false;});

  try { localStorage.removeItem(AI_CHAT_KEY); } catch (_) {}

  loadChatState();

  notify('ล้างแชตของคุณใจดีแล้ว ♡');

});



function init() {

  resetDateTime();

  el('todayText').textContent = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  loadRecords();

  try { const group = localStorage.getItem(AGE_GROUP_KEY); if (group === 'adult' || group === 'minor') el('ageGroup').value = group; } catch (_) {}

  render();

  loadReminder();

  loadChatState();

}



init();





// ===== คุณใจดี Chibi: สลับ 3 ภาพที่ผู้ใช้เลือกให้เป็นแอนิเมชัน =====

// ไฟล์ภาพต้องอยู่ในโฟลเดอร์ images/ (รวมอยู่ใน ZIP แล้ว)

const mascotImages = {

  normal: 'images/jaidee-normal.webp',   // หน้าปกติ

  happy: 'images/jaidee-happy.webp',     // ยิ้มตาปิด

  heart: 'images/jaidee-heart.webp'      // ถือหัวใจ

};

const mascotSlots = [...document.querySelectorAll('[data-mascot]')];

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let mascotTimeout = null;

let mascotSequenceIndex = 0;



// preload ลดอาการกระพริบ/ภาพขาวตอนเปลี่ยนท่า

for (const src of Object.values(mascotImages)) {

  const image = new Image();

  image.src = src;

}



function setMascotPose(pose) {

  const src = mascotImages[pose] || mascotImages.normal;

  mascotSlots.forEach(slot => {

    const layers = slot.querySelectorAll('.mascot-frame');

    const active = Number(slot.dataset.active || 0);

    if (layers[active].dataset.pose === pose) return;

    const next = 1 - active;

    layers[next].src = src;

    layers[next].dataset.pose = pose;

    // update visible layer after source assignment; CSS fades between the two layers

    layers[next].classList.add('is-visible');

    layers[active].classList.remove('is-visible');

    slot.dataset.active = String(next);

  });

}



// อยู่ท่าปกติเป็นหลัก; สลับยิ้มสั้น ๆ และถือหัวใจเป็นครั้งคราว

const mascotCycle = [

  { pose:'normal', duration:3200 },

  { pose:'happy', duration:750 },

  { pose:'normal', duration:2700 },

  { pose:'heart', duration:1750 },

  { pose:'normal', duration:2400 }

];



function runMascotCycle() {

  if (reducedMotion || document.hidden) return;

  const frame = mascotCycle[mascotSequenceIndex];

  setMascotPose(frame.pose);

  mascotSequenceIndex = (mascotSequenceIndex + 1) % mascotCycle.length;

  mascotTimeout = window.setTimeout(runMascotCycle, frame.duration);

}



function reactMascot(pose='heart', duration=1900) {

  if (mascotTimeout) window.clearTimeout(mascotTimeout);

  setMascotPose(pose);

  if (!reducedMotion) {

    mascotSequenceIndex=0;

    mascotTimeout=window.setTimeout(runMascotCycle, duration);

  }

}



// แตะที่ตัวละครเพื่อดูท่าหัวใจ

for (const button of document.querySelectorAll('.mascot-action')) {

  button.addEventListener('click', () => reactMascot('heart', 2000));

}



// เมื่อถามคำถาม: ตอบสนองด้วยสีหน้า และยิ้มเมื่อคุณใจดีตอบ

assistantForm.addEventListener('submit', () => reactMascot('heart', 2200));

quickQuestions.forEach(button => button.addEventListener('click', () => reactMascot('heart', 2200)));



document.addEventListener('visibilitychange', () => {

  if (mascotTimeout) window.clearTimeout(mascotTimeout);

  if (!document.hidden && !reducedMotion) runMascotCycle();

});



if (!reducedMotion) runMascotCycle();

// When original WebP mascot sprites cannot be found, show a heart instead of broken images.
for (const slot of document.querySelectorAll('[data-mascot]')) {
  const frames = [...slot.querySelectorAll('.mascot-frame')];
  frames.forEach(img => {
    img.addEventListener('error', () => {
      if (!frames.some(frame => frame.complete && frame.naturalWidth > 0)) {
        slot.dataset.noImages = 'true';
      }
    });
    img.addEventListener('load', () => { delete slot.dataset.noImages; });
  });
  if (frames.every(img => img.complete && img.naturalWidth === 0)) slot.dataset.noImages = 'true';
}