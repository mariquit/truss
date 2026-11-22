"""Drive the installer using a controlling terminal and redirected standard input."""

import errno
import os
from pathlib import Path
import pty
import select
import signal
import sys
import time


def run(installer: str, keys: bytes) -> bytes:
    pid, master = pty.fork()
    if pid == 0:
        with open(os.devnull, "rb") as stdin:
            os.dup2(stdin.fileno(), 0)
        os.execlp("bash", "bash", installer)

    deadline = time.monotonic() + 4
    output = bytearray()
    sent = False
    reaped = False
    try:
        while time.monotonic() < deadline:
            if not select.select([master], [], [], max(0, deadline - time.monotonic()))[0]:
                break
            try:
                chunk = os.read(master, 8192)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                chunk = b""
            if not chunk:
                _, status = os.waitpid(pid, 0)
                reaped = True
                assert sent and os.waitstatus_to_exitcode(status) == 0, bytes(output)
                return bytes(output)
            output.extend(chunk)
            if not sent and b"Space: toggle" in output:
                os.write(master, keys)
                sent = True
        raise AssertionError(bytes(output))
    finally:
        if not reaped:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        os.close(master)


if __name__ == "__main__":
    installer = sys.argv[1]
    run(installer, b" \x1b")
    assert not (Path(os.environ["XDG_CONFIG_HOME"]) / "opencode").exists()
    # Select the first item, wrap up to the last, toggle it off and back on, then install.
    run(installer, b" \x1bOA   \r")
