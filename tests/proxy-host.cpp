#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winver.h>
#include <cassert>
#include <filesystem>
#include <fstream>
#include <vector>
#include <iostream>
#include <thread>
#include <cstring>
int main() {
    // A static VERSION.dll import ensures the DLL's entry gate executes before main.
    wchar_t self[32768]; GetModuleFileNameW(nullptr,self,32768);
    auto base=(unsigned char*)GetModuleHandleW(nullptr);
    auto nt=(IMAGE_NT_HEADERS64*)(base+((IMAGE_DOS_HEADER*)base)->e_lfanew);
    auto rva=nt->OptionalHeader.AddressOfEntryPoint; DWORD raw=0;
    auto section=IMAGE_FIRST_SECTION(nt);
    for(unsigned i=0;i<nt->FileHeader.NumberOfSections;++i)
        if(rva>=section[i].VirtualAddress && rva<section[i].VirtualAddress+section[i].SizeOfRawData)
            raw=section[i].PointerToRawData+rva-section[i].VirtualAddress;
    assert(raw); unsigned char original[14]; std::ifstream f(std::filesystem::path(self),std::ios::binary);
    f.seekg(raw); f.read((char*)original,14); assert(f && !std::memcmp(base+rva,original,14));
    HMODULE proxy=GetModuleHandleW(L"version.dll"); assert(proxy);
    wchar_t loaded[32768]; GetModuleFileNameW(proxy,loaded,32768);
    assert(std::filesystem::path(loaded).parent_path()==std::filesystem::path(self).parent_path());
    wchar_t system[MAX_PATH]; GetSystemDirectoryW(system,MAX_PATH);
    std::wstring dll=std::wstring(system)+L"\\version.dll", resource=std::wstring(system)+L"\\kernel32.dll";
    HMODULE real=LoadLibraryExW(dll.c_str(),nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32); assert(real && real!=proxy);
    const char* names[]={"GetFileVersionInfoA","GetFileVersionInfoByHandle","GetFileVersionInfoExA","GetFileVersionInfoExW","GetFileVersionInfoSizeA","GetFileVersionInfoSizeExA","GetFileVersionInfoSizeExW","GetFileVersionInfoSizeW","GetFileVersionInfoW","VerFindFileA","VerFindFileW","VerInstallFileA","VerInstallFileW","VerLanguageNameA","VerLanguageNameW","VerQueryValueA","VerQueryValueW"};
    for(int i=0;i<17;++i) assert(GetProcAddress(proxy,names[i])==GetProcAddress(proxy,MAKEINTRESOURCEA(i+1)));
    auto realSize=(decltype(&GetFileVersionInfoSizeW))GetProcAddress(real,"GetFileVersionInfoSizeW");
    DWORD unused=0; auto size=GetFileVersionInfoSizeW(resource.c_str(),&unused); assert(size && size==realSize(resource.c_str(),&unused));
    std::vector<unsigned char> a(size),b(size);
    auto realInfo=(decltype(&GetFileVersionInfoW))GetProcAddress(real,"GetFileVersionInfoW");
    assert(GetFileVersionInfoW(resource.c_str(),0,size,a.data()) && realInfo(resource.c_str(),0,size,b.data()));
    VS_FIXEDFILEINFO* info=nullptr; UINT len=0;
    assert(VerQueryValueW(a.data(),L"\\",(void**)&info,&len) && info->dwSignature==0xfeef04bd);
    VS_FIXEDFILEINFO* reference=nullptr;
    auto realQuery=(decltype(&VerQueryValueW))GetProcAddress(real,"VerQueryValueW");
    assert(realQuery(b.data(),L"\\",(void**)&reference,&len)); assert(!std::memcmp(info,reference,sizeof(*info)));
    // ANSI paths and ExW's fifth stack argument also traverse assembly thunks.
    char ansi[MAX_PATH]; WideCharToMultiByte(CP_ACP,0,resource.c_str(),-1,ansi,MAX_PATH,nullptr,nullptr);
    DWORD asize=GetFileVersionInfoSizeA(ansi,&unused); assert(asize); std::vector<char> abuf(asize);
    assert(GetFileVersionInfoA(ansi,0,asize,abuf.data()));
    assert(VerQueryValueA(abuf.data(),"\\",(void**)&info,&len));
    auto exSize=GetFileVersionInfoSizeExW(FILE_VER_GET_NEUTRAL,resource.c_str(),&unused);
    std::vector<char> exbuf(exSize); assert(GetFileVersionInfoExW(FILE_VER_GET_NEUTRAL,resource.c_str(),0,exSize,exbuf.data()));
    // Eight arguments: missing input makes VerFindFile safe and repeatable.
    auto realFind=(decltype(&VerFindFileW))GetProcAddress(real,"VerFindFileW");
    wchar_t cur1[MAX_PATH]{},dest1[MAX_PATH]{},cur2[MAX_PATH]{},dest2[MAX_PATH]{};
    UINT c1=MAX_PATH,d1=MAX_PATH,c2=MAX_PATH,d2=MAX_PATH;
    wchar_t missing[]=L"pbz-nonexistent-fixture-93e7.dll";
    DWORD r1=VerFindFileW(0,missing,system,system,cur1,&c1,dest1,&d1);
    DWORD r2=realFind(0,missing,system,system,cur2,&c2,dest2,&d2);
    assert(r1==r2 && c1==c2 && d1==d2 && !wcscmp(cur1,cur2) && !wcscmp(dest1,dest2));
    auto realError=(decltype(&GetFileVersionInfoSizeW))GetProcAddress(real,"GetFileVersionInfoSizeW");
    SetLastError(123); realError(L"Z:\\pbz-missing",&unused); DWORD error=GetLastError();
    SetLastError(123); GetFileVersionInfoSizeW(L"Z:\\pbz-missing",&unused); assert(GetLastError()==error);
    std::vector<std::thread> threads;
    for(int i=0;i<8;++i) threads.emplace_back([&] { DWORD scratch=0; for(int j=0;j<25;++j) assert(GetFileVersionInfoSizeW(resource.c_str(),&scratch)==size); });
    for(auto& t:threads)t.join();
    HANDLE small=CreateThread(nullptr,64*1024,[](void*)->DWORD{return 0;},nullptr,STACK_SIZE_PARAM_IS_A_RESERVATION,nullptr);
    assert(small && WaitForSingleObject(small,5000)==WAIT_OBJECT_0);
    DWORD smallExit=1; assert(GetExitCodeThread(small,&smallExit) && smallExit==0); CloseHandle(small);
    std::cout<<"PASS static proxy load, entry restoration, unsupported game fail-open, 17 names/ordinals, W/A APIs, stack arguments, last-error, concurrency\n";
    std::cout<<"PASS DLL notifications on a 64 KiB thread stack\n";
    return 0;
}
