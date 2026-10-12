import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { getOrganization } from '../application/getOrganization';
import { makeDeps, seededDeps } from './helpers';

// The JSON Schemas in contracts/ are what other teams read: they have to accept what the
// code really produces and consumes.
const root = resolve(__dirname, '../../..');
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const readModel = ajv.compile(json('contracts/organization.schema.json'));
const load = ajv.compile(json('contracts/organization-import.schema.json'));

describe('contracts', () => {
  it.each(['seed/organization.test.json', 'seed/organization.demo.json'])('%s follows the load contract', (path) => {
    load(json(path));
    expect(load.errors ?? []).toEqual([]);
  });

  it('the load contract refuses a person with no account and no employee number', () => {
    expect(load({ people: [{ displayName: 'Persona Prueba' }] })).toBe(false);
  });

  it('GET /api/organization follows the read-model contract, empty and loaded', async () => {
    for (const deps of [makeDeps(), await seededDeps()]) {
      readModel(JSON.parse(JSON.stringify(await getOrganization(undefined, deps))));
      expect(readModel.errors ?? []).toEqual([]);
    }
  });
});
