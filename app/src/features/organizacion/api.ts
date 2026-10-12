import type { AccessContext, HistoryEntry, ImportResult, OrganizationView } from '@origo/capital-humano';

/** An error the API explained: `message` is ready to show, `details` lists what is in the way. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
    public readonly status = 0,
  ) {
    super(message);
  }
}

// Local DEV has no identity provider: the person chosen in the header is sent with each call.
let currentUserId = '';
export const setCurrentUser = (personId: string) => {
  currentUserId = personId;
};

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-origo-user': currentUserId },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No hay conexión con el servidor local. Revisa que la API esté encendida.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.message ?? 'Algo falló. Inténtalo de nuevo.', payload.details ?? [], response.status);
  return payload as T;
}

export interface Change {
  kind: 'orgUnit' | 'role' | 'team' | 'person' | 'roleAssignment' | 'teamMembership';
  data: Record<string, unknown>;
}
export interface ImportFile {
  name: string;
  text: string;
}

export const api = {
  organization: () => request<OrganizationView>('/organization'),
  save: (changes: Change[]) => request<{ dataAsOf: string | null }>('/organization/entities', { changes }),
  importFiles: (mode: 'preview' | 'apply', files: ImportFile[], previewId?: string) => request<ImportResult>('/organization/imports', { mode, files, previewId }),
  access: (personId: string) => request<AccessContext>(`/organization/access/${personId}`),
  history: (entityId: string) => request<HistoryEntry[]>(`/organization/history/${entityId}`),
};
