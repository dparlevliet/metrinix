var Q = require('q');
var fs = require('fs');
var os = require('os');
var child_process = require('child_process');


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
     *    > metrinix.uptime().then(function(result) { console.log(result); });
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
               memory: {
                 pages: 0,
                 pagesize: 0,
                 bytes: 0,
                 mb: 0,
               }
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

                  /**
                   * http://man7.org/linux/man-pages/man5/proc.5.html
                   *
                   * /proc/[pid]/stat
                   *    Status information about the process.  This is used by ps(1).
                   *    It is defined in the kernel source file fs/proc/array.c.
                   *
                   *    The fields, in order, with their proper scanf(3) format
                   *    specifiers, are listed below.  Whether or not certain of these
                   *    fields display valid information is governed by a ptrace
                   *    access mode PTRACE_MODE_READ_FSCREDS | PTRACE_MODE_NOAUDIT
                   *    check (refer to ptrace(2)).  If the check denies access, then
                   *    the field value is displayed as 0.  The affected fields are
                   *    indicated with the marking [PT].
                   */
                  var statMap = {
                    /**
                     *    (1) pid  %d
                     *              The process ID.
                     */
                    pid: 0,

                    /**
                     *    (2) comm  %s
                     *              The filename of the executable, in parentheses.
                     *              This is visible whether or not the executable is
                     *              swapped out.
                     */
                    comm: 1,

                    /**
                     *    (3) state  %c
                     *              One of the following characters, indicating process
                     *              state:
                     *
                     *              R  Running
                     *              S  Sleeping in an interruptible wait
                     *              D  Waiting in uninterruptible disk sleep
                     *              Z  Zombie
                     *              T  Stopped (on a signal) or (before Linux 2.6.33)
                     *                 trace stopped
                     *              t  Tracing stop (Linux 2.6.33 onward)
                     *              W  Paging (only before Linux 2.6.0)
                     *              X  Dead (from Linux 2.6.0 onward)
                     *              x  Dead (Linux 2.6.33 to 3.13 only)
                     *              K  Wakekill (Linux 2.6.33 to 3.13 only)
                     *              W  Waking (Linux 2.6.33 to 3.13 only)
                     *              P  Parked (Linux 3.9 to 3.13 only)
                     */
                    state: 2,

                    /**
                     *    (4) ppid  %d
                     *              The PID of the parent of this process.
                     */
                    ppid: 3,

                    /**
                     *    (5) pgrp  %d
                     *              The process group ID of the process.
                     */
                    pgrp: 4,

                    /**
                     *    (6) session  %d
                     *              The session ID of the process.
                     */
                    session: 5,

                    /**
                     *    (7) tty_nr  %d
                     *              The controlling terminal of the process.  (The minor
                     *              device number is contained in the combination of
                     *              bits 31 to 20 and 7 to 0; the major device number is
                     *              in bits 15 to 8.)
                     */
                    tty_nr: 6,

                    /**
                     *    (8) tpgid  %d
                     *              The ID of the foreground process group of the
                     *              controlling terminal of the process.
                     */
                    tpgid: 7,

                    /**
                     *    (9) flags  %u
                     *              The kernel flags word of the process.  For bit
                     *              meanings, see the PF_* defines in the Linux kernel
                     *              source file include/linux/sched.h.  Details depend
                     *              on the kernel version.
                     *
                     *              The format for this field was %lu before Linux 2.6.
                     */
                    flags: 8,

                    /**
                     *    (10) minflt  %lu
                     *              The number of minor faults the process has made
                     *              which have not required loading a memory page from
                     *              disk.
                     */
                    minflt: 9,

                    /**
                     *    (11) cminflt  %lu
                     *              The number of minor faults that the process's
                     *              waited-for children have made.
                     */
                    cminflt: 10,

                    /**
                     *    (12) majflt  %lu
                     *              The number of major faults the process has made
                     *              which have required loading a memory page from disk.
                     */
                    majflt: 11,

                    /**
                     *    (13) cmajflt  %lu
                     *              The number of major faults that the process's
                     *              waited-for children have made.
                     */
                    cmajflt: 12,

                    /**
                     *    (14) utime  %lu
                     *              Amount of time that this process has been scheduled
                     *              in user mode, measured in clock ticks (divide by
                     *              sysconf(_SC_CLK_TCK)).  This includes guest time,
                     *              guest_time (time spent running a virtual CPU, see
                     *              below), so that applications that are not aware of
                     *              the guest time field do not lose that time from
                     *              their calculations.
                     */
                    utime: 13,

                    /**
                     *    (15) stime  %lu
                     *              Amount of time that this process has been scheduled
                     *              in kernel mode, measured in clock ticks (divide by
                     *              sysconf(_SC_CLK_TCK)).
                     */
                    stime: 14,

                    /**
                     *    (16) cutime  %ld
                     *              Amount of time that this process's waited-for
                     *              children have been scheduled in user mode, measured
                     *              in clock ticks (divide by sysconf(_SC_CLK_TCK)).
                     *              (See also times(2).)  This includes guest time,
                     *              cguest_time (time spent running a virtual CPU, see
                     *              below).
                     */
                    cutime: 15,

                    /**
                     *    (17) cstime  %ld
                     *              Amount of time that this process's waited-for
                     *              children have been scheduled in kernel mode,
                     *              measured in clock ticks (divide by
                     *              sysconf(_SC_CLK_TCK)).
                     */
                    cstime: 16,

                    /**
                     *    (18) priority  %ld
                     *              (Explanation for Linux 2.6) For processes running a
                     *              real-time scheduling policy (policy below; see
                     *              sched_setscheduler(2)), this is the negated
                     *              scheduling priority, minus one; that is, a number in
                     *              the range -2 to -100, corresponding to real-time
                     *              priorities 1 to 99.  For processes running under a
                     *              non-real-time scheduling policy, this is the raw
                     *              nice value (setpriority(2)) as represented in the
                     *              kernel.  The kernel stores nice values as numbers in
                     *              the range 0 (high) to 39 (low), corresponding to the
                     *              user-visible nice range of -20 to 19.
                     *
                     *              Before Linux 2.6, this was a scaled value based on
                     *              the scheduler weighting given to this process.
                     */
                    priority: 17,

                    /**
                     *    (19) nice  %ld
                     *              The nice value (see setpriority(2)), a value in the
                     *              range 19 (low priority) to -20 (high priority).
                     */
                    nice: 18,

                    /**
                     *    (20) num_threads  %ld
                     *              Number of threads in this process (since Linux 2.6).
                     *              Before kernel 2.6, this field was hard coded to 0 as
                     *              a placeholder for an earlier removed field.
                     */
                    num_threads: 19,

                    /**
                     *    (21) itrealvalue  %ld
                     *              The time in jiffies before the next SIGALRM is sent
                     *              to the process due to an interval timer.  Since
                     *              kernel 2.6.17, this field is no longer maintained,
                     *              and is hard coded as 0.
                     */
                    itrealvalue: 20,

                    /**
                     *    (22) starttime  %llu
                     *              The time the process started after system boot.  In
                     *              kernels before Linux 2.6, this value was expressed
                     *              in jiffies.  Since Linux 2.6, the value is expressed
                     *              in clock ticks (divide by sysconf(_SC_CLK_TCK)).
                     *
                     *              The format for this field was %lu before Linux 2.6.
                     */
                    starttime: 21,

                    /**
                     *    (23) vsize  %lu
                     *              Virtual memory size in bytes.
                     */
                    vsize: 22,

                    /**
                     *    (24) rss  %ld
                     *              Resident Set Size: number of pages the process has
                     *              in real memory.  This is just the pages which count
                     *              toward text, data, or stack space.  This does not
                     *              include pages which have not been demand-loaded in,
                     *              or which are swapped out.
                     */
                    rss: 23,

                    /**
                     *    (25) rsslim  %lu
                     *              Current soft limit in bytes on the rss of the
                     *              process; see the description of RLIMIT_RSS in
                     *              getrlimit(2).
                     */
                    rsslim: 24,

                    /**
                     *    (26) startcode  %lu  [PT]
                     *              The address above which program text can run.
                     */
                    startcode: 25,

                    /**
                     *    (27) endcode  %lu  [PT]
                     *              The address below which program text can run.
                     */
                    endcode: 26,

                    /**
                     *    (28) startstack  %lu  [PT]
                     *              The address of the start (i.e., bottom) of the
                     *              stack.
                     */
                    startstack: 27,

                    /**
                     *    (29) kstkesp  %lu  [PT]
                     *              The current value of ESP (stack pointer), as found
                     *              in the kernel stack page for the process.
                     */
                    kstkesp: 28,

                    /**
                     *    (30) kstkeip  %lu  [PT]
                     *              The current EIP (instruction pointer).
                     */
                    kstkeip: 29,

                    /**
                     *    (31) signal  %lu
                     *              The bitmap of pending signals, displayed as a
                     *              decimal number.  Obsolete, because it does not
                     *              provide information on real-time signals; use
                     *              /proc/[pid]/status instead.
                     */
                    signal: 30,

                    /**
                     *    (32) blocked  %lu
                     *              The bitmap of blocked signals, displayed as a
                     *              decimal number.  Obsolete, because it does not
                     *              provide information on real-time signals; use
                     *              /proc/[pid]/status instead.
                     */
                    blocked: 31,

                    /**
                     *    (33) sigignore  %lu
                     *              The bitmap of ignored signals, displayed as a
                     *              decimal number.  Obsolete, because it does not
                     *              provide information on real-time signals; use
                     *              /proc/[pid]/status instead.
                     */
                    sigignore: 32,

                    /**
                     *    (34) sigcatch  %lu
                     *              The bitmap of caught signals, displayed as a decimal
                     *              number.  Obsolete, because it does not provide
                     *              information on real-time signals; use
                     *              /proc/[pid]/status instead.
                     */
                    sigcatch: 33,

                    /**
                     *    (35) wchan  %lu  [PT]
                     *              This is the "channel" in which the process is
                     *              waiting.  It is the address of a location in the
                     *              kernel where the process is sleeping.  The
                     *              corresponding symbolic name can be found in
                     *              /proc/[pid]/wchan.
                     */
                    wchan: 34,

                    /**
                     *    (36) nswap  %lu
                     *              Number of pages swapped (not maintained).
                     */
                    nswap: 35,

                    /**
                     *    (37) cnswap  %lu
                     *              Cumulative nswap for child processes (not
                     *              maintained).
                     */
                    cnswap: 36,

                    /**
                     *    (38) exit_signal  %d  (since Linux 2.1.22)
                     *              Signal to be sent to parent when we die.
                     */
                    exit_signal: 37,

                    /**
                     *    (39) processor  %d  (since Linux 2.2.8)
                     *              CPU number last executed on.
                     */
                    processor: 38,

                    /**
                     *    (40) rt_priority  %u  (since Linux 2.5.19)
                     *              Real-time scheduling priority, a number in the range
                     *              1 to 99 for processes scheduled under a real-time
                     *              policy, or 0, for non-real-time processes (see
                     *              sched_setscheduler(2)).
                     */
                    rt_priority: 39,

                    /**
                     *    (41) policy  %u  (since Linux 2.5.19)
                     *              Scheduling policy (see sched_setscheduler(2)).
                     *              Decode using the SCHED_* constants in linux/sched.h.
                     *
                     *              The format for this field was %lu before Linux
                     *              2.6.22.
                     */
                    policy: 40,

                    /**
                     *    (42) delayacct_blkio_ticks  %llu  (since Linux 2.6.18)
                     *              Aggregated block I/O delays, measured in clock ticks
                     *              (centiseconds).
                     */
                    delayacct_blkio_ticks: 41,

                    /**
                     *    (43) guest_time  %lu  (since Linux 2.6.24)
                     *              Guest time of the process (time spent running a
                     *              virtual CPU for a guest operating system), measured
                     *              in clock ticks (divide by sysconf(_SC_CLK_TCK)).
                     */
                    guest_time: 42,

                    /**
                     *    (44) cguest_time  %ld  (since Linux 2.6.24)
                     *              Guest time of the process's children, measured in
                     *              clock ticks (divide by sysconf(_SC_CLK_TCK)).
                     */
                    cguest_time: 43,

                    /**
                     *    (45) start_data  %lu  (since Linux 3.3)  [PT]
                     *              Address above which program initialized and
                     *              uninitialized (BSS) data are placed.
                     */
                    start_data: 44,

                    /**
                     *    (46) end_data  %lu  (since Linux 3.3)  [PT]
                     *              Address below which program initialized and
                     *              uninitialized (BSS) data are placed.
                     */
                    end_data: 45,

                    /**
                     *    (47) start_brk  %lu  (since Linux 3.3)  [PT]
                     *              Address above which program heap can be expanded
                     *              with brk(2).
                     */
                    start_brk: 46,

                    /**
                     *    (48) arg_start  %lu  (since Linux 3.5)  [PT]
                     *              Address above which program command-line arguments
                     *              (argv) are placed.
                     */
                    arg_start: 47,

                    /**
                     *    (49) arg_end  %lu  (since Linux 3.5)  [PT]
                     *              Address below program command-line arguments (argv)
                     *              are placed.
                     */
                    arg_end: 48,

                    /**
                     *    (50) env_start  %lu  (since Linux 3.5)  [PT]
                     *              Address above which program environment is placed.
                     */
                    env_start: 49,

                    /**
                     *    (51) env_end  %lu  (since Linux 3.5)  [PT]
                     *              Address below which program environment is placed.
                     */
                    env_end: 50,

                    /**
                     *    (52) exit_code  %d  (since Linux 3.5)  [PT]
                     *              The thread's exit status in the form reported by
                     *              waitpid(2).
                     */
                    exit_code: 51,
                  };

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

      return self.uptime().then(function(prevUptime) {
        return defer(function(deferred) {
          self._getconf('CLK_TCK').then(function(hertz) {
            readAll().then(function(processes) {
              // to calculate the percent usage right now we need to compare
              // it against some recent figures, otherwise we would only
              // be able to achieve an average percentage value over the
              // life-time of the process.
              setTimeout(function() {
                self.uptime().then(function(curUptime) {
                  var upDiff = curUptime.up - prevUptime.up;
                  readAll().then(function(p2processes) {
                    Object.keys(p2processes).forEach(function(pid) {
                      try {
                        // calculate the cpu usage
                        var prevProcess = processes[pid];
                        var curProcess = p2processes[pid];

                        if (!prevProcess) {
                          // this is a new process, we have nothing to benchmark
                          // against. Instead, we will remove it from the list.
                          delete p2processes[pid];
                          return true;
                        }

                        // diff in user space
                        var prevUserTime = prevProcess.raw.utime + prevProcess.raw.cutime;
                        var curUserTime = curProcess.raw.utime + curProcess.raw.cutime;
                        var userDiff = (curUserTime - prevUserTime) / hertz;

                        // diff in system space
                        var prevSystemTime = prevProcess.raw.stime + prevProcess.raw.cstime;
                        var curSystemTime = curProcess.raw.stime + curProcess.raw.cstime;
                        var systemDiff = (curSystemTime - prevSystemTime) / hertz;

                        // total diff
                        var totalDiff = userDiff + systemDiff;

                        p2processes[pid].cpu = {
                          totalPercent: (totalDiff/upDiff) * 100,
                          userPercent: (userDiff/upDiff) * 100,
                          systemPercent: (systemDiff/upDiff) * 100,
                          raw: {
                            user: userDiff,
                            system: systemDiff,
                            total: totalDiff,
                          }
                        };
                      } catch (e) {
                        console.log(e);
                      }
                    });
                    deferred.resolve(p2processes);
                  });
                });
              }, 500);
            });
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

    return self;
  }

  return new Metrinix();
}());