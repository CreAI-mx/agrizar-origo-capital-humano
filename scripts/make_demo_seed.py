"""Writes seed/organization.demo.json: a fully invented organization for the shareable demo.

It reads nothing, so no client data can end up in it. The output is deterministic.
Usage: python3 -I scripts/make_demo_seed.py [output.json]
"""
import json
import random
import sys
from pathlib import Path

rng = random.Random(2026)

LADDER = [
    ("director", "Director"), ("gerente", "Gerente"), ("jefe", "Jefe"), ("coordinador", "Coordinador"),
    ("lider", "Líder"), ("supervisor", "Supervisor"), ("especialista", "Especialista"),
    ("analista", "Analista"), ("auxiliar", "Auxiliar"), ("practicante", "Practicante"),
]
ROLE_NAME = dict(LADDER) | {"capturista": "Capturista"}

# dirección -> área -> subáreas
TREE = {
    ("DIR-PROD", "Producción"): {("PROD-INV-N", "Invernaderos Norte"): ["Riego y Nutrición", "Sanidad Vegetal"], ("PROD-INV-S", "Invernaderos Sur"): [], ("PROD-BER", "Berries"): []},
    ("DIR-EMP", "Empaque"): {("EMP-L1", "Línea de Empaque 1"): [], ("EMP-L2", "Línea de Empaque 2"): [], ("EMP-CAL", "Calidad e Inocuidad"): []},
    ("DIR-OPS", "Operaciones"): {("OPS-LOG", "Logística"): ["Embarques", "Almacén"], ("OPS-MTTO", "Mantenimiento"): [], ("OPS-COM", "Compras"): []},
    ("DIR-CH", "Capital Humano"): {("CH-REC", "Reclutamiento"): [], ("CH-NOM", "Nómina"): [], ("CH-CAP", "Capacitación"): []},
    ("DIR-FIN", "Finanzas"): {("FIN-CON", "Contabilidad"): [], ("FIN-TES", "Tesorería"): []},
    ("DIR-TI", "Tecnología"): {("TI-SIS", "Sistemas"): [], ("TI-DAT", "Datos"): []},
}

FIRST = "Alejandro Mariana Ricardo Fernanda Héctor Daniela Octavio Paola Rubén Ximena Gerardo Lucía Ernesto Valeria Ignacio Regina Mauricio Camila Rodrigo Renata Esteban Jimena Leonel Abril Fabián Natalia Gustavo Itzel Ramiro Montserrat Emilio Carolina Saúl Brenda Marcos Yolanda Tomás Adriana Julián Elisa Noé Miriam Iván Rocío Armando Silvia Hugo Karla Benjamín Araceli".split()
LAST = "Arriaga Bustamante Cisneros Delgadillo Escobedo Figueroa Galindo Huerta Ibarra Jaramillo Lozano Montoya Navarrete Olvera Paredes Quintero Rosales Solís Tapia Urbina Valdivia Zamora Barragán Cervantes Esquivel Fuentes Maldonado Nava Ochoa Padilla Rangel Salgado Treviño Villaseñor Zepeda Acosta Beltrán Carrillo".split()

roles = [{"code": "administrador_origo", "name": "Administrador de Origo", "isSystem": True, "description": "Puede cambiar la organización"}]
roles += [{"code": code, "name": name, "level": code} for code, name in LADDER]
roles += [
    {"code": "capturista", "name": "Capturista", "description": "Registra datos en campo"},
    {"code": "aprobador", "name": "Aprobador", "description": "Autoriza capturas y cambios"},
]
units = [{"code": "AGZ", "name": "Agrizar (datos de prueba)", "kind": "empresa"}]
teams = []
people = [{
    "displayName": "Administrador Demo",
    "account": "admin.demo@origo.test",
    "employeeNumber": "P-0001",
    "assignments": [{"roleCode": "administrador_origo", "orgUnitCode": "AGZ"}],
}]
used = set()


def invented_name():
    while True:
        first_surname, second_surname = rng.sample(LAST, 2)
        name = f"{rng.choice(FIRST)} {first_surname} {second_surname}"
        if name not in used:
            used.add(name)
            return name


def person(role, unit, title, team=None):
    entry = {
        "displayName": invented_name(),
        "employeeNumber": f"P-{len(people) + 1:04d}",
        "assignments": [{"roleCode": role, "orgUnitCode": unit, "jobTitle": title}],
    }
    if team:
        entry["teams"] = [{"orgUnitCode": unit, "teamCode": team}]
    people.append(entry)
    return entry


def staff(unit, unit_name, sizes):
    """One equipo per size: a lead plus that many integrantes."""
    for index, size in enumerate(sizes):
        code = f"EQ-{index + 1:02d}"
        lead_role = rng.choice(["supervisor", "lider", "coordinador"])
        lead = person(lead_role, unit, f"{ROLE_NAME[lead_role]} de {unit_name}", code)
        shift = "Turno" if "Empaque" in unit_name or "Invernadero" in unit_name else "Equipo"
        teams.append({"orgUnitCode": unit, "code": code, "name": f"{shift} {'ABC'[index]} · {unit_name}", "leadKey": lead["employeeNumber"]})
        for _ in range(size):
            role = rng.choice(["analista", "analista", "auxiliar", "auxiliar", "especialista", "capturista", "practicante"])
            person(role, unit, f"{ROLE_NAME[role]} de {unit_name}", code)


person("director", "AGZ", "Director General")
for (dir_code, dir_name), areas in TREE.items():
    units.append({"code": dir_code, "name": f"Dirección de {dir_name}", "kind": "direccion", "parentCode": "AGZ"})
    person("director", dir_code, f"Director de {dir_name}")
    person("aprobador", dir_code, f"Aprobador de {dir_name}")
    for (area_code, area_name), subareas in areas.items():
        units.append({"code": area_code, "name": area_name, "kind": "area", "parentCode": dir_code})
        person("gerente", area_code, f"Gerente de {area_name}")
        if rng.random() < 0.6:
            person("jefe", area_code, f"Jefe de {area_name}")
        if not subareas:
            staff(area_code, area_name, [rng.randint(2, 4)] + ([rng.randint(2, 3)] if rng.random() < 0.45 else []))
        for index, sub_name in enumerate(subareas):
            sub_code = f"{area_code}-{index + 1}"
            units.append({"code": sub_code, "name": sub_name, "kind": "subarea", "parentCode": area_code})
            person("coordinador", sub_code, f"Coordinador de {sub_name}")
            staff(sub_code, sub_name, [rng.randint(2, 4)])

out = {"isTestData": True, "roles": roles, "orgUnits": units, "teams": teams, "people": people}
target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "seed" / "organization.demo.json"
target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print({key: len(value) for key, value in out.items() if isinstance(value, list)}, "->", target)
