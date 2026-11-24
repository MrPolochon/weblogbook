"""Publish an immutable APK release, then advance the Android-only beta channel."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

repo = os.environ["GITHUB_REPOSITORY"]
commit = os.environ["GITHUB_SHA"]


def gh(*args, **kwargs):
    return subprocess.run(["gh", *args, "--repo", repo], text=True, **kwargs)


manifest = json.loads(Path("dist/android-update.json").read_text())
tag = "android-v" + manifest["versionName"]
existing = gh("release", "view", tag, "--json", "targetCommitish", capture_output=True)
if existing.returncode == 0:
    assert json.loads(existing.stdout)["targetCommitish"] == commit, "Version already belongs to another commit: bump versionCode and versionName"
    # A rebuild must never change an already distributed APK or its checksum.
    with tempfile.TemporaryDirectory() as folder:
        gh("release", "download", tag, "--pattern", "android-update.json", "--dir", folder, check=True)
        manifest = json.loads((Path(folder) / "android-update.json").read_text())
else:
    assets = [str(path) for path in Path("dist").iterdir() if path.suffix in (".apk", ".json", ".txt")]
    gh("release", "create", tag, *assets, "--target", commit, "--prerelease", "--latest=false",
       "--title", "VHF Radio Android " + manifest["versionName"],
       "--notes-file", "vhf-radio-android/RELEASE_NOTES.md", check=True)

channel = "android-channel-beta"
channel_exists = gh("release", "view", channel, capture_output=True).returncode == 0
with tempfile.TemporaryDirectory() as folder:
    current_file = Path(folder) / "android-update.json"
    if channel_exists:
        gh("release", "download", channel, "--pattern", "android-update.json", "--dir", folder, check=True)
        current = json.loads(current_file.read_text())
        if current["versionCode"] > manifest["versionCode"]:
            raise SystemExit("Newer Android channel already published; leaving it unchanged.")
        if current["versionCode"] == manifest["versionCode"]:
            assert current == manifest, "A versionCode cannot be reused for different APKs"
            raise SystemExit(0)
    current_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if channel_exists:
        gh("release", "upload", channel, str(current_file), "--clobber", check=True)
    else:
        gh("release", "create", channel, str(current_file), "--target", commit, "--prerelease", "--latest=false",
           "--title", "Canal de mise à jour Android bêta",
           "--notes", "Manifeste utilisé par VHF Radio Android pour détecter les nouvelles versions. Les APK se trouvent dans les releases android-v*. Ce canal ne modifie pas les mises à jour Windows.", check=True)
