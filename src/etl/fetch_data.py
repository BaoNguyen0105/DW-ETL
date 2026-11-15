import os
import kagglehub

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC_DIR = os.path.dirname(_HERE)
_PROJECT_ROOT = os.path.dirname(_SRC_DIR)
_DEFAULT_DATASET_DIR = os.path.join(_PROJECT_ROOT, "data", "dataset").replace("\\", "/")


def download_dataset(output_dir: str = _DEFAULT_DATASET_DIR):
    """
    Kiểm tra xem thư mục output_dir đã có các file CSV hay chưa.
    Nếu đã có đủ dữ liệu thì bỏ qua, nếu chưa có thì mới tải từ Kaggle.
    """
    if not os.path.isabs(output_dir):
        if output_dir in ("dataset", "data/dataset"):
            output_dir = _DEFAULT_DATASET_DIR
        else:
            candidate = os.path.join(_PROJECT_ROOT, output_dir)
            if os.path.exists(candidate):
                output_dir = candidate
    if output_dir and os.path.exists(output_dir):
        csv_files = [f for f in os.listdir(output_dir) if f.endswith(".csv")]
        if len(csv_files) >= 8:  # Bộ dữ liệu Olist có 8-9 file CSV
            print(f">>> Dataset đã có sẵn tại '{output_dir}' ({len(csv_files)} files CSV). Bỏ qua tải lại!")
            return output_dir

    print(f">>> Đang tải dataset từ Kaggle về '{output_dir}'...")
    path = kagglehub.dataset_download("olistbr/brazilian-ecommerce", output_dir=output_dir)
    return path
