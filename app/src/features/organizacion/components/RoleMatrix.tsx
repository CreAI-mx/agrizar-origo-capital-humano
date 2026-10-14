import type { OrganizationView, RoleAssignment } from '@origo/capital-humano';
import { ROLE_LEVELS } from '@origo/capital-humano';
import { Empty } from 'antd';
import { useMemo, type CSSProperties } from 'react';
import { CropSeal, branchOf, cropsOf } from '../crops';
import { count, sortUnits } from '../lib';

interface Props {
  org: OrganizationView;
  /** Active assignments inside the área filter. */
  held: RoleAssignment[];
  scope: ReadonlySet<string> | null;
  selectedId: string | null;
  onRole: (roleId: string) => void;
  /** A cell was chosen: the people with that role in that dirección. */
  onCell: (roleId: string, orgUnitId: string) => void;
}

// How strongly a cell is tinted, from the emptiest to the fullest one of the table.
const heat = (people: number, most: number): CSSProperties => ({ ['--heat' as string]: `${Math.round(14 + 52 * (people / most))}%` });

/** Spec M2-29: who holds each role in each dirección, with the gaps in plain sight. */
export function RoleMatrix({ org, held, scope, selectedId, onRole, onCell }: Props) {
  const { columns, rows, hasRoot, most, cell } = useMemo(() => {
    const branches = branchOf(org.orgUnits);
    const shown = scope && new Set([...scope].map((id) => branches.get(id)));
    const columns = sortUnits(org.orgUnits.filter((u) => u.status === 'active' && branches.get(u.id) === u.id && (!shown || shown.has(u.id))));
    // A person counts once per role and dirección, however many áreas of it they hold the role on.
    const people = new Map<string, Set<string>>();
    for (const a of held) {
      const key = `${a.roleId}|${branches.get(a.orgUnitId) ?? ''}`;
      people.set(key, (people.get(key) ?? new Set<string>()).add(a.personId));
    }
    const cell = (roleId: string, orgUnitId: string) => people.get(`${roleId}|${orgUnitId}`)?.size ?? 0;
    const active = org.roles.filter((r) => r.status === 'active');
    const ladder = active.filter((r) => r.level).sort((a, b) => ROLE_LEVELS.indexOf(a.level!) - ROLE_LEVELS.indexOf(b.level!) || a.name.localeCompare(b.name, 'es'));
    const others = active.filter((r) => !r.level).sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, 'es'));
    return {
      columns,
      rows: [ladder, others],
      hasRoot: [...people.keys()].some((key) => key.endsWith('|')),
      most: Math.max(1, ...[...people.values()].map((set) => set.size)),
      cell,
    };
  }, [org.orgUnits, org.roles, held, scope]);
  const crops = useMemo(() => cropsOf(org.orgUnits), [org.orgUnits]);
  const total = (roleId: string) => new Set(held.filter((a) => a.roleId === roleId).map((a) => a.personId)).size;

  if (!rows[0]!.length && !rows[1]!.length) return <Empty description="Aún no hay roles" />;
  return (
    <div className="matrix">
      <div className="matrix-scroll">
        <table className="role-matrix">
          <thead>
            <tr>
              <th scope="col" className="org-kind">
                Rol
              </th>
              {columns.map((unit) => (
                <th key={unit.id} scope="col">
                  <CropSeal crop={crops.get(unit.id) ?? 'brote'} size={30} />
                  <span>{unit.name}</span>
                </th>
              ))}
              {hasRoot && (
                <th scope="col">
                  <CropSeal crop="brote" size={30} />
                  <span>Empresa</span>
                </th>
              )}
              <th scope="col" className="org-kind">
                Total
              </th>
            </tr>
          </thead>
          {rows.map(
            (group, index) =>
              group.length > 0 && (
                <tbody key={index === 0 ? 'ladder' : 'others'}>
                  {group.map((role) => (
                    <tr key={role.id} className={role.id === selectedId ? 'is-selected' : undefined}>
                      <th scope="row">
                        <button type="button" className="matrix-role" onClick={() => onRole(role.id)} aria-label={`Ver el detalle del rol ${role.name}`}>
                          {role.level && <span className="fresh">{ROLE_LEVELS.indexOf(role.level) + 1}</span>}
                          {role.name}
                        </button>
                      </th>
                      {columns.map((unit) => {
                        const people = cell(role.id, unit.id);
                        return (
                          <td key={unit.id}>
                            {people ? (
                              <button type="button" className="matrix-cell" data-crop={crops.get(unit.id)} style={heat(people, most)} onClick={() => onCell(role.id, unit.id)} aria-label={`${count(people, 'persona', 'personas')} con el rol ${role.name} en ${unit.name}: ver quiénes`}>
                                {people}
                              </button>
                            ) : role.isSystem ? (
                              // A system role is given once, on the empresa: its absence elsewhere is not a gap.
                              <span className="matrix-none">·</span>
                            ) : (
                              <span className="matrix-gap" title={`Nadie tiene el rol ${role.name} en ${unit.name}`}>
                                0
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {hasRoot && <td>{cell(role.id, '') ? <span className="matrix-cell is-root" style={heat(cell(role.id, ''), most)}>{cell(role.id, '')}</span> : <span className="matrix-none">·</span>}</td>}
                      <td className="matrix-total">{total(role.id)}</td>
                    </tr>
                  ))}
                </tbody>
              ),
          )}
        </table>
      </div>
      <p className="muted">Toca una celda para ver a esas personas. Un hueco punteado es un rol que esa dirección no tiene.</p>
    </div>
  );
}
