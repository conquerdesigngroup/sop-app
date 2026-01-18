import React, { ReactNode } from 'react';
import { SOPProvider } from './SOPContext';
import { TaskProvider } from './TaskContext';
import { JobProvider } from './JobContext';
import { EventProvider } from './EventContext';

/**
 * DataProvider - Combines all data-related context providers
 *
 * This grouping optimizes re-renders by:
 * 1. Reducing provider nesting depth (7 levels -> 4 levels)
 * 2. Grouping related data contexts together
 * 3. Making the provider tree more maintainable
 *
 * Provider structure after optimization:
 * - AuthProvider (user session, authentication)
 * - ActivityLogProvider (audit trail - separate for admin-only access)
 * - DataProvider (all data contexts combined)
 *   ├── SOPProvider
 *   ├── TaskProvider
 *   ├── JobProvider
 *   └── EventProvider
 */
interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  return (
    <SOPProvider>
      <TaskProvider>
        <JobProvider>
          <EventProvider>
            {children}
          </EventProvider>
        </JobProvider>
      </TaskProvider>
    </SOPProvider>
  );
};

export default DataProvider;
