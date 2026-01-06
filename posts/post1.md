

---

# Virtual Memory in Linux, FreeBSD, NetBSD

Virtual Memory (VM) is a **memory management technique** that gives each process the impression that it has access to a **large, continuous block of memory**, even though the physical RAM may be much smaller.

This abstraction allows multiple programs to run simultaneously without worrying about the exact amount of physical memory. Instead of allocating all memory directly from RAM, the operating system uses techniques like **paging** and **swap space** to efficiently manage memory.

---

## How Virtual Memory Works

1. **Virtual Addresses:** Every process has its own set of addresses called virtual addresses. These are independent of the physical memory addresses.
2. **Paging:** Physical memory (RAM) is divided into small, fixed-size blocks called *pages*. Virtual pages from processes are mapped to these physical pages.
3. **Swap Space:** When RAM is full, less frequently used pages are moved to disk (swap). This allows more processes to run, but accessing swapped pages is slower than RAM.
4. **Memory Segments:** Each process has different segments in memory:

   * **Text (Code):** The executable instructions of the process.
   * **Data (Heap):** Dynamically allocated memory for variables and objects.
   * **Stack:** Memory used for function calls and local variables.
   * **Shared Libraries:** Memory shared among processes using the same library.

---

## Virtual Memory in Linux

Linux uses **paging and swap** extensively. You can inspect virtual memory usage per process and system-wide.

### Commands to inspect virtual memory

```bash
free -h
```

**Sample Output:**

```
              total        used        free      shared  buff/cache   available
Mem:           15Gi       6.5Gi       5.0Gi       1.0Gi       3.5Gi       7.5Gi
Swap:          2.0Gi       0.5Gi       1.5Gi
```

* **Mem:** Shows RAM usage.
* **Swap:** Shows disk-based memory used for swapping.

```bash
cat /proc/1234/status | grep Vm
```

**Sample Output:**

```
VmPeak:     1024000 kB
VmSize:     1012340 kB
VmRSS:       48000 kB
VmData:     600000 kB
VmStk:         2048 kB
VmExe:          800 kB
VmLib:        10240 kB
```

* **VmSize:** Total virtual memory (RAM + swap) used by the process.
* **VmRSS:** Physical memory (RAM) currently used.
* **VmData:** Memory used for dynamic allocations (heap).
* **VmStk:** Memory used for the process stack.
* **VmExe:** Memory used for the executable code.
* **VmLib:** Memory shared with libraries.

### Configuring Virtual Memory in Linux

* **Swap Size:** Swap can be created at installation or later with a swap file/partition.
* **Swappiness:** Controls how aggressively Linux uses swap.

```bash
cat /proc/sys/vm/swappiness

sudo sysctl -w vm.swappiness=10
```

* **ulimit:** Limits memory usage for processes.

```bash
ulimit -v 1048576
```

---

## Virtual Memory in FreeBSD

FreeBSD uses a VM system similar to Mach, supporting **paging, swapping, and memory mapping**.

### Commands to inspect virtual memory

```bash
vmstat -s
```

**Sample Output:**

```
      16384 M virtual memory
       8192 M active memory
       4096 M inactive memory
       2048 M free memory
        512 M cache
```

```bash
procstat -v 1234
```

**Sample Output:**

```
PID COMM             START                END PAGES RESIDENT PRIVFAULT SHRD  NAME
1234 myprocess    0x400000 0x401000 1   1      0         0      text
1234 myprocess    0x601000 0x801000 512 500     20        0      data
```

* **PAGES:** Number of memory pages allocated.
* **RESIDENT:** Physical memory pages in RAM.
* **PRIVFAULT:** Number of private page faults.
* **NAME:** Segment type (text/code, data, etc.).

### Configuring Virtual Memory in FreeBSD

* Swap is configured in `/etc/fstab` or via `mdconfig`.
* VM parameters can be tuned via `sysctl`:

```bash
sysctl vm.swap_enabled

sysctl vm.swap_total=2G
```

---

## Virtual Memory in NetBSD

NetBSD provides a **traditional BSD VM system** with paging, swap, and memory mapping.

### Commands to inspect virtual memory

```bash
top
```

**Sample Output:**

```
PID USERNAME PRI NICE SIZE RES STATE
1234 root     20   0  100M 50M  R
```

* **SIZE:** Total virtual memory used by the process.
* **RES:** Physical memory used.

```bash
pmap 1234
```

**Sample Output:**

```
1234:   myprocess
00f00000 00f01000 r-x  myprocess text
01000000 01200000 rw-  myprocess data
```

* Shows memory segments (code, data, stack) and access permissions (r = read, w = write, x = execute).

### Configuring Virtual Memory in NetBSD

* Swap partitions or files are configured in `/etc/fstab`.
* VM parameters tuned via `sysctl`:

```bash
sysctl hw.nswap

sysctl vm.swap_enabled=1
```

---

## How Virtual Memory Impacts the System

1. **Performance:** Using swap slows down processes because disk access is slower than RAM.
2. **Process Limits:** Processes can be limited to avoid using excessive memory.
3. **Stability:** Proper configuration of swap and VM parameters ensures the system does not run out of memory.
4. **Isolation:** Each process sees its own virtual memory, preventing interference between processes.

---
