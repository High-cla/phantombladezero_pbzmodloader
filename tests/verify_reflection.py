"""Verify exported graph integrity independently of the memory reader.

Usage: python tests/verify_reflection.py build/reflection/<capture>
"""
import json
from pathlib import Path
import sys


def verify(root):
    data = json.loads((root/'reflection.json').read_text(encoding='utf-8'))
    records = data['records']
    paths = {r['path']:r for r in records}
    assert len(paths) == len(records), 'Duplicate record paths'
    failures = json.loads((root/'failures.json').read_text(encoding='utf-8'))
    unresolved = []
    for record in records:
        if record.get('super'):
            assert record['super'] in paths, 'Missing superclass'
        for fn in record.get('functions', []):
            assert fn in paths and paths[fn]['kind'] == 'Function', 'Missing function'
            assert paths[fn]['owner'] == record['path'], 'Incorrect function owner'

        def check(prop):
            if prop.get('unresolved'):
                unresolved.append((record['path'],prop.get('name')))
                return
            for key in ('target','enum','metaClass'):
                if prop.get(key):
                    assert prop[key] in paths, f'Missing property reference {prop[key]}'
            for key in ('inner','key','value','underlying'):
                if key in prop: check(prop[key])

        for prop in record.get('properties', []): check(prop)
    stats = data['manifest']['statistics']
    assert stats['reflectedRecords'] == len(records)
    assert stats['failureCount'] == failures['count'] == len(failures['failures'])
    for owner, member in unresolved:
        assert any(f.get('owner') == owner and (f.get('member',member) == member)
                   for f in failures['failures']), f'Unreported unresolved field: {owner}.{member}'
    return dict(passed=True, uniquePaths=len(paths), allTypeReferencesResolved=True,
                functionOwnershipConsistent=True, unresolvedFieldsAccountedFor=len(unresolved))


if __name__ == '__main__':
    print(json.dumps(verify(Path(sys.argv[1])), indent=2))
