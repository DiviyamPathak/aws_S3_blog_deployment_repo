
# Building a Python-First Operating System: Inside PCO/OS

## Introduction

Most modern operating systems are written primarily in C, C++, or Rust. PCO/OS takes a different approach: it is an experimental x86_64 operating system built around a Python-first kernel architecture using Codon, while keeping hardware-facing components in C and Assembly.

The goal of the project is not simply to create another toy kernel. Instead, it explores whether high-level languages can be used for substantial portions of kernel development while still maintaining direct control over memory management, interrupts, process scheduling, virtual memory, and user-space execution.

Today, PCO/OS boots through UEFI, manages its own page tables, supports preemptive multitasking, loads ELF binaries into ring-3 user space, provides a virtual file system, and exposes a POSIX-inspired syscall interface.

---

# Why Build an Operating System?

Operating systems sit at the boundary between hardware and software. Building one forces you to understand:

* Computer Architecture
* Operating Systems Internals
* Systems Programming
* Memory Management
* Process Scheduling
* Interrupt Handling
* Firmware Interfaces
* Virtual Memory
* File Systems
* CPU Privilege Levels

Rather than studying these concepts independently, PCO/OS integrates them into a single working system.

---

# Project Architecture

The architecture follows a simple principle:

> High-level policy in Python. Hardware control in low-level code.

The kernel itself is primarily written in Codon-compatible Python, while Assembly and C are used only where direct CPU interaction is required.

```text
OVMF
  ↓
BOOTX64.EFI
  ↓
KERNEL.ELF
  ↓
kernel_main()
```

Major architectural layers include:

* UEFI Boot Loader
* Hardware Abstraction Layer (HAL)
* Physical Memory Manager (PMM)
* Virtual Memory Manager (VMM)
* Interrupt Subsystem
* Scheduler
* System Call Layer
* Virtual File System (VFS)
* ELF Loader
* Interactive Shell

---

# UEFI Boot Process

Unlike many hobby operating systems that rely on GRUB, PCO/OS uses a custom UEFI boot path.

The EFI loader performs several critical tasks:

* Loads KERNEL.ELF
* Reads the EFI memory map
* Loads INITRAMFS.BIN
* Builds a BootInfo structure
* Exits firmware services
* Transfers control to the kernel

This approach gives the kernel explicit ownership over the machine state immediately after startup.

The custom BootInfo structure contains:

* Memory map information
* Kernel address ranges
* CPU information
* Initramfs location
* Boot method metadata

This provides a stable bootloader-to-kernel ABI and eliminates dependency on bootloader-specific behavior.

---

# Memory Management

One of the largest milestones was implementing custom memory management.

## Physical Memory Manager (PMM)

The PMM consumes the EFI memory map and constructs a physical page allocator.

Features include:

* 4 KiB page allocation
* EFI memory map parsing
* Kernel memory reservation
* Page ownership tracking
* Self-test validation

The allocator avoids firmware regions and kernel-reserved pages, giving the OS direct ownership of available RAM.

## Virtual Memory Manager (VMM)

Once physical memory allocation works, the kernel constructs its own page tables.

Capabilities include:

* Kernel-owned CR3
* Identity-mapped bootstrap memory
* 2 MiB large pages
* Dynamic 4 KiB page splitting
* Map / Unmap operations
* Memory protection controls
* Address translation helpers

The result is complete independence from firmware-managed paging structures.

---

# Interrupts and Exception Handling

Modern operating systems depend heavily on interrupt-driven execution.

PCO/OS implements:

* GDT
* IDT
* TSS
* Interrupt Service Routines
* Exception Dispatchers

Supported exceptions include:

* Divide Error (#DE)
* Double Fault (#DF)
* General Protection Fault (#GP)
* Page Fault (#PF)

Special attention was given to double-fault handling through a dedicated IST stack to improve fault isolation and debugging.

The kernel provides detailed diagnostic output whenever a fault occurs, making low-level debugging significantly easier.

---

# APIC and Timekeeping

After basic interrupt support was operational, the next challenge was time.

The kernel initializes the Local APIC and programs the LAPIC timer to generate periodic interrupts.

Implemented features include:

* APIC Initialization
* LAPIC Timer Configuration
* Timer IRQ Validation
* Kernel Tick Accounting
* Timekeeping Infrastructure

This timer system forms the foundation for process scheduling and future SMP support.

---

# Process Scheduling

With timer interrupts available, the kernel moved beyond cooperative execution.

PCO/OS now supports:

* Context Switching
* Process Management
* Wait Queues
* Parent/Child Relationships
* Task Reaping
* Process Reparenting
* Timer-Based Preemption

Unlike purely cooperative kernels, user-space tasks can now be preempted directly by LAPIC timer interrupts.

This represents a major step toward a fully multitasking operating system.

---

# Ring-3 User Space

A critical operating-system milestone is executing code outside kernel mode.

PCO/OS supports:

* Ring-3 Execution
* User Stacks
* Separate Address Spaces
* User Heaps
* Process Isolation

Each user process receives:

* Private virtual memory
* Dedicated stack
* Heap region
* Scheduler context

This separation prevents user code from directly accessing privileged kernel memory.

---

# System Calls

User-space applications communicate with the kernel through a custom syscall layer.

Current capabilities include:

* getpid()
* getppid()
* yield()
* exit()
* waitpid()
* open()
* read()
* write()
* close()
* readdir()
* brk()

System calls are routed through an `int 0x80` entry path and dispatched by the kernel scheduler.

The design intentionally mirrors POSIX concepts while remaining lightweight.

---

# Building a Virtual File System

A usable operating system requires more than memory and processes.

PCO/OS includes a lightweight Virtual File System that supports:

* Hierarchical Directories
* Initramfs Storage
* Tmpfs Storage
* Descriptor-Based I/O
* File Metadata
* Directory Enumeration

Example structure:

```text
/
├── bin
├── docs
├── tmp
└── hello.txt
```

The VFS serves as the foundation for executable loading and shell interaction.

---

# ELF Loading

To support real user-space applications, the kernel implements a custom ELF64 loader.

Supported features include:

* ELF Validation
* PT_LOAD Segments
* Multiple Program Segments
* BSS Initialization
* Entry Point Verification

Applications are loaded directly from the VFS and executed in ring-3 user mode.

Current test programs verify:

* Process Creation
* Argument Passing
* Heap Allocation
* File I/O
* Exec Chains
* Scheduler Preemption

---

# Interactive Shell

Once processes, filesystems, and system calls were operational, the project gained an interactive shell.

Current commands include:

* help
* pwd
* cd
* ls
* cat
* stat
* write
* ticks
* spawn
* run

The shell operates entirely through the serial interface and serves as the primary user-facing environment.

---

# Tooling and Development Workflow

The project uses a modern systems-programming toolchain:

* Python Systems Programming
* Codon
* C
* NASM Assembly
* LLVM
* Linkers
* ELF Tooling
* GNU Toolchain
* QEMU
* OVMF
* GDB

Serial output remains the primary debugging channel throughout development.

This workflow allows rapid iteration while maintaining visibility into low-level kernel behavior.

---

# Lessons Learned

Building an operating system reveals challenges that rarely appear in application development.

Some of the most important lessons include:

* Serial debugging is more valuable than graphical output during early bring-up.
* Memory management becomes the foundation for almost every later subsystem.
* Interrupt handling must be reliable before multitasking can exist.
* User-space isolation dramatically increases architectural complexity.
* Toolchain decisions can affect kernel stability as much as code design.

Most importantly:

> Every subsystem depends on understanding the layers beneath it.

Operating systems expose the reality of how software actually executes on hardware.

---

# Future Work

Several major areas remain on the roadmap:

* SMP (Multi-Core Support)
* Higher-Half Kernel Mapping
* Advanced Virtual Memory Policies
* mmap()/munmap()
* Networking Stack
* Device Drivers
* Persistent Filesystems
* Expanded POSIX Compatibility
* Improved Userland Tooling

The long-term goal is to evolve PCO/OS from a kernel experiment into a practical educational operating system.

---

# Conclusion

PCO/OS demonstrates that modern operating-system development does not need to be limited to traditional implementation languages.

By combining Python-first kernel logic with carefully isolated low-level components, the project explores a different approach to systems programming while still implementing the fundamental building blocks of a modern operating system:

* UEFI Booting
* Memory Management
* Interrupt Handling
* Process Scheduling
* User-Space Execution
* Virtual File Systems
* System Calls
* ELF Loading

The project continues to serve as both a learning platform and an exploration of how high-level languages can participate in low-level systems development.
