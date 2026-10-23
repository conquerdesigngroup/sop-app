import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ClassPicker, { ALL_CLASSES, ClassSelection, describeSelection } from './ClassPicker';
import { ClassOption, TeacherOption } from '../../lib/attendanceRecords';

/**
 * The picker decides which children end up in a report, so the thing pinned
 * here is the SET it hands back — a weekday that quietly picks up a Tuesday
 * class, or a Cancel that applies anyway, both produce a plausible file that is
 * about the wrong classes.
 */

const klass = (id: string, name: string, dayOfWeek: number | null, startTime: string | null = null): ClassOption =>
  ({ id, name, dayOfWeek, startTime });

const classes = [
  klass('mon1', 'Jr Ballet 2', 1, '16:00:00'),
  klass('mon2', 'Teen Jazz', 1, '18:30:00'),
  klass('tue1', 'Mini Hip Hop', 2, '17:00:00'),
  klass('none', 'Private Lesson', null),
];

const teachers: TeacherOption[] = [
  { id: 't1', name: 'Ada Nunez', classIds: ['mon2', 'tue1', 'retired-class'] },
];

const setup = (value: ClassSelection = ALL_CLASSES, myClassIds: string[] = []) => {
  const onApply = jest.fn();
  const onClose = jest.fn();
  render(
    <ClassPicker
      isOpen
      onClose={onClose}
      classes={classes}
      teachers={teachers}
      myClassIds={myClassIds}
      value={value}
      onApply={onApply}
    />,
  );
  return { onApply, onClose };
};

describe('ClassPicker', () => {
  it("a weekday picks exactly that day's classes and names itself after it", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mon (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 classes' }));

    const sel: ClassSelection = onApply.mock.calls[0][0];
    expect(sel.ids?.sort()).toEqual(['mon1', 'mon2']);
    expect(describeSelection(sel, classes)).toBe('Monday classes');
  });

  it("a teacher's classes skip ones that are no longer active", () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByLabelText("A teacher's classes"), { target: { value: 't1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 classes' }));
    expect(onApply.mock.calls[0][0].ids.sort()).toEqual(['mon2', 'tue1']);
  });

  it('ticking by hand drops the quick-pick name, so the button never mislabels the set', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mon (2)' }));
    fireEvent.click(screen.getByLabelText(/Mini Hip Hop/));
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 classes' }));
    const sel: ClassSelection = onApply.mock.calls[0][0];
    expect(sel.label).toBeUndefined();
    expect(describeSelection(sel, classes)).toBe('3 classes');
  });

  it('offers My classes only to someone who holds classes', () => {
    setup(ALL_CLASSES, ['tue1']);
    expect(screen.getByRole('button', { name: 'My classes (1)' })).toBeInTheDocument();
  });

  it('ticking everything goes back to all classes, not a long list of ids', () => {
    const { onApply } = setup({ ids: ['mon1'] });
    fireEvent.click(screen.getByRole('button', { name: 'All classes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show all classes' }));
    expect(onApply.mock.calls[0][0]).toEqual(ALL_CLASSES);
  });

  it('will not apply an empty selection', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Untick all' }));
    expect(screen.getByRole('button', { name: 'Pick at least one' })).toBeDisabled();
  });

  it('Cancel applies nothing', () => {
    const { onApply, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mon (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
