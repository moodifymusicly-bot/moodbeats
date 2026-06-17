import pty
import os
import time

pid, fd = pty.fork()

if pid == 0:
    # Child process
    os.execvp("ssh-copy-id", ["ssh-copy-id", "-o", "StrictHostKeyChecking=no", "root@187.127.181.204"])
else:
    # Parent process
    output = b""
    try:
        while True:
            chunk = os.read(fd, 1024)
            if not chunk:
                break
            output += chunk
            if b"password:" in chunk.lower():
                os.write(fd, b"cKj09012003@#\n")
            if b"fingerprint" in chunk.lower() or b"yes/no" in chunk.lower():
                os.write(fd, b"yes\n")
    except OSError:
        # Expected when child exits
        pass
    print(output.decode(errors='ignore'))
    os.waitpid(pid, 0)
