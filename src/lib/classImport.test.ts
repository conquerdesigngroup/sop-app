import {
  parseDay, parseTime, parseAge, parseExportDate, parseMoney, classesCsvToRows,
} from './classImport';

describe('parseDay', () => {
  it('reads the abbreviations the export uses, Sunday = 0', () => {
    expect(parseDay('Mon')).toBe(1);
    expect(parseDay('Tue')).toBe(2);
    expect(parseDay('Wed')).toBe(3);
    expect(parseDay('Thu')).toBe(4);
    expect(parseDay('Fri')).toBe(5);
    expect(parseDay('Sat')).toBe(6);
    expect(parseDay('Sun')).toBe(0);
  });

  it('accepts full names and stray punctuation', () => {
    expect(parseDay('Thursday')).toBe(4);
    expect(parseDay(' mon. ')).toBe(1);
  });

  // portal_classes holds one day. Filing a two-day class under the first of them
  // would put half its sessions on a day it does not meet.
  it('refuses anything naming more than one day', () => {
    expect(parseDay('Mon, Wed')).toBeNull();
    expect(parseDay('Mon/Wed')).toBeNull();
    expect(parseDay('Tue and Thu')).toBeNull();
  });

  it('refuses what it does not recognise', () => {
    expect(parseDay('')).toBeNull();
    expect(parseDay('Someday')).toBeNull();
  });
});

describe('parseTime', () => {
  it('converts the export 12-hour format to 24-hour', () => {
    expect(parseTime('04:00 PM')).toBe('16:00');
    expect(parseTime('09:30 AM')).toBe('09:30');
    expect(parseTime('4:15PM')).toBe('16:15');
  });

  it('handles both noon and midnight, which are where 12-hour clocks go wrong', () => {
    expect(parseTime('12:00 PM')).toBe('12:00');
    expect(parseTime('12:30 AM')).toBe('00:30');
  });

  it('passes 24-hour times through', () => {
    expect(parseTime('16:30')).toBe('16:30');
  });

  it('rejects nonsense rather than guessing', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('13:00 PM')).toBeNull();
    expect(parseTime('04:75 PM')).toBeNull();
    expect(parseTime('teatime')).toBeNull();
  });
});

describe('parseAge / parseMoney', () => {
  it('strips the y suffix', () => {
    expect(parseAge('7y')).toBe('7');
    expect(parseAge('18')).toBe('18');
    expect(parseAge('')).toBe('');
    expect(parseAge('toddler')).toBe('');
  });

  it('keeps the number out of a fee', () => {
    expect(parseMoney('77.5')).toBe('77.5');
    expect(parseMoney('$1,077.50')).toBe('1077.50');
    expect(parseMoney('')).toBe('');
  });
});

describe('parseExportDate', () => {
  it('reads "Aug 29, 2026"', () => {
    expect(parseExportDate('Aug 29, 2026')).toBe('2026-08-29');
    expect(parseExportDate('Jun 20, 2027')).toBe('2027-06-20');
  });

  it('zero-pads a single-digit day', () => {
    expect(parseExportDate('Sep 1, 2026')).toBe('2026-09-01');
  });

  it('passes ISO through and rejects the rest', () => {
    expect(parseExportDate('2026-08-29')).toBe('2026-08-29');
    expect(parseExportDate('')).toBe('');
    expect(parseExportDate('sometime next year')).toBe('');
  });
});

describe('classesCsvToRows', () => {
  const header =
    'Title,Location,Days,Start Time,End Time,Duration (mins),Registration Start Date,Start Date,' +
    'End Date,Tuition Fee,Max Size,Tuition Billing Cycle,Registration Fee Amount,Description,' +
    'Start Age,End Age,Room,Instructor,Tags,Group,Policy';

  const row =
    'Pre Ballet 1a (morgan/m-4pm),Dancing Images Dance Center,Mon,04:00 PM,05:00 PM,0,' +
    '"Aug 29, 2026","Aug 31, 2026","Jun 20, 2027",77.5,20,Monthly,0,"Ballet, and more.",' +
    '7y,18y,Studio 1,Morgan Davidson,,Academy,Studio Policies';

  it('maps the export columns onto the import row', () => {
    const { rows, skipped, error } = classesCsvToRows(`${header}\n${row}`);
    expect(error).toBeUndefined();
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Pre Ballet 1a (morgan/m-4pm)',
      day_of_week: '1',
      start_time: '16:00',
      end_time: '17:00',
      room: 'Studio 1',
      instructor: 'Morgan Davidson',
      group: 'Academy',
      capacity: '20',
      tuition_fee: '77.5',
      registration_fee: '0',
      age_min_years: '7',
      age_max_years: '18',
      season_start: '2026-08-31',
      season_end: '2027-06-20',
      registration_opens: '2026-08-29',
    });
    // The quoted description keeps its comma.
    expect(rows[0].description).toBe('Ballet, and more.');
  });

  // The title is a label Enrolio wrote once and never refreshed: this class says
  // Monday 6pm in its name and actually meets Saturday morning. The columns win.
  it('takes the schedule from the columns, never from the title', () => {
    const moved = row
      .replace('Pre Ballet 1a (morgan/m-4pm)', 'All-star Bb (chill/m-6pm)')
      .replace(',Mon,04:00 PM,05:00 PM,', ',Sat,09:00 AM,09:30 AM,');
    const { rows } = classesCsvToRows(`${header}\n${moved}`);
    expect(rows[0].title).toBe('All-star Bb (chill/m-6pm)');
    expect(rows[0].day_of_week).toBe('6');
    expect(rows[0].start_time).toBe('09:00');
  });

  it('skips an unusable row and says why, rather than importing it wrong', () => {
    const bad = row.replace(',Mon,04:00 PM,', ',Mon/Wed,04:00 PM,');
    const { rows, skipped } = classesCsvToRows(`${header}\n${row}\n${bad}`);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].row).toBe(3);
    expect(skipped[0].reason).toMatch(/single weekday/);
  });

  it('refuses a file that is not the classes export', () => {
    const { error } = classesCsvToRows('email,student_name\na@b.com,Mia Jones');
    expect(error).toMatch(/Title/);
  });

  it('tolerates a BOM on the first header', () => {
    const { rows, error } = classesCsvToRows(`﻿${header}\n${row}`);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(1);
  });
});
