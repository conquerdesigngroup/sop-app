import {
  decodeEntities, normaliseTag, splitTags, cleanName, splitStudents, contactsCsvToImport, changeCount,
  memoryChangeCount, parseActivityDate, runEnrollmentImport, EnrollmentImportResult,
} from './enrollmentImport';

const mockRpc = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

// Every family, dancer and address here is invented. The repo is public.

describe('runEnrollmentImport', () => {
  const contacts = [{ row: 2, contact_id: 'c-1', email: 'a@example.com', first_name: '', last_name: '', tags: [], students: [] }];

  it('sends the rows, the mode, the hash the preview gave and any confirmation', async () => {
    mockRpc.mockResolvedValue({ data: { counts: {} }, error: null });
    await runEnrollmentImport('apply', contacts, 'hash-1', 'contacts.csv', true);
    expect(mockRpc).toHaveBeenCalledWith('admin_enrollment_import', {
      p_contacts: contacts, p_mode: 'apply', p_expect: 'hash-1', p_filename: 'contacts.csv', p_confirm: true,
    });
    await runEnrollmentImport('preview', contacts, null, 'contacts.csv');
    expect(mockRpc).toHaveBeenLastCalledWith('admin_enrollment_import', expect.objectContaining({ p_confirm: false }));
  });

  it('passes the database\'s own sentence through', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Not authorised' } });
    await expect(runEnrollmentImport('preview', contacts, null, null)).rejects.toThrow('Not authorised');
  });

  // The screen shipping ahead of its migration must say so, not "function not found".
  it('says plainly when the database does not have the sync yet', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(runEnrollmentImport('preview', contacts, null, null))
      .rejects.toThrow('Roster sync is not set up in the database yet (migration v68). Nothing was changed.');
  });
});

describe('parseActivityDate', () => {
  it('reads the date out of the Last Activity stamp', () => {
    expect(parseActivityDate('Sep 24 2026 05:38 AM')).toBe('2026-09-24');
    expect(parseActivityDate('Oct 1 2026 11:00 PM')).toBe('2026-10-01');
  });

  it('gives up rather than guessing', () => {
    expect(parseActivityDate('')).toBeNull();
    expect(parseActivityDate('yesterday')).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes the escapes the export writes, and numeric ones', () => {
    expect(decodeEntities('turns &amp; jumps')).toBe('turns & jumps');
    expect(decodeEntities('O&#39;Neil &quot;Bo&quot; &lt;3')).toBe('O\'Neil "Bo" <3');
    expect(decodeEntities('Zo&#xEB;')).toBe('Zoë');
  });

  // An escaped escape is text that genuinely said "&lt;"; decoding it twice
  // would change what the family wrote.
  it('decodes once, not twice', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });
});

describe('normaliseTag / splitTags', () => {
  it('lower-cases, trims and single-spaces a tag the way the database compares it', () => {
    expect(normaliseTag('  Mini  Jazz 1 (Dana/M-4PM) ')).toBe('mini jazz 1 (dana/m-4pm)');
  });

  // The export carries some class tags twice: once escaped, once not.
  it('collapses an escaped and a plain copy of the same class into one tag', () => {
    expect(splitTags('petite turns &amp; jumps (kai/th-3:45pm), petite turns & jumps (kai/th-3:45pm)'))
      .toEqual(['petite turns & jumps (kai/th-3:45pm)']);
  });

  // Which tags are classes is the database's call. Dropping one here as "not a
  // class" would read, to the sync, as a class the family left.
  it('keeps every tag, class or not, stale title or current', () => {
    expect(splitTags('current family, enrolled, mini jazz 1 (dana/m-4pm), mini jazz 1 (dana/m-5pm), missed-call'))
      .toEqual(['current family', 'enrolled', 'mini jazz 1 (dana/m-4pm)', 'mini jazz 1 (dana/m-5pm)', 'missed-call']);
  });

  it('reads an empty cell as no tags', () => {
    expect(splitTags('')).toEqual([]);
    expect(splitTags(' , ,')).toEqual([]);
  });
});

describe('cleanName / splitStudents', () => {
  it('drops the asterisk Enrolio sometimes grows on a name', () => {
    expect(cleanName('Ada Quinn* ')).toBe('Ada Quinn');
    expect(cleanName('  Ada   Quinn ')).toBe('Ada Quinn');
  });

  it('splits on commas', () => {
    expect(splitStudents('Ada Quinn, Ben Quinn')).toEqual(['Ada Quinn', 'Ben Quinn']);
  });

  // The cell is quoted and carries real line breaks between dancers.
  it('splits on newlines, including Windows ones', () => {
    expect(splitStudents('Ada Quinn\nBen Quinn\r\nCal Quinn')).toEqual(['Ada Quinn', 'Ben Quinn', 'Cal Quinn']);
  });

  it('keeps a name with two given names whole', () => {
    expect(splitStudents('Laura Isabel Quinn')).toEqual(['Laura Isabel Quinn']);
  });

  it('counts the same dancer written twice once', () => {
    expect(splitStudents('Ada Quinn, ada quinn*, ADA  QUINN')).toEqual(['Ada Quinn']);
  });

  it('reads an empty cell as nobody', () => {
    expect(splitStudents('')).toEqual([]);
  });
});

describe('contactsCsvToImport', () => {
  const header = 'Contact Id,First Name,Last Name,Phone,Email,Last Activity,Tags,All Students,DI Notes';

  it('maps the export onto the rows the RPC takes, and nothing more', () => {
    const csv = `${header}\n` +
      'c-101,Pat,Quinn,+15550100,Pat.Quinn@Example.com ,Sep 20 2026 10:01 AM,' +
      '"current family, mini jazz 1 (dana/m-4pm), enrolled","Ada Quinn, Ben Quinn",Allergic to nothing';
    const { contacts, skipped, error } = contactsCsvToImport(csv);
    expect(error).toBeUndefined();
    expect(skipped).toEqual([]);
    expect(contacts).toEqual([{
      row: 2,
      contact_id: 'c-101',
      email: 'pat.quinn@example.com',
      first_name: 'Pat',
      last_name: 'Quinn',
      tags: ['current family', 'mini jazz 1 (dana/m-4pm)', 'enrolled'],
      students: ['Ada Quinn', 'Ben Quinn'],
    }]);
    // The phone, the notes and the activity date never leave the browser.
    expect(JSON.stringify(contacts)).not.toMatch(/5550100|Allergic|Sep 20/);
  });

  // Enrolio has no "exported at"; the newest activity in the file stands in
  // for it, so the screen can notice last week's file picked by mistake.
  it('dates the file by its newest Last Activity', () => {
    const csv = `${header}\n` +
      'c-110,A,Lo,,a@example.com,Sep 20 2026 10:01 AM,,,\n' +
      'c-111,B,Lo,,b@example.com,Sep 24 2026 05:38 AM,,,\n' +
      'c-112,C,Lo,,c@example.com,,,,';
    expect(contactsCsvToImport(csv).exportedOn).toBe('2026-09-24');
    expect(contactsCsvToImport(`${header}\nc-113,D,Lo,,d@example.com,,,,`).exportedOn).toBeNull();
  });

  it('reads All Students across the line breaks inside its quoted cell', () => {
    const csv = `${header}\n` +
      'c-102,Sam,Ruiz,,sam@example.com,,"teen hip hop (sam/w-6pm)","Nia Ruiz\nOmar Ruiz\nEva Ruiz",\n' +
      'c-103,Lee,Park,,lee@example.com,,,,';
    const { contacts } = contactsCsvToImport(csv);
    expect(contacts.map(c => [c.row, c.students])).toEqual([
      [2, ['Nia Ruiz', 'Omar Ruiz', 'Eva Ruiz']],
      [3, []],
    ]);
  });

  it('decodes &amp; in a tag and de-duplicates the escaped copy', () => {
    const csv = `${header}\n` +
      'c-104,Kim,Ash,,kim@example.com,,"petite turns &amp; jumps (kai/th-3:45pm), petite turns & jumps (kai/th-3:45pm)",Rae Ash,';
    expect(contactsCsvToImport(csv).contacts[0].tags).toEqual(['petite turns & jumps (kai/th-3:45pm)']);
  });

  it('keeps stale class titles for the database to report, rather than deciding here', () => {
    const csv = `${header}\n` +
      'c-105,Jo,Bell,,jo@example.com,,"all-star bb (chill/m-6pm), petite ballet (x/sa-9am)",Tia Bell,';
    expect(contactsCsvToImport(csv).contacts[0].tags)
      .toEqual(['all-star bb (chill/m-6pm)', 'petite ballet (x/sa-9am)']);
  });

  // Two parents with two contact records and one email are one family. That
  // decision needs the households, so both rows go through untouched.
  it('passes both records of a two-contact family through for the database to combine', () => {
    const csv = `${header}\n` +
      'c-106,Ana,Voss,,voss@example.com,,"junior ballet 2 (lee/t-5pm), open tap (lee/f-7pm)",,\n' +
      'c-107,Ben,Voss,,VOSS@example.com,,current family,"Ida Voss, Max Voss",';
    const { contacts } = contactsCsvToImport(csv);
    expect(contacts.map(c => [c.contact_id, c.email, c.tags.length, c.students.length])).toEqual([
      ['c-106', 'voss@example.com', 2, 0],
      ['c-107', 'voss@example.com', 1, 2],
    ]);
  });

  it('skips a row with neither a contact id nor an email, and says which', () => {
    const csv = `${header}\nc-108,Al,Fox,,al@example.com,,,Kai Fox,\n,,,,,,enrolled,,`;
    const { contacts, skipped } = contactsCsvToImport(csv);
    expect(contacts).toHaveLength(1);
    expect(skipped).toEqual([{ row: 3, reason: 'no contact id or email' }]);
  });

  it('refuses a file that is not the contacts export', () => {
    const classes = 'Title,Location,Days,Start Time\nMini Jazz 1 (dana/m-4pm),Studio,Mon,04:00 PM';
    expect(contactsCsvToImport(classes).error).toMatch(/Current Families/);
    expect(contactsCsvToImport('').error).toMatch(/header row/);
  });

  it('tolerates a BOM on the first header and Windows line endings', () => {
    const csv = `﻿${header}\r\nc-109,Zo,Hart,,zo@example.com,,enrolled,Ivy Hart,\r\n`;
    const { contacts, error } = contactsCsvToImport(csv);
    expect(error).toBeUndefined();
    expect(contacts[0].contact_id).toBe('c-109');
  });
});

describe('changeCount / memoryChangeCount', () => {
  it('counts roster changes apart from tag changes, and neither counts what is only reported', () => {
    const counts = {
      contacts: 9, families: 8, adds: 2, drops: 3, unassigned: 4, conflicts: 1, blocked: 0,
      first_seen_families: 1, new_families: 1, new_dancers: 2, not_imported: 5, merged_contacts: 1,
      email_conflicts: 0, missing_families: 7, held_untagged: 2, tagged_unheld: 40, memory_changes: 5,
      unmatched_class_tags: 40,
    };
    const r = { counts, memory_changes: { added: 3, removed: 2 } } as EnrollmentImportResult;
    expect(changeCount(r)).toBe(6);
    expect(memoryChangeCount(r)).toBe(5);
  });
});
