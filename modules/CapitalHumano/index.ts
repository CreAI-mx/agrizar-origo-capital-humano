// Public surface of the module: types the web client shares with the API.
export * from './domain/models';
export type { AccessContext } from './domain/rules';
export type { ImportAction, ImportCause, ImportItem, ImportSheet } from './domain/importPlan';
// Pure reader of a CSV file: the Back Office counts rows with the same rules the load uses.
export { parseCsv } from './application/importOrganization/parseFiles';
export type { OrganizationView } from './application/getOrganization';
export type { HistoryEntry } from './application/getHistory';
export type { PeoplePageView } from './application/listPeople';
export type { PersonProfile } from './application/getPersonProfile';
export type { PeopleAlert, PeopleQueryInput, PeopleTray, PersonRow } from './domain/peopleDirectory';
export type { PersonRef } from './domain/reporting';
export type { ImportResult } from './application/importOrganization';
