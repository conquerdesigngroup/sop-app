// IndexedDB utilities for offline storage
// Stores data locally when offline and syncs when connection is restored

import { SOP, JobTask, TaskTemplate, User, WorkHoursEntry } from '../types';

const DB_NAME = 'sop_app_offline';
const DB_VERSION = 2;

// Store names
export const STORES = {
  SOPS: 'sops',
  JOB_TASKS: 'job_tasks',
  TASK_TEMPLATES: 'task_templates',
  USERS: 'users',
  WORK_HOURS: 'work_hours',
  PENDING_CHANGES: 'pending_changes',
};

// Change types for sync
export type ChangeType = 'create' | 'update' | 'delete';

export interface PendingChange {
  id: string;
  storeName: string;
  changeType: ChangeType;
  data: any;
  timestamp: number;
  /**
   * The exact row to send to Postgres, already in snake_case.
   *
   * Without this the sync path derives the row by camelCase-converting
   * every key of `data`, which is fine for stores whose local shape happens
   * to match their table. work_hours does not: its id is a server-side UUID
   * (a client id would fail the column type), and total_hours is computed by
   * a trigger and must not be sent. Supplying the payload explicitly keeps
   * those rules in one place instead of teaching the generic converter about
   * one table's exceptions.
   */
  payload?: Record<string, any>;
}

// Initialize IndexedDB
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      if (!db.objectStoreNames.contains(STORES.SOPS)) {
        const sopStore = db.createObjectStore(STORES.SOPS, { keyPath: 'id' });
        sopStore.createIndex('department', 'department', { unique: false });
        sopStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.JOB_TASKS)) {
        const taskStore = db.createObjectStore(STORES.JOB_TASKS, { keyPath: 'id' });
        taskStore.createIndex('assignedTo', 'assignedTo', { unique: false, multiEntry: true });
        taskStore.createIndex('status', 'status', { unique: false });
        taskStore.createIndex('scheduledDate', 'scheduledDate', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.TASK_TEMPLATES)) {
        const templateStore = db.createObjectStore(STORES.TASK_TEMPLATES, { keyPath: 'id' });
        templateStore.createIndex('department', 'department', { unique: false });
        templateStore.createIndex('category', 'category', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const userStore = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        userStore.createIndex('email', 'email', { unique: true });
        userStore.createIndex('department', 'department', { unique: false });
      }

      // Added in DB_VERSION 2. Existing installs run this branch on their
      // next load; the contains() guard makes it a no-op afterwards.
      if (!db.objectStoreNames.contains(STORES.WORK_HOURS)) {
        const hoursStore = db.createObjectStore(STORES.WORK_HOURS, { keyPath: 'id' });
        hoursStore.createIndex('employeeId', 'employeeId', { unique: false });
        hoursStore.createIndex('workDate', 'workDate', { unique: false });
        hoursStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.PENDING_CHANGES)) {
        const changesStore = db.createObjectStore(STORES.PENDING_CHANGES, { keyPath: 'id' });
        changesStore.createIndex('timestamp', 'timestamp', { unique: false });
        changesStore.createIndex('storeName', 'storeName', { unique: false });
      }
    };
  });
};

// Generic CRUD operations
export const addItem = async (storeName: string, item: any): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.add(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const updateItem = async (storeName: string, item: any): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteItem = async (storeName: string, id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getItem = async (storeName: string, id: string): Promise<any> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllItems = async (storeName: string): Promise<any[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getItemsByIndex = async (
  storeName: string,
  indexName: string,
  value: any
): Promise<any[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Pending changes management
export const addPendingChange = async (
  storeName: string,
  changeType: ChangeType,
  data: any,
  payload?: Record<string, any>
): Promise<void> => {
  const change: PendingChange = {
    id: `${storeName}_${changeType}_${data.id}_${Date.now()}`,
    storeName,
    changeType,
    data,
    timestamp: Date.now(),
    ...(payload ? { payload } : {}),
  };
  return addItem(STORES.PENDING_CHANGES, change);
};

/** Pending changes for one store, oldest first. */
export const getPendingChangesForStore = async (storeName: string): Promise<PendingChange[]> => {
  const changes = await getPendingChanges();
  return changes
    .filter((change) => change.storeName === storeName)
    .sort((a, b) => a.timestamp - b.timestamp);
};

export const getPendingChanges = async (): Promise<PendingChange[]> => {
  return getAllItems(STORES.PENDING_CHANGES);
};

export const clearPendingChange = async (id: string): Promise<void> => {
  return deleteItem(STORES.PENDING_CHANGES, id);
};

export const clearAllPendingChanges = async (): Promise<void> => {
  const changes = await getPendingChanges();
  await Promise.all(changes.map((change) => clearPendingChange(change.id)));
};

// Clear all data (for logout or reset)
export const clearAllData = async (): Promise<void> => {
  const db = await initDB();
  const storeNames = [
    STORES.SOPS,
    STORES.JOB_TASKS,
    STORES.TASK_TEMPLATES,
    STORES.USERS,
    STORES.WORK_HOURS,
    STORES.PENDING_CHANGES,
  ];

  await Promise.all(
    storeNames.map((storeName) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    })
  );
};

// Check if we're online
export const isOnline = (): boolean => {
  return navigator.onLine;
};

// Sync helpers
export const saveSOPOffline = async (sop: SOP, changeType: ChangeType = 'update'): Promise<void> => {
  await updateItem(STORES.SOPS, sop);
  if (!isOnline()) {
    await addPendingChange(STORES.SOPS, changeType, sop);
  }
};

export const saveJobTaskOffline = async (task: JobTask, changeType: ChangeType = 'update'): Promise<void> => {
  await updateItem(STORES.JOB_TASKS, task);
  if (!isOnline()) {
    await addPendingChange(STORES.JOB_TASKS, changeType, task);
  }
};

export const saveTaskTemplateOffline = async (
  template: TaskTemplate,
  changeType: ChangeType = 'update'
): Promise<void> => {
  await updateItem(STORES.TASK_TEMPLATES, template);
  if (!isOnline()) {
    await addPendingChange(STORES.TASK_TEMPLATES, changeType, template);
  }
};

/**
 * Queue an hours entry that could not reach the database.
 *
 * Hours Input is the screen most used away from wifi, and until now a
 * submission made with no signal simply failed. The entry is kept locally
 * with its client-side id so the employee can see it in their own history,
 * while `payload` carries the row the replay will actually insert.
 *
 * The payload must keep status 'pending' and employee_id set to the signed-in
 * user: migration v7's RLS only accepts an employee's own pending rows, and a
 * queued write that violates that would fail on every future replay attempt.
 */
export const queueWorkHoursOffline = async (
  entry: WorkHoursEntry,
  payload: Record<string, any>
): Promise<void> => {
  await updateItem(STORES.WORK_HOURS, entry);
  await addPendingChange(STORES.WORK_HOURS, 'create', entry, payload);
};

/** Entries still waiting to reach Postgres, oldest first. */
export const getQueuedWorkHours = async (): Promise<WorkHoursEntry[]> => {
  const changes = await getPendingChangesForStore(STORES.WORK_HOURS);
  return changes.map((change) => ({ ...(change.data as WorkHoursEntry), pendingSync: true }));
};
