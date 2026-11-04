'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, Activity, Server, Zap, ShieldCheck, RefreshCw, Power } from 'lucide-react';

interface TelemetryData {
  timestamp: number;
  host: {
    hostname: string;
    uptime_seconds: number;
    cpu: { total_percent: number; core_count: number; per_core: number[]; load_avg: number[] };
    memory: { total_gb: number; used_gb: number; free_gb: number; percent: number };
    disks: { device: string; mountpoint: string; total_gb: number; used_gb: number; percent: number }[];
    network: { interface: string; bytes_sent: number; bytes_recv: number }[];
  };
  containers: { id: string; name: string; status: string; image: string; ports: string }[];
  ai_runtime: { status: string; endpoint: string; active_slots: number; total_slots: number; slots: any[] };
  models: { name: string; size_mb: number; is_projector: boolean }[];
  resilience: { watchdog_log_path: string; recent_entries: string[] };
}

export default function TelemetryDashboard() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string>('');

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL || 'ws://172.16.1.142:9000/ws/telemetry';
    let ws: WebSocket;

    const connectWS = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch (err) {}
      };
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connectWS, 2000);
      };
    };

    connectWS();
    return () => ws && ws.close();
  }, []);

  const triggerContainerAction = async (containerName: string, action: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_TELEMETRY_API_URL || 'http://172.16.1.142:9000/api/v1';
    setActionMessage(`Executing ${action} on container ${containerName}...`);
    try {
      const res = await fetch(`${apiUrl}/control/container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container_name: containerName, action }),
      });
      const resData = await res.json();
      setActionMessage(`Action status: ${resData.status}`);
    } catch (e: any) {
      setActionMessage(`Failed action: ${e.message}`);
    }
  };

  const triggerSystemdAction = async (serviceName: string, action: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_TELEMETRY_API_URL || 'http://172.16.1.142:9000/api/v1';
    setActionMessage(`Executing ${action} on service ${serviceName}...`);
    try {
      const res = await fetch(`${apiUrl}/control/systemd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_name: serviceName, action }),
      });
      const resData = await res.json();
      setActionMessage(`Service action status: ${resData.status}`);
    } catch (e: any) {
      setActionMessage(`Failed service action: ${e.message}`);
    }
  };

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header Bar */}
      <header className="flex flex-wrap items-center justify-between bg-panelBg p-4 rounded-xl border border-gray-800">
        <div className="flex items-center space-x-3">
          <Activity className="w-8 h-8 text-accentCyan animate-pulse" />
          <div>
            <h1 className="text-xl font-bold tracking-wider text-white">HEXADATA OMNISIGHT MASTER CONTROL ROOM</h1>
            <p className="text-xs text-gray-400">Node IP: 172.16.1.142 | Host: {data?.host.hostname || 'Detecting...'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${connected ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
            {connected ? '● WS STREAM ACTIVE (1s)' : '○ DISCONNECTED'}
          </span>
        </div>
      </header>

      {actionMessage && (
        <div className="bg-cyan-950/80 border border-cyan-800 text-cyan-200 px-4 py-2 rounded-lg text-sm">
          {actionMessage}
        </div>
      )}

      {/* Hardware Metrics Row */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panelBg p-4 rounded-xl border border-gray-800 space-y-2">
          <div className="flex justify-between items-center text-gray-400 text-sm">
            <span className="flex items-center gap-1.5"><Cpu className="w-4 h-4 text-cyan-400" /> CPU Usage</span>
            <span>{data?.host.cpu.total_percent || 0}%</span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-2.5">
            <div className="bg-cyan-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${data?.host.cpu.total_percent || 0}%` }}></div>
          </div>
          <p className="text-xs text-gray-500">{data?.host.cpu.core_count || 0} Physical/Logical Cores</p>
        </div>

        <div className="bg-panelBg p-4 rounded-xl border border-gray-800 space-y-2">
          <div className="flex justify-between items-center text-gray-400 text-sm">
            <span className="flex items-center gap-1.5"><Server className="w-4 h-4 text-emerald-400" /> RAM Allocation</span>
            <span>{data?.host.memory.percent || 0}%</span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-2.5">
            <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${data?.host.memory.percent || 0}%` }}></div>
          </div>
          <p className="text-xs text-gray-500">{data?.host.memory.used_gb || 0} GB / {data?.host.memory.total_gb || 0} GB</p>
        </div>

        <div className="bg-panelBg p-4 rounded-xl border border-gray-800 space-y-2">
          <div className="flex justify-between items-center text-gray-400 text-sm">
            <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-amber-400" /> Root Storage</span>
            <span>{data?.host.disks[0]?.percent || 0}%</span>
          </div>
          <div className="w-full bg-gray-900 rounded-full h-2.5">
            <div className="bg-amber-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${data?.host.disks[0]?.percent || 0}%` }}></div>
          </div>
          <p className="text-xs text-gray-500">{data?.host.disks[0]?.used_gb || 0} GB Used / {data?.host.disks[0]?.total_gb || 0} GB Total</p>
        </div>

        <div className="bg-panelBg p-4 rounded-xl border border-gray-800 space-y-2">
          <div className="flex justify-between items-center text-gray-400 text-sm">
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-purple-400" /> AI Engine</span>
            <span className={data?.ai_runtime.status === 'online' ? 'text-emerald-400' : 'text-red-400'}>
              {data?.ai_runtime.status.toUpperCase() || 'OFFLINE'}
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>Slots Active: {data?.ai_runtime.active_slots || 0} / {data?.ai_runtime.total_slots || 4}</span>
            <span>Port: 8080</span>
          </div>
          <button
            onClick={() => triggerSystemdAction('llama-server.service', 'restart')}
            className="w-full mt-1 bg-gray-800 hover:bg-gray-700 text-xs py-1.5 rounded text-gray-200 border border-gray-700 flex items-center justify-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Restart Inference Daemon
          </button>
        </div>
      </section>

      {/* Docker Fleet Matrix */}
      <section className="bg-panelBg p-5 rounded-xl border border-gray-800 space-y-4">
        <h2 className="text-md font-semibold text-gray-200 flex items-center gap-2">
          <Server className="w-5 h-5 text-accentCyan" /> Container Fleet Matrix
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data?.containers.map((c) => (
            <div key={c.id} className="bg-gray-900/90 p-4 rounded-lg border border-gray-800 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-100 text-sm">{c.name}</h3>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">{c.image}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${c.status.includes('Up') || c.status === 'running' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                  {c.status}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => triggerContainerAction(c.name, 'restart')}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-xs py-1 rounded text-gray-300 border border-gray-700"
                >
                  Restart
                </button>
                <button
                  onClick={() => triggerContainerAction(c.name, 'stop')}
                  className="flex-1 bg-red-950/40 hover:bg-red-900/60 text-xs py-1 rounded text-red-300 border border-red-800/50"
                >
                  Stop
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Models & Resilience Watchdog */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-panelBg p-5 rounded-xl border border-gray-800 space-y-3">
          <h2 className="text-md font-semibold text-gray-200 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Active Model Inventory
          </h2>
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {data?.models.map((m, idx) => (
              <div key={idx} className="flex justify-between items-center p-2.5 bg-gray-900/60 rounded border border-gray-800/80 text-xs">
                <div>
                  <span className="font-semibold text-gray-200">{m.name}</span>
                  {m.is_projector && <span className="ml-2 text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-1.5 py-0.5 rounded">Vision Projector</span>}
                </div>
                <span className="text-gray-400 font-mono">{m.size_mb} MB</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-panelBg p-5 rounded-xl border border-gray-800 space-y-3">
          <h2 className="text-md font-semibold text-gray-200 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Resilience Watchdog Feed
          </h2>
          <div className="bg-black/80 p-3 rounded font-mono text-xs text-emerald-400 max-h-[220px] overflow-y-auto space-y-1 border border-gray-900">
            {data?.resilience.recent_entries.map((entry, idx) => (
              <div key={idx} className="truncate">{entry}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}