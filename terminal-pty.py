import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios

CONTROL_FD = 3


def resize(fd, rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))


def write_all(fd, data):
    while data:
        written = os.write(fd, data)
        data = data[written:]


def main():
    rows, cols = int(sys.argv[1]), int(sys.argv[2])
    command = sys.argv[3:]
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execvp(command[0], command)
        finally:
            os._exit(127)

    resize(fd, rows, cols)

    def hang_up(*_):
        try:
            os.kill(pid, signal.SIGHUP)
        except ProcessLookupError:
            pass
        os._exit(0)

    signal.signal(signal.SIGTERM, hang_up)
    signal.signal(signal.SIGHUP, hang_up)

    inputs = [fd, 0, CONTROL_FD]
    pending = b''
    while True:
        try:
            ready, _, _ = select.select(inputs, [], [])
        except InterruptedError:
            continue
        if fd in ready:
            try:
                data = os.read(fd, 65536)
            except OSError:
                data = b''
            if not data:
                break
            write_all(1, data)
        if 0 in ready:
            data = os.read(0, 65536)
            if not data:
                hang_up()
            write_all(fd, data)
        if CONTROL_FD in ready:
            data = os.read(CONTROL_FD, 1024)
            if not data:
                inputs.remove(CONTROL_FD)
                continue
            pending += data
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                parts = line.split()
                if len(parts) == 2 and all(part.isdigit() for part in parts):
                    resize(fd, int(parts[0]), int(parts[1]))

    _, status = os.waitpid(pid, 0)
    code = os.waitstatus_to_exitcode(status)
    sys.exit(128 - code if code < 0 else code)


if __name__ == '__main__':
    main()
