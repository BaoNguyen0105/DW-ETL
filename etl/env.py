import os
import sys
import subprocess
import re


def activate_local_tools():
    """Tự động ưu tiên sử dụng JDK 17 và Hadoop trong thư mục tools/ nếu có sẵn."""
    local_jdk = os.path.abspath("tools/jdk-17")
    if os.path.exists(local_jdk):
        os.environ["JAVA_HOME"] = local_jdk
        # Đưa bin của JDK 17 lên vị trí ĐẦU TIÊN trong PATH để ghi đè các Java khác trên máy
        os.environ["PATH"] = os.path.join(local_jdk, "bin") + os.pathsep + os.environ.get("PATH", "")

    local_hadoop = os.path.abspath("tools/hadoop")
    if os.path.exists(local_hadoop):
        os.environ["HADOOP_HOME"] = local_hadoop

    local_conf = os.path.abspath("conf")
    if os.path.exists(local_conf):
        os.environ["SPARK_CONF_DIR"] = local_conf


def check_java_version():
    """Kiểm tra phiên bản Java đang chạy, đảm bảo dùng đúng Java 17 để tránh lỗi crash Spark."""
    try:
        result = subprocess.run(
            ["java", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            env=os.environ,
        )
        output = result.stderr or result.stdout
        match = re.search(r'version "(17|\d+)', output)
        if match:
            version = int(match.group(1))
            if version == 17:
                return True
            else:
                print(f"⚠️ [LỖI PHIÊN BẢN] Java hiện tại của bạn là phiên bản JDK {version}.")
                print("👉 PySpark yêu cầu đúng Java 17 để hoạt động ổn định (tránh lỗi package sun.security.action).")
                print("👉 Vui lòng chạy 'python setup_env.py' để tự động tải JDK 17 vào tools/jdk-17!")
                sys.exit(1)
    except Exception:
        pass

    print("❌ [LỖI] Không tìm thấy Java trong biến môi trường PATH / JAVA_HOME.")
    print("👉 Vui lòng chạy 'python setup_env.py' để tự động thiết lập môi trường JDK 17!")
    sys.exit(1)


def silence_pyspark_cleanup():
    """Tắt thông báo 'SUCCESS: The process with PID ...' của taskkill và cảnh báo incubator của JVM trên Windows."""
    try:
        import pyspark.java_gateway
        _orig_popen = pyspark.java_gateway.Popen

        def _silent_popen(*args, **kwargs):
            cmd_str = str(args[0]) if args else ""
            if "taskkill" in cmd_str:
                kwargs["stdout"] = subprocess.DEVNULL
                kwargs["stderr"] = subprocess.DEVNULL
            elif "spark-submit" in cmd_str:
                kwargs["stderr"] = subprocess.DEVNULL
            return _orig_popen(*args, **kwargs)

        pyspark.java_gateway.Popen = _silent_popen
    except Exception:
        pass


def ensure_environment():
    """Kích hoạt và kiểm tra toàn bộ môi trường thực thi cho PySpark."""
    activate_local_tools()
    check_java_version()
    silence_pyspark_cleanup()

