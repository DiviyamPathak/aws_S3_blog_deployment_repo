
# How to Fix Docker TLS Certificate Errors Caused by Jio Mobile Hotspot’s IPv6 Routing


## Introduction

Some users encounter the following TLS error when running `docker pull` or `docker-compose up`:

```
ERROR: Get "https://registry-1.docker.io/v2/": tls: failed to verify certificate: x509: certificate is valid for www.inalde.edu.co, inalde.edu.co, not registry-1.docker.io
```

This error means that Docker received a TLS certificate not belonging to Docker Hub. The cause might be a **network or DNS-level mis-routing**, commonly triggered by **broken IPv6 routing via mobile hotspots** 

---

#  Understanding the Problewm

### What the error means

Docker requested:

```
https://registry-1.docker.io/v2/
```

But the certificate returned belonged to:

```
www.inalde.edu.co
```

This means:

* our request did not reach Docker Hub. A middle device (ISP, hotspot router, NAT64 gateway, IPv6 proxy, or DNS resolver) redirected the request to an unrelated server. TLS verification detected the mismatch and failed, its a networking path problem.

---

#  Why This Happens 

## Mobile Hotspots often break IPv6 routing

Many mobile hotspot providers (e.g., Jio) advertise an IPv6 prefix but:

* Do not provide proper IPv6 routing
* Do not support NAT66
* Do not provide a working DNS64 + NAT64 chain
* Drop long-lived IPv6 connections or redirect them internally

When our system prefers IPv6, Docker resolves:

```
registry-1.docker.io -> IPv6 address
```

Your system then tries connecting to Docker Hub via IPv6, but because the mobile provider routes IPv6 incorrectly, you will hit:

* A transparent web proxy
* A misconfigured CDN node
* A captive portal
* An internal IP that hosts unrelated content

This results in the wrong certificate.

### Why IPv6 causes the misrouting

Docker Hub supports IPv6 in limited regions. When your ISP forwards IPv6 incorrectly:

* DNS returns a valid IPv6
* Router or ISP replaces traffic with another unrelated host
* TLS certificate mismatch occurs

IPv4 does not suffer from such issues because mobile carriers route IPv4 through NAT44, which is stable and widely deployed.

---

# Confirming It Is an IPv6 Issue

### Inspect IPv6 DNS resolution with ```getent``

getent is a standard Unix/Linux command used to query system databases that are managed by the GNU C Library’s Name Service Switch (NSS).
It retrieves entries (data records) from various system databases.

```
getent hosts registry-1.docker.io
```

If you see only IPv6 addresses (`2600:1f18:...`), our OS is choosing IPv6.

### Test IPv6 connection

```
curl -6 https://registry-1.docker.io
```

If it returns a wrong certificate, the IPv6 path is broken.

### Test IPv4

```
curl -4 https://registry-1.docker.io
```

If IPv4 works but IPv6 fails, the problem is confirmed.



---

# First Solution: Disable IPv6 System-Wide

### Why it works

Forces all traffic to use IPv4, completely bypassing the broken IPv6 path from the hotspot provider. This will also 
prevent other applications from using IPv6

## Linux

Check current IPv6 state:

```
cat /proc/sys/net/ipv6/conf/all/disable_ipv6
```

Disable temporarily:

```
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1
```

Disable permanently:

Edit `/etc/sysctl.conf`:

```
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
```

Reload:

```
sudo sysctl -p
```

## macOS

macOS does not provide a global IPv6 disable. Instead disable per interface:

```
networksetup -setv6off Wi-Fi
```

Re-enable:

```
networksetup -setv6automatic Wi-Fi
```

## Windows

Disable IPv6:

```
Control Panel → Network and Internet → Network Connections  
Right-click Wi-Fi → Properties  
Uncheck "Internet Protocol Version 6 (TCP/IPv6)"
```

Or PowerShell:

```
Disable-NetAdapterBinding -Name "Wi-Fi" -ComponentID ms_tcpip6
```

---

# Second Solution: Disable IPv6 Only for Docker

### Why it works

If we wnat to keep IPv6 enabled system-wide, disable it only inside Docker so that container pulls always use IPv4.

Edit `/etc/docker/daemon.json`:

```
{
  "ipv6": false,
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```

Restart Docker:

```
sudo systemctl restart docker
```

Reasoning: Docker normally binds IPv6 networks internally. Disabling it forces IPv4-only network stacks inside Docker.

---

# 4.3 Solution C: Force IPv4 DNS Resolution

### Why it works

If the system retrieves only IPv4 A records, Docker never attempts IPv6 connections.

### Linux

Edit `/etc/resolv.conf`:

```
nameserver 8.8.8.8
nameserver 1.1.1.1
```

Or configure NetworkManager:

```
nm-connection-editor → IPv4 → Manual DNS
```

### macOS

```
System Settings → Network → Wi-Fi → Details → DNS  
Add 8.8.8.8 and 1.1.1.1
```

### Windows

```
Control Panel → Network Adapter → IPv4 → DNS  
Use: 8.8.8.8, 1.1.1.1
```

Reasoning: Some DNS resolvers return AAAA (IPv6) first. Using Google/Cloudflare helps enforce stable IPv4.

---

# Third Solution: Use a VPN

### Why it works

VPN providers maintain stable IPv4 paths. IPv6 is either disabled or fully NATed, bypassing the mobile provider’s broken routing.

Example:

* ProtonVPN
* Mullvad
* Cloudflare Warp

---

# Fourth Solution: Change Network (Best Fix)

### Why it works

Using a stable network resolves the problem instantly.

Use:

* Wired broadband
* Home Wi-Fi
* Office network
---
