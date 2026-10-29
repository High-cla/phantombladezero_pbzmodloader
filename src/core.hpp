#pragma once
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <tlhelp32.h>
#include <bcrypt.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
#include <array>
#include <set>
#include <map>
#include <regex>
#include <stdexcept>
#include <cstring>
#include <sstream>
#include <iomanip>
namespace fs = std::filesystem;
using Bytes = std::vector<unsigned char>;
using U64 = unsigned long long;
constexpr U64 CALL_RVA=0x6686768, START_RVA=0x6284a20;
constexpr size_t SLAB_SIZE=8192+256*2048;
constexpr char HASH[]="7b4fcd286a350780faf0824d73aa150b21cbf1bccde883e6a96386cbe09973b4";
#ifdef PBZ_DLL
void log(const std::string& s);
#else
std::ofstream output;
void log(const std::string& s) { std::cout<<s<<std::endl; if(output) { output<<s<<'\n'; output.flush(); } }
#endif
void check(bool ok,const char* op) { if(!ok) throw std::runtime_error(std::string(op)+" error="+std::to_string(GetLastError())); }
struct Handle {
    HANDLE h=nullptr;
    explicit Handle(HANDLE v=nullptr):h(v){}
    ~Handle(){if(h && h!=INVALID_HANDLE_VALUE) CloseHandle(h);}
    Handle(const Handle&)=delete;
    Handle& operator=(const Handle&)=delete;
};
std::string utf8(const std::wstring& s) {
    if(s.empty()) return {};
    int n=WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),nullptr,0,nullptr,nullptr);
    std::string r(n,0); WideCharToMultiByte(CP_UTF8,0,s.data(),(int)s.size(),r.data(),n,nullptr,nullptr); return r;
}
std::string sha256(const fs::path& p) {
    BCRYPT_ALG_HANDLE a=nullptr; BCRYPT_HASH_HANDLE h=nullptr;
    if(BCryptOpenAlgorithmProvider(&a,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0) throw std::runtime_error("BCrypt provider");
    if(BCryptCreateHash(a,&h,nullptr,0,nullptr,0,0)<0) { BCryptCloseAlgorithmProvider(a,0); throw std::runtime_error("BCrypt hash"); }
    std::ifstream f(p,std::ios::binary); std::array<char,65536> b{}; unsigned char digest[32]; bool ok=bool(f);
    while(f) { f.read(b.data(),b.size()); if(BCryptHashData(h,(PUCHAR)b.data(),(ULONG)f.gcount(),0)<0) ok=false; }
    ok=ok && f.eof() && BCryptFinishHash(h,digest,32,0)>=0;
    BCryptDestroyHash(h); BCryptCloseAlgorithmProvider(a,0);
    if(!ok) throw std::runtime_error("Hash read failed");
    std::ostringstream s; for(auto v:digest) s<<std::hex<<std::setfill('0')<<std::setw(2)<<(int)v; return s.str();
}
std::wstring ini(const fs::path& p,const std::wstring& section,const wchar_t* key) {
    wchar_t buf[4096]; DWORD n=GetPrivateProfileStringW(section.c_str(),key,L"",buf,4096,p.c_str());
    if(n>=4095) throw std::runtime_error("Config value too long"); return std::wstring(buf,n);
}
int number(const std::wstring& s,int max) {
    if(s.empty() || s.find_first_not_of(L"0123456789")!=std::wstring::npos) throw std::runtime_error("Invalid numeric config");
    auto n=std::stoul(s); if(n>(unsigned)max) throw std::runtime_error("Config number out of range"); return (int)n;
}
std::string config(const fs::path& root) {
    fs::path p=root/L"mods.ini"; if(!fs::is_regular_file(p)) throw std::runtime_error("Missing mods.ini");
    if(ini(p,L"Loader",L"Version")!=L"1") throw std::runtime_error("Unsupported config version");
    int count=number(ini(p,L"Loader",L"Count"),128); std::set<std::string> ids;
    std::string result="'use strict';\nmodule.exports = {\"version\":1,\"mods\":[";
    for(int i=0;i<count;++i) {
        auto section=L"Mod."+std::to_wstring(i);
        auto id=utf8(ini(p,section,L"Id")), entry=utf8(ini(p,section,L"Entry"));
        auto enabled=number(ini(p,section,L"Enabled"),1);
        if(!std::regex_match(id,std::regex("[A-Za-z0-9_-]+")) || !ids.insert(id).second ||
           !std::regex_match(entry,std::regex("mods/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.js"))) throw std::runtime_error("Invalid or duplicate MOD: "+id);
        if(enabled) {
            auto file=fs::weakly_canonical(root/fs::u8path(entry));
            auto relative=file.lexically_relative(fs::canonical(root/L"mods"));
            if(relative.empty() || *relative.begin()==L".." || !fs::is_regular_file(file)) throw std::runtime_error("Missing or escaped entry: "+entry);
        }
        if(i) result+=",";
        result+="{\"id\":\""+id+"\",\"enabled\":"+(enabled?"true":"false")+",\"entry\":\""+entry+"\"}";
    }
    return result+"]};\n";
}
// PuerTS still reads from its JavaScript search root. Only this disposable cache
// is replaced; user scripts and configuration live together under Mods.
void syncMods(const fs::path& root,const fs::path& scripts) {
    const auto source=root/L"mods", cache=scripts/L"generated-mods";
    // Reject reparse points so neither copying nor cleanup follows a junction.
    auto rejectLink=[](const fs::path& path) {
        auto attributes=GetFileAttributesW(path.c_str());
        if(attributes!=INVALID_FILE_ATTRIBUTES && (attributes&FILE_ATTRIBUTE_REPARSE_POINT))
            throw std::runtime_error("MOD source/cache must not contain reparse points");
    };
    rejectLink(source); rejectLink(cache);
    if(fs::exists(source)) for(const auto& item:fs::recursive_directory_iterator(source)) rejectLink(item.path());
    if(fs::exists(cache)) for(const auto& item:fs::recursive_directory_iterator(cache)) rejectLink(item.path());
    fs::remove_all(cache);
    if(fs::exists(source)) fs::copy(source,cache,fs::copy_options::recursive);
    else fs::create_directories(cache);
}
#ifdef PBZ_DLL
void read(HANDLE,U64 address,void* dest,size_t n) { std::memcpy(dest,(void*)address,n); }
void write(HANDLE,U64 address,const void* data,size_t n) { std::memcpy((void*)address,data,n); }
BOOL protect(HANDLE,void* address,size_t n,DWORD flags,DWORD* old) { return VirtualProtect(address,n,flags,old); }
void* allocate(HANDLE,void* address,size_t n) { return VirtualAlloc(address,n,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE); }
BOOL release(HANDLE,void* address) { return VirtualFree(address,0,MEM_RELEASE); }
#else
void read(HANDLE p,U64 address,void* dest,size_t n) { SIZE_T done=0; check(ReadProcessMemory(p,(void*)address,dest,n,&done)&&done==n,"read memory"); }
void write(HANDLE p,U64 address,const void* data,size_t n) { SIZE_T done=0; check(WriteProcessMemory(p,(void*)address,data,n,&done)&&done==n,"write memory"); }
BOOL protect(HANDLE p,void* address,size_t n,DWORD flags,DWORD* old) { return VirtualProtectEx(p,address,n,flags,old); }
void* allocate(HANDLE p,void* address,size_t n) { return VirtualAllocEx(p,address,n,MEM_COMMIT|MEM_RESERVE,PAGE_READWRITE); }
BOOL release(HANDLE p,void* address) { return VirtualFreeEx(p,address,0,MEM_RELEASE); }
#endif
void patch(HANDLE p,U64 address,const Bytes& bytes) {
    DWORD old=0,unused=0; check(protect(p,(void*)address,bytes.size(),PAGE_EXECUTE_READWRITE,&old),"patch protect");
    try { write(p,address,bytes.data(),bytes.size()); }
    catch(...) { protect(p,(void*)address,bytes.size(),old,&unused); throw; }
    check(protect(p,(void*)address,bytes.size(),old,&unused),"restore protect");
    check(FlushInstructionCache(p,(void*)address,bytes.size()),"flush instructions");
}
void imm64(Bytes& b,U64 n) { for(int i=0;i<8;++i) b.push_back((unsigned char)(n>>(i*8))); }
void imm32(Bytes& b,int n) { for(int i=0;i<4;++i) b.push_back((unsigned char)((unsigned)n>>(i*8))); }
void rel32(Bytes& b,U64 from,U64 to) {
    auto d=(long long)to-(long long)from; if(d<INT32_MIN||d>INT32_MAX) throw std::runtime_error("rel32 out of range"); imm32(b,(int)d);
}
void absoluteJump(Bytes& b,U64 target) { b.insert(b.end(),{0xff,0x25,0,0,0,0}); imm64(b,target); }
U64 allocateNear(HANDLE p,U64 base) {
    // 64 KiB aligned allocations, all hooks and relocated operands must fit rel32.
    U64 center=(base+CALL_RVA)&~U64(65535);
    for(U64 d=0x10000;d<0x70000000;d+=0x10000) {
        for(U64 addr:{center+d,center-d}) {
            auto v=allocate(p,(void*)addr,SLAB_SIZE);
            if(v) return (U64)v;
        }
    }
    throw std::runtime_error("No nearby allocation");
}
// Leaf trampoline: no foreign DLL, CRT or UE allocation ownership. Original argv untouched.
Bytes startStub(U64 slab,U64 target) {
    Bytes b={0x9c,0x48,0xff,0x05}; rel32(b,slab+8,slab+4096+8); // pushfq; inc qword [counter]
    b.push_back(0x9d); b.insert(b.end(),{0x48,0xba}); imm64(b,slab+4128); // popfq; mov rdx,FString*
    absoluteJump(b,target); return b;
}
Bytes loggerStub(U64 at,U64 ring,U64 original,const Bytes& stolen) {
    // Preserve flags and every register touched. No calls, so no unwind/stack-alignment change.
    Bytes b={0x9c,0x50,0x51,0x52,0x56,0x57,0x41,0x51,0x41,0x52,0x41,0x53};
    std::vector<size_t> exits;
    auto jcc=[&](unsigned char op){ b.insert(b.end(),{0x0f,op}); exits.push_back(b.size()); imm32(b,0); };
    auto add=[&](std::initializer_list<unsigned char> v){b.insert(b.end(),v);};
    add({0x48,0x85,0xd2}); jcc(0x84); // test rdx
    add({0x8b,0x4a,0x08,0x83,0xf9,0x05}); jcc(0x8c); // FString count >=5
    add({0x48,0x8b,0x32,0x48,0x85,0xf6}); jcc(0x84); // rsi=data
    add({0x48,0xb8}); imm64(b,0x005a00420050005bULL); // UTF-16 "[PBZ"
    add({0x48,0x39,0x06}); jcc(0x85);
    add({0xff,0xc9,0xb8,0xe8,0x03,0,0,0x39,0xc1,0x0f,0x47,0xc8}); // min(count-1,1000)
    add({0x49,0xbb}); imm64(b,ring);
    add({0xb8,1,0,0,0,0xf0,0x49,0x0f,0xc1,0x03}); // lock xadd [r11],rax
    add({0x4c,0x8d,0x50,0x01,0x25,0xff,0,0,0,0x48,0xc1,0xe0,0x0b}); // seq=old+1; slot=(old&255)*2048
    add({0x49,0x8d,0xbc,0x03}); imm32(b,4096); // rdi=ring+4096+slot (slab+8192)
    add({0x49,0x89,0xf9,0x48,0xc7,0x07,0,0,0,0,0x89,0x4f,0x08,0x48,0x83,0xc7,0x10,0xfc,0xf3,0x66,0xa5});
    add({0x4d,0x87,0x11}); // xchg [r9],r10 publishes complete record
    size_t end=b.size(); for(auto i:exits) { int d=(int)(end-i-4); std::memcpy(b.data()+i,&d,4); }
    add({0x41,0x5b,0x41,0x5a,0x41,0x59,0x5f,0x5e,0x5a,0x59,0x58,0x9d});
    // Relocate the exact seven-byte cmp byte [rip+disp32],imm8; following jcc stays original.
    int oldDisp; std::memcpy(&oldDisp,stolen.data()+2,4);
    U64 operand=original+7+oldDisp;
    b.insert(b.end(),{0x80,0x3d}); rel32(b,at+b.size()+5,operand); b.push_back(stolen[6]);
    Bytes j={0xe9}; rel32(j,at+b.size()+5,original+7); b.insert(b.end(),j.begin(),j.end()); return b;
}
struct Patch { U64 address; Bytes old; };
struct Installed { U64 slab=0; std::vector<Patch> patches; };
Installed install(HANDLE p,U64 base) {
    Installed state;
    const std::array<U64,3> loggers={0x62ab700,0x62b2e00,0x62a56b0};
    const std::array<Bytes,3> signatures={Bytes{0x80,0x3d,0x61,0xc8,0xd5,0x07,0x05},Bytes{0x80,0x3d,0x61,0x51,0xd5,0x07,0x03},Bytes{0x80,0x3d,0xb1,0x28,0xd6,0x07,0x02}};
    auto verify=[&](U64 addr,const Bytes& expected) { Bytes got(expected.size()); read(p,addr,got.data(),got.size()); if(got!=expected) throw std::runtime_error("Instruction signature mismatch"); };
    verify(base+CALL_RVA,{0xe8,0xb3,0xe2,0xbf,0xff});
    verify(base+START_RVA,{0x48,0x8b,0x09,0x48,0x8b,0x01,0x48,0xff,0x20});
    for(int i=0;i<3;++i) verify(base+loggers[i],signatures[i]);
    state.slab=allocateNear(p,base);
    try {
        Bytes blob(3072); auto stub=startStub(state.slab,base+START_RVA); std::copy(stub.begin(),stub.end(),blob.begin());
        for(int i=0;i<3;++i) {
            auto logger=loggerStub(state.slab+256+i*512,state.slab+4096,base+loggers[i],signatures[i]);
            if(logger.size()>512) throw std::runtime_error("Logger stub overflow");
            std::copy(logger.begin(),logger.end(),blob.begin()+256+i*512);
        }
        write(p,state.slab,blob.data(),blob.size());
        const wchar_t module[]=L"PBZModLoader/bootstrap";
        struct String { U64 data; int count; int capacity; } name={state.slab+4160,(int)std::size(module),(int)std::size(module)};
        write(p,state.slab+4128,&name,sizeof(name)); write(p,state.slab+4160,module,sizeof(module));
        // Executable code is RX; counters, FString and bounded ring are on RW pages.
        DWORD ignored; check(protect(p,(void*)state.slab,4096,PAGE_EXECUTE_READ,&ignored),"stub RX");
        for(int i=0;i<3;++i) {
            state.patches.push_back({base+loggers[i],signatures[i]});
            Bytes hook={0xe9}; rel32(hook,base+loggers[i]+5,state.slab+256+i*512); hook.insert(hook.end(),{0x90,0x90}); patch(p,base+loggers[i],hook);
        }
        state.patches.push_back({base+CALL_RVA,{0xe8,0xb3,0xe2,0xbf,0xff}});
        Bytes call={0xe8}; rel32(call,base+CALL_RVA+5,state.slab); patch(p,base+CALL_RVA,call);
        return state;
    } catch(...) {
        bool restored=true; for(auto it=state.patches.rbegin();it!=state.patches.rend();++it) try{patch(p,it->address,it->old);}catch(...){restored=false;}
        if(restored) release(p,(void*)state.slab);
        throw;
    }
}
void drain(HANDLE p,U64 slab,U64& next) {
    U64 count=0; read(p,slab+4096,&count,8);
    if(count>next+256) { log("log-overflow dropped="+std::to_string(count-next-256)); next=count-256; }
    while(next<count) {
        std::array<unsigned char,2048> b{}; U64 addr=slab+8192+(next%256)*2048;
        read(p,addr,b.data(),b.size()); U64 seq=0,again=0; unsigned len=0;
        std::memcpy(&seq,b.data(),8); std::memcpy(&len,b.data()+8,4); read(p,addr,&again,8);
        if(seq!=next+1 || again!=seq) break;
        if(len<=1000) log(utf8(std::wstring((wchar_t*)(b.data()+16),len)));
        ++next;
    }
}
