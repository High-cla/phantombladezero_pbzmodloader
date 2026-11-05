#pragma once
// Trust is extended only to: the loader's own embedded script, files below the mods
// folder that match their bytes on disk, and (when enabled) scripts in the game's own
// script tree, which is where pak mods put changed game scripts.
struct GameString { const wchar_t* data; int count,capacity; };
struct GameBytes { const unsigned char* data; int count,capacity; };
bool gameString(const GameString* value,std::wstring& result,size_t limit=32768) {
    if(!value || !value->data || value->count<1 || value->capacity<value->count || (size_t)value->count>limit ||
       value->data[value->count-1]!=0) return false;
    result.assign(value->data,value->count-1);
    return result.find(L'\0')==std::wstring::npos;
}
std::wstring lowerSlashes(std::wstring name) {
    std::replace(name.begin(),name.end(),L'\\',L'/');
    for(auto& c:name) if(c>=L'A' && c<=L'Z') c+=L'a'-L'A';
    return name;
}
bool cleanRelativePath(const std::wstring& relative) {
    if(relative.empty() || relative.find_first_of(L":\0",0,2)!=std::wstring::npos) return false;
    size_t start=0;
    for(;;) {
        auto end=relative.find(L'/',start);
        auto part=relative.substr(start,end==std::wstring::npos?end:end-start);
        if(part.empty() || part==L"." || part==L"..") return false;
        if(end==std::wstring::npos) return true;
        start=end+1;
    }
}
// Windows ignores case, and hot reload spells the root differently per revision, so
// only the lower-case text decides. The result is the file's real place on disk.
fs::path modScriptPath(const fs::path& root,const std::wstring& name) {
    auto canonicalRoot=fs::canonical(root);
    const auto prefix=lowerSlashes(canonicalRoot.generic_wstring())+L"/mods/";
    auto lower=lowerSlashes(name);
    if(lower.rfind(prefix,0)!=0) return {};
    std::wstring suffix=name.substr(prefix.size());
    std::replace(suffix.begin(),suffix.end(),L'\\',L'/');
    if(!cleanRelativePath(suffix)) return {};
    auto mods=fs::canonical(canonicalRoot/L"mods");
    auto candidate=fs::canonical(mods/fs::path(suffix));
    auto within=candidate.lexically_relative(mods);
    if(within.empty() || within.is_absolute()) return {};
    for(const auto& part:within) if(part==L"..") return {};
    return candidate;
}
bool readModScript(const fs::path& root,const GameString* path,Bytes& bytes) {
    std::wstring name;
    if(!gameString(path,name)) return false;
    auto file=modScriptPath(root,name);
    if(file.empty()) return false;
    std::ifstream stream(file,std::ios::binary|std::ios::ate);
    if(!stream) return false;
    auto length=stream.tellg();
    if(length<0 || length>64*1024*1024) return false;
    bytes.resize((size_t)length); stream.seekg(0);
    if(!bytes.empty()) stream.read((char*)bytes.data(),bytes.size());
    return bool(stream);
}
bool trustedModBytes(const fs::path& root,const GameString* path,const GameBytes* source) {
    if(!source || source->count<0 || source->capacity<source->count || (source->count && !source->data)) return false;
    Bytes expected;
    return readModScript(root,path,expected) && expected.size()==(size_t)source->count &&
        (expected.empty() || std::memcmp(expected.data(),source->data,expected.size())==0);
}
// PuerTS decodes UTF-8 and evaluates a CommonJS wrapper around .js files.
bool sameScriptText(const unsigned char* utf8Data,size_t utf8Size,const GameString* source) {
    std::wstring actual;
    if(!gameString(source,actual,64*1024*1024)) return false;
    size_t offset=utf8Size>=3 && utf8Data[0]==0xef && utf8Data[1]==0xbb && utf8Data[2]==0xbf?3:0;
    auto size=(int)(utf8Size-offset);
    std::wstring decoded;
    if(size) {
        auto data=(const char*)utf8Data+offset;
        int length=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,data,size,nullptr,0);
        if(!length) return false;
        decoded.resize(length);
        if(MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,data,size,decoded.data(),length)!=length) return false;
    }
    return actual==decoded || actual==L"(function (exports, require, module, __filename, __dirname) { "+decoded+L"\n});";
}
bool trustedModText(const fs::path& root,const GameString* path,const GameString* source) {
    Bytes expected;
    return readModScript(root,path,expected) && sameScriptText(expected.data(),expected.size(),source);
}
// The script a pak mod changes or adds: below the game's script tree, .js or .json, no way out of it.
bool gameScriptPath(const std::wstring& name) {
    const std::wstring marker=L"/content/javascript/";
    auto lower=lowerSlashes(name);
    auto at=lower.find(marker);
    if(at==std::wstring::npos) return false;
    auto suffix=lower.substr(at+marker.size());
    auto ends=[&](const wchar_t* tail) { std::wstring t=tail; return suffix.size()>t.size() && suffix.compare(suffix.size()-t.size(),t.size(),t)==0; };
    if(!ends(L".js") && !ends(L".json")) return false;
    for(auto c:suffix) if(c<32 || c==127) return false;
    return cleanRelativePath(suffix);
}
// The game finds its first module on disk, so the loader names an existing game script
// and replaces its bytes here, after the game read them and before it turns them into
// text. The game's array keeps its own memory: the new bytes must fit its capacity.
bool replaceBytes(const GameBytes* target,const std::string& content) {
    if(!target || !target->data || target->capacity<target->count || content.size()>(size_t)target->capacity) return false;
    std::memcpy(const_cast<unsigned char*>(target->data),content.data(),content.size());
    const_cast<GameBytes*>(target)->count=(int)content.size();
    return true;
}
