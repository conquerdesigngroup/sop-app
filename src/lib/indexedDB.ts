// IndexedDB utilities for offline storage
// Stores data locally when offline and syncs when connection is restored

import { SOP, JobTask, TaskTemplate, User } from '../types';

const DB_NAME = 'sop_app_offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  SOPS: 'sops',
  JOB_TASKS: 'job_tasks',
  TASK_TEMPLATES: 'task_templates',
  USERS: 'users',
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
  data: any
): Promise<void> => {
  const change: PendingChange = {
    id: `${storeName}_${changeType}_${data.id}_${Date.now()}`,
    storeName,
    changeType,
    data,
    timestamp: Date.now(),
  };
  return addItem(STORES.PENDING_CHANGES, change);
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
