import os
import sys
import shutil
import zipfile
import urllib.request
import subprocess
import re


# Project tools directory inside current working directory
CWD = os.getcwd()
TOOLS_DIR = os.path.join(CWD, "tools")
JDK_DIR = os.path.join(TOOLS_DIR, "jdk-17")
HADOOP_DIR = os.path.join(TOOLS_DIR, "hadoop")


def set_env_var(var_name: str, value: str):
    """Sets a Windows persistent environment variable silently without setx console spam."""
    subprocess.run(
        ["setx", var_name, value],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def download_file(url: str, dest_path: str):
    """Downloads a file using a custom User-Agent to avoid 403 Forbidden errors."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as response, open(dest_path, "wb") as out_file:
        shutil.copyfileobj(response, out_file)


# ==============================================================================
# 1. JAVA (JDK 17) DETECTION & INSTALLATION
# ==============================================================================
def get_java_version():
    """Returns the major Java version if Java is installed and accessible."""
    try:
        result = subprocess.run(
            ["java", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        output = result.stderr or result.stdout
        match = re.search(r'version "(17|\d+)', output)
        if match:
            return int(match.group(1))
    except Exception:
        pass
    return None


def install_local_jdk_17():
    """Installs OpenJDK 17 locally into tools/jdk-17."""
    os.makedirs(TOOLS_DIR, exist_ok=True)
    zip_path = os.path.join(TOOLS_DIR, "temurin-jdk-17.zip")
    api_url = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"

    try:
        print("      ↓ Downloading portable OpenJDK 17 from Adoptium API...")
        download_file(api_url, zip_path)

        print("      ⚙ Extracting JDK 17 into tools/jdk-17...")
        temp_extract = os.path.join(TOOLS_DIR, "_jdk_temp")
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(temp_extract)

        extracted_folder = [f for f in os.listdir(temp_extract) if os.path.isdir(os.path.join(temp_extract, f))][0]
        if os.path.exists(JDK_DIR):
            shutil.rmtree(JDK_DIR)
        shutil.move(os.path.join(temp_extract, extracted_folder), JDK_DIR)
        shutil.rmtree(temp_extract)

        if os.path.exists(zip_path):
            os.remove(zip_path)

        set_env_var("JAVA_HOME", JDK_DIR)
        print("      ✓ Local JDK 17 installed & JAVA_HOME configured!")
        return True
    except Exception as e:
        print(f"      ✗ Download failed: {e}")
        print(f"      ! Please extract OpenJDK 17 into '{JDK_DIR}' manually.")
        return False


def setup_java():
    print("[1/2] Checking Java (JDK 17)...")
    local_java_exe = os.path.join(JDK_DIR, "bin", "java.exe")

    # 1. Check local tools/jdk-17
    if os.path.exists(local_java_exe):
        set_env_var("JAVA_HOME", JDK_DIR)
        print(f"      ✓ Local JDK 17 found: tools/jdk-17 (JAVA_HOME configured)")
        return True

    # 2. Check system Java
    current_version = get_java_version()
    if current_version == 17:
        print(f"      ✓ System Java 17 detected!")
        return True

    if current_version is not None:
        print(f"      ! Current Java is version {current_version}. PySpark requires Java 17.")

    return install_local_jdk_17()


# ==============================================================================
# 2. HADOOP WINUTILS (FOR WINDOWS ONLY)
# ==============================================================================
def setup_winutils():
    print("[2/2] Checking Hadoop Winutils...")
    if not sys.platform.startswith("win"):
        print("      ✓ Linux/macOS detected (winutils not required)")
        return True

    bin_dir = os.path.join(HADOOP_DIR, "bin")
    winutils_exe = os.path.join(bin_dir, "winutils.exe")
    hadoop_dll = os.path.join(bin_dir, "hadoop.dll")

    if os.path.exists(winutils_exe) and os.path.exists(hadoop_dll):
        set_env_var("HADOOP_HOME", HADOOP_DIR)
        print("      ✓ Winutils found: tools/hadoop/bin (HADOOP_HOME configured)")
        return True

    os.makedirs(bin_dir, exist_ok=True)
    base_url = "https://raw.githubusercontent.com/cdarlint/winutils/master/hadoop-3.3.6/bin"

    print("      ↓ Downloading winutils.exe & hadoop.dll...")
    try:
        download_file(f"{base_url}/winutils.exe", winutils_exe)
        download_file(f"{base_url}/hadoop.dll", hadoop_dll)

        set_env_var("HADOOP_HOME", HADOOP_DIR)
        print("      ✓ Winutils installed & HADOOP_HOME configured!")
        return True
    except Exception as e:
        print(f"      ✗ Download failed: {e}")
        return False


# ==============================================================================
# MAIN RUNNER
# ==============================================================================
if __name__ == "__main__":
    print("-" * 55)
    setup_java()
    setup_winutils()
    print("-" * 55)
    print("✓ Environment is ready! (Restart terminal if you just installed)")
    print("-" * 55)
