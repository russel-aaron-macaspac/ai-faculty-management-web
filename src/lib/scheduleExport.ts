import { Schedule } from '@/types/schedule';
import { formatTimeToTwelveHour, parseTimeToMinutes } from '@/lib/timeUtils';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const START_MINUTES = 7 * 60;
const END_MINUTES = 21 * 60;
const SLOT_MINUTES = 30;

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const formatClockTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  return formatTimeToTwelveHour(`${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
};

const formatSlot = (minutes: number) => `${formatClockTime(minutes)} - ${formatClockTime(minutes + SLOT_MINUTES)}`;

const getCellColor = (schedule: Schedule) => {
  if (schedule.status === 'approved') return '#ffc000';
  if (schedule.status === 'rejected') return '#ffff00';
  return '#f6b900';
};

const renderScheduleCell = (schedule: Schedule) => `
  <div class="schedule-cell" style="background-color:${getCellColor(schedule)}">
    <div>${escapeHtml(schedule.subject?.name || schedule.subject?.code || 'Scheduled class')}</div>
    <div>${escapeHtml(schedule.section || '')}</div>
    <div>${escapeHtml(schedule.facultyName || '')}</div>
  </div>`;

export const exportScheduleMatrix = (
  schedules: Schedule[],
  options: {
    filename?: string;
    organization?: string;
    title?: string;
    subtitle?: string;
    section?: string;
  } = {}
) => {
  if (typeof window === 'undefined' || schedules.length === 0) return;

  const rows = Array.from({ length: (END_MINUTES - START_MINUTES) / SLOT_MINUTES }, (_, index) => {
    const slot = START_MINUTES + index * SLOT_MINUTES;
    const cells = DAYS.map((day) => {
      const schedule = schedules.find((candidate) => {
        const start = parseTimeToMinutes(candidate.startTime);
        return candidate.day === day && start === slot;
      });

      if (!schedule) {
        const occupied = schedules.some((candidate) => {
          const start = parseTimeToMinutes(candidate.startTime) ?? 0;
          const end = parseTimeToMinutes(candidate.endTime) ?? 0;
          return candidate.day === day && start < slot && end > slot;
        });
        return occupied ? '' : '<td></td>';
      }

      const start = parseTimeToMinutes(schedule.startTime) ?? slot;
      const end = parseTimeToMinutes(schedule.endTime) ?? start + SLOT_MINUTES;
      const rowSpan = Math.max(1, Math.ceil((end - start) / SLOT_MINUTES));
      return `<td rowspan="${rowSpan}">${renderScheduleCell(schedule)}</td>`;
    }).join('');

    return `<tr><th>${formatSlot(slot)}</th>${cells}</tr>`;
  }).join('');

  const documentHtml = `<!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8"><style>
        @page { size: landscape; margin: 0.25in; }
        body { font-family: Arial, sans-serif; color: #000; }
        h1, h2, p { text-align: center; margin: 4px 0; }
        h1 { font-size: 15pt; } h2 { font-size: 12pt; } p { font-size: 10pt; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #222; text-align: center; vertical-align: middle; }
        thead th { height: 24px; font-size: 10pt; }
        tbody th { width: 15%; white-space: nowrap; font-size: 9pt; font-weight: bold; }
        tbody tr { height: 21px; }
        td { padding: 0; }
        .schedule-cell { min-height: 100%; height: 100%; padding: 8px 4px; font-size: 9pt; line-height: 1.35; }
      </style></head>
      <body>
        <h1>${escapeHtml(options.organization || 'School of Communication, Multimedia and Computer Studies')}</h1>
        <h2>${escapeHtml(options.title || 'Bachelor of Science in Information Technology')}</h2>
        <p>${escapeHtml(options.subtitle || 'Class Schedule | AY 2025-2026 | 1st Semester')}</p>
        ${options.section ? `<p>${escapeHtml(options.section)}</p>` : ''}
        <table>
          <thead><tr><th>TIME</th>${DAYS.map((day) => `<th>${day.toUpperCase()}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`;

  const blob = new Blob([documentHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename || 'schedule-matrix.xls';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export type FacultyConsultationHour = {
  day: string;
  startTime: string;
  endTime: string;
};

const formatLoadTime = (schedule: Schedule) =>
  `${formatTimeToTwelveHour(schedule.startTime)} - ${formatTimeToTwelveHour(schedule.endTime)}`;

const getScheduleHoursForExport = (schedule: Schedule) => {
  const start = parseTimeToMinutes(schedule.startTime);
  const end = parseTimeToMinutes(schedule.endTime);
  return start !== null && end !== null && end > start ? (end - start) / 60 : 0;
};

export const exportFacultyLoad = (
  facultySchedules: Schedule[],
  consultationHours: FacultyConsultationHour[],
  options: {
    filename?: string;
    facultyName: string;
    appointmentStatus?: string;
    designation?: string;
    organization?: string;
    academicYear?: string;
    semester?: string;
  }
) => {
  if (typeof window === 'undefined') return;

  const regularSchedules = facultySchedules.filter((schedule) => schedule.loadType !== 'overload');
  const overloadSchedules = facultySchedules.filter((schedule) => schedule.loadType === 'overload');
  const renderLoadRow = (schedule?: Schedule) => {
    if (!schedule) return '<tr class="blank-row">' + '<td></td>'.repeat(10) + '</tr>';
    const isLab = (schedule.subject?.name || '').toLowerCase().includes('lab');
    const hours = getScheduleHoursForExport(schedule);
    return `<tr>
      <td>${escapeHtml(schedule.subject?.code || '')}</td>
      <td>${escapeHtml(schedule.subject?.name || '')}</td>
      <td>${escapeHtml(formatLoadTime(schedule))}</td>
      <td>${escapeHtml(schedule.day || '')}</td>
      <td>${escapeHtml(schedule.section || '')}</td>
      <td>${escapeHtml(schedule.room?.name || 'Online')}</td>
      <td>${schedule.units ?? ''}</td>
      <td>${isLab ? '' : (hours || schedule.lectureContactHours || '')}</td>
      <td>${isLab ? (hours || schedule.labContactHours || '') : ''}</td>
      <td>${schedule.classSize ?? ''}</td>
    </tr>`;
  };
  const renderFixedLoadRows = (schedules: Schedule[]) =>
    Array.from({ length: Math.max(6, schedules.length) }, (_, index) => renderLoadRow(schedules[index])).join('');

  const totalUnits = facultySchedules.reduce((total, schedule) => total + (Number(schedule.units) || 0), 0);
  const totalHours = facultySchedules.reduce((total, schedule) => total + getScheduleHoursForExport(schedule), 0);
  const overloadUnits = overloadSchedules.reduce((total, schedule) => total + (Number(schedule.units) || 0), 0);
  const renderTimeRows = (rows: FacultyConsultationHour[]) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.map((day) => {
      const row = rows.find((item) => item.day === day);
      return `<tr><th>${day.toUpperCase()}</th><td>${row ? escapeHtml(`${formatTimeToTwelveHour(row.startTime)} - ${formatTimeToTwelveHour(row.endTime)}`) : ''}</td></tr>`;
    }).join('');
  };

  const documentHtml = `<!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8"><style>
        @page { size: landscape; margin: 0.25in; }
        body { font-family: Arial, sans-serif; color: #000; font-size: 9pt; }
        h1, h2, p { text-align: center; margin: 4px 0; }
        h1 { font-size: 14pt; } h2 { font-size: 11pt; } p { font-size: 9pt; }
        .info, .load, .summary, .time-table, .approval { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #222; padding: 5px; }
        .info th { width: 18%; text-align: left; background: #f2f2f2; }
        .section-title { margin-top: 14px; font-weight: bold; text-transform: uppercase; }
        .load th { background: #f2f2f2; text-transform: uppercase; font-size: 8pt; }
        .load td { text-align: center; }
        .load td:nth-child(2) { text-align: left; }
        .summary { width: 55%; margin-right: auto; }
        .summary th { text-align: left; background: #f2f2f2; }
        .time-table { width: 45%; margin-right: auto; }
        .time-table th { width: 35%; background: #f2f2f2; text-align: left; }
        .blank-row { height: 24px; }
        .approval th { width: 25%; height: 48px; text-align: left; vertical-align: top; }
        .approval td { vertical-align: top; line-height: 1.5; }
      </style></head>
      <body>
        <h1>${escapeHtml(options.organization || 'School of Communication, Multimedia and Computer Studies')}</h1>
        <h2>FACULTY LOAD &amp; SCHEDULE</h2>
        <p>${escapeHtml(`${options.semester || 'First Semester'}, Academic Year ${options.academicYear || '2025-2026'}`)}</p>
        <table class="info">
          <tr><th>NAME OF FACULTY</th><td>${escapeHtml(options.facultyName)}</td><th>STATUS OF APPOINTMENT</th><td>${escapeHtml(options.appointmentStatus || 'Not set')}</td></tr>
          <tr><th>DESIGNATION</th><td>${escapeHtml(options.designation || 'Faculty')}</td><th>LOAD TYPE</th><td>Regular and Overload</td></tr>
        </table>
        <div class="section-title">Regular Load</div>
        <table class="load">
          <thead><tr><th>CODE</th><th>DESCRIPTION</th><th>TIME</th><th>DAY/S</th><th>SECTION</th><th>ROOM</th><th>UNITS</th><th>CONTACT HRS. LEC</th><th>CONTACT HRS. LAB</th><th>CLASS SIZE</th></tr></thead>
          <tbody>${renderFixedLoadRows(regularSchedules)}</tbody>
        </table>
        <table class="summary">
          <tr><th>TOTAL NO. OF UNITS</th><td>${totalUnits}</td></tr>
          <tr><th>TOTAL NO. OF HOURS</th><td>${totalHours}</td></tr>
          <tr><th>TOTAL OVERLOAD UNITS</th><td>${overloadUnits}</td></tr>
        </table>
        <div class="section-title">Official Time</div>
        <table class="time-table"><tbody>${renderTimeRows([])}</tbody></table>
        <div class="section-title">Overload Schedule</div>
        <table class="load">
          <thead><tr><th>CODE</th><th>DESCRIPTION</th><th>TIME</th><th>DAY/S</th><th>SECTION</th><th>ROOM</th><th>UNITS</th><th>CONTACT HRS. LEC</th><th>CONTACT HRS. LAB</th><th>CLASS SIZE</th></tr></thead>
          <tbody>${renderFixedLoadRows(overloadSchedules)}</tbody>
        </table>
        <div class="section-title">Consultation Hours</div>
        <table class="time-table"><tbody>${renderTimeRows(consultationHours)}</tbody></table>
        <table class="approval"><tbody>
          <tr><th>PRODUCTIVE OUTPUT:</th><td rowspan="4">Faculty member should submit productive outputs every end of the semester. This may include research outputs or any relevant academic outputs such as module writing, test bank, creative works, laboratory production, developing software, including community outreach and extension services.</td></tr>
          <tr><th>PREPARED BY:</th></tr><tr><th>RECOMMENDING APPROVAL:</th></tr><tr><th>APPROVED BY:</th></tr>
        </tbody></table>
      </body>
    </html>`;

  const blob = new Blob([documentHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename || 'faculty-load-schedule.xls';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};