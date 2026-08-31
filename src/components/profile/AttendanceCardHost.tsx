import React from 'react';
import { ProfileCardProps } from '../../lib/profileCards';
import AttendanceCard from './AttendanceCard';

/**
 * Adapts the registry's card contract to AttendanceCard's own props.
 *
 * The registry hands every card the same bundle so that adding a card never
 * changes the page. AttendanceCard itself takes only what it uses, so it stays
 * testable without constructing a whole ProfileContext. This four-line file is
 * the join between those two facts.
 */
const AttendanceCardHost: React.FC<ProfileCardProps> = ({ ctx }) => (
  <AttendanceCard source={ctx.source} />
);

export default AttendanceCardHost;
