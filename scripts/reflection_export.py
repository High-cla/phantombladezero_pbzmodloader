"""Read-only, build-locked UE reflection inventory. Python 3.10+, Windows x64.

No injection, debugger attachment, game function calls or process writes.
Offsets are selected by executable SHA256, not inferred from UE version.
"""
import argparse
from collections import Counter
import ctypes as C
from ctypes import wintypes as W
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
import sys

BUILD = 'CL-301524_JKS-17219'
SHA256 = '7b4fcd286a350780faf0824d73aa150b21cbf1bccde883e6a96386cbe09973b4'
PROFILE = dict(nameBlocksRva=0xdd11ad0, objectArrayRva=0xddb3c50,
               chunkSize=65536, itemSize=24, itemObjectOffset=8,
               structSuper=0x40, structChildren=0x48, structProperties=0x50,
               structSize=0xa8, functionFlags=0x100, fieldNext=0x10,
               fieldOwner=0x18, fieldName=0x20, fieldClassName=0x30,
               propertyData=0x70, enumNames=0x40, enumValues=0x48, enumCount=0x50)
BUILD_PROFILES = {
    SHA256: dict(build=BUILD, profile=PROFILE),
    '4415933ce33476f14c837abb61a1b60af8b78cd81783896501913a7aac69e423': dict(
        build='CL-302256_JKS-17280',
        profile={**PROFILE, 'nameBlocksRva': 0xdd86ad0, 'objectArrayRva': 0xde28c60}),
}


class ParseError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ParseError(message)


def build_profile(sha256):
    require(sha256 in BUILD_PROFILES, f'Unsupported executable SHA256: {sha256}')
    entry = BUILD_PROFILES[sha256]
    return entry['build'], dict(entry['profile'])


class Process:
    def __init__(self, pid):
        self.k = C.WinDLL('kernel32', use_last_error=True)
        self.k.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
        self.k.OpenProcess.restype = W.HANDLE
        self.k.CloseHandle.argtypes = [W.HANDLE]
        self.k.ReadProcessMemory.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p,
                                           C.c_size_t, C.POINTER(C.c_size_t)]
        self.k.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)]
        self.handle = self.k.OpenProcess(0x410, False, pid)
        require(self.handle, f'OpenProcess failed: {C.get_last_error()}')
        try:
            path = C.create_unicode_buffer(32768)
            length = W.DWORD(len(path))
            require(self.k.QueryFullProcessImageNameW(self.handle, 0, path, C.byref(length)), 'Executable path unavailable')
            self.exe = Path(path.value)
            with self.exe.open('rb') as f:
                digest = hashlib.sha256()
                for block in iter(lambda: f.read(1024 * 1024), b''):
                    digest.update(block)
            self.sha256 = digest.hexdigest()
            self.build, self.profile = build_profile(self.sha256)
            ps = C.WinDLL('psapi')
            ps.EnumProcessModules.argtypes = [W.HANDLE, C.c_void_p, W.DWORD, C.c_void_p]
            modules = (C.c_void_p * 1024)()
            needed = W.DWORD()
            require(ps.EnumProcessModules(self.handle, modules, C.sizeof(modules), C.byref(needed)), 'Module enumeration failed')
            self.base = modules[0]
            require(self.read(self.base, 2) == b'MZ', 'Invalid module base')
        except Exception:
            self.close()
            raise

    def close(self):
        if self.handle:
            self.k.CloseHandle(self.handle)
            self.handle = None

    def read(self, address, length):
        require(0x10000 <= address < 0x800000000000 and 0 <= length <= 16*1024*1024,
                f'Invalid read range {address:#x}+{length:#x}')
        buf = C.create_string_buffer(length)
        got = C.c_size_t()
        ok = self.k.ReadProcessMemory(self.handle, address, buf, length, C.byref(got))
        require(ok and got.value == length, f'Unreadable memory {address:#x}+{length:#x} (error {C.get_last_error()})')
        return buf.raw


class Exporter:
    def __init__(self, process):
        self.m = process
        self.profile = process.profile
        self.names = {}
        self.objects = {}
        self.paths = {}
        self.failures = []
        self.property_kinds = Counter()
        self.struct_heads = {}
        self.class_kinds = {}

    def unpack(self, fmt, address):
        return struct.unpack('<' + fmt, self.m.read(address, struct.calcsize('<' + fmt)))

    def u32(self, a): return self.unpack('I', a)[0]
    def ptr(self, a): return self.unpack('Q', a)[0]

    def name(self, index, number=0):
        if index not in self.names:
            require(index >> 16 < 8192, f'Invalid FName index {index:#x}')
            block = self.ptr(self.m.base + self.profile['nameBlocksRva'] + 8*(index >> 16))
            address = block + 2*(index & 65535)
            header = self.unpack('H', address)[0]
            length = header >> 6
            require(0 < length <= 1023, f'Invalid FName length at {address:#x}')
            value = self.m.read(address+2, length*(2 if header & 1 else 1)).decode('utf-16-le' if header & 1 else 'utf-8')
            require(not any(ord(ch) < 32 for ch in value), 'Control character in FName')
            self.names[index] = value
        return self.names[index] + (f'_{number-1}' if number else '')

    def fname(self, address): return self.name(*self.unpack('II', address))

    def fail(self, stage, address, error, owner=None):
        self.failures.append(dict(stage=stage, address=hex(address), owner=owner, error=str(error)))

    def header(self):
        a = self.m.base + self.profile['objectArrayRva']
        max_chunks, chunks, data, count, maximum = self.unpack('IIQII', a)
        require(0 < count <= maximum <= 10000000 and 0 < chunks <= max_chunks <= 1024,
                'Object array bounds invalid')
        require(maximum == max_chunks*65536 and chunks == (count+65535)//65536, 'Object array chunk layout mismatch')
        return max_chunks, chunks, data, count, maximum

    def snapshot(self):
        require(self.name(0) == 'None' and self.name(3) == 'ByteProperty', 'Name pool validation failed')
        self.start_header = self.header()
        _, chunks, data, count, _ = self.start_header
        self.slots = count
        self.null_slots = 0
        self.chunk_pointers = [self.ptr(data+8*j) for j in range(chunks)]
        for j, chunk in enumerate(self.chunk_pointers):
            n = min(65536, count-j*65536)
            buf = self.m.read(chunk, n*24)
            for t in range(n):
                address = struct.unpack_from('<Q', buf, t*24+8)[0]
                if not address:
                    self.null_slots += 1
                    continue
                try:
                    _, flags, index, cls, name, number, outer = self.unpack('QIIQIIQ', address)
                    require(index == j*65536+t, f'Object index mismatch: {index} != {j*65536+t}')
                    self.objects[address] = dict(index=index, name=self.name(name, number),
                                                 classAddress=cls, outerAddress=outer, objectFlags=flags)
                except (ParseError, UnicodeError) as e:
                    self.fail('object', address, e, f'slot:{j*65536+t}')

    def path(self, address, visiting=None):
        if not address: return None
        if address in self.paths: return self.paths[address]
        visiting = set() if visiting is None else visiting
        require(address not in visiting and len(visiting) < 128, 'Outer cycle/depth limit')
        require(address in self.objects, f'Object reference outside captured inventory: {address:#x}')
        visiting.add(address)
        o = self.objects[address]
        outer = self.path(o['outerAddress'], visiting)
        result = (outer + '.' if outer else '') + o['name']
        self.paths[address] = result
        return result

    def kind(self, address):
        if self.objects[address]['objectFlags'] & 0x10:  # CDOs are instances, not declarations.
            return None
        cls = self.objects[address]['classAddress']
        original_cls = cls
        if cls in self.class_kinds:
            return self.class_kinds[cls]
        seen = set()
        while cls:
            require(cls not in seen and len(seen) < 128, 'Metaclass inheritance cycle')
            seen.add(cls)
            require(cls in self.objects, f'Missing metaclass {cls:#x}')
            name = self.objects[cls]['name']
            if name in ('Class', 'ScriptStruct', 'Enum', 'Function'):
                self.class_kinds[original_cls] = name
                return name
            cls = self.ptr(cls+0x40)
        self.class_kinds[original_cls] = None
        return None

    def property(self, a, depth=0):
        require(depth < 32, 'Nested property depth limit')
        kind = self.fname(self.ptr(a+8)+0x30)
        name = self.fname(a+0x20)
        dim, size, flags = self.unpack('IIQ', a+0x30)
        offset = self.u32(a+0x44)
        require(0 < dim <= 1048576 and 0 <= size <= 16777216 and offset <= 16777216, 'Property bounds invalid')
        r = dict(name=name, kind=kind, arrayDim=dim, elementSize=size, offset=offset, flags=hex(flags))
        r['parameter'] = bool(flags & 0x80)
        r['out'] = bool(flags & 0x100)
        r['return'] = bool(flags & 0x400)
        r['reference'] = bool(flags & 0x8000000)
        r['const'] = bool(flags & 2)
        primitive = {'Int8Property','Int16Property','IntProperty','Int64Property','UInt16Property',
                     'UInt32Property','UInt64Property','FloatProperty','DoubleProperty','NameProperty',
                     'StrProperty','TextProperty','Utf8StrProperty','AnsiStrProperty'}
        if kind in primitive:
            pass
        elif kind == 'BoolProperty':
            r['boolStorage'] = dict(zip(('fieldSize','byteOffset','byteMask','fieldMask'), self.unpack('4B', a+0x70)))
        elif kind in ('StructProperty','ObjectProperty','WeakObjectProperty','LazyObjectProperty',
                      'SoftObjectProperty','InterfaceProperty','DelegateProperty',
                      'MulticastDelegateProperty','MulticastInlineDelegateProperty','MulticastSparseDelegateProperty'):
            r['target'] = self.path(self.ptr(a+0x70))
            require(r['target'], 'Missing property target')
        elif kind in ('ClassProperty','SoftClassProperty'):
            r['target'] = self.path(self.ptr(a+0x70))
            r['metaClass'] = self.path(self.ptr(a+0x78))
            require(r['target'] and r['metaClass'], 'Missing class target')
        elif kind == 'ByteProperty':
            r['enum'] = self.path(self.ptr(a+0x70))
        elif kind == 'EnumProperty':
            r['underlying'] = self.property(self.ptr(a+0x70), depth+1)
            r['enum'] = self.path(self.ptr(a+0x78))
            require(r['underlying']['kind'] in {'ByteProperty','Int8Property','Int16Property',
                    'IntProperty','Int64Property','UInt16Property','UInt32Property','UInt64Property'}
                    and not r['underlying'].get('unresolved')
                    and r['underlying']['elementSize'] == size, 'Invalid enum underlying storage')
            # Cooked properties can retain numeric storage with no UEnum metadata.
            # Preserve this distinction; never guess an enum from the member name.
            if r['enum'] is None:
                r['enumMetadataMissing'] = True
        elif kind == 'FieldPathProperty':
            r['fieldClass'] = self.fname(self.ptr(a+0x70)+0x30)
        elif kind == 'ArrayProperty':
            r['inner'] = self.property(self.ptr(a+0x78), depth+1)
        elif kind in ('SetProperty','OptionalProperty'):
            r['inner'] = self.property(self.ptr(a+0x70), depth+1)
        elif kind == 'MapProperty':
            r['key'] = self.property(self.ptr(a+0x70), depth+1)
            r['value'] = self.property(self.ptr(a+0x78), depth+1)
        else:
            r['unresolved'] = True
            self.fail('property-type', a, f'Unsupported property kind: {kind}', name)
        self.property_kinds[kind] += 1
        return r

    def properties(self, owner):
        result, seen = [], set()
        a = self.ptr(owner+0x50)
        while a:
            require(a not in seen and len(seen) < 65536, 'Property chain cycle/limit')
            seen.add(a)
            nxt = self.ptr(a+0x10)
            try:
                require(self.ptr(a+0x18) == owner | 1, 'Property owner mismatch')
                result.append(self.property(a))
            except (ParseError, UnicodeError) as e:
                self.fail('property', a, e, self.path(owner))
                raw = self.m.read(a, 0x80)
                flags = struct.unpack_from('<Q', raw, 0x38)[0]
                self.failures[-1].update(member=self.fname(a+0x20),
                                        propertyKind=self.fname(self.ptr(a+8)+0x30),
                                        rawHeaderHex=raw.hex())
                result.append(dict(address=hex(a), name=self.fname(a+0x20),
                                   kind=self.fname(self.ptr(a+8)+0x30), flags=hex(flags),
                                   arrayDim=self.u32(a+0x30), elementSize=self.u32(a+0x34), offset=self.u32(a+0x44),
                                   parameter=bool(flags & 0x80), out=bool(flags & 0x100),
                                   reference=bool(flags & 0x8000000), const=bool(flags & 2),
                                   **{'return':bool(flags & 0x400)}, rawHeaderHex=raw.hex(),
                                   unresolved=True, error=str(e)))
            a = nxt
        return result

    def record(self, a, kind):
        o = self.objects[a]
        path = self.path(a)
        r = dict(path=path, name=o['name'], kind=kind, metaclass=self.path(o['classAddress']),
                 source='native' if path.startswith('/Script/') else 'asset-or-runtime',
                 objectFlags=hex(o['objectFlags']), objectIndex=o['index'])
        if kind == 'Enum':
            count = self.u32(a+0x50)
            require(count <= 65536, 'Enum count exceeds limit')
            names, values = self.ptr(a+0x40), self.ptr(a+0x48)
            # This build uses separately tagged name/value arrays, not TPair storage.
            require(not count or (names & 1 and values & 1), 'Unsupported enum array tags')
            r['values'] = [dict(name=self.fname((names & ~1)+8*j),
                                value=self.unpack('q', (values & ~1)+8*j)[0]) for j in range(count)]
        else:
            self.struct_heads[a] = self.m.read(a+0x40, 24)
            r['super'] = self.path(self.ptr(a+0x40))
            r['size'] = self.u32(a+0xa8)
            r['properties'] = self.properties(a)
            if kind == 'Function':
                flags, count, size, ret = self.unpack('IHHH', a+0x100)
                r.update(functionFlags=hex(flags), parameterCount=count, parameterSize=size,
                         returnOffset=ret, owner=self.path(o['outerAddress']),
                         static=bool(flags & 0x2000), native=bool(flags & 0x400))
                actual = [p for p in r['properties'] if p.get('parameter')]
                require(len(actual) == count, f'Parameter count mismatch: {len(actual)} != {count}')
                returns = [p for p in actual if p.get('return')]
                require(len(returns) <= 1, 'Multiple return properties')
                if returns and not returns[0].get('unresolved'):
                    require(returns[0]['offset'] == ret, 'Return offset mismatch')
                for prop in actual:
                    if not prop.get('unresolved'):
                        require(prop['offset']+prop['elementSize']*prop['arrayDim'] <= size,
                                'Parameter exceeds parameter buffer')
            elif kind == 'Class':
                # Children are declared UFunctions; inherited members stay on their owner.
                child, seen, members = self.ptr(a+0x48), set(), []
                while child:
                    require(child not in seen and len(seen) < 65536, 'UField chain cycle/limit')
                    seen.add(child)
                    members.append(self.path(child))
                    child = self.ptr(child+0x28)
                r['functions'] = members
        return r

    def export(self):
        records = []
        self.kinds = {}
        for a in self.objects:
            try:
                kind = self.kind(a)
                if kind:
                    self.kinds[a] = kind
            except ParseError as e:
                self.fail('classification', a, e)
        for a, kind in self.kinds.items():
            try:
                records.append(self.record(a, kind))
            except (ParseError, UnicodeError) as e:
                self.fail('type', a, e, self.objects[a]['name'])
                # Keep the discovered item in the complete inventory even if parsing failed.
                records.append(dict(path=self.paths.get(a), name=self.objects[a]['name'], kind=kind,
                                    objectIndex=self.objects[a]['index'], unresolved=True, error=str(e)))
        return sorted(records, key=lambda r: (r.get('path') or '', r['objectIndex']))

    def validate(self, records):
        lookup = {r['path']: r for r in records}
        vector = lookup['/Script/CoreUObject.Vector']
        require([(p['name'], p['kind'], p['offset']) for p in vector['properties']] ==
                [('X','DoubleProperty',0),('Y','DoubleProperty',8),('Z','DoubleProperty',16)], 'Vector layout mismatch')
        require(vector['size'] == 24, 'Vector size mismatch')
        require(lookup['/Script/Engine.Actor']['super'] == '/Script/CoreUObject.Object', 'Actor inheritance mismatch')
        pawn = lookup['/Script/Engine.GameplayStatics.GetPlayerPawn']
        require([p['name'] for p in pawn['properties']] == ['WorldContextObject','PlayerIndex','ReturnValue'], 'GetPlayerPawn signature mismatch')
        require(pawn['properties'][-1]['target'] == '/Script/Engine.Pawn' and pawn['properties'][-1]['return'], 'Pawn return mismatch')
        axis = lookup['/Script/CoreUObject.EAxis']['values']
        require([v['value'] for v in axis] == list(range(5)), 'EAxis enum layout mismatch')
        end = self.header()
        require(end == self.start_header, 'Object array changed during capture; retry in a stable scene')
        # Detect freed/reused reflection slots and changed property/children heads.
        for a in self.kinds:
            o = self.objects[a]
            chunk = self.ptr(end[2]+8*(o['index']//65536))
            require(self.ptr(chunk+24*(o['index']%65536)+8) == a,
                    f'Reflection slot changed during capture: {o["index"]} {o["name"]}')
            require(self.u32(a+12) == o['index'] and self.ptr(a+16) == o['classAddress'] and
                    self.fname(a+24) == o['name'], 'Reflection object changed during capture')
            if a in self.struct_heads:
                require(self.m.read(a+0x40,24) == self.struct_heads[a], 'Reflection links changed during capture')
        return dict(vector=True, actorInheritance=True, playerPawnSignature=True, axisEnum=True,
                    objectArrayStable=True, reflectionIdentitiesStable=True)

    def display(self):
        settings = [a for a,o in self.objects.items()
                    if self.objects.get(o['classAddress'],{}).get('name')=='PBZSettingsLocal'
                    and not o['objectFlags'] & 0x10]
        require(len(settings)==1, 'Expected one live PBZSettingsLocal')
        a = settings[0]
        x,y = self.unpack('II',a+208)
        mode = self.u32(a+248)
        require((x,y,mode)==(1280,720,2), f'Tests require windowed 1280x720; live settings: {x}x{y}, mode={mode}')
        return dict(width=x,height=y,mode='windowed',engineMode=mode,source='live PBZSettingsLocal')


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--label', required=True, help='Scene label, e.g. main-menu or save-map')
    args = parser.parse_args(argv)
    require(not args.output.exists(), 'Output directory already exists; use a new capture directory')
    args.output.mkdir(parents=True)
    process = None
    exporter = None
    try:
        process = Process(args.pid)
        exporter = Exporter(process)
        exporter.snapshot()
        display = exporter.display()
        records = exporter.export()
        checks = exporter.validate(records)
        stats = dict(objectSlots=exporter.slots, nullSlots=exporter.null_slots,
                     parsedObjects=len(exporter.objects), reflectedRecords=len(records),
                     byKind=dict(Counter(r['kind'] for r in records)),
                     bySourceAndKind=dict(Counter(r.get('source','unresolved')+':'+r['kind'] for r in records)),
                     declaredProperties=sum(len(r.get('properties',[])) for r in records if r['kind'] != 'Function'),
                     functionFields=sum(len(r.get('properties',[])) for r in records if r['kind'] == 'Function'),
                     functionParametersIncludingReturns=sum(p.get('parameter',False) for r in records
                         if r['kind']=='Function' for p in r.get('properties',[])),
                     enumValues=sum(len(r.get('values',[])) for r in records),
                     propertyKinds=dict(sorted(exporter.property_kinds.items())),
                     failureCount=len(exporter.failures))
        manifest = dict(schemaVersion=1, build=process.build, exeSha256=process.sha256,
                        capturedAt=datetime.now(timezone.utc).isoformat(), label=args.label,
                        processId=args.pid, profile=process.profile, checks=checks,
                        display=display,
                        scope='Registered native and currently loaded reflected types/functions; no asset loading',
                        consistency='Read-only live capture; stable array and reflection identities, not an atomic engine snapshot',
                        bindingStatus='Not tested for PuerTS accessibility or callability', statistics=stats)
        write_json(args.output/'reflection.json', dict(manifest=manifest, records=records))
        write_json(args.output/'summary.json', manifest)
        write_json(args.output/'failures.json', dict(count=len(exporter.failures),
                   byStage=dict(Counter(f['stage'] for f in exporter.failures)),
                   byError=dict(Counter(f['error'] for f in exporter.failures)), failures=exporter.failures))
        import csv
        with (args.output/'inventory.csv').open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['path','kind','source','metaclass','super','properties','functions','enumValues','unresolved'])
            for r in records:
                writer.writerow([r.get(k,'') for k in ('path','kind','source','metaclass','super')]+
                                [len(r.get(k,[])) for k in ('properties','functions','values')]+[r.get('unresolved',False)])
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return 2 if exporter.failures else 0
    except Exception as e:
        write_json(args.output/'failures.json', dict(fatal=str(e), failures=exporter.failures if exporter else []))
        print(f'Export rejected: {e}', file=sys.stderr)
        return 1
    finally:
        if process: process.close()


if __name__ == '__main__':
    sys.exit(main())
