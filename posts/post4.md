
---

#  Understanding Blocking vs Non-Blocking I/O and Sync vs Async in FastAPI

When we first dive into **FastAPI**, we’ll quickly encounter terms like *blocking*, *non-blocking*, *synchronous*, and *asynchronous*.
These concepts are fundamental to writing efficient, scalable web applications — especially when dealing with I/O-bound tasks such as database queries, file reads, or HTTP requests.

Let’s break them down step by step and then look at how they work in practice.

---

##  1. The Ideas

### Blocking I/O

**Blocking I/O** means that when a function performs an input/output operation (like reading a file or waiting for a database query), it **blocks the execution** of the current thread until the operation completes.

Think of it like this:

> we’re standing in a queue at a coffee shop waiting for order before doing anything else — that’s blocking behavior.

Example (pseudocode):

```python
data = read_file("large_file.txt")  # blocks until file is read
process(data)
```

No other code runs until `read_file()` finishes.

---

### Non-Blocking I/O

In **non-blocking I/O**, the function **does not block** the thread.
Instead, it *starts* the operation and immediately moves on, allowing other tasks to run while waiting for the I/O to complete.

> we order coffee, get a buzzer, and sit down to check emails while waiting — that’s non-blocking.

Example (conceptually):

```python
task = read_file_async("large_file.txt")
# do other work
data = await task  # get result later
```

---

## 2. Synchronous vs Asynchronous Execution

While **blocking/non-blocking** describes *how I/O operations behave*,
**synchronous/asynchronous** describes *how our program manages control flow*.

| Concept          | Description                                                                                                       | Example                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Synchronous**  | Code executes line by line. Each statement waits for the previous one to finish.                                  | Traditional Python functions    |
| **Asynchronous** | Code can pause (`await`) without blocking other tasks. Uses event loop to handle multiple I/O tasks concurrently. | `async def` + `await` in Python |

So:

* A synchronous function **can** use non-blocking I/O, but typically doesn’t.
* An asynchronous function **requires** non-blocking I/O to be effective.

---

## ⚡ 3. How FastAPI Uses This

FastAPI is built on top of **Starlette** (an async web framework) and **Uvicorn** (an ASGI server).
It supports both:

* **Normal (sync)** Python functions
* **Async (non-blocking)** functions

Depending on how we define our endpoints, FastAPI decides whether to run them in a threadpool (for blocking I/O) or inside the async event loop (for non-blocking I/O).

---

## 4. Example Implementation in FastAPI

Let’s write two simple endpoints — one **blocking** and one **non-blocking** — to see the difference.

---

### Example Directory Structure

```
fastapi_io_demo/
│
├── main.py
├── requirements.txt
└── (venv)
```

---

### main.py

```python
from fastapi import FastAPI
import time
import asyncio

app = FastAPI()

# -------------------------------
# Blocking I/O (synchronous)
# -------------------------------
@app.get("/blocking")
def blocking_endpoint():
    """
    Simulate a blocking I/O task using time.sleep().
    This blocks the current thread for 5 seconds.
    """
    start = time.time()
    time.sleep(5)  # Blocking call
    end = time.time()
    return {
        "message": "Blocking I/O complete",
        "time_taken": f"{end - start:.2f} seconds"
    }


# -------------------------------
# Non-Blocking I/O (asynchronous)
# -------------------------------
@app.get("/non_blocking")
async def non_blocking_endpoint():
    """
    Simulate a non-blocking I/O task using asyncio.sleep().
    This yields control back to the event loop while waiting.
    """
    start = time.time()
    await asyncio.sleep(5)  # Non-blocking call
    end = time.time()
    return {
        "message": "Non-blocking I/O complete",
        "time_taken": f"{end - start:.2f} seconds"
    }
```

---

### Running the Server

Install dependencies:

```bash
pip install fastapi uvicorn
```

Then start the server:

```bash
uvicorn main:app --reload
```

Now visit:

* [http://127.0.0.1:8000/blocking](http://127.0.0.1:8000/blocking)
* [http://127.0.0.1:8000/non_blocking](http://127.0.0.1:8000/non_blocking)

---

## 5. Testing the Difference

Try making **two simultaneous requests** to both endpoints (for example, open two browser tabs or use `curl` in two terminals).

* When hitting **/blocking**, the second request will wait until the first one finishes — because it blocks the worker thread.
* When hitting **/non_blocking**, both requests can proceed concurrently — because `await asyncio.sleep()` releases control back to the event loop.

---

## 6. Key Takeaways

| Concept              | Behavior                                  | Use In                              |
| -------------------- | ----------------------------------------- | ----------------------------------- |
| **Blocking I/O**     | Waits until operation completes           | File reads, traditional DB queries  |
| **Non-Blocking I/O** | Doesn’t block thread, allows concurrency  | Async network I/O                   |
| **Synchronous**      | Sequential, simple to reason about        | CPU-bound tasks                     |
| **Asynchronous**     | Concurrent, efficient for I/O-bound tasks | API calls, DB queries, web services |

---

## 7. When to Use Which?

 Use **synchronous** routes if:

* our task is **CPU-bound** (heavy computation).
* we use traditional, blocking libraries (like regular SQL drivers).

 Use **asynchronous** routes if:

* we perform **I/O-bound** tasks (network, file, or database calls).
* we use **async-compatible** libraries (e.g. `httpx`, `asyncpg`).

---


## Benchmark Setup

We’ll simulate **10 concurrent clients** hitting each endpoint using the command-line tool **`ab` (Apache Benchmark)** or **`httpx.AsyncClient`** for Python-based testing.

### Install Benchmark Tools

```bash
sudo apt install apache2-utils
pip install httpx
```

---

## Test 1: Blocking Endpoint

Run the following command:

```bash
ab -n 10 -c 10 http://127.0.0.1:8000/blocking
```

Explanation:

* `-n 10` → total 10 requests
* `-c 10` → all 10 concurrent requests

### Example Result

```
Concurrency Level:      10
Time taken for tests:   50.21 seconds
Complete requests:      10
Failed requests:        0
Requests per second:    0.19 [#/sec] (mean)
Time per request:       50210.73 [ms] (mean)
```

### Analysis

Each request took **~5 seconds**, but because the endpoint is *blocking*,
the server processes them **sequentially**, leading to ~50 seconds total.

FastAPI had to assign each blocking call to a thread pool,
and those threads waited on `time.sleep()` (blocking the OS thread).

---

##  Test 2: Non-Blocking Endpoint

Now test the async version:

```bash
ab -n 10 -c 10 http://127.0.0.1:8000/non_blocking
```

### Example Result

```
Concurrency Level:      10
Time taken for tests:   5.12 seconds
Complete requests:      10
Failed requests:        0
Requests per second:    1.95 [#/sec] (mean)
Time per request:       5123.54 [ms] (mean)
```

### Analysis

This time, **all 10 requests completed in about 5 seconds total** —
because `await asyncio.sleep()` allowed them to run concurrently.

Even though each request *waits 5 seconds*,
the event loop efficiently overlaps the waits using cooperative multitasking.

---

## Visual Comparison

| Endpoint        | Type                 | Total Requests | Concurrency | Total Time (s) | Requests/sec |
| --------------- | -------------------- | -------------- | ----------- | -------------- | ------------ |
| `/blocking`     | Sync (Blocking)      | 10             | 10          | **50.21**      | 0.19         |
| `/non_blocking` | Async (Non-Blocking) | 10             | 10          | **5.12**       | 1.95         |

---

## (Optional) Python-Based Concurrency Test

You can also verify with **`httpx.AsyncClient`** inside a script:

```python
import asyncio
import httpx
import time

URLS = [
    "http://127.0.0.1:8000/blocking",
    "http://127.0.0.1:8000/non_blocking"
]

async def benchmark(url):
    async with httpx.AsyncClient() as client:
        start = time.time()
        tasks = [client.get(url) for _ in range(10)]
        await asyncio.gather(*tasks)
        end = time.time()
        print(f"{url} -> Completed in {end - start:.2f} seconds")

asyncio.run(benchmark(URLS[0]))
asyncio.run(benchmark(URLS[1]))
```

### Expected Output

```
http://127.0.0.1:8000/blocking -> Completed in 50.12 seconds
http://127.0.0.1:8000/non_blocking -> Completed in 5.09 seconds
```

---

## Why This Matters

| Scenario                                   | Best Choice              | Reason                             |
| ------------------------------------------ | ------------------------ | ---------------------------------- |
| File I/O, DB calls, HTTP requests          | **Async / Non-blocking** | Can overlap I/O waits efficiently  |
| Heavy computation (e.g., image processing) | **Sync / Blocking**      | Async doesn’t help CPU-bound tasks |
| Mixed workloads                            | **Hybrid FastAPI app**   | Combine both kinds of endpoints    |

---

## Summary

| Concept              | Meaning                         | Example                 |
| -------------------- | ------------------------------- | ----------------------- |
| **Blocking I/O**     | Thread waits for I/O completion | `time.sleep()`          |
| **Non-Blocking I/O** | Doesn’t block thread            | `await asyncio.sleep()` |
| **Synchronous**      | Executes line-by-line           | `def` functions         |
| **Asynchronous**     | Runs tasks concurrently         | `async def` functions   |

**FastAPI** automatically handles both:

* Runs blocking endpoints in a threadpool.
* Runs async endpoints in the event loop.

---
