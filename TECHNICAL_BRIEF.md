# Anti-UAS RF Early Warning — Technical Brief (Track 3)

Passive RF early-warning prototype: detects and classifies UAS-related RF emissions (control/telemetry-like links) from recorded datasets and raises actionable alerts. Defensive monitoring only — no countermeasures, offline, unclassified.

## 1. Requirements mapping

| Requirement | Target | Our approach (summary) |
|---|---|---|
| Input | SigMF IQ or spectrogram bundle | Support both; IQ path computes its own spectrograms |
| Alert latency | ≤ 2 s from signal onset | Streaming STFT with 0.5 s hop; detect-then-classify budget ≈ 1.2 s worst case |
| Outputs | UAS-like / Non-UAS / Unknown | Two-stage detector + classifier with confidence; Unknown = low-margin band |
| Detection | Pd ≥ 0.90 @ FAR ≤ 3% | Recall-first CFAR detector; FAR burned down by the classifier stage, not the detector |
| Classification | F1 ≥ 0.85 (UAS-like) | Lightweight CNN on spectrogram tiles + engineered features; threshold tuned on validation ROC |
| Confidence + tuning | Required | Calibrated probability (temperature scaling); single `--threshold` knob |
| Signature library | Re-occurrence matching | Embedding + feature vector store; cosine similarity match on every new event |
| Metadata | Time bounds, freq/BW, confidence, features | Every alert is a self-contained JSON record |
| Compute | Laptop CPU, offline | NumPy/SciPy DSP + small ONNX model; no GPU dependency |

## 2. System architecture

```
SigMF IQ ──► Ingest ──► STFT ──► Noise floor ──► Burst/event ──► Feature ──► Classifier ──► Alert engine ──► JSON alerts
  or            │      engine     (median/MAD    detector        extract     (CNN + GBM      │  (thresholds,      + dashboard
spectrogram ────┘                  per bin,      (CFAR-style,    (per         ensemble,       │   persistence,
bundle                             adaptive)     recall-first)   event)       calibrated)     ▼   dedupe)
                                                                                        Signature library
                                                                                        (match / enroll)
```

The pipeline is streaming even when run offline: the file is consumed in chunks as if arriving live, which is what makes the ≤ 2 s latency measurable and honest.

### 2.1 Ingest
The IQ path reads SigMF (`.sigmf-meta` + `.sigmf-data`), honoring sample rate, center frequency, and capture segments. The spectrogram path accepts a bundle (NPY/PNG frames + JSON metadata) and normalizes it into the same internal tensor format, so everything downstream is input-agnostic. Chunk size 0.5 s.

### 2.2 Time–frequency front end
STFT with ~1 ms windows (e.g., 2048-point FFT at 20 MS/s, 50% overlap), magnitude in dB, downsampled into spectrogram tiles of roughly 0.5 s × full band. Per-frequency-bin noise floor is tracked with a rolling median + MAD estimator, which adapts to slow clutter (Wi-Fi channels rising and falling, broadcast carriers) without tracking fast bursts — this is the first line of false-alarm defense.

### 2.3 Event detection (recall-first)
A CFAR-style detector flags time–frequency regions exceeding the local noise floor by an adaptive margin, then morphologically merges adjacent detections into *events* with time bounds and frequency bounds. This stage is deliberately permissive (target Pd ≈ 0.99 at this stage): missing a burst here is unrecoverable, whereas false detections still get two more chances to be rejected. Onset time is recorded at first crossing — the latency clock starts here.

### 2.4 Feature extraction
Per event we compute the features that actually separate UAS links from clutter:

- **Temporal:** burst duration, inter-burst interval and its regularity (drone control links are highly periodic, e.g. ~7–14 ms frame cadence), duty cycle.
- **Spectral:** occupied bandwidth (−20 dB), center frequency drift, spectral flatness, shape of the PSD (FHSS bursts are narrow and clean; OFDM video links are wide and flat-topped).
- **Hopping behavior:** hop rate and hop-set spread estimated by tracking event centroids across time — the single strongest UAS discriminator, since RC control links (FHSS at 2.4/5.8 GHz, ExpressLRS/Crossfire at 915/433 MHz) hop in patterns Wi-Fi and Bluetooth do not replicate.
- **Structure:** autocorrelation of the band-power time series (reveals frame periodicity), rise/fall sharpness.

### 2.5 Classification (two heads, one decision)
A small CNN (3–4 conv blocks, <1M params, exported to ONNX) consumes the normalized spectrogram tile of the event; a gradient-boosted tree consumes the engineered features. Their outputs are averaged and calibrated (temperature scaling on validation data) into a single confidence score. Decision logic:

- confidence ≥ T_uas → **UAS-like**
- confidence ≤ T_non → **Non-UAS**
- in between → **Unknown**

Both thresholds are exposed for tuning; the report includes the full ROC so evaluators can pick their own operating point. CPU inference cost is ~5–15 ms per event — negligible in the latency budget.

### 2.6 False-alarm control strategy
FAR ≤ 3% is the hardest constraint and gets a layered defense: (1) the adaptive noise floor absorbs slow clutter; (2) the classifier — trained against a hard-negative clutter set of Wi-Fi, Bluetooth, BLE advertising, Zigbee, FM remotes, and impulsive noise — does the main rejection; (3) a *clutter library* mirrors the signature library: recurring false alarms confirmed as non-UAS are enrolled and matched, suppressing repeat offenders; (4) optional k-of-n persistence (e.g. 2 detections within 1 s) for the alert, tuned so it never spends more than ~0.5 s of the latency budget. Persistence trades latency for FAR — the config default (k=2, n=1 s) keeps worst-case alert time ≈ 1.2 s.

### 2.7 Latency budget (worst case, laptop CPU)

| Stage | Budget |
|---|---|
| Chunk accumulation (0.5 s hop) | 0.50 s |
| STFT + detection on chunk | 0.15 s |
| Persistence window (k=2) | 0.50 s |
| Features + inference + alert emit | 0.05 s |
| **Total from onset** | **≈ 1.20 s** ✓ (≤ 2 s) |

### 2.8 Signature library
Every UAS-like event is enrolled: engineered feature vector + a 64-d embedding from the CNN's penultimate layer, plus metadata. New events are cosine-matched against the library before classification completes; a match ≥ 0.92 tags the alert `reoccurrence_of: <signature_id>` and boosts confidence. Stored as SQLite + JSON export so the library survives runs and is human-inspectable.

## 3. Alert format (JSONL stream)

```json
{
  "alert_id": "a-000042",
  "verdict": "UAS-like",
  "confidence": 0.94,
  "t_onset": 12.482, "t_end": 13.910,
  "f_center_hz": 2441500000, "bandwidth_hz": 1800000,
  "latency_s": 1.13,
  "features": {"hop_rate_hz": 88.5, "burst_period_ms": 11.2, "duty_cycle": 0.31, "flatness": 0.18},
  "signature_match": {"id": "sig-007", "similarity": 0.95},
  "evidence": "snapshots/a-000042.png"
}
```

Each alert saves a spectrogram snapshot (the evidence image the dashboard displays). A run also emits `summary.json`: event counts by verdict, latency percentiles, and threshold settings.

## 4. Training data plan (no data in hand yet)

Phase 1 — **synthetic generator**: parameterized simulator producing FHSS control-link bursts (variable hop rate/dwell/BW), OFDM-like video downlinks, and telemetry beacons, mixed over clutter beds (synthetic Wi-Fi/BLE/Zigbee traffic, CW tones, impulsive noise) across SNR −5…+30 dB, with random frequency offsets and channel fading. This unblocks the full pipeline and the test harness immediately, and doubles as the robustness rig.

Phase 2 — **public datasets** to ground the classifier in real emissions: DroneRF (2.4 GHz, multiple drone models, RF background), DroneDetect / CardRF-style captures where obtainable. Real recordings are used for fine-tuning and for the hard-negative clutter set.

Phase 3 — **organizer samples**, when available, define the canonical input format and the final threshold calibration.

Augmentation throughout: SNR scaling, time dilation, frequency shifting, clutter overlay mixing — so the model never sees a "clean lab" bias.

## 5. Evaluation harness

A self-scoring harness ships with the prototype: it takes any labeled dataset (including our synthetic one), runs the fixed CLI command, and reports Pd, FAR, UAS-class F1, per-alert latency (measured from labeled onset to alert emission timestamp), and a confusion matrix — the same numbers the judges will compute. Threshold tuning procedure: sweep T_uas on validation, plot ROC, select the operating point with FAR = 2% (margin under the 3% ceiling), then verify Pd ≥ 0.90 holds on the held-out split.

Robustness tests (reported in the brief that accompanies submission): SNR sweep curves (Pd vs SNR), clutter-density stress (alerts under 0/50/90% band occupancy), unseen-protocol probe (protocols excluded from training must land in Unknown, not UAS-like), and truncated-burst behavior.

## 6. Runtime, CLI, and packaging

Python 3.11; NumPy/SciPy for DSP, ONNX Runtime for the CNN, scikit-learn/LightGBM for the tree, SQLite for the library. No GPU, no network access at runtime. Docker image with a fixed command format:

```bash
docker run -v $(pwd)/data:/data anti-uas-ews \
  detect --input /data/capture.sigmf-meta --out /data/alerts.jsonl \
         --threshold 0.80 --report /data/summary.json
```

The same entry point exposes `train`, `evaluate`, and `serve-dashboard` subcommands. Real-time throughput target: ≥ 1× capture rate at 20 MS/s on a laptop CPU (streaming chunks, vectorized DSP) — qualifying for the real-time bonus.

## 7. Dashboard (adapting the existing radar UI)

The React terminal-style dashboard we already built maps cleanly onto this deliverable: the radar panel becomes a **frequency–time activity view** (band occupancy with alert markers), ACTIVE TRACKS becomes the **alerts timeline table** (verdict, confidence, freq/BW, latency), the SIGNAL LOG stays as the live event feed, the stats tiles show **Pd-relevant counters** (alerts, UAS-like, Unknown, FAR estimate), and clicking an alert opens the **evidence snapshot** (spectrogram crop) where the drone detail popup was. The Node server is replaced by the Python process serving the same WebSocket event format — the frontend barely changes.

## 8. Milestones

1. Synthetic RF generator + SigMF ingest + STFT front end (unblocks everything).
2. CFAR detector + feature extraction + evaluation harness (first Pd/FAR numbers on synthetic data).
3. Classifier training + calibration + Unknown band (hit F1 target on synthetic).
4. Signature/clutter libraries + JSON alert stream + latency instrumentation.
5. Dashboard rewire + Docker packaging + robustness test suite.
6. Fine-tune on real/organizer data; lock thresholds; write submission brief.

## 9. Risks

Main risk is domain gap between synthetic training data and the hidden test set — mitigated by grounding on public real captures early and keeping the engineered-feature head (which generalizes better than CNNs across recording conditions). Second risk is the FAR ceiling under dense clutter — mitigated by the clutter library and by reporting Unknown rather than forcing a binary call on marginal events, which the ternary spec explicitly permits.
