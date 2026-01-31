"""
3D City Tour Guide - Backend Server
FastAPI application with WebSocket support for real-time tour updates.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from routes.tour import router as tour_router
from models.state import TourManager

# Global tour manager instance
tour_manager = TourManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("🚀 Tour Guide Backend starting...")
    yield
    print("👋 Tour Guide Backend shutting down...")


app = FastAPI(
    title="3D City Tour Guide API",
    description="AI-powered walking tour guide for Providence, RI",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tour_router, prefix="/api")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "tour-guide-backend"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "message": "Welcome to the 3D City Tour Guide API",
        "docs": "/docs",
        "health": "/health"
    }


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, tour_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[tour_id] = websocket

    def disconnect(self, tour_id: str):
        if tour_id in self.active_connections:
            del self.active_connections[tour_id]

    async def send_state_update(self, tour_id: str, data: dict):
        if tour_id in self.active_connections:
            await self.active_connections[tour_id].send_json(data)


ws_manager = ConnectionManager()


@app.websocket("/ws/tour/{tour_id}")
async def websocket_endpoint(websocket: WebSocket, tour_id: str):
    """WebSocket endpoint for real-time tour updates."""
    await ws_manager.connect(tour_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Handle incoming messages (location updates, user actions)
            if data.get("type") == "location_update":
                # Process location update
                await ws_manager.send_state_update(tour_id, {
                    "type": "state_update",
                    "message": "Location received"
                })
    except WebSocketDisconnect:
        ws_manager.disconnect(tour_id)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
