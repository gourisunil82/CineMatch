"""
Start the CineMatch backend with one command:

    python run.py

Environment variables (optional):
    PORT  -> port to listen on (default 8000)
    HOST  -> host to bind   (default 127.0.0.1)
"""
import os

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    print(f"[CineMatch] Starting API at http://{host}:{port}  (docs at /docs)")
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")
