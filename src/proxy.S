    .text
    .globl pbz_entry_gate
    .seh_proc pbz_entry_gate
pbz_entry_gate:
    pushfq
    .seh_stackalloc 8
    subq $224, %rsp
    .seh_stackalloc 224
    .seh_endprologue
    movq %rax, 32(%rsp)
    movq %rcx, 40(%rsp)
    movq %rdx, 48(%rsp)
    movq %r8, 56(%rsp)
    movq %r9, 64(%rsp)
    movq %r10, 72(%rsp)
    movq %r11, 80(%rsp)
    movdqu %xmm0, 96(%rsp)
    movdqu %xmm1, 112(%rsp)
    movdqu %xmm2, 128(%rsp)
    movdqu %xmm3, 144(%rsp)
    movdqu %xmm4, 160(%rsp)
    movdqu %xmm5, 176(%rsp)
    call pbz_initialize
    movdqu 96(%rsp), %xmm0
    movdqu 112(%rsp), %xmm1
    movdqu 128(%rsp), %xmm2
    movdqu 144(%rsp), %xmm3
    movdqu 160(%rsp), %xmm4
    movdqu 176(%rsp), %xmm5
    movq 32(%rsp), %rax
    movq 40(%rsp), %rcx
    movq 48(%rsp), %rdx
    movq 56(%rsp), %r8
    movq 64(%rsp), %r9
    movq 72(%rsp), %r10
    movq 80(%rsp), %r11
    addq $224, %rsp
    popfq
    jmp *pbz_original_entry(%rip)
    .seh_endproc

// Forward arbitrary signatures, including undocumented ByHandle, unchanged.
// Keep original register and stack arguments intact; r11 is a volatile scratch.
    .macro version_export index
    .globl pbz_version_\index
    .seh_proc pbz_version_\index
pbz_version_\index:
    subq $168, %rsp
    .seh_stackalloc 168
    .seh_endprologue
    movq %rax, 32(%rsp)
    movq %rcx, 40(%rsp)
    movq %rdx, 48(%rsp)
    movq %r8, 56(%rsp)
    movq %r9, 64(%rsp)
    movdqu %xmm0, 80(%rsp)
    movdqu %xmm1, 96(%rsp)
    movdqu %xmm2, 112(%rsp)
    movdqu %xmm3, 128(%rsp)
    movl $\index, %ecx
    call pbz_resolve_version
    movq %rax, %r11
    movdqu 80(%rsp), %xmm0
    movdqu 96(%rsp), %xmm1
    movdqu 112(%rsp), %xmm2
    movdqu 128(%rsp), %xmm3
    movq 32(%rsp), %rax
    movq 40(%rsp), %rcx
    movq 48(%rsp), %rdx
    movq 56(%rsp), %r8
    movq 64(%rsp), %r9
    addq $168, %rsp
    jmp *%r11
    .seh_endproc
    .endm
    version_export 0
    version_export 1
    version_export 2
    version_export 3
    version_export 4
    version_export 5
    version_export 6
    version_export 7
    version_export 8
    version_export 9
    version_export 10
    version_export 11
    version_export 12
    version_export 13
    version_export 14
    version_export 15
    version_export 16
