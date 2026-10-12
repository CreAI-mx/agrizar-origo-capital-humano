"""Turn the published "Organigrama Agrizar" HTML into the bulk-load format.

Usage:  python3 -I scripts/extract_organigrama.py <organigrama.html> [output.json]

The output holds real names, so it goes to data/local/ (git-ignored) by default.
What is derived, and how (ASSUMPTION until Eduardo's input arrives):
  - Área   = one per page of the org chart; its parent is the page its "back" button points to.
  - Rol    = the level found in the job title (director, gerente, ... ; "otro" when none).
  - Equipo = each person with direct reports inside a page leads a team of those reports.
  - People have no identifier in the source: they get a temporary number (TMP-0001...).
    A name is not an identity, so two boxes are taken as one person only when the chart
    itself links them: the head of a page and that same name on other pages. The same
    name on two pages with no such link is loaded as two people, and every case the
    script could not settle is listed at the end for review.
Vacant boxes and dotted (functional) lines are not loaded: MD-2 has no positions.
"""
import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

LEVELS = ["director", "gerente", "jefe", "coordinador", "lider", "supervisor",
          "especialista", "analista", "auxiliar", "practicante"]
KINDS = ["empresa", "direccion", "area", "subarea"]


def plain(text):
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn").strip().lower()


def code_of(page_id):
    return re.sub(r"[^A-Z0-9]+", "-", plain(page_id).upper()).strip("-")


class Pages(HTMLParser):
    """Collects, per page: title, parent page and boxes in document order with their depth."""

    def __init__(self):
        super().__init__()
        self.pages = {}
        self.page = None
        self.depth = None      # data-nivel of the node being read; None inside the head
        self.box = None
        self.field = None
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "section" and "data-pagina" in a:
            self.page = {"id": a["data-pagina"], "title": "", "parent": None, "boxes": []}
            self.pages[a["data-pagina"]] = self.page
            self.depth = None
        elif self.page is None:
            return
        elif tag == "button" and "volver" in classes:
            self.page["parent"] = a.get("data-ir")
        elif tag == "h3":
            self.in_title = True
        elif tag == "div" and "nodo" in classes:
            self.depth = int(a.get("data-nivel", "0"))
        elif tag == "div" and "caja" in classes:
            head = "titular" in classes
            self.box = {"depth": -1 if head else (0 if "staff" in classes or self.depth is None else self.depth),
                        "head": head, "vacant": "vacante" in classes, "puesto": "", "nombre": ""}
            self.page["boxes"].append(self.box)
        elif tag == "span" and self.box is not None and classes and classes[0] in ("puesto", "nombre"):
            self.field = classes[0]

    def handle_endtag(self, tag):
        if tag == "section":
            self.page = None
        elif tag == "h3":
            self.in_title = False
        elif tag == "span":
            self.field = None

    def handle_data(self, data):
        if self.in_title and self.page is not None:
            self.page["title"] += data
        elif self.field and self.box is not None:
            self.box[self.field] += data


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "data/local/organization.import.json")
    parser = Pages()
    parser.feed(Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace"))
    pages = {k: v for k, v in parser.pages.items() if v["boxes"]}

    def depth_of(page):
        n = 0
        while page["parent"] in pages and n < 10:
            page, n = pages[page["parent"]], n + 1
        return n

    org_units = [{"code": code_of(p["id"]), "name": " ".join(p["title"].split()),
                  "kind": KINDS[min(depth_of(p), 3)],
                  "parentCode": code_of(p["parent"]) if p["parent"] in pages else None}
                 for p in pages.values()]
    roots = [u for u in org_units if u["parentCode"] is None]
    if len(roots) != 1:
        sys.exit(f"Expected one root page, found {len(roots)}: {[u['code'] for u in roots]}")

    roles = [{"code": "administrador_origo", "name": "Administrador de Origo", "isSystem": True,
              "description": "Puede cambiar la organización"}]
    roles += [{"code": lv, "name": lv.capitalize().replace("Lider", "Líder"), "level": lv} for lv in LEVELS]
    roles.append({"code": "otro", "name": "Otro puesto", "description": "Puestos fuera del escalafón"})

    def role_of(puesto):
        words = plain(puesto)
        return next((lv for lv in LEVELS if lv in words), "otro")

    is_person = lambda b: not b["vacant"] and plain(b["nombre"]) not in ("", "vacante")
    heads, head_pages = {}, {}
    for p in pages.values():
        for b in p["boxes"]:
            if b["head"] and is_person(b):
                heads[plain(b["nombre"])] = p["id"]
                head_pages.setdefault(plain(b["nombre"]), set()).add(p["id"])
    people, teams, stats = {}, [], {"vacantes": 0, "cajas": 0}
    seen_on, boxes_on = {}, {}     # per name: pages it appears on; per (name, page): boxes there

    def person_of(box, page):
        name = plain(box["nombre"])
        # Heads are reconciled across pages by name; everyone else is one person per page.
        key = name if name in heads else (name, page["id"])
        if not any(box is known for known in boxes_on.setdefault((name, page["id"]), [])):
            boxes_on[(name, page["id"])].append(box)
        seen_on.setdefault(name, set()).add(page["id"])
        if key not in people:
            people[key] = {"displayName": " ".join(box["nombre"].split()), "employeeNumber": f"TMP-{len(people) + 1:04d}",
                           "assignments": [], "teams": []}
        return people[key]

    for page in pages.values():
        unit = code_of(page["id"])
        trail, groups = {}, []          # trail: last box seen at each depth; groups: (lead box, reports)
        for box in page["boxes"]:
            stats["cajas"] += 1
            trail[box["depth"]] = box
            if not is_person(box):
                stats["vacantes"] += 1
                continue
            person = person_of(box, page)
            owns_page = heads.get(plain(box["nombre"]))
            if box["head"] or owns_page in (None, page["id"]):
                assignment = {"roleCode": role_of(box["puesto"]), "orgUnitCode": unit, "jobTitle": " ".join(box["puesto"].split())}
                if assignment not in person["assignments"]:
                    person["assignments"].append(assignment)
            boss = trail.get(box["depth"] - 1)
            if box["depth"] >= 1 and boss is not None and is_person(boss):
                group = next((g for g in groups if g[0] is boss), None)
                if group is None:
                    groups.append((boss, [box]))
                else:
                    group[1].append(box)
        for index, (boss, reports) in enumerate(groups, start=1):
            team_code = f"EQ-{index:02d}"
            lead = person_of(boss, page)
            teams.append({"orgUnitCode": unit, "code": team_code, "name": f"Equipo de {' '.join(boss['puesto'].split())}",
                          "leadKey": lead["employeeNumber"]})
            for member in [lead] + [person_of(b, page) for b in reports]:
                ref = {"orgUnitCode": unit, "teamCode": team_code}
                if ref not in member["teams"]:
                    member["teams"].append(ref)

    demo_admin = {"displayName": "Administrador Demo", "account": "admin.demo@origo.test", "employeeNumber": "DEMO-0001",
                  "assignments": [{"roleCode": "administrador_origo", "orgUnitCode": roots[0]["code"]}], "teams": []}
    payload = {"isTestData": False, "roles": roles, "orgUnits": org_units, "teams": teams,
               "people": [demo_admin] + list(people.values())}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{out}: {len(org_units)} áreas, {len(roles)} roles, {len(teams)} equipos, {len(people)} personas "
          f"({stats['cajas']} cajas leídas, {stats['vacantes']} vacantes omitidas)")
    by_kind = {k: sum(1 for u in org_units if u['kind'] == k) for k in KINDS}
    print("áreas por tipo:", by_kind)

    # Cases a name alone cannot settle. Printed, never written to the output.
    split = sorted(n for n, where in seen_on.items() if n not in heads and len(where) > 1)
    twice = sorted({n for (n, _page), boxes in boxes_on.items() if len(boxes) > 1 and n not in heads})
    two_heads = sorted(n for n, where in head_pages.items() if len(where) > 1)
    if split or twice or two_heads:
        print("Por revisar (un nombre no identifica a una persona):")
        for name in split:
            print(f"  - {name}: aparece en {len(seen_on[name])} páginas sin encabezar ninguna; se cargó como personas distintas")
        for name in twice:
            print(f"  - {name}: aparece más de una vez en la misma página; se cargó como una sola persona")
        for name in two_heads:
            print(f"  - {name}: encabeza {len(head_pages[name])} páginas; se cargó como una sola persona")


if __name__ == "__main__":
    main()
