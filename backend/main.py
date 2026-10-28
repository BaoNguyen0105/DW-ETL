from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import olap, dss

app = FastAPI(
    title="CO4031 - DW & DSS Analytics API",
    description="Backend API serving OLAP multidimensional queries and Decision Support System for Olist E-commerce.",
    version="1.0.0",
)

# Enable CORS for Frontend (Streamlit, React, Vue, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(olap.router, prefix="/api/olap", tags=["OLAP Analytics"])
app.include_router(dss.router, prefix="/api/dss", tags=["Decision Support System (DSS)"])


@app.get("/")
def root():
    return {
        "message": "Welcome to CO4031 Data Warehouse & DSS API",
        "docs_url": "/docs",
        "status": "online",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
