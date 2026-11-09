"""Embed the app icon and optional release version into a copied Windows EXE."""
import ctypes as C
from ctypes import wintypes as W
from pathlib import Path
import struct
import sys

exe, ico = map(lambda s: Path(s).resolve(strict=True), sys.argv[1:3])
data = ico.read_bytes()
reserved, kind, count = struct.unpack_from('<HHH', data)
if reserved != 0 or kind != 1 or not count:
    raise ValueError('Expected a nonempty ICO file')
k = C.WinDLL('kernel32', use_last_error=True)
k.LoadLibraryExW.argtypes = [W.LPCWSTR, W.HANDLE, W.DWORD]; k.LoadLibraryExW.restype = W.HMODULE
k.FreeLibrary.argtypes = [W.HMODULE]
CALLBACK = C.WINFUNCTYPE(W.BOOL, W.HMODULE, C.c_void_p, C.c_void_p, C.c_ssize_t)
k.EnumResourceNamesW.argtypes = [W.HMODULE, C.c_void_p, CALLBACK, C.c_ssize_t]
names = []
@CALLBACK
def collect(module, resource_type, name, parameter):
    names.append(name if name <= 65535 else C.wstring_at(name))
    return True
module = k.LoadLibraryExW(str(exe), None, 2)
if not module: raise C.WinError(C.get_last_error())
try: k.EnumResourceNamesW(module, C.c_void_p(14), collect, 0)
finally: k.FreeLibrary(module)
k.BeginUpdateResourceW.argtypes = [W.LPCWSTR, W.BOOL]; k.BeginUpdateResourceW.restype = W.HANDLE
k.UpdateResourceW.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, W.WORD, C.c_void_p, W.DWORD]; k.UpdateResourceW.restype = W.BOOL
k.EndUpdateResourceW.argtypes = [W.HANDLE, W.BOOL]; k.EndUpdateResourceW.restype = W.BOOL
handle = k.BeginUpdateResourceW(str(exe), False)
if not handle: raise C.WinError(C.get_last_error())
def update(resource_type, name, payload):
    pointer = C.c_void_p(name) if isinstance(name, int) else C.cast(C.c_wchar_p(name), C.c_void_p)
    buffer = C.create_string_buffer(payload)
    # Electron's original resources are English; neutral is also replaced for Windows fallback.
    for language in [0, 1033]:
        if not k.UpdateResourceW(handle, C.c_void_p(resource_type), pointer, language, buffer, len(payload)):
            raise C.WinError(C.get_last_error())
def version_resource(version):
    numbers = [int(n) for n in version.split('.')]
    if len(numbers) != 3 or any(n < 0 or n > 65535 for n in numbers):
        raise ValueError('Expected a three-part Windows release version')
    def block(key, value=b'', children=(), text=False):
        payload = bytearray(struct.pack('<HHH', 0, len(value)//2 if text else len(value), int(text)))
        payload.extend((key+'\0').encode('utf-16le'))
        payload.extend(b'\0' * (-len(payload) % 4)); payload.extend(value)
        for child in children:
            payload.extend(b'\0' * (-len(payload) % 4)); payload.extend(child)
        struct.pack_into('<H', payload, 0, len(payload))
        return bytes(payload)
    def string(key, value): return block(key, (value+'\0').encode('utf-16le'), text=True)
    major, minor, patch = numbers
    fixed = struct.pack('<13I', 0xFEEF04BD, 0x10000, major<<16|minor, patch<<16,
                        major<<16|minor, patch<<16, 0x3F, 0, 0x40004, 1, 0, 0, 0)
    strings = {'CompanyName':'ZHP0226', 'FileDescription':'可视化实验室',
               'FileVersion':version+'.0', 'ProductName':'Visualization Lab',
               'ProductVersion':version, 'InternalName':'visualization-workbench',
               'OriginalFilename':'可视化工作台.exe', 'LegalCopyright':'Copyright (c) 2026 ZHP0226'}
    table = block('StringFileInfo', children=[block('040904B0', children=[string(k,v) for k,v in strings.items()], text=True)], text=True)
    translations = block('VarFileInfo', children=[block('Translation', struct.pack('<HH', 1033, 1200))], text=True)
    return block('VS_VERSION_INFO', fixed, [table, translations])
try:
    group = bytearray(data[:6])
    for i in range(count):
        entry = data[6 + i * 16:22 + i * 16]
        length, offset = struct.unpack_from('<II', entry, 8)
        payload = data[offset:offset+length]
        if len(payload) != length: raise ValueError('Truncated ICO image')
        update(3, i + 1, payload)
        group.extend(entry[:12] + struct.pack('<H', i + 1))
    for name in names or [1]: update(14, name, bytes(group))
    if len(sys.argv) > 3: update(16, 1, version_resource(sys.argv[3]))
except BaseException:
    k.EndUpdateResourceW(handle, True)
    raise
if not k.EndUpdateResourceW(handle, False): raise C.WinError(C.get_last_error())
print(f'Embedded {count} icon sizes into {exe.name}')
