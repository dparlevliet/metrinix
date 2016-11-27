Introduction
============

NodeJS OS metrics for *nix

!WARNING! Still under construction. Not safe to use.

Disk
----

### Partition space

```js
> var metrinix = require('metrinix');
> metrinix.df().then(function(result) { console.log(result); });
[
  {
    "filesystem": "udev",
    "capacity": {
      "size": 78848,
      "unit": "M"
    },
    "used": {
      "size": 0,
      "unit": "M"
    },
    "available": {
      "size": 78848,
      "unit": "M"
    },
    "remaining": 100,
    "mountPoint": "/dev",
    "raw": [
      "udev",
      "77G",
      "0",
      "77G",
      "0%",
      "/dev"
    ]
  },
  {
    "filesystem": "tmpfs",
    "capacity": {
      "size": 16384,
      "unit": "M"
    },
    "used": {
      "size": 28,
      "unit": "M"
    },
    "available": {
      "size": 16384,
      "unit": "M"
    },
    "remaining": 99,
    "mountPoint": "/run",
    "raw": [
      "tmpfs",
      "16G",
      "28M",
      "16G",
      "1%",
      "/run"
    ]
  },
  {
    "filesystem": "/dev/mapper/darkangel--vg-root",
    "capacity": {
      "size": 6081740.8,
      "unit": "M"
    },
    "used": {
      "size": 3565158.4,
      "unit": "M"
    },
    "available": {
      "size": 2411724.8,
      "unit": "M"
    },
    "remaining": 39,
    "mountPoint": "/",
    "raw": [
      "/dev/mapper/darkangel--vg-root",
      "5.8T",
      "3.4T",
      "2.3T",
      "61%",
      "/"
    ]
  }
]
```
