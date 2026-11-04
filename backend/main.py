import asyncio
import os
import glob
import subprocess
import json
import time
import psutil
import httpx
import docker
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="HexaData OmniSight Telemetry Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LLAMA_SERVER_HOST = os.getenv("LLAMA_SERVER_HOST", "172.17.0.1")
LLAMA_SERVER_PORT = os.getenv("LLAMA_SERVER_PORT", "8080")
MODEL_DIR = os.getenv("MODEL_DIR", "/root/llama.cpp/models")
WATCHDOG_LOG = os.getenv("WATCHDOG_LOG", "/var/log/llama-watchdog.log")

def get_docker_client():
    try:
        return docker.DockerClient(base_url="unix://var/run/docker.sock")
    except Exception:
        return None

class ContainerActionReq(BaseModel):
    container_name: str
    action: str  # start, stop, restart

class SystemdActionReq(BaseModel):
    service_name: str
    action: str  # start, stop, restart

class SystemActionReq(BaseModel):
    action: str  # drop_caches, reboot_vm

async def fetch_host_telemetry() -> Dict[str, Any]:
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    
    net_stats = []
    for iface, counters in psutil.net_io_counters(pernic=True).items():
        if iface != "lo":
            net_stats.append({
                "interface": iface,
                "bytes_sent": counters.bytes_sent,
                "bytes_recv": counters.bytes_recv,
                "packets_sent": counters.packets_sent,
                "packets_recv": counters.packets_recv,
                "errin": counters.errin,
                "errout": counters.errout
            })

    disk_stats = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disk_stats.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "total_gb": round(usage.total / (1024**3), 2),
                "used_gb": round(usage.used / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2),
                "percent": usage.percent
            })
        except Exception:
            continue

    return {
        "hostname": os.uname().nodename if hasattr(os, "uname") else "hexadata-vm",
        "uptime_seconds": int(time.time() - psutil.boot_time()),
        "cpu": {
            "total_percent": psutil.cpu_percent(interval=None),
            "core_count": psutil.cpu_count(logical=True),
            "per_core": psutil.cpu_percent(interval=None, percpu=True),
            "load_avg": list(os.getloadavg()) if hasattr(os, "getloadavg") else [0.0, 0.0, 0.0]
        },
        "memory": {
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "free_gb": round(mem.free / (1024**3), 2),
            "cached_gb": round(getattr(mem, "cached", 0) / (1024**3), 2),
            "percent": mem.percent
        },
        "swap": {
            "total_gb": round(swap.total / (1024**3), 2),
            "used_gb": round(swap.used / (1024**3), 2),
            "percent": swap.percent
        },
        "disks": disk_stats,
        "network": net_stats
    }

async def fetch_docker_telemetry() -> List[Dict[str, Any]]:
    client = get_docker_client()
    if not client:
        return []
    
    containers_data = []
    try:
        containers = client.containers.list(all=True)
        for c in containers:
            stats_summary = {
                "id": c.short_id,
                "name": c.name,
                "status": c.status,
                "image": c.image.tags[0] if c.image.tags else c.short_id,
                "created": c.attrs.get("Created", ""),
                "restart_policy": c.attrs.get("HostConfig", {}).get("RestartPolicy", {}).get("Name", "unknown"),
                "ports": str(c.ports)
            }
            containers_data.append(stats_summary)
    except Exception:
        pass
    return containers_data

async def fetch_ai_runtime_telemetry() -> Dict[str, Any]:
    url_slots = f"http://{LLAMA_SERVER_HOST}:{LLAMA_SERVER_PORT}/slots"
    url_health = f"http://{LLAMA_SERVER_HOST}:{LLAMA_SERVER_PORT}/health"
    
    ai_state = {
        "status": "offline",
        "endpoint": f"http://{LLAMA_SERVER_HOST}:{LLAMA_SERVER_PORT}",
        "active_slots": 0,
        "total_slots": 4,
        "slots": []
    }
    
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            h_res = await client.get(url_health)
            if h_res.status_code == 200:
                ai_state["status"] = "online"
                
            s_res = await client.get(url_slots)
            if s_res.status_code == 200:
                slots_data = s_res.json()
                ai_state["total_slots"] = len(slots_data)
                ai_state["active_slots"] = sum(1 for s in slots_data if s.get("is_processing", False))
                ai_state["slots"] = [
                    {
                        "id": s.get("id"),
                        "is_processing": s.get("is_processing", False),
                        "n_decoded": s.get("n_decoded", 0),
                        "n_prompt": s.get("n_prompt", 0)
                    }
                    for s in slots_data
                ]
    except Exception:
        ai_state["status"] = "offline"
        
    return ai_state

def scan_model_inventory() -> List[Dict[str, Any]]:
    models = []
    search_paths = [MODEL_DIR, "/root/llama.cpp/models", "/models"]
    
    found_files = set()
    for path in search_paths:
        if os.path.exists(path):
            for ext in ["*.gguf", "*.bin"]:
                for file_path in glob.glob(os.path.join(path, ext)):
                    if file_path not in found_files:
                        found_files.add(file_path)
                        size_bytes = os.path.getsize(file_path)
                        models.append({
                            "name": os.path.basename(file_path),
                            "path": file_path,
                            "size_mb": round(size_bytes / (1024 * 1024), 2),
                            "size_gb": round(size_bytes / (1024**3), 2),
                            "is_projector": "mmproj" in os.path.basename(file_path).lower()
                        })
    return models

def get_resilience_logs() -> Dict[str, Any]:
    logs = []
    if os.path.exists(WATCHDOG_LOG):
        try:
            with open(WATCHDOG_LOG, "r") as f:
                lines = f.readlines()
                logs = [l.strip() for l in lines[-15:]]
        except Exception:
            logs = ["Error reading watchdog log file."]
    else:
        logs = ["Watchdog log file not initialized yet."]
        
    return {
        "watchdog_log_path": WATCHDOG_LOG,
        "recent_entries": logs
    }

async def build_full_telemetry_payload() -> Dict[str, Any]:
    host = await fetch_host_telemetry()
    containers = await fetch_docker_telemetry()
    ai_runtime = await fetch_ai_runtime_telemetry()
    models = scan_model_inventory()
    resilience = get_resilience_logs()
    
    return {
        "timestamp": int(time.time()),
        "host": host,
        "containers": containers,
        "ai_runtime": ai_runtime,
        "models": models,
        "resilience": resilience
    }

@app.get("/api/v1/telemetry")
async def get_telemetry_snapshot():
    return await build_full_telemetry_payload()

@app.post("/api/v1/control/container")
async def container_control(payload: ContainerActionReq):
    client = get_docker_client()
    if not client:
        raise HTTPException(status_code=500, detail="Docker client unavailable")
    try:
        c = client.containers.get(payload.container_name)
        if payload.action == "start":
            c.start()
        elif payload.action == "stop":
            c.stop(timeout=5)
        elif payload.action == "restart":
            c.restart(timeout=5)
        else:
            raise HTTPException(status_code=400, detail="Invalid action")
        return {"status": "success", "container": payload.container_name, "action": payload.action}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/control/systemd")
async def systemd_control(payload: SystemdActionReq):
    allowed_services = ["llama-server.service", "llama-watchdog.timer", "docker.service"]
    if payload.service_name not in allowed_services:
        raise HTTPException(status_code=403, detail="Service control restricted")
    
    cmd = ["systemctl", payload.action, payload.service_name]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        return {"status": "success", "service": payload.service_name, "action": payload.action}
    else:
        raise HTTPException(status_code=500, detail=res.stderr or "Failed to execute systemctl")

@app.post("/api/v1/control/system")
async def system_control(payload: SystemActionReq):
    if payload.action == "drop_caches":
        res = subprocess.run(["sysctl", "-w", "vm.drop_caches=3"], capture_output=True, text=True)
        return {"status": "success", "action": "drop_caches", "output": res.stdout}
    elif payload.action == "reboot_vm":
        subprocess.Popen(["shutdown", "-r", "+1", "Reboot initiated via OmniSight Control Plane"])
        return {"status": "success", "action": "reboot_vm", "message": "VM scheduled for reboot in 1 minute."}
    else:
        raise HTTPException(status_code=400, detail="Invalid system action")

@app.websocket("/ws/telemetry")
async def websocket_telemetry_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = await build_full_telemetry_payload()
            await websocket.send_json(payload)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass