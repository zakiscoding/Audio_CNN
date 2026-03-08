"use client";

import { useState, useRef } from "react";
import ColorScale from "../components/ColorScale";
import FeatureMap from "../components/FeatureMap";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import Waveform from "~/components/WaveForm";

interface Prediction {
  class: string;
  confidence: number;
}

interface LayerData {
  shape: number[];
  values: number[][];
}

interface VisualizationData {
  [layerName: string]: LayerData;
}

interface WaveformData {
  values: number[];
  sample_rate: number;
  duration: number;
}

interface ApiResponse {
  predictions: Prediction[];
  visualization: VisualizationData;
  input_spectrogram: LayerData;
  waveform: WaveformData;
}

const ESC50_EMOJI_MAP: Record<string, string> = {
  dog: "🐕",
  rain: "🌧️",
  crying_baby: "👶",
  door_wood_knock: "🚪",
  helicopter: "🚁",
  rooster: "🐓",
  sea_waves: "🌊",
  sneezing: "🤧",
  mouse_click: "🖱️",
  chainsaw: "🪚",
  pig: "🐷",
  crackling_fire: "🔥",
  clapping: "👏",
  keyboard_typing: "⌨️",
  siren: "🚨",
  cow: "🐄",
  crickets: "🦗",
  breathing: "💨",
  door_wood_creaks: "🚪",
  car_horn: "📯",
  frog: "🐸",
  chirping_birds: "🐦",
  coughing: "😷",
  can_opening: "🥫",
  engine: "🚗",
  cat: "🐱",
  water_drops: "💧",
  footsteps: "👣",
  washing_machine: "🧺",
  train: "🚂",
  hen: "🐔",
  wind: "💨",
  laughing: "😂",
  vacuum_cleaner: "🧹",
  church_bells: "🔔",
  insects: "🦟",
  pouring_water: "🚰",
  brushing_teeth: "🪥",
  clock_alarm: "⏰",
  airplane: "✈️",
  sheep: "🐑",
  toilet_flush: "🚽",
  snoring: "😴",
  clock_tick: "⏱️",
  fireworks: "🎆",
  crow: "🐦‍⬛",
  thunderstorm: "⛈️",
  drinking_sipping: "🥤",
  glass_breaking: "🔨",
  hand_saw: "🪚",
};

const getEmojiForClass = (className: string): string => {
  return ESC50_EMOJI_MAP[className] ?? "🔈";
};

function splitLayers(visualization: VisualizationData) {
  const mainMap = new Map<string, LayerData>();
  const internals: Record<string, [string, LayerData][]> = {};

  for (const [name, data] of Object.entries(visualization)) {
    if (!name.includes(".")) {
      mainMap.set(name, data);
    } else {
      const [parent] = name.split(".");
      if (parent === undefined) continue;
      if (!internals[parent]) internals[parent] = [];
      internals[parent].push([name, data]);
      if (!mainMap.has(parent)) mainMap.set(parent, data);
    }
  }

  return { main: Array.from(mainMap.entries()), internals };
}

const ESC50_CATEGORIES: Record<string, string[]> = {
  "Animals": ["dog", "rooster", "pig", "cow", "frog", "cat", "hen", "insects", "sheep", "crow"],
  "Nature": ["rain", "sea_waves", "crackling_fire", "chirping_birds", "water_drops", "wind", "pouring_water", "thunderstorm", "crickets", "footsteps"],
  "Human": ["crying_baby", "sneezing", "clapping", "breathing", "coughing", "laughing", "brushing_teeth", "snoring", "drinking_sipping", "toilet_flush"],
  "Indoor": ["door_wood_knock", "mouse_click", "keyboard_typing", "door_wood_creaks", "can_opening", "washing_machine", "vacuum_cleaner", "clock_alarm", "clock_tick", "glass_breaking"],
  "Mechanical": ["helicopter", "chainsaw", "siren", "car_horn", "engine", "train", "church_bells", "airplane", "fireworks", "hand_saw"],
};

export default function HomePage() {
  const [vizData, setVizData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showClasses, setShowClasses] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAudioDuration = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration); };
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read audio duration")); };
      audio.src = url;
    });

  const processFile = async (file: File) => {
    setError(null);
    setVizData(null);

    try {
      const duration = await getAudioDuration(file);
      if (duration > 5) {
        setError(`File is ${duration.toFixed(1)}s — maximum allowed is 5 seconds.`);
        return;
      }
    } catch {
      // If duration can't be read, let the server handle it
    }

    setFileName(file.name);
    setIsLoading(true);

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const base64String = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );

        const API_URL = process.env.NEXT_PUBLIC_API_URL;
        if (!API_URL) throw new Error("Missing NEXT_PUBLIC_API_URL");
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_data: base64String }),
        });

        if (!response.ok) throw new Error(`API error: ${response.statusText}`);

        const data: ApiResponse = await response.json();
        setVizData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read the file.");
      setIsLoading(false);
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetAndUpload = () => {
    setError(null);
    setVizData(null);
    setFileName("");
    fileInputRef.current?.click();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };

  const { main, internals } = vizData
    ? splitLayers(vizData.visualization)
    : { main: [], internals: {} };

  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(ellipse at 15% 40%, rgba(0,200,230,0.04) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(139,92,246,0.05) 0%, transparent 55%), #060911",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-12">

        {/* Header */}
        <div className="mb-14 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs text-cyan-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            ESC-50 · 50 Sound Classes
          </div>
          <h1
            className="mb-3 text-5xl font-semibold tracking-tight"
            style={{
              background: "linear-gradient(to bottom, #f1f5f9, #64748b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CNN Audio Visualizer
          </h1>
          <p className="text-slate-500">
            Upload an audio file to classify sounds and explore neural network feature maps
          </p>
        </div>

        {/* How to use */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-4">
          {[
            { step: "01", title: "Find a sound", desc: "Record or find a short clip of one of the 50 supported environmental sounds" },
            { step: "02", title: "Keep it short", desc: "Trim your clip to 5 seconds or under — the model was trained on short clips" },
            { step: "03", title: "Upload", desc: "Drop the file onto the upload zone or click Choose File. WAV, MP3, FLAC and more are accepted" },
            { step: "04", title: "Explore results", desc: "See the top predictions and scroll down to explore the CNN feature maps" },
          ].map(({ step, title, desc }) => (
            <div
              key={step}
              className="rounded-xl p-4"
              style={{ background: "#060f24", border: "1px solid #0f2545" }}
            >
              <p className="mb-1 font-mono text-xs font-bold" style={{ color: "#facc15" }}>{step}</p>
              <p className="mb-1 text-sm font-semibold text-white">{title}</p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(186,210,255,0.45)" }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="mb-10 rounded-2xl p-12 text-center transition-all duration-200"
          style={{
            border: `2px dashed ${isDragging ? "rgba(0,210,230,0.5)" : "rgba(30,45,61,1)"}`,
            background: isDragging ? "rgba(0,210,230,0.04)" : "#0a0f1a",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={isLoading}
            className="hidden"
          />

          <div className="mb-4 flex justify-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: "#0d1520", border: "1px solid #1e2d3d" }}
            >
              {isLoading ? (
                <svg className="h-6 w-6 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              )}
            </div>
          </div>

          {isLoading ? (
            <p className="text-slate-400">Analysing audio...</p>
          ) : (
            <>
              <p className="mb-1 font-medium text-slate-300">
                {fileName ? fileName : "Drop any audio file here"}
              </p>
              <p className="mb-4 text-sm text-slate-600">or click to browse</p>

              <div className="mb-5 flex flex-wrap justify-center gap-1.5">
                {["WAV", "MP3", "FLAC", "OGG", "M4A", "AAC", "OPUS", "AIFF"].map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded px-1.5 py-0.5 font-mono text-xs"
                    style={{
                      background: "rgba(0,212,255,0.06)",
                      border: "1px solid rgba(0,212,255,0.15)",
                      color: "rgba(186,210,255,0.5)",
                    }}
                  >
                    {fmt}
                  </span>
                ))}
              </div>

              <p
                className="mb-5 flex items-center justify-center gap-1.5 text-xs"
                style={{ color: "rgba(251,191,36,0.7)" }}
              >
                <span>⚠</span>
                Keep files 5 seconds or under for best results
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg px-5 py-2 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
                style={{
                  background: "rgba(0,212,255,0.08)",
                  border: "1px solid rgba(0,212,255,0.25)",
                }}
              >
                Choose File
              </button>
            </>
          )}
        </div>

        {/* Supported Classes */}
        <div className="mb-6">
          <button
            onClick={() => setShowClasses((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl px-5 py-3 text-sm transition-colors"
            style={{ background: "#060f24", border: "1px solid #0f2545" }}
          >
            <span className="flex items-center gap-2" style={{ color: "rgba(186,210,255,0.6)" }}>
              <span style={{ color: "#facc15" }}>◈</span>
              50 supported sound classes
            </span>
            <span style={{ color: "rgba(186,210,255,0.35)", fontSize: "0.7rem" }}>
              {showClasses ? "▲ hide" : "▼ show"}
            </span>
          </button>

          {showClasses && (
            <div
              className="mt-2 rounded-xl p-5"
              style={{ background: "#060f24", border: "1px solid #0f2545" }}
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(ESC50_CATEGORIES).map(([category, classes]) => (
                  <div key={category}>
                    <p
                      className="mb-3 text-xs font-bold uppercase tracking-[0.18em]"
                      style={{ color: "#facc15" }}
                    >
                      {category}
                    </p>
                    <ul className="space-y-1.5">
                      {classes.map((cls) => (
                        <li
                          key={cls}
                          className="flex items-center gap-2 text-xs"
                          style={{ color: "rgba(186,210,255,0.55)" }}
                        >
                          <span>{getEmojiForClass(cls)}</span>
                          <span>{cls.replaceAll("_", " ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-8 flex items-center justify-between gap-4 rounded-xl px-5 py-4 text-sm text-red-400"
            style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <span>{error}</span>
            <button
              onClick={resetAndUpload}
              className="shrink-0 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors hover:text-red-300"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              Try Another File
            </button>
          </div>
        )}

        {/* Results */}
        {vizData && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                onClick={resetAndUpload}
                className="rounded-lg px-5 py-2 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
                style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)" }}
              >
                Analyse Another File
              </button>
            </div>

            {/* Predictions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-200">Top Predictions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {vizData.predictions.slice(0, 3).map((pred, i) => (
                    <div key={pred.class} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-300">
                          {getEmojiForClass(pred.class)}{" "}
                          {pred.class.replaceAll("_", " ")}
                        </span>
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: i === 0 ? "#22d3ee" : "#475569" }}
                        >
                          {(pred.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full"
                        style={{ background: "#1a2535" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pred.confidence * 100}%`,
                            background:
                              i === 0
                                ? "linear-gradient(to right, #06b6d4, #6366f1)"
                                : "#2a3d52",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Spectrogram + Waveform */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-slate-200">Input Spectrogram</CardTitle>
                </CardHeader>
                <CardContent>
                  <FeatureMap
                    data={vizData.input_spectrogram.values}
                    title={`${vizData.input_spectrogram.shape.join(" × ")}`}
                    spectrogram
                  />
                  <div className="mt-4 flex justify-end">
                    <ColorScale width={200} height={14} min={-1} max={1} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-slate-200">Audio Waveform</CardTitle>
                </CardHeader>
                <CardContent>
                  <Waveform
                    data={vizData.waveform.values}
                    title={`${vizData.waveform.duration.toFixed(2)}s · ${vizData.waveform.sample_rate} Hz`}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Feature Maps */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CardTitle className="text-slate-200">Convolutional Layer Outputs</CardTitle>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs text-cyan-400"
                    style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}
                  >
                    {main.length} layers
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-5">
                  {main.map(([mainName, mainData]) => (
                    <div key={mainName} className="space-y-3">
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-600">
                          {mainName}
                        </h4>
                        <FeatureMap
                          data={mainData.values}
                          title={`${mainData.shape.join(" × ")}`}
                        />
                      </div>
                      {internals[mainName] && (
                        <div
                          className="h-80 overflow-y-auto rounded-lg p-2"
                          style={{ background: "#060911", border: "1px solid #1e2d3d" }}
                        >
                          <div className="space-y-2">
                            {internals[mainName]
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([layerName, layerData]) => (
                                <FeatureMap
                                  key={layerName}
                                  data={layerData.values}
                                  title={`Block ${layerName.replace(`${mainName}.`, "")}`}
                                  internal={true}
                                />
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <ColorScale width={200} height={14} min={-1} max={1} />
                </div>
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </main>
  );
}
