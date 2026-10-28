import os
import kagglehub

def download_dataset(output_dir="dataset"):
    """
    Kiểm tra xem thư mục output_dir đã có các file CSV hay chưa.
    Nếu đã có đủ dữ liệu thì bỏ qua, nếu chưa có thì mới tải từ Kaggle.
    """
    if output_dir and os.path.exists(output_dir):
        csv_files = [f for f in os.listdir(output_dir) if f.endswith(".csv")]
        if len(csv_files) >= 8:  # Bộ dữ liệu Olist có 8-9 file CSV
            print(f">>> Dataset đã có sẵn tại '{output_dir}' ({len(csv_files)} files CSV). Bỏ qua tải lại!")
            return output_dir

    print(f">>> Đang tải dataset từ Kaggle về '{output_dir}'...")
    path = kagglehub.dataset_download("olistbr/brazilian-ecommerce", output_dir=output_dir)
    return path
