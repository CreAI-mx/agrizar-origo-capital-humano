import type { PeopleQueryInput } from '@origo/capital-humano';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { createElement, useEffect } from 'react';
import { ApiError, api, type Change, type ImportFile } from './api';

export const useOrganization = () => useQuery({ queryKey: ['organization'], queryFn: api.organization });

/** One page of the people directory; the page on screen stays while the next one loads. */
export const usePeople = (query: PeopleQueryInput) => useQuery({ queryKey: ['people', query], queryFn: () => api.people(query), placeholderData: keepPreviousData });

export const usePerson = (personId: string | null) =>
  useQuery({ queryKey: ['person', personId], queryFn: () => api.person(personId!), enabled: Boolean(personId) });

/**
 * A read model fetched on its own can be newer or older than the organization on screen.
 * Whichever is behind is fetched again, so the "Dato de" of the header is true for both (M2-15).
 * `other` is undefined while that read model has not arrived.
 */
export function useSameSnapshot(orgDataAsOf: string | null, other: string | null | undefined, key: 'people' | 'person') {
  const client = useQueryClient();
  useEffect(() => {
    if (other === undefined || other === orgDataAsOf) return;
    void client.invalidateQueries({ queryKey: [(other ?? '') > (orgDataAsOf ?? '') ? 'organization' : key] });
  }, [client, orgDataAsOf, other, key]);
}

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
    mutationFn: ({ mode, files, previewId }: { mode: 'preview' | 'apply'; files: ImportFile[]; previewId?: string }) => api.importFiles(mode, files, previewId),
    onSuccess: (result) => {
      if (result.mode === 'apply') void client.invalidateQueries();
    },
    onError: notifyError,
  });
}
