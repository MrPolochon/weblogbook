"""Exercise Android's in-place update using the same debug certificate on one runner."""
import os
from pathlib import Path
import re
import subprocess

subprocess.run(["gradle", "--no-daemon", "connectedDebugAndroidTest"], check=True)
apk = "app/build/outputs/apk/debug/app-debug.apk"
aapt = Path(os.environ["ANDROID_HOME"]) / "build-tools/36.0.0/aapt"
badging = subprocess.check_output([str(aapt), "dump", "badging", apk], text=True)
next_code = int(re.search(r"versionCode='([0-9]+)'", badging)[1]) + 1
subprocess.run(["gradle", "--no-daemon", "assembleDebug", f"-PradioVersionCode={next_code}"], check=True)
subprocess.run(["adb", "install", "-r", apk], check=True)
result = subprocess.run(["adb", "shell", "am", "instrument", "-w", "-e", "class",
                         "com.weblogbook.vhfradio.UpdateInstallTest", "-e", "verifyUpdate", str(next_code),
                         "com.weblogbook.vhfradio.beta.dev.test/androidx.test.runner.AndroidJUnitRunner"],
                        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True)
Path("update-install-test.txt").write_text(result.stdout, encoding="utf-8")
print(result.stdout)
assert "OK (2 tests)" in result.stdout, "Android in-place update test failed"
