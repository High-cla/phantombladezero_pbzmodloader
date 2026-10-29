"""Parser regressions use synthetic bytes, not a running game."""
import sys
from pathlib import Path
import struct
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from reflection_export import Exporter, ParseError, PROFILE


class Memory:
    base = 0x140000000

    def __init__(self): self.bytes = {}

    def put(self, at, fmt, *values):
        for j,b in enumerate(struct.pack('<'+fmt,*values)): self.bytes[at+j]=b

    def read(self, at, n):
        try: return bytes(self.bytes[at+j] for j in range(n))
        except KeyError: raise ParseError('Unreadable fixture memory')


class ParserTest(unittest.TestCase):
    def setUp(self):
        self.m = Memory()
        self.e = Exporter(self.m)
        self.names = {1:'ArrayProperty',2:'IntProperty',3:'Items',4:'EnumProperty',5:'StructProperty'}
        self.e.names = self.names.copy()

    def prop(self, at, cls, name=3, data=0, flags=0):
        for offset in range(0,0x80,8): self.m.put(at+offset,'Q',0)
        fc = 0x100000+cls*0x100
        self.m.put(at+8,'Q',fc)
        self.m.put(fc+0x30,'II',cls,0)
        self.m.put(at+0x20,'II',name,0)
        self.m.put(at+0x30,'IIQ',1,4,flags)
        self.m.put(at+0x70,'Q',data)

    def test_array_inner_uses_78_not_70(self):
        self.prop(0x20000,1)
        self.prop(0x21000,2,flags=0x8000582)
        self.m.put(0x20078,'Q',0x21000)
        item=self.e.property(0x20000)['inner']
        self.assertEqual(item['kind'],'IntProperty')
        self.assertTrue(all(item[k] for k in ('parameter','out','return','reference','const')))

    def test_missing_enum_retains_member_and_reports_failure(self):
        owner=0x30000
        self.e.objects[owner]=dict(name='Test',outerAddress=0)
        self.m.put(owner+0x50,'Q',0x20000)
        self.prop(0x20000,4,data=0x21000,flags=0x80)
        self.prop(0x21000,2)
        self.m.put(0x20018,'Q',owner|1)
        fields=self.e.properties(owner)
        self.assertEqual(fields[0]['name'],'Items')
        self.assertTrue(fields[0]['parameter'])
        self.assertTrue(fields[0]['unresolved'])
        self.assertEqual(len(self.e.failures),1)

    def test_split_tagged_enum_preserves_signed_64_bit(self):
        a=0x30000
        self.e.objects[a]=dict(name='E',outerAddress=0,classAddress=0,objectFlags=0,index=7)
        self.m.put(a+0x40,'QQI',0x40001,0x50001,2)
        self.m.put(0x40000,'IIII',3,0,3,2)
        self.m.put(0x50000,'qq',-1,2**60)
        r=self.e.record(a,'Enum')
        self.assertEqual(r['values'],[dict(name='Items',value=-1),dict(name='Items_1',value=2**60)])

    def test_outer_cycle_rejected(self):
        self.e.objects[1]=dict(name='A',outerAddress=2)
        self.e.objects[2]=dict(name='B',outerAddress=1)
        with self.assertRaisesRegex(ParseError,'cycle'): self.e.path(1)

    def test_property_cycle_rejected(self):
        self.prop(0x20000,2)
        self.m.put(0x30050,'Q',0x20000)
        self.m.put(0x20010,'Q',0x20000)
        self.m.put(0x20018,'Q',0x30001)
        with self.assertRaisesRegex(ParseError,'cycle'): self.e.properties(0x30000)

    def test_cdo_is_not_a_type(self):
        self.e.objects[1]=dict(objectFlags=0x10)
        self.assertIsNone(self.e.kind(1))

    def test_invalid_array_bounds_rejected(self):
        self.m.put(self.m.base+PROFILE['objectArrayRva'],'IIQII',65,3,0x10000,10,65*65536)
        with self.assertRaisesRegex(ParseError,'layout'): self.e.header()

    def test_fname_utf16_and_number_suffix(self):
        self.m.put(self.m.base+PROFILE['nameBlocksRva'],'Q',0x40000)
        self.m.put(0x40014,'H',2*64+1)
        self.m.put(0x40016,'HH',ord('角'),ord('色'))
        self.assertEqual(self.e.name(10,2),'角色_1')


if __name__ == '__main__': unittest.main()
