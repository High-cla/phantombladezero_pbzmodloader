#define PBZ_DLL
#include "core.hpp"

extern "C" void pbz_entry_gate();
extern "C" { void* pbz_original_entry=nullptr; }
static unsigned char entryBytes[14];
static HMODULE selfModule=nullptr;
static HANDLE logFile=INVALID_HANDLE_VALUE;
static INIT_ONCE versionOnce=INIT_ONCE_STATIC_INIT;
static HMODULE realVersion=nullptr;
static FARPROC versionFunctions[17]{};
static fs::path reloadRoot,reloadScripts;
static const char* const versionNames[]={
    "GetFileVersionInfoA","GetFileVersionInfoByHandle","GetFileVersionInfoExA","GetFileVersionInfoExW",
    "GetFileVersionInfoSizeA","GetFileVersionInfoSizeExA","GetFileVersionInfoSizeExW","GetFileVersionInfoSizeW",
    "GetFileVersionInfoW","VerFindFileA","VerFindFileW","VerInstallFileA","VerInstallFileW",
    "VerLanguageNameA","VerLanguageNameW","VerQueryValueA","VerQueryValueW"
};
static BOOL CALLBACK loadVersion(PINIT_ONCE,void*,void**) {
    wchar_t system[MAX_PATH+32]; UINT n=GetSystemDirectoryW(system,MAX_PATH);
    if(!n || n>=MAX_PATH) return FALSE;
    lstrcatW(system,L"\\version.dll");
    realVersion=LoadLibraryExW(system,nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);
    if(!realVersion || realVersion==selfModule) return FALSE;
    for(int i=0;i<17;++i) {
        versionFunctions[i]=GetProcAddress(realVersion,versionNames[i]);
        if(!versionFunctions[i]) return FALSE;
    }
    return TRUE;
}
extern "C" FARPROC pbz_resolve_version(unsigned index) noexcept {
    const DWORD error=GetLastError();
    if(index>=17 || !InitOnceExecuteOnce(&versionOnce,loadVersion,nullptr,nullptr)) {
        // A missing Windows API cannot be safely replaced with a fabricated return value.
        RaiseFailFastException(nullptr,nullptr,0);
        return nullptr;
    }
    SetLastError(error); return versionFunctions[index];
}
void log(const std::string& s) {
    if(logFile==INVALID_HANDLE_VALUE) return;
    SYSTEMTIME t; GetLocalTime(&t); char time[40];
    snprintf(time,sizeof(time),"[%02u:%02u:%02u.%03u] ",t.wHour,t.wMinute,t.wSecond,t.wMilliseconds);
    std::string line=std::string(time)+s+"\r\n"; DWORD written;
    // FILE_APPEND_DATA and a single WriteFile per record allow the shutdown marker
    // to use this handle without a C++ lock or allocation in DllMain.
    WriteFile(logFile,line.data(),(DWORD)line.size(),&written,nullptr);
}
static DWORD WINAPI monitor(void* context) noexcept {
    U64 slab=(U64)context,next=0,starts=0;
    bool hotkeyRegistered=false,hotkeyWarning=false;
    constexpr int hotkeyId=0x5042;
    unsigned revision=1;
    try {
        for(;;) {
            drain(GetCurrentProcess(),slab,next);
            U64 current=0; read(GetCurrentProcess(),slab+4104,&current,8);
            if(current!=starts) { starts=current; log("main-start count="+std::to_string(starts)); }
            DWORD foregroundProcess=0;
            GetWindowThreadProcessId(GetForegroundWindow(),&foregroundProcess);
            bool focused=foregroundProcess==GetCurrentProcessId();
            if(focused && !hotkeyRegistered) {
                hotkeyRegistered=RegisterHotKey(nullptr,hotkeyId,MOD_CONTROL|MOD_NOREPEAT,VK_F5)!=0;
                if(!hotkeyRegistered && !hotkeyWarning) {
                    log("Ctrl+F5 registration failed; shortcut may be in use"); hotkeyWarning=true;
                }
            } else if(!focused && hotkeyRegistered) {
                UnregisterHotKey(nullptr,hotkeyId); hotkeyRegistered=false;
            }
            if(!focused) hotkeyWarning=false;
            MSG message{};
            bool requested=false;
            while(PeekMessageW(&message,nullptr,WM_HOTKEY,WM_HOTKEY,PM_REMOVE))
                if(message.wParam==hotkeyId && focused) requested=true;
            if(requested) {
                // Compilation may take time; do not reserve another app's
                // shortcut or queue repeated requests while preparing a batch.
                UnregisterHotKey(nullptr,hotkeyId); hotkeyRegistered=false;
                try {
                    publishReload(reloadRoot,reloadScripts,revision);
                    log("hot reload published revision="+std::to_string(revision++));
                }
                catch(const std::exception& e) {
                    log(std::string("hot reload preparation failed: ")+e.what());
                    try { publishReloadFailure(reloadScripts,revision); ++revision; }
                    catch(const std::exception& failure) { log(std::string("reload failure notification: ")+failure.what()); }
                }
            }
            Sleep(50);
        }
    } catch(const std::exception& e) { log(std::string("ERROR monitor: ")+e.what()); }
    catch(...) { log("ERROR monitor: unknown exception"); }
    if(hotkeyRegistered) UnregisterHotKey(nullptr,hotkeyId);
    return 0;
}
extern "C" void pbz_initialize() noexcept {
    const DWORD savedError=GetLastError();
    // Restore the complete original entry before initialization. No instruction
    // relocation is necessary: the gate tail-jumps back to this exact address.
    DWORD old=0,unused=0;
    if(!VirtualProtect(pbz_original_entry,sizeof(entryBytes),PAGE_EXECUTE_READWRITE,&old)) {
        RaiseFailFastException(nullptr,nullptr,0); return;
    }
    std::memcpy(pbz_original_entry,entryBytes,sizeof(entryBytes));
    if(!VirtualProtect(pbz_original_entry,sizeof(entryBytes),old,&unused) ||
       !FlushInstructionCache(GetCurrentProcess(),pbz_original_entry,sizeof(entryBytes))) {
        RaiseFailFastException(nullptr,nullptr,0); return;
    }
    try {
        wchar_t exe[32768]; check(GetModuleFileNameW(nullptr,exe,32768)>0,"game path");
        const fs::path game=exe;
        const fs::path project=findProject(game);
        const fs::path root=project/L"PBZModLoader", scripts=project/L"Content/JavaScript/PBZModLoader";
        SYSTEMTIME st; GetLocalTime(&st); wchar_t name[80];
        swprintf(name,80,L"%04u%02u%02u-%02u%02u%02u-%lu-dll",st.wYear,st.wMonth,st.wDay,st.wHour,st.wMinute,st.wSecond,GetCurrentProcessId());
        fs::path evidence=root/L"evidence"/name; fs::create_directories(evidence);
        logFile=CreateFileW((evidence/L"loader.log").c_str(),FILE_APPEND_DATA,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
        check(logFile!=INVALID_HANDLE_VALUE,"create DLL log");
        log("backend=dll; startup=exe-entry; debugger-api=none");
        log("entry-restored; pid="+std::to_string(GetCurrentProcessId()));
        HMODULE pinned=nullptr;
        check(GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_PIN,
            reinterpret_cast<LPCWSTR>(&pbz_initialize),&pinned),"pin proxy");
        pbz_resolve_version(0);
        wchar_t system[32768]; check(GetModuleFileNameW(realVersion,system,32768)>0,"system version path");
        log("proxy-system="+utf8(system));
        log("project="+utf8(project.wstring()));
        auto enabled=ini(root/L"mods.ini",L"Loader",L"Enabled");
        if(!enabled.empty() && number(enabled,1)==0) { log("MODs disabled by Loader.Enabled=0; original game continues"); SetLastError(savedError); return; }
        auto image=snapshotImage(GetCurrentProcess(),(U64)GetModuleHandleW(nullptr));
        const auto sites=resolveSites(image);
        { std::ostringstream message; message<<"signatures validated; call-rva=0x"<<std::hex<<sites.call<<" start-rva=0x"<<sites.start;
          for(auto rva:sites.loggers) message<<" logger-rva=0x"<<rva; log(message.str()); }
        for(auto file:{L"bootstrap.js",L"manager.js"}) if(!fs::is_regular_file(scripts/file)) throw std::runtime_error("Missing loader JS");
        resetReloads(scripts);
        reloadRoot=root; reloadScripts=scripts;
        syncMods(root,scripts);
        auto generated=config(root,scripts);
        auto temporary=scripts/(L"generated-config."+std::to_wstring(GetCurrentProcessId())+L".tmp");
        { std::ofstream f(temporary,std::ios::binary); f<<generated; f.close(); check(bool(f),"write config"); }
        check(MoveFileExW(temporary.c_str(),(scripts/L"generated-config.js").c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH),"publish config");
        auto installed=install(GetCurrentProcess(),(U64)GetModuleHandleW(nullptr),image,sites);
        log("native hooks installed; configuration published");
        HANDLE worker=CreateThread(nullptr,0,monitor,(void*)installed.slab,0,nullptr);
        if(worker) CloseHandle(worker); else log("ERROR monitor: CreateThread failed; MOD loading remains enabled");
    } catch(const std::exception& e) { log(std::string("MODs skipped: ")+e.what()+"; original game continues"); }
    catch(...) { log("MODs skipped: unknown initialization error; original game continues"); }
    SetLastError(savedError);
}

// Called with the Windows loader lock held. No file I/O, hash, STL allocation,
// LoadLibrary, thread creation/wait, configuration or PuerTS calls occur here.
__attribute__((noinline)) static void armEntry(HMODULE module) noexcept {
    // PROCESS_ATTACH is serialized. Keep long-path buffers out of thread stacks:
    // the game creates small-stack threads that also receive DLL notifications.
    static wchar_t exe[32768],dll[32768];
    DWORD a=GetModuleFileNameW(nullptr,exe,32768),b=GetModuleFileNameW(module,dll,32768);
    if(!a || a>=32768 || !b || b>=32768) return;
    wchar_t* exeName=wcsrchr(exe,L'\\'); wchar_t* dllName=wcsrchr(dll,L'\\');
    if(!exeName || !dllName) return;
    if(exeName-exe!=dllName-dll || _wcsnicmp(exe,dll,exeName-exe)) return;
    // No platform path assumptions. Unsupported wrappers fail signature validation.
    auto base=(unsigned char*)GetModuleHandleW(nullptr);
    auto dos=(IMAGE_DOS_HEADER*)base;
    if(dos->e_magic!=IMAGE_DOS_SIGNATURE || dos->e_lfanew<=0 || dos->e_lfanew>0x100000) return;
    auto nt=(IMAGE_NT_HEADERS64*)(base+dos->e_lfanew);
    if(nt->Signature!=IMAGE_NT_SIGNATURE || nt->OptionalHeader.Magic!=IMAGE_NT_OPTIONAL_HDR64_MAGIC) return;
    DWORD rva=nt->OptionalHeader.AddressOfEntryPoint;
    if(!rva || rva>nt->OptionalHeader.SizeOfImage-sizeof(entryBytes)) return;
    void* entry=base+rva; DWORD old,unused;
    if(!VirtualProtect(entry,sizeof(entryBytes),PAGE_EXECUTE_READWRITE,&old)) return;
    std::memcpy(entryBytes,entry,sizeof(entryBytes)); pbz_original_entry=entry;
    unsigned char jump[14]={0xff,0x25,0,0,0,0}; auto gate=&pbz_entry_gate;
    std::memcpy(jump+6,&gate,8); std::memcpy(entry,jump,sizeof(jump));
    if(!FlushInstructionCache(GetCurrentProcess(),entry,sizeof(jump))) {
        std::memcpy(entry,entryBytes,sizeof(entryBytes)); pbz_original_entry=nullptr;
        FlushInstructionCache(GetCurrentProcess(),entry,sizeof(jump));
    }
    VirtualProtect(entry,sizeof(entryBytes),old,&unused);
}
BOOL WINAPI DllMain(HINSTANCE module,DWORD reason,void* reserved) {
    if(reason==DLL_PROCESS_ATTACH) { selfModule=module; armEntry(module); }
    else if(reason==DLL_PROCESS_DETACH && reserved && logFile!=INVALID_HANDLE_VALUE) {
        static const char marker[]="process-detach shutdown=true (not an exit-code assertion)\r\n";
        DWORD written; WriteFile(logFile,marker,sizeof(marker)-1,&written,nullptr);
        // No joins, loader calls or C++ stream destruction here. OS closes the handle.
    }
    return TRUE;
}
