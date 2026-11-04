from .dss_pipeline import run_late_delivery_pipeline, run_sales_forecast_pipeline

def main():
    run_late_delivery_pipeline()
    run_sales_forecast_pipeline()

if __name__ == "__main__":
    main()