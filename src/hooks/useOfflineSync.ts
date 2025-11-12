// Hook for managing offline/online state and syncing changes
import { useState, useEffect, useCallback } from 'react';
import {
  getPendingChanges,
  clearPendingChange,
  isOnline as checkIsOnline,
  PendingChange,
} from '../lib/indexedDB';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(checkIsOnline());
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const useSupabase = isSupabaseConfigured();

  // Update pending changes count
  const updatePendingCount = useCallback(async () => {
    const changes = await getPendingChanges();
    setPendingChangesCount(changes.length);
  }, []);

  // Sync pending changes to Supabase
  const syncChanges = useCallback(async () => {
    if (!useSupabase || !isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      const changes = await getPendingChanges();

      // Sort by timestamp to maintain order
      const sortedChanges = changes.sort((a, b) => a.timestamp - b.timestamp);

      for (const change of sortedChanges) {
        try {
          await syncSingleChange(change);
          await clearPendingChange(change.id);
        } catch (error) {
          console.error(`Failed to sync change ${change.id}:`, error);
          // Continue with other changes even if one fails
        }
      }

      await updatePendingCount();
    } catch (error) {
      console.error('Error syncing changes:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [useSupabase, isOnline, isSyncing, updatePendingCount]);

  // Sync a single change based on its type
  const syncSingleChange = async (change: PendingChange) => {
    const { storeName, changeType, data } = change;

    // Map store names to Supabase tables
    const tableMap: { [key: string]: string } = {
      sops: 'sops',
      job_tasks: 'job_tasks',
      task_templates: 'task_templates',
      users: 'profiles',
    };

    const tableName = tableMap[storeName];
    if (!tableName) {
      console.error(`Unknown store name: ${storeName}`);
      return;
    }

    // Convert camelCase to snake_case for database fields
    const convertToSnakeCase = (obj: any): any => {
      const converted: any = {};
      for (const key in obj) {
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        converted[snakeKey] = obj[key];
      }
      return converted;
    };

    const dbData = convertToSnakeCase(data);

    switch (changeType) {
      case 'create':
        const { error: createError } = await supabase.from(tableName).insert(dbData);
        if (createError) throw createError;
        break;

      case 'update':
        const { error: updateError } = await supabase
          .from(tableName)
          .update(dbData)
          .eq('id', data.id);
        if (updateError) throw updateError;
        break;

      case 'delete':
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', data.id);
        if (deleteError) throw deleteError;
        break;
    }
  };

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Automatically sync when coming back online
      setTimeout(() => syncChanges(), 1000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pending count
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncChanges, updatePendingCount]);

  // Listen for service worker sync messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_OFFLINE_CHANGES') {
        syncChanges();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [syncChanges]);

  return {
    isOnline,
    isSyncing,
    pendingChangesCount,
    syncChanges,
    updatePendingCount,
  };
};
