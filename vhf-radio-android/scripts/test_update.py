"""Exercise Android's in-place update using the same debug certificate on one runner."""
import os
from pathlib import Path
import re
import subprocess

apk = "app/build/outputs/apk/debug/app-debug.apk"
test_apk = "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
runner = "com.weblogbook.vhfradio.beta.dev.test/androidx.test.runner.AndroidJUnitRunner"
log = Path("update-install-test.txt")
log.write_text("", encoding="utf-8")


def run_tests(*arguments, expected):
    result = subprocess.run(["adb", "shell", "am", "instrument", "-w", *arguments, runner],
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, flush=True)
    with log.open("a", encoding="utf-8") as report:
        report.write(result.stdout + "\n")
    assert result.returncode == 0 and expected in result.stdout, "Android instrumentation failed (see output above)"


# Install directly so Gradle/UTP cannot uninstall the app or test runner between
# the initial test and the update. Retaining the existing data is the test.
subprocess.run(["adb", "install", "-r", apk], check=True)
subprocess.run(["adb", "install", "-r", test_apk], check=True)
run_tests(expected="OK (4 tests)")
aapt = Path(os.environ["ANDROID_HOME"]) / "build-tools/36.0.0/aapt"
badging = subprocess.check_output([str(aapt), "dump", "badging", apk], text=True)
next_code = int(re.search(r"versionCode='([0-9]+)'", badging)[1]) + 1
subprocess.run(["gradle", "--no-daemon", "assembleDebug", f"-PradioVersionCode={next_code}"], check=True)
subprocess.run(["adb", "install", "-r", apk], check=True)
run_tests("-e", "class", "com.weblogbook.vhfradio.UpdateInstallTest", "-e", "verifyUpdate", str(next_code), expected="OK (2 tests)")
