#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmsystem.h>
#include <hidsdi.h>
#include <dsound.h>
#include <dxgi.h>
#include <winver.h>
#include <cassert>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <thread>
#include <vector>

#if defined(PBZ_TEST_HID)
static constexpr auto dll=L"hid.dll";
void exercise(HMODULE real) {
    GUID a{},b{}; HidD_GetHidGuid(&a);
    reinterpret_cast<decltype(&HidD_GetHidGuid)>(GetProcAddress(real,"HidD_GetHidGuid"))(&b);
    assert(!memcmp(&a,&b,sizeof a));
}
#elif defined(PBZ_TEST_WINMM)
static constexpr auto dll=L"winmm.dll";
void exercise(HMODULE real) {
    TIMECAPS a{},b{};
    auto f=reinterpret_cast<decltype(&timeGetDevCaps)>(GetProcAddress(real,"timeGetDevCaps"));
    assert(timeGetDevCaps(&a,sizeof a)==f(&b,sizeof b)); assert(!memcmp(&a,&b,sizeof a));
}
#elif defined(PBZ_TEST_DSOUND)
static constexpr auto dll=L"dsound.dll";
void exercise(HMODULE real) {
    GUID a{},b{};
    const GUID input={0xdef00000,0x9c6d,0x47ed,{0xaa,0xf1,0x4d,0xda,0x8f,0x2b,0x5c,0x03}};
    auto f=reinterpret_cast<decltype(&GetDeviceID)>(GetProcAddress(real,"GetDeviceID"));
    assert(GetDeviceID(&input,&a)==f(&input,&b)); assert(!memcmp(&a,&b,sizeof a));
}
#elif defined(PBZ_TEST_DXGI)
static constexpr auto dll=L"dxgi.dll";
void exercise(HMODULE real) {
    const GUID iid={0x7b7166ec,0x21c7,0x44ae,{0xb2,0x1a,0xc9,0xae,0x32,0x1a,0xe3,0x69}};
    IDXGIFactory *a=nullptr,*b=nullptr;
    auto f=reinterpret_cast<decltype(&CreateDXGIFactory)>(GetProcAddress(real,"CreateDXGIFactory"));
    HRESULT x=CreateDXGIFactory(iid,(void**)&a),y=f(iid,(void**)&b);
    assert(x==y); if(a)a->Release(); if(b)b->Release();
}
#else
static constexpr auto dll=L"version.dll";
void exercise(HMODULE real) {
    DWORD a=0,b=0;
    auto f=reinterpret_cast<decltype(&GetFileVersionInfoSizeW)>(GetProcAddress(real,"GetFileVersionInfoSizeW"));
    SetLastError(123); auto x=GetFileVersionInfoSizeW(L"Z:\\pbz-missing",&a); auto e=GetLastError();
    SetLastError(123); assert(x==f(L"Z:\\pbz-missing",&b)); assert(e==GetLastError());
}
#endif
int main() {
#if defined(PBZ_TEST_DUPLICATE)
    DWORD ignored=0; GetFileVersionInfoSizeW(L"Z:\\pbz-missing",&ignored);
#endif
    wchar_t self[32768],loaded[32768],system[MAX_PATH];
    GetModuleFileNameW(nullptr,self,32768);
    auto proxy=GetModuleHandleW(dll); assert(proxy);
    GetModuleFileNameW(proxy,loaded,32768);
    assert(std::filesystem::path(loaded).parent_path()==std::filesystem::path(self).parent_path());
    auto base=(unsigned char*)GetModuleHandleW(nullptr);
    auto nt=(IMAGE_NT_HEADERS64*)(base+((IMAGE_DOS_HEADER*)base)->e_lfanew);
    auto rva=nt->OptionalHeader.AddressOfEntryPoint; DWORD raw=0;
    auto section=IMAGE_FIRST_SECTION(nt);
    for(unsigned i=0;i<nt->FileHeader.NumberOfSections;++i)
        if(rva>=section[i].VirtualAddress && rva<section[i].VirtualAddress+section[i].SizeOfRawData)
            raw=section[i].PointerToRawData+rva-section[i].VirtualAddress;
    assert(raw); unsigned char original[14]; std::ifstream f(std::filesystem::path(self),std::ios::binary);
    f.seekg(raw); f.read((char*)original,14); assert(f && !memcmp(base+rva,original,14));
#if defined(PBZ_TEST_LATE)
    auto late=LoadLibraryW((std::filesystem::path(self).parent_path()/L"hid.dll").c_str());
    assert(late && !memcmp(base+rva,original,14));
    GUID hidGuid{};
    reinterpret_cast<void(WINAPI*)(GUID*)>(GetProcAddress(late,"HidD_GetHidGuid"))(&hidGuid);
    FreeLibrary(late);
    assert(!memcmp(base+rva,original,14));
#endif
    GetSystemDirectoryW(system,MAX_PATH);
    auto real=LoadLibraryExW((std::wstring(system)+L"\\"+dll).c_str(),nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);
    assert(real && real!=proxy);
    std::vector<std::thread> threads;
    for(int i=0;i<8;++i) threads.emplace_back([=]{for(int j=0;j<8;++j)exercise(real);});
    for(auto& thread:threads)thread.join();
    std::wcout<<L"PASS "<<dll<<L": static import, local proxy, entry restoration, API forwarding and concurrency\n";
}
