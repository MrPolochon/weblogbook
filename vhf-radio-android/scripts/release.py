"""Prepare the private signing material and verify the distributable APK in CI."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def prepare_signing():
    raw = os.environ.get("ANDROID_SIGNING_BUNDLE", "")
    if not raw:
        raise SystemExit("ANDROID_SIGNING_BUNDLE is required. Refusing to publish with a temporary debug key.")
    try:
        bundle = json.loads(raw)
        key = base64.b64decode(bundle["keystoreBase64"], validate=True)
        password, alias = bundle["password"], bundle["alias"]
        assert key and isinstance(password, str) and len(password) >= 24
        assert isinstance(alias, str) and re.fullmatch(r"[a-zA-Z0-9_-]+", alias)
        assert "\n" not in password and "\r" not in password
    except Exception:
        raise SystemExit("Invalid Android signing bundle (contents intentionally hidden).") from None
    # Mask individual values before writing them into the runner environment.
    print(f"::add-mask::{password}")
    print(f"::add-mask::{bundle['keystoreBase64']}")
    path = Path(os.environ["RUNNER_TEMP"]) / "vhf-radio-signing.p12"
    path.write_bytes(key)
    path.chmod(0o600)
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env:
        env.write(f"ANDROID_KEYSTORE_FILE={path}\nANDROID_KEYSTORE_PASSWORD={password}\nANDROID_KEY_ALIAS={alias}\n")


def package():
    apk = Path("app/build/outputs/apk/release/app-release.apk")
    tools = Path(os.environ["ANDROID_HOME"]) / "build-tools" / "36.0.0"
    verification = subprocess.check_output([str(tools / "apksigner"), "verify", "--verbose", "--print-certs", str(apk)], text=True)
    certs = re.findall(r"Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)", verification)
    expected = Path("signing-certificate.sha256").read_text().strip().lower()
    assert len(certs) == 1 and certs[0].lower() == expected, "Release signed with an unexpected certificate"
    badging = subprocess.check_output([str(tools / "aapt"), "dump", "badging", str(apk)], text=True)
    package_line = re.search(r"package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", badging)
    assert package_line, "APK metadata missing"
    app_id, code, version = package_line.groups()
    assert app_id == "com.weblogbook.vhfradio.beta"
    assert re.fullmatch(r"[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}-beta\.[0-9]{1,4}", version)
    assert "application-debuggable" not in badging, "Debug APK cannot be distributed"
    min_sdk = int(re.search(r"sdkVersion:'([0-9]+)'", badging)[1])
    target = Path("dist")
    target.mkdir(exist_ok=True)
    filename = f"VHF-Radio-Android-{version}.apk"
    shutil.copyfile(apk, target / filename)
    digest = hashlib.file_digest(apk.open("rb"), "sha256").hexdigest()
    manifest = dict(schemaVersion=1, versionCode=int(code), versionName=version, applicationId=app_id,
                    minSdk=min_sdk, size=apk.stat().st_size, sha256=digest,
                    apkUrl=f"https://github.com/MrPolochon/weblogbook/releases/download/android-v{version}/{filename}")
    (target / "android-update.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (target / "SHA256SUMS.txt").write_text(f"{digest}  {filename}\n", encoding="utf-8")
    print(f"Verified signed release: {version}, versionCode {code}")


if __name__ == "__main__":
    {"signing": prepare_signing, "package": package}[sys.argv[1]]()
