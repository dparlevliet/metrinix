var Q = require('q');
var fs = require('fs');
var os = require('os');
var child_process = require('child_process');
var statMap = require('./bin/statMap.js');


function defer(f) {
  var deferred = Q.defer();
  f(deferred);
  return deferred.promise;
}


module.exports = (function() {
  function Metrinix() {
    var self = this;

    self._exec = function(command, params) {
      return defer(function(deferred) {
        var buffer = '';
        var child = child_process.spawn(command, params || []);
        child.stdout.on('data', function (data) {
          buffer += data;
        });
        child.stderr.on('data', function (data) {
          buffer += data;
        });
        child.on('close', function(code) {
          deferred.resolve(buffer);
        });
      });
    };

    self._getconf = function(key) {
      return self._exec('getconf', [key]);
    };

    /**
     * Returns a list of the cpu core loads as a percentage
     *
     * @example
     *    > var metrinix = require('metrinix');
     *    > metrinix.uptime().then(function(result) { console.log(result); });
     *    {
     *      "total": {
     *        "raw": {
     *          "idle": 80831294000,
     *          "usage": 1232634800
     *        },
     *        "percent": 26
     *      },
     *      "cores": [
     *        {
     *          "user": 3,
     *          "nice": 0,
     *          "sys": 1,
     *          "idle": 96,
     *          "irq": 0,
     *          "total": {
     *            "percent": 4,
     *            "raw": {
     *              "idle": 3263462400,
     *              "usage": 136446200
     *            }
     *          },
     *          "raw": {
     *            "model": "Intel(R) Xeon(R) CPU           X5650  @ 2.67GHz",
     *            "speed": 1600,
     *            "times": {
     *              "user": 105852400,
     *              "nice": 12912200,
     *              "sys": 17681600,
     *              "idle": 3263462400,
     *              "irq": 0
     *            }
     *          }
     *        },
     *        ...
     *      ],
     *    }
     *
     * @return <Object>defer
     */
    self.cpuUsage = function() {
      return defer(function(deferred) {
        /**
         * https://nodejs.org/api/os.html#os_os_cpus
         *
         * @example
            [{
              model: 'Intel(R) Xeon(R) CPU           X5650  @ 2.67GHz',
              speed: 1610,
              times: {
                user: 4632100,
                nice: 3240800,
                sys: 2068200,
                idle: 3077137800,
                irq: 0
              }
            },]
         */
        var cpus = os.cpus();
        var cpuCoresPercent = [];
        var cpuTotalLoadPercent = 0;
        cpus.forEach(function(cpu, offset) {
          var total = 0;
          var coreUsage = 0;
          var totalIdle = 0;
          var totalUsage = 0;
          cpuCoresPercent[offset] = {};

          // sum the totals for this cpu core
          Object.keys(cpu.times).forEach(function(key) {
            total += cpu.times[key];
          });

          // calculate the usage percentage for each core
          Object.keys(cpu.times).forEach(function(key) {
            var percent = Math.round(100 * (cpu.times[key] / total));
            cpuCoresPercent[offset][key] = percent;
            if (key !== 'idle') {
              cpuTotalLoadPercent += percent;
              coreUsage += percent;
              totalUsage += cpu.times[key];
            } else {
              totalIdle += cpu.times[key];
            }
          });

          // add totals
          cpuCoresPercent[offset].total = {
            percent: coreUsage,
            raw: {
              idle: totalIdle,
              usage: totalUsage,
            }
          };
          cpuCoresPercent[offset].raw = cpu;
        });

        var totalIdle = 0;
        var totalPercent = 0;
        var totalUsage = 0;
        cpuCoresPercent.forEach(function(cpu, offset) {
          totalIdle += cpu.total.raw.idle;
          totalUsage += cpu.total.raw.usage;
          totalPercent += cpu.total.percent;
        });
        deferred.resolve({
          total: {
            raw: {
              idle: totalIdle,
              usage: totalUsage,
            },
            percent: totalPercent,
          },
          cores: cpuCoresPercent,
        });
      });
    };

    /**
     * Get the systems uptime.
     *
     * Uses ``/proc/uptime``. This file contains two numbers: the uptime of the
     * system (seconds), and the amount of time spent in idle process (seconds).
     *
     * Note: In the file the idle time is the total for all cpus combined.
     *
     * @example
     *    > var metrinix = require('metrinix');
     *    > metrinix.uptime().then(function(result) { console.log(result); });
     *    {
     *      up: 279890.57, // total uptime in seconds
     *      idle: 272434.7525, // average idle time for each core
     *      idleTotal: 6538434.06  // total idle time for all cores
     *    }
     *
     * @return <Object>defer
     */
    self.uptime = function() {
      return defer(function(deferred) {
        fs.readFile('/proc/uptime', 'utf8', function(err, data) {
          if (err) {
            throw err;
          }

          var parts = data.split(' ');
          if (typeof(parts) !== 'object' || !parts.forEach || parts.length !== 2) {
            throw new Error('Invalid uptime file');
          }

          return deferred.resolve({
            up: parseFloat(parts[0]), // uptime in seconds
            idle: (parseFloat(parts[1]) / os.cpus().length), // time spent idle, avg.
            idleTotal: parseFloat(parts[1]), // time spend idle for all cpus
          });
        });
      });
    };


    /**
     * Get metrics of all currently running processes
     *
     * @example:
     *    > var metrinix = require('metrinix');
     *    > metrinix.ps().then(function(result) { console.log(result); });
     *    {
     *      '32764':{
     *         id:{
     *            process:'32764',
     *            parent:32763
     *         },
     *         executable:'docker-ssh',
     *         command:'/bin/sh /usr/local/bin/docker-ssh e8a3b6fd9f97a21271c43e633ad9d35d99b4767b8bccd318f5a505335830920e ',
     *         state:{
     *            code:'S',
     *            value:'Sleeping'
     *         },
     *         raw:{
     *            pid:32764,
     *            comm:'(docker-ssh)',
     *            state:'S',
     *            ppid:32763,
     *            pgrp:32763,
     *            session:32699,
     *            tty_nr:34831,
     *            tpgid:32763,
     *            flags:4194304,
     *            minflt:155,
     *            cminflt:1895,
     *            majflt:0,
     *            cmajflt:2,
     *            utime:0,
     *            stime:0,
     *            cutime:3,
     *            cstime:0,
     *            priority:20,
     *            nice:0,
     *            num_threads:1,
     *            itrealvalue:0,
     *            starttime:10300780,
     *            vsize:4616192,
     *            rss:427,
     *            rsslim:18446744073709552000,
     *            startcode:1,
     *            endcode:1,
     *            startstack:0,
     *            kstkesp:0,
     *            kstkeip:0,
     *            signal:0,
     *            blocked:0,
     *            sigignore:0,
     *            sigcatch:65538,
     *            wchan:0,
     *            nswap:0,
     *            cnswap:0,
     *            exit_signal:17,
     *            processor:5,
     *            rt_priority:0,
     *            policy:0,
     *            delayacct_blkio_ticks:0,
     *            guest_time:0,
     *            cguest_time:0,
     *            start_data:0,
     *            end_data:0,
     *            start_brk:0,
     *            arg_start:0,
     *            arg_end:0,
     *            env_start:0,
     *            env_end:0,
     *            exit_code:0
     *         },
     *         cpu: {
     *            totalPercent:0,
     *            userPercent:0,
     *            systemPercent:0,
     *            raw: {
     *              user: 0,
     *              system: 0,
     *              total: 0,
     *            }
     *         },
     *         memory: {
     *           pages: 0,
     *           pagesize: 0,
     *           bytes: 0,
     *           mb: 0,
     *         }
     *      }
     *
     * @return <Object>defer
     */
    self.ps = function() {
      var readAll = function() {
        return defer(function(deferred) {
          self._getconf('PAGESIZE').then(function(pagesize) {
            fs.readdir('/proc', function(err, dirs) {
              if (err) {
                throw err;
              }
              try {
                var processes = {};
                dirs.forEach(function(dir) {
                  var match = dir.match(/[0-9]+$/);
                  if (!match) {
                    return true;
                  }
                  var PID = match[0];
                  var command = fs.readFileSync('/proc/'+PID+'/cmdline').toString().replace(/[\x00]/g, ' ');

                  var stat = fs.readFileSync('/proc/'+PID+'/stat').toString().trim();

                  // process names can contain spaces, but they're all wrapped in ()
                  // so we need to filter these out so we can accurately parse
                  // the stat file.
                  var processName = stat.match(/(\([^\)]+\))/);
                  stat = stat.replace(processName[0], processName[0].replace(/\s/g, '_'));

                  // now that spaces have been replaced with _ in the process names
                  // of the original stat string, we should be able to split the
                  // string accurately for kernel 3.5 minimum.
                  var parts = stat.split(' ');
                  if (parts.length !== 52) {
                    console.warn('Stat for process '+PID+' may be inaccurate. Expected 52 entries (as of kernel 3.5), found ' + parts.length);
                  }

                  // return the process name back to its original form
                  parts[statMap.comm] = processName[0];

                  // map the state code to a term to make it human-readable
                  var state;
                  switch (parts[statMap.state]) {
                    case 'S':
                      state = 'Sleeping';
                      break;
                    case 'R':
                      state = 'Running';
                      break;
                    case 'D':
                      state = 'Waiting';
                      break;
                    case 'Z':
                      state = 'Zombie';
                      break;
                    case 'T':
                      state = 'Stopped';
                      break;
                    case 't':
                      state = 'Tracing stop';
                      break;
                    case 'W':
                      state = 'Paging';
                      break;
                    case 'X':
                    case 'x':
                      state = 'Dead';
                      break;
                    case 'K':
                      state = 'Wakekill';
                      break;
                    case 'W':
                      state = 'Waking';
                      break;
                    case 'P':
                      state = 'Parked';
                      break;
                  }

                  // map file to a dict
                  var rawMap = {};
                  Object.keys(statMap).forEach(function(key) {
                    var value = parts[statMap[key]];
                    if (value.match(/[0-9\.]+$/)) {
                      value = parseFloat(value);
                    }
                    rawMap[key] = value;
                  });

                  processes[''+PID] = {
                    id: {
                      process: PID,
                      parent: rawMap.ppid,
                    },
                    executable: rawMap.comm.replace(/[\(\)]/g, '').trim(),
                    command: command.trim(),
                    state: {
                      code: rawMap.state,
                      value: state,
                    },
                    raw: rawMap,
                    memory: {
                      pages: rawMap.rss,
                      pagesize: pagesize,
                      bytes: (rawMap.rss*pagesize),
                      mb: (rawMap.rss===0)?0: ((rawMap.rss*pagesize)/(1024*1024)),
                    }
                  };
                });
                deferred.resolve(processes);
              } catch (e) {
                console.log(e);
              }
            });
          });
        });
      };

      return defer(function(deferred) {
        self.uptime().then(function(prevUptime) {
          defer(function(_deferred) {
            readAll().then(function(prevProcesses) {
              // to calculate the percent usage right now we need to compare
              // it against some recent figures, otherwise we would only
              // be able to achieve an average percentage value over the
              // life-time of the process.
              setTimeout(function() {
                _deferred.resolve({
                  prevProcesses: prevProcesses,
                  prevUptime: prevUptime,
                });
              }, 1000);
            });
          }).then(function(prefab) {
            return defer(function(_deferred) {
              // get the uptime right now
              self.uptime().then(function(curUptime) {
                var upDiff = curUptime.up - prevUptime.up;
                prefab.upDiff = upDiff;
                prefab.curUptime = curUptime;
                _deferred.resolve(prefab);
              });
            });
          }).then(function(prefab) {
            // get the list of current processes
            return defer(function(_deferred) {
              readAll().then(function(curProcesses) {
                prefab.curProcesses = curProcesses;
                _deferred.resolve(prefab);
              });
            });
          }).then(function(prefab) {
            // get the cpu hertz
            return defer(function(_deferred) {
              self._getconf('CLK_TCK').then(function(hertz) {
                prefab.hertz = hertz;
                _deferred.resolve(prefab);
              });
            });
          }).then(function(prefab) {
            try {
              Object.keys(prefab.curProcesses).forEach(function(pid) {
                // calculate the cpu usage
                var prevProcess = prefab.prevProcesses[pid];
                var curProcess = prefab.curProcesses[pid];

                if (!prevProcess) {
                  // this is a new process, we have nothing to benchmark
                  // against. Instead, we will remove it from the list.
                  delete prefab.curProcesses[pid];
                  return true;
                }

                // diff in user space
                var prevUserTime = prevProcess.raw.utime + prevProcess.raw.cutime;
                var curUserTime = curProcess.raw.utime + curProcess.raw.cutime;
                var userDiff = (curUserTime - prevUserTime) / prefab.hertz;

                // diff in system space
                var prevSystemTime = prevProcess.raw.stime + prevProcess.raw.cstime;
                var curSystemTime = curProcess.raw.stime + curProcess.raw.cstime;
                var systemDiff = (curSystemTime - prevSystemTime) / prefab.hertz;

                // total diff
                var totalDiff = userDiff + systemDiff;

                prefab.curProcesses[pid].cpu = {
                  totalPercent: (totalDiff/prefab.upDiff) * 100,
                  userPercent: (userDiff/prefab.upDiff) * 100,
                  systemPercent: (systemDiff/prefab.upDiff) * 100,
                  raw: {
                    user: userDiff,
                    system: systemDiff,
                    total: totalDiff,
                  }
                };
              });
            } catch (e) {
              console.log(e);
            }
            deferred.resolve(prefab.curProcesses);
          });
        });
      });
    };

    /**
     * Returns summary information about mounted disks
     *
     * @example:
     *    > var metrinix = require('metrinix');
     *    > metrinix.df().then(function(result) { console.log(result); });
     *    [ { filesystem: 'udev',
     *        capacity: { size: 78848, unit: 'M' },
     *        used: { size: 0, unit: 'M' },
     *        available: { size: 78848, unit: 'M' },
     *        remaining: 100,
     *        mountPoint: '/dev',
     *        raw: [ 'udev', '77G', '0', '77G', '0%', '/dev' ] },
     *      { filesystem: 'tmpfs',
     *        capacity: { size: 16384, unit: 'M' },
     *        used: { size: 28, unit: 'M' },
     *        available: { size: 16384, unit: 'M' },
     *        remaining: 99,
     *        mountPoint: '/run',
     *        raw: [ 'tmpfs', '16G', '28M', '16G', '1%', '/run' ] },
     *      { filesystem: '/dev/mapper/darkangel--vg-root',
     *        capacity: { size: 6081740.8, unit: 'M' },
     *        used: { size: 3565158.4, unit: 'M' },
     *        available: { size: 2411724.8, unit: 'M' },
     *        remaining: 39,
     *        mountPoint: '/',
     *        raw:
     *         [ '/dev/mapper/darkangel--vg-root',
     *           '5.8T',
     *           '3.4T',
     *           '2.3T',
     *           '61%',
     *           '/' ] } ]
     *
     * @return <Object>defer
     */
    self.df = function() {
      return defer(function(deferred) {
        // get the information via df because replicating this for the miriad of
        // disk configurations would be far too much work right now.
        self._exec('df', ['-H']).then(function(output) {
          var lines = output.split("\n");
          lines.splice(0, 1);
          var df = [];
          lines.forEach(function(line, offset) {
            var parts = line.replace(/\s+/g, ' ').split(' ');
            if (parts.length !== 6) {
              return true;
            }

            var convertToBytes = function(string) {
              var sizeParts = (new RegExp('([0-9\.]+)([TMG]{1})', 'g')).exec(string);
              if (!sizeParts) {
                return 0;
              }

              var size = sizeParts[1];
              var suffix = sizeParts[2];
              switch (suffix) {
                case 'T':
                  return (parseFloat(size) * (1024*1024*1024)) / 1024;
                case 'G':
                  return (parseFloat(size) * (1024*1024)) / 1024;
                case 'M':
                  return (parseFloat(size));
                default:
                  return 0;
              }
            };

            try {
              df[offset] = {
                filesystem: parts[0],
                capacity: {
                  size: convertToBytes(parts[1]),
                  unit: 'M',
                },
                used: {
                  size: convertToBytes(parts[2]),
                  unit: 'M',
                },
                available: {
                  size: convertToBytes(parts[3]),
                  unit: 'M',
                },
                remaining: 100 - parseFloat(parts[4].replace('%', '')),
                mountPoint: parts[5],
                raw: parts,
              };
            } catch (e) {
              console.log(e);
            }
          });
          deferred.resolve(df);
        });
      });
    };

    /**
     * Get the RAM and SWAP usages
     *
     * @example:
     *    > var metrinix = require('metrinix');
     *    > metrinix.memory().then(function(result) { console.log(result); });
     *    { ram:
     *       { total: { size: 142745588, unit: 'kB' },
     *         used: { size: 5112264, unit: 'kB' },
     *         free: { size: 451856, unit: 'kB' },
     *         cached: { size: 137181468, unit: 'kB' },
     *         buffers: { size: 1223528, unit: 'kB' } },
     *      swap:
     *       { total: { size: 150982652, unit: 'kB' },
     *         used: { size: 183372, unit: 'kB' },
     *         free: { size: 150788892, unit: 'kB' },
     *         cached: { size: 10388, unit: 'kB' } },
     *      raw:
     *       { MemTotal: { size: 148539436, unit: 'kB' },
     *         MemFree: { size: 451856, unit: 'kB' },
     *         MemAvailable: { size: 142745588, unit: 'kB' },
     *         Buffers: { size: 1223528, unit: 'kB' },
     *         Cached: { size: 137181468, unit: 'kB' },
     *         SwapCached: { size: 10388, unit: 'kB' },
     *         Active: { size: 37773196, unit: 'kB' },
     *         Inactive: { size: 104922160, unit: 'kB' },
     *         'Active(anon)': { size: 2560920, unit: 'kB' },
     *         'Inactive(anon)': { size: 1778500, unit: 'kB' },
     *         'Active(file)': { size: 35212276, unit: 'kB' },
     *         'Inactive(file)': { size: 103143660, unit: 'kB' },
     *         Unevictable: { size: 3656, unit: 'kB' },
     *         Mlocked: { size: 3656, unit: 'kB' },
     *         SwapTotal: { size: 150982652, unit: 'kB' },
     *         SwapFree: { size: 150788892, unit: 'kB' },
     *         Dirty: { size: 166584, unit: 'kB' },
     *         Writeback: { size: 0, unit: 'kB' },
     *         AnonPages: { size: 4285008, unit: 'kB' },
     *         Mapped: { size: 242532, unit: 'kB' },
     *         Shmem: { size: 46424, unit: 'kB' },
     *         Slab: { size: 4755736, unit: 'kB' },
     *         SReclaimable: { size: 4590048, unit: 'kB' },
     *         SUnreclaim: { size: 165688, unit: 'kB' },
     *         KernelStack: { size: 16800, unit: 'kB' },
     *         PageTables: { size: 48316, unit: 'kB' },
     *         NFS_Unstable: { size: 0, unit: 'kB' },
     *         Bounce: { size: 0, unit: 'kB' },
     *         WritebackTmp: { size: 0, unit: 'kB' },
     *         CommitLimit: { size: 225252368, unit: 'kB' },
     *         Committed_AS: { size: 10929632, unit: 'kB' },
     *         VmallocTotal: { size: 34359738367, unit: 'kB' },
     *         VmallocUsed: { size: 0, unit: 'kB' },
     *         VmallocChunk: { size: 0, unit: 'kB' },
     *         HardwareCorrupted: { size: 0, unit: 'kB' },
     *         AnonHugePages: { size: 544768, unit: 'kB' },
     *         CmaTotal: { size: 0, unit: 'kB' },
     *         CmaFree: { size: 0, unit: 'kB' },
     *         HugePages_Total: { size: 0, unit: undefined },
     *         HugePages_Free: { size: 0, unit: undefined },
     *         HugePages_Rsvd: { size: 0, unit: undefined },
     *         HugePages_Surp: { size: 0, unit: undefined },
     *         Hugepagesize: { size: 2048, unit: 'kB' },
     *         DirectMap4k: { size: 364732, unit: 'kB' },
     *         DirectMap2M: { size: 35276800, unit: 'kB' },
     *         DirectMap1G: { size: 116391936, unit: 'kB' } } }
     *
     * @return <Object>defer
     */
    self.memory = function() {
      return defer(function(deferred) {
        fs.readFile('/proc/meminfo', function(err, data) {
          if (err) {
            throw err;
          }
          var lines = data.toString().split("\n");
          var memoryMap = {};
          lines.forEach(function(line) {
            var parts = line.split(':');
            if (!parts || parts.length != 2) {
              return true;
            }
            var byteParts = parts[1].trim().split(' ');
            memoryMap[parts[0]] = {
              size: parseInt(byteParts[0], 10),
              unit: byteParts[1],
            };
          });
          deferred.resolve({
            ram: {
              total: memoryMap['MemAvailable'],
              used: {
                size: memoryMap['MemAvailable'].size - memoryMap['MemFree'].size - memoryMap['Cached'].size,
                unit: memoryMap['MemAvailable'].unit,
              },
              free: memoryMap['MemFree'],
              cached: memoryMap['Cached'],
              buffers: memoryMap['Buffers'],
            },
            swap: {
              total: memoryMap['SwapTotal'],
              used: {
                size: memoryMap['SwapTotal'].size - memoryMap['SwapFree'].size - memoryMap['SwapCached'].size,
                unit: memoryMap['SwapTotal'].unit,
              },
              free: memoryMap['SwapFree'],
              cached: memoryMap['SwapCached'],
            },
            raw: memoryMap
          });
        });
      });
    };

    /**
     * System load average
     *
     * @example:
     *    > var metrinix = require('metrinix');
     *    > metrinix.loadAvg().then(function(result) { console.log(result); });
     *    { min1: 0.01806640625,
     *      min5: 0.0576171875,
     *      min15: 0.0498046875,
     *      raw: [ 0.01806640625, 0.0576171875, 0.0498046875 ] }
     *
     * @return <Object>defer
     */
    self.loadAvg = function() {
      return defer(function(deferred) {
        var loadAvg = os.loadavg();
        deferred.resolve({
          min1: loadAvg[0],
          min5: loadAvg[1],
          min15: loadAvg[2],
          raw: loadAvg,
        });
      });
    };

    /**
     * Get network statistics
     *
     * @example:
     *    > var metrinix = require('metrinix');
     *    > metrinix.network().then(function(result) { console.log(result); });
     *    {
     *      "interfaces": {
     *        "veth5dda6cc": {
     *          "type": "docker",
     *          "rx": {
     *            "speed": 0, "unit": "kB/s"
     *          },
     *          "tx": {
     *            "speed": 0, "unit": "kB/s"
     *          },
     *          "raw": {
     *            "prev": {
     *              "name": "veth5dda6cc",
     *              "receive": {
     *                "bytes": 335337,
     *                "errs": 399,
     *                "packets": 0,
     *                "drop": 0,
     *                "fifo": 0,
     *                "frame": 0,
     *                "compressed": 0,
     *                "multicast": 0
     *              },
     *              "transfer": {
     *                "bytes": 12105717,
     *                "errs": 171074,
     *                "packets": 0,
     *                "drop": 0,
     *                "fifo": 0,
     *                "frame": 0,
     *                "compressed": 0,
     *                "multicast": 0
     *              },
     *              "raw": [
     *                "veth5dda6cc:", "335337", "399", "0", "0", "0", "0", "0",
     *                "0", "12105717", "171074", "0", "0", "0", "0", "0", "0"
     *              ]
     *            },
     *            "cur": {
     *              "name": "veth5dda6cc",
     *              "receive": {
     *                "bytes": 335337,
     *                "errs": 399,
     *                "packets": 0,
     *                "drop": 0,
     *                "fifo": 0,
     *                "frame": 0,
     *                "compressed": 0,
     *                "multicast": 0
     *              },
     *              "transfer": {
     *                "bytes": 12105717,
     *                "errs": 171074,
     *                "packets": 0,
     *                "drop": 0,
     *                "fifo": 0,
     *                "frame": 0,
     *                "compressed": 0,
     *                "multicast": 0
     *              },
     *              "raw": [
     *                "veth5dda6cc:", "335337", "399", "0", "0", "0", "0", "0",
     *                "0", "12105717", "171074", "0", "0", "0", "0", "0", "0"
     *              ]
     *            }
     *          }
     *        },
     *      },
     *      "total": {
     *        "docker": {
     *          "rx": {
     *            "speed": 0.6533203125,
     *            "unit": "kB/s"
     *          },
     *          "tx": {
     *            "speed": 1.2529296875,
     *            "unit": "kB/s"
     *          }
     *        },
     *        "physical": {
     *          "rx": {
     *            "speed": 11.572265625,
     *            "unit": "kB/s"
     *          },
     *          "tx": {
     *            "speed": 3.337890625,
     *            "unit": "kB/s"
     *          }
     *        },
     *        "bridge": {
     *          "rx": {
     *            "speed": 0.5849609375,
     *            "unit": "kB/s"
     *          },
     *          "tx": {
     *            "speed": 1.2529296875,
     *            "unit": "kB/s"
     *          }
     *        }
     *      }
     *    }
     *
     * @return <Object>defer
     */
    self.network = function() {
      var readAll = function() {
        return defer(function(deferred) {
          fs.readFile('/proc/net/dev', function(err, data) {
            if (err) {
              throw err;
            }
            var lines = data.toString().split("\n");
            /**
             * Inter-|   Receive                                                |  Transmit
             * face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
             */
            var interfaces = {};
            lines.forEach(function(line) {
              if (line.indexOf(':') > -1) {
                line = line.replace(/\s+/g, ' ');
                var parts = line.split(' ');
                var name = parts[0].replace(':', '');
                if (name.length == 0 ) {
                  return true;
                }
                interfaces[name] = {
                  name: name,
                  receive: {
                    bytes: parseInt(parts[1]),
                    errs: parseInt(parts[2]),
                    packets: parseInt(parts[3]),
                    drop: parseInt(parts[4]),
                    fifo: parseInt(parts[5]),
                    frame: parseInt(parts[6]),
                    compressed: parseInt(parts[7]),
                    multicast: parseInt(parts[8]),
                  },
                  transfer: {
                    bytes: parseInt(parts[9]),
                    errs: parseInt(parts[10]),
                    packets: parseInt(parts[11]),
                    drop: parseInt(parts[12]),
                    fifo: parseInt(parts[13]),
                    frame: parseInt(parts[14]),
                    compressed: parseInt(parts[15]),
                    multicast: parseInt(parts[16]),
                  },
                  raw: parts,
                };
              }
            });
            deferred.resolve(interfaces);
          });
        });
      };
      return defer(function(deferred) {
        defer(function(_deferred) {
          readAll().then(function(network) {
            setTimeout(function() {
              _deferred.resolve({
                prevNetwork: network,
              });
            }, 1000);
          });
        }).then(function(prefab) {
          return defer(function(_deferred) {
            readAll().then(function(network) {
              prefab.curNetwork = network;
              _deferred.resolve(prefab);
            });
          });
        }).then(function(prefab) {
          var final = {
            interfaces: {},
            total: {},
          };
          Object.keys(prefab.curNetwork).forEach(function(name) {
            try {
              // calculate the current upload (tx) / download (rx) speed in kB/s
              var rx = (prefab.curNetwork[name].receive.bytes - prefab.prevNetwork[name].receive.bytes) / 1024;
              var tx = (prefab.curNetwork[name].transfer.bytes - prefab.prevNetwork[name].transfer.bytes) / 1024;

              // determine the device type
              var type = 'physical';
              try { fs.statSync('/sys/class/net/'+name+'/upper_docker0'); type = 'docker'; } catch (e) {}
              try { fs.statSync('/sys/class/net/'+name+'/bridge'); type = 'bridge'; } catch (e) {}
              try { fs.statSync('/sys/class/net/'+name+'/tun_flags'); type = 'tun/tap'; } catch (e) {}

              // aggregate the totals by device type
              if (typeof(final.total[type]) === 'undefined') {
                final.total[type] = {
                  rx: {
                    speed: 0,
                    unit: 'kB/s',
                  },
                  tx: {
                    speed: 0,
                    unit: 'kB/s',
                  },
                };
              }
              final.total[type].rx.speed += rx;
              final.total[type].tx.speed += tx;

              // define the device stats
              final.interfaces[name] = {
                type: type,
                rx: {
                  speed: rx,
                  unit: 'kB/s',
                },
                tx: {
                  speed: tx,
                  unit: 'kB/s',
                },
                raw: {
                  prev: prefab.prevNetwork[name],
                  cur: prefab.curNetwork[name],
                },
              };
            } catch (e) {
              console.log(e);
            }
          });
          deferred.resolve(final);
        });
      });
    };

    return self;
  }

  return new Metrinix();
}());