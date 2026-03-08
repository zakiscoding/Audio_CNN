import base64
import io
import modal
import numpy as np
import requests
import torch
import torch.nn as nn
import torchaudio.transforms as T
from pydantic import BaseModel
from model import AudioCNN
import soundfile as sf
import librosa

app = modal.App("audio-cnn-inference")

image = (modal.Image.debian_slim()
            .pip_install_from_requirements("requirements.txt")
            .apt_install(["libsndfile1", "ffmpeg"])
            .add_local_python_source("model"))

model_volume = modal.Volume.from_name("esc-model")

class AudioProcessor:
    def __init__(self):
        self.transform = nn.Sequential(
            T.MelSpectrogram(
                sample_rate=44100, 
                n_fft=1024, 
                hop_length=512,
                n_mels=128, 
                f_min=0,
                f_max=11025,
            ),
            T.AmplitudeToDB()
        )
        
    def process_audio_chunk(self, audio_chunk):
        waveform = torch.from_numpy(audio_chunk).float().unsqueeze(0)  # [1, samples]
        spectogram = self.transform(waveform)  # [1, n_mels, time_frames]
        return spectogram.unsqueeze(0)  # [1, 1, n_mels, time_frames]
class InferenceRequest(BaseModel):
    audio_data: str
          
@app.cls(image=image, gpu='A10G' , volumes={"/models": model_volume}, scaledown_window=15)
class AudioClassifier:
    @modal.enter()
    def load_model(self):
        print("Loading model...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        checkpoint= torch.load('/models/best_model.pth', 
                                map_location=self.device)
        self.classes = checkpoint['classes']
        
        self.model = AudioCNN(num_classes=len(self.classes))
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.to(self.device)
        self.model.eval()
        
        self.audio_processor = AudioProcessor()
        print("Model loaded on enter")
    
    @modal.fastapi_endpoint(method="POST")
    def inference(self, request: InferenceRequest):
        audio_bytes = base64.b64decode(request.audio_data)

        audio_data, sample_rate = librosa.load(
            io.BytesIO(audio_bytes), sr=None, mono=True, dtype=np.float32)

        if sample_rate != 44100:
            audio_data = librosa.resample(
                y=audio_data, orig_sr=sample_rate, target_sr=44100)
            sample_rate = 44100
        
        spectogram = self.audio_processor.process_audio_chunk(audio_data)
        spectogram = spectogram.to(self.device)
         
        with torch.no_grad():
            output, feature_maps = self.model(
                spectogram, return_feature_maps=True)
             
            output = torch.nan_to_num(output)
            probabilities = torch.softmax(output, dim=1) # dim=0 batch, dim=1 class (batch_size, num_class)
            top3_probs, top3_indices = torch.topk(probabilities[0], 3)
            
            #dog:0.8 chirpinng birds: 0.1 etc.
            #top3_probs: [0.9,0,01,0,08], top3_indice: [15,42,5]
            # (0.9,15), (0.01,42)
            predictions = [{'class': self.classes[idx.item()], 'confidence': prob.item()}
                           for prob, idx in zip(top3_probs, top3_indices)]
            
            viz_data = {}
            if feature_maps is None:
                feature_maps = {}
            for name, tensor in feature_maps.items():
                 if tensor.dim()==4: # [batch, channel, height, width]
                     aggregated_tensor = torch.mean(tensor, dim=1)
                     squeezed_tensor = aggregated_tensor.squeeze(0)
                     numpy_array = squeezed_tensor.cpu().numpy()
                     clean_array = np.nan_to_num(numpy_array)
                     viz_data[name] = {
                         "shape": list(clean_array.shape),
                         "values": clean_array.tolist()
                     }
             
            spectrogram_np = spectogram.squeeze(0).squeeze(0).cpu().numpy()
            clean_spectrogram = np.nan_to_num(spectrogram_np)
             
            max_samples = 8000
            if len(audio_data) > max_samples:
                step = len(audio_data) // max_samples
                waveform_data = audio_data[::step]
            else:
                waveform_data = audio_data
                     
        response = {
            "predictions": predictions,
            "visualization": viz_data,
            "input_spectrogram": {
                "shape": list(clean_spectrogram.shape),
                "values": clean_spectrogram.tolist()
            },
            "waveform": {
                "values": waveform_data.tolist(),
                "sample_rate": sample_rate,
                "duration": len(audio_data) / sample_rate
            }
        }
        
        return response

@app.local_entrypoint()
def main():
    audio_data, sample_rate = sf.read("chirpingbirds.wav")
    
    buffer = io.BytesIO()
    sf.write(buffer, audio_data, sample_rate, format="WAV")
    audio_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    payload = {"audio_data": audio_b64}
    server = AudioClassifier()
    url = server.inference.get_web_url()
    response = requests.post(url, json=payload)
    response.raise_for_status()
    
    result = response.json()
    
    waveform_info = result.get("waveform", {})
    if waveform_info:
        values = waveform_info.get("values", {})
        print(f"first 10 waveform values: {[round(v,4) for v in values[:10]]}...")
        print(f"Duration: {waveform_info.get('duration', 0)} seconds")
    
    print("top predictions:")
    
    for pred in result.get("predictions", []):
        print(f"--{pred['class']} {pred['confidence']:0.2%}")