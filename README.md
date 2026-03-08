# CNN Audio Visualizer (ESC-50)

What I built
- I created a compact end-to-end project that trains a convolutional neural network on the ESC-50 environmental sound dataset and exposes an interactive web UI where you can upload a WAV file and instantly see:
  - Model top predictions (class + confidence)
  - Input mel-spectrogram
  - Raw waveform
  - Intermediate convolutional feature maps (visualized per layer)
- It’s designed for exploration and debugging: you can inspect what the network "sees" as it classifies sounds.

How it works (short)
- I convert audio to Mel spectrograms and feed them into a CNN with residual blocks.
- Training includes standard augmentation and MixUp; I log metrics to TensorBoard and save best checkpoints.
- The frontend (Next.js) sends WAV files as base64 to an inference endpoint and renders predictions + visualizations.

What’s in this repo
- train.py — dataset loader, training loop, MixUp helper, TensorBoard logging, Modal integration for remote runs.
- model.py — AudioCNN and ResidualBlock implementation.
- requirements.txt — runtime dependencies (torch, torchaudio, torchcodec, tensorboard, etc).
- audio-cnn-saas/ — Next.js frontend that uploads WAV files and visualizes model outputs.
- volumes / modal config — helpers for running on Modal and persisting logs/checkpoints.

Quickstart (local)
1. Create and activate a virtualenv (mac/zsh):
   .venv/bin/python -m pip install --upgrade pip
   .venv/bin/python -m pip install -r requirements.txt

2. Backend audio backend note:
   - If torchaudio complains about torchcodec, install it:
     .venv/bin/python -m pip install torchcodec
   - Or force a different backend in train.py:
     torchaudio.set_audio_backend("sox_io")

3. Train a quick smoke run:
   python train.py --epochs 1 --batch-size 16
   - TensorBoard logs are saved under the mounted models volume (e.g. /models/tensorboard_logs/...).

Frontend (local)
- From audio-cnn-saas/:
  npm install
  npm run dev
- Set NEXT_PUBLIC_API_URL to your inference endpoint (Modal or hosted API) in .env.local or Vercel env vars.

Deployment notes
- I push the repo to GitHub and deploy the frontend on Vercel. Set NEXT_PUBLIC_API_URL in Vercel to the inference URL.
- If the browser hits CORS issues, run a Next.js API route as a proxy (server-side requests avoid CORS and hide secrets).

Gotchas & fixes I made
- Ensured spectrograms have a channel dim before Conv2d (unsqueeze when needed).
- Fixed a ResidualBlock addition bug (out = out + shortcut).
- torchaudio in some environments prefers torchcodec — include it in requirements when using Modal/container images.
- TensorBoard logs saved to mounted volume to persist across runs.