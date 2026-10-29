#pragma once
// Mapped PE snapshot. Addresses in descriptors are interpreted relative to origin,
// which is the runtime base in-process and preferred ImageBase in file tests.
struct ImageSection { size_t begin, size; DWORD flags; };
struct ImageView {
    Bytes bytes;
    U64 origin;
    std::vector<ImageSection> sections;
    bool contains(size_t at,size_t n,DWORD flags=0) const {
        for(auto s:sections) if((s.flags&flags)==flags && at>=s.begin && n<=s.size && at-s.begin<=s.size-n) return true;
        return false;
    }
    template<class T> T value(size_t at) const {
        if(!contains(at,sizeof(T))) throw std::runtime_error("Signature operand outside image sections");
        T v; std::memcpy(&v,bytes.data()+at,sizeof(v)); return v;
    }
    size_t relative(size_t at,size_t displacement,size_t length) const {
        auto target=(long long)at+length+value<int32_t>(at+displacement);
        if(target<0 || !contains((size_t)target,1)) throw std::runtime_error("Signature relative target outside image");
        return (size_t)target;
    }
    std::string ascii(size_t at) const {
        std::string s;
        for(size_t i=0;i<512;++i) { auto c=value<char>(at+i); if(!c) return s; s+=c; }
        throw std::runtime_error("Unterminated signature string");
    }
    std::vector<size_t> find(const std::vector<int>& pattern) const {
        std::vector<size_t> hits;
        for(auto s:sections) if(s.flags&IMAGE_SCN_MEM_EXECUTE) {
            if(pattern.empty() || s.size<pattern.size()) continue;
            size_t at=s.begin,end=s.begin+s.size-pattern.size()+1;
            while(at<end) {
                auto p=(const unsigned char*)std::memchr(bytes.data()+at,pattern[0],end-at);
                if(!p) break;
                at=p-bytes.data(); bool match=true;
                for(size_t j=1;j<pattern.size();++j) if(pattern[j]>=0 && p[j]!=pattern[j]) { match=false; break; }
                if(match) hits.push_back(at);
                ++at;
            }
        }
        return hits;
    }
};
struct HookSites { size_t call,start; std::array<size_t,3> loggers; };
HookSites resolveSites(const ImageView& image) {
    HookSites sites{};
    // lea rdx,"MainStart"; construct FString; prepare context, name and argv;
    // call PuerTS Start. Displacements vary with builds and ASLR.
    const std::vector<int> mainPattern={0x48,0x8d,0x15,-1,-1,-1,-1,0x48,0x8d,0x4d,0x97,0xe8,-1,-1,-1,-1,0x4c,0x8d,0x45,0xd7,0x48,0x8b,0xcb,0x48,0x8d,0x55,0x97,0xe8,-1,-1,-1,-1,0x48,0x8b,0x4d,0x97,0x48,0x85,0xc9};
    size_t count=0;
    for(auto at:image.find(mainPattern)) {
        try {
            if(image.ascii(image.relative(at,3,7))!="MainStart") continue;
            auto call=at+27,start=image.relative(call,1,5);
            const Bytes thunk={0x48,0x8b,0x09,0x48,0x8b,0x01,0x48,0xff,0x20};
            if(!image.contains(start,thunk.size(),IMAGE_SCN_MEM_EXECUTE) ||
               !std::equal(thunk.begin(),thunk.end(),image.bytes.begin()+start)) continue;
            sites.call=call; sites.start=start; ++count;
        } catch(const std::exception&) { /* malformed candidate is not a match */ }
    }
    if(count!=1) throw std::runtime_error("MainStart signature requires one validated match; found="+std::to_string(count));
    size_t category=0,source=0;
    for(size_t i=0;i<3;++i) {
        const int level[]={5,3,2};
        const std::vector<int> logger={0x80,0x3d,-1,-1,-1,-1,level[i],0x72,0x28,0x83,0x7a,0x08,0,0x74,5,0x4c,0x8b,0x0a,0xeb,7,0x4c,0x8d,0x0d,-1,-1,-1,-1,0x4c,0x8b,0xc1,0x48,0x8d,0x15,-1,-1,-1,-1,0x48,0x8d,0x0d,-1,-1,-1,-1,0xe9,-1,-1,-1,-1,0xc3};
        count=0; size_t matchedCategory=0,matchedSource=0;
        for(auto at:image.find(logger)) {
            try {
                auto cat=image.relative(at,2,7);
                if(!image.contains(cat,1,IMAGE_SCN_MEM_WRITE) || image.relative(at+30,3,7)!=cat) continue;
                auto target=image.relative(at+44,1,5);
                if(!image.contains(target,1,IMAGE_SCN_MEM_EXECUTE)) continue;
                auto descriptor=image.relative(at+37,3,7);
                U64 ptr=image.value<U64>(descriptor+8);
                if(ptr<image.origin) continue;
                auto src=(size_t)(ptr-image.origin);
                auto path=image.ascii(src);
                std::replace(path.begin(),path.end(),'\\','/');
                const std::string suffix="/Puerts/Source/JsEnv/Private/JSLogger.cpp";
                if(path.size()<suffix.size() || path.compare(path.size()-suffix.size(),suffix.size(),suffix)) continue;
                sites.loggers[i]=at; matchedCategory=cat; matchedSource=src; ++count;
            } catch(const std::exception&) {}
        }
        if(count!=1) throw std::runtime_error("PuerTS logger signature requires one validated match; level="+std::to_string(level[i])+" found="+std::to_string(count));
        if(i && (category!=matchedCategory || source!=matchedSource)) throw std::runtime_error("PuerTS logger references disagree");
        category=matchedCategory; source=matchedSource;
    }
    return sites;
}

fs::path findProject(const fs::path& executable) {
    for(auto dir=fs::absolute(executable).parent_path();!dir.empty();) {
        auto candidate=dir.filename()==L"ProjectPBZ"?dir:dir/L"ProjectPBZ";
        if(fs::is_directory(candidate/L"Content") && fs::is_regular_file(candidate/L"Mods/PBZModLoader/mods.ini") &&
           fs::is_regular_file(candidate/L"Content/JavaScript/PBZModLoader/bootstrap.js")) return fs::canonical(candidate);
        auto parent=dir.parent_path(); if(parent==dir) break; dir=parent;
    }
    throw std::runtime_error("ProjectPBZ runtime not found above game executable");
}
