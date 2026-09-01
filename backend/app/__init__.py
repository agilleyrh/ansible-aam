import os

# Apple Silicon CRC / MicroShift guests advertise SVE2 in /proc/cpuinfo even though
# the hypervisor does not implement those instructions. cryptography 47+ bundles
# OpenSSL that probes SVE at import time and dies with SIGILL (exit 132).
# OPENSSL_armcap=0 disables that probe. It is a no-op on x86_64.
os.environ.setdefault("OPENSSL_armcap", "0")
