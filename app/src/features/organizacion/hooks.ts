import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { createElement } from 'react';
import { ApiError, api, type Change, type ImportFile } from './api';

export const useOrganization = () => useQuery({ queryKey: ['organization'], queryFn: api.organization });

export const useAccess = (personId: string | undefined) =>
  useQuery({ queryKey: ['access', personId], queryFn: () => api.access(personId!), enabled: Boolean(personId) });

export const useHistory = (entityId: string | undefined) =>
  useQuery({ queryKey: ['history', entityId], queryFn: () => api.history(entityId!), enabled: Boolean(entityId) });

/** Shows an API error with the list of what is in the way, when the API sent one. */
export function useErrorNotice() {
  const { notification } = App.useApp();
  return (error: unknown) => {
    const details = error instanceof ApiError ? error.details : [];
    notification.error({
      message: error instanceof Error ? error.message : 'Algo falló. Inténtalo de nuevo.',
      description: details.length
        ? createElement('ul', { style: { paddingLeft: 18, margin: 0 } }, ...details.map((d) => createElement('li', { key: d }, d)))
        : undefined,
      duration: details.length ? 10 : 5,
    });
  };
}

/** Saves a batch of changes, refreshes every view and confirms with `done`. */
export function useSave() {
  const client = useQueryClient();
  const { message } = App.useApp();
  const notifyError = useErrorNotice();
  return useMutation({
    mutationFn: ({ changes }: { changes: Change[]; done: string }) => api.save(changes),
    onSuccess: (_result, { done }) => {
      void client.invalidateQueries();
      void message.success(done);
    },
    onError: notifyError,
  });
}

export function useImport() {
  const client = useQueryClient();
  const notifyError = useErrorNotice();
  return useMutation({
    mutationFn: ({ mode, files }: { mode: 'preview' | 'apply'; files: ImportFile[] }) => api.importFiles(mode, files),
    onSuccess: (result) => {
      if (result.mode === 'apply') void client.invalidateQueries();
    },
    onError: notifyError,
  });
}
